// PF / EPF / EPS calculation layer (Phase 26).
//
// This engine deliberately depends on financialRules.js for every statutory
// rate. It never hardcodes a rate and never falls back to the newest row.
// Employer-side contributions remain retirement-benefit information and are
// intentionally returned in a structure that cannot be mistaken for a
// spendable account balance.

import { getVerifiedRule } from './financialRules.js'

const RULES = {
  employeePF: ['epf', 'employee_contribution_rate'],
  employerEPF: ['epf', 'employer_contribution_rate'],
  eps: ['eps', 'employer_contribution_rate'],
}

function unavailable(ruleKey, asOfDate) {
  return {
    status: 'unavailable',
    amount: null,
    rateUsed: null,
    ratePeriod: null,
    source: null,
    reason: `No verified financial rule is available for ${ruleKey} on ${String(asOfDate)}.`,
  }
}

function sourceFromRule(rule) {
  return {
    scheme: rule.scheme,
    ruleKey: rule.rule_key,
    url: rule.source_url || null,
    retrievedAt: rule.retrieved_at || null,
    verificationStatus: rule.verification_status,
  }
}

function periodFromRule(rule) {
  return {
    effectiveFrom: rule.effective_from,
    effectiveTo: rule.effective_to || null,
  }
}

function validateBasic(basicMonthly) {
  return Number.isFinite(Number(basicMonthly)) && Number(basicMonthly) >= 0
}

function calculateWithRule(basicMonthly, asOfDate, rule, ruleKey) {
  if (!rule || rule.verification_status !== 'verified') {
    return unavailable(ruleKey, asOfDate)
  }

  const rateUsed = Number(rule.value)
  const amount = Number(basicMonthly) * (rateUsed / 100)

  return {
    status: 'ok',
    amount,
    rateUsed,
    ratePeriod: periodFromRule(rule),
    source: sourceFromRule(rule),
  }
}

/**
 * Calculate employee EPF contribution from the verified rule active on the
 * supplied calculation date.
 *
 * The optional third argument is a test seam. Production callers omit it,
 * so getVerifiedRule() remains the real dependency.
 */
export async function calculateEmployeePF(basicMonthly, asOfDate, { ruleGetter = getVerifiedRule } = {}) {
  if (!validateBasic(basicMonthly)) {
    return { status: 'invalid_input', amount: null, rateUsed: null, ratePeriod: null, source: null, reason: 'Basic monthly salary must be a non-negative number.' }
  }
  const rule = await ruleGetter(...RULES.employeePF, asOfDate)
  return calculateWithRule(basicMonthly, asOfDate, rule, RULES.employeePF[1])
}

/**
 * Calculate the employer EPF portion from the verified rule active on the
 * supplied calculation date. This is retirement-benefit information, not
 * ordinary income or account balance.
 */
export async function calculateEmployerEPF(basicMonthly, asOfDate, { ruleGetter = getVerifiedRule } = {}) {
  if (!validateBasic(basicMonthly)) {
    return { status: 'invalid_input', amount: null, rateUsed: null, ratePeriod: null, source: null, reason: 'Basic monthly salary must be a non-negative number.' }
  }
  const rule = await ruleGetter(...RULES.employerEPF, asOfDate)
  return calculateWithRule(basicMonthly, asOfDate, rule, RULES.employerEPF[1])
}

/**
 * Calculate EPS from the verified rule active on the supplied calculation
 * date. The current financial_rules seed intentionally has no wage-cap rule,
 * so this calculation reports that limitation instead of presenting the
 * uncapped result as an exact statutory amount.
 */
export async function calculateEPS(basicMonthly, asOfDate, { ruleGetter = getVerifiedRule } = {}) {
  if (!validateBasic(basicMonthly)) {
    return { status: 'invalid_input', amount: null, rateUsed: null, ratePeriod: null, source: null, reason: 'Basic monthly salary must be a non-negative number.' }
  }
  const rule = await ruleGetter(...RULES.eps, asOfDate)
  const result = calculateWithRule(basicMonthly, asOfDate, rule, RULES.eps[1])
  if (result.status !== 'ok') return result

  return {
    ...result,
    basis: 'full basic salary supplied',
    limitation: 'The current financial_rules data does not model the EPS wage ceiling, so this is an uncapped estimate rather than an exact statutory EPS amount.',
  }
}

/**
 * Combine the three retirement calculations without creating an income,
 * balance, cash-flow, or spendable-money shape.
 */
export async function calculateRetirementBreakdown(basicMonthly, asOfDate, { ruleGetter = getVerifiedRule } = {}) {
  const [employeePF, employerEPF, eps] = await Promise.all([
    calculateEmployeePF(basicMonthly, asOfDate, { ruleGetter }),
    calculateEmployerEPF(basicMonthly, asOfDate, { ruleGetter }),
    calculateEPS(basicMonthly, asOfDate, { ruleGetter }),
  ])

  return {
    status: [employeePF, employerEPF, eps].every((item) => item.status === 'ok') ? 'ok' : 'partial',
    calculationDate: asOfDate,
    basicMonthly,
    retirementBenefits: {
      employeePF,
      employerEPF,
      eps,
    },
  }
}
