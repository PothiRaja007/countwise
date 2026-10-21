// D3 - the Debts form: validation, mapping and the display rules. Pure: no network, no database, no clock
// (today is always a parameter, except todayISO, which only the page calls).
//
// Form fields are TEXT, exactly as typed. validateDebtForm turns them into the values the `debts` table stores
// (see supabase/p16_debts.sql). The database re-checks everything; this gives the user a plain message first.
//
// Money rules: at most 2 decimals, never negative, at most 100,000,000,000. The rate is required, has no default,
// has at most 2 decimals and is 0 to 100. An interest-free debt always has rate 0.

import { computeEmi, buildSchedule } from './debtEngine.js'

export const ACTIVE_DEBT_LIMIT = 20
export const MAX_MONEY = 100000000000

export const KINDS = [
  { value: 'term_loan', label: 'Loan' },
  { value: 'interest_free', label: 'Interest-free' },
  { value: 'credit_card', label: 'Credit card' },
]
export const kindLabel = (kind) => (KINDS.find((k) => k.value === kind) || { label: kind }).label

export const EMPTY_FORM = {
  name: '', kind: 'term_loan', lender: '', asOfDate: '', principal: '', accruedInterest: '',
  ratePct: '', monthlyPayment: '', remainingMonths: '', dueDay: '',
}

const MONEY_RE = /^\d+(\.\d{1,2})?$/
const INT_RE = /^\d+$/
const DATE_RE = /^(\d{4})-(\d{2})-(\d{2})$/

function daysInMonth(y, m) {
  if (m === 2) return (y % 4 === 0 && y % 100 !== 0) || y % 400 === 0 ? 29 : 28
  return [4, 6, 9, 11].includes(m) ? 30 : 31
}
export function isRealDate(s) {
  const g = DATE_RE.exec(String(s || ''))
  if (!g) return false
  const y = Number(g[1]), m = Number(g[2]), d = Number(g[3])
  return y >= 1900 && m >= 1 && m <= 12 && d >= 1 && d <= daysInMonth(y, m)
}

/** The user's own calendar date as 'YYYY-MM-DD'. The only function here that reads the clock; pages call it. */
export function todayISO(now = new Date()) {
  const p = (n) => String(n).padStart(2, '0')
  return `${now.getFullYear()}-${p(now.getMonth() + 1)}-${p(now.getDate())}`
}

const s = (v) => (v == null ? '' : String(v)).trim()

function money(text, label, errors, key, { required, allowZero }) {
  const t = s(text)
  if (t === '') {
    if (required) errors[key] = `${label} is required.`
    return null
  }
  if (!MONEY_RE.test(t)) { errors[key] = `${label} must be a number with at most 2 decimals, for example 25000 or 1250.50.`; return null }
  const n = Number(t)
  if (!Number.isFinite(n) || n > MAX_MONEY) { errors[key] = `${label} is too large.`; return null }
  if (n === 0 && !allowZero) { errors[key] = `${label} must be more than 0.`; return null }
  return n
}

/**
 * fields: the text values of the form. today: 'YYYY-MM-DD'.
 * Returns { ok: true, values } or { ok: false, errors } where errors is { fieldName: message }.
 * values are the `debts` columns (without user_id): name, kind, lender, as_of_date, as_of_outstanding,
 * as_of_accrued_interest, annual_rate_pct, monthly_payment, remaining_months, due_day.
 */
export function validateDebtForm(fields, today) {
  const f = { ...EMPTY_FORM, ...(fields || {}) }
  const errors = {}

  const name = s(f.name)
  if (name === '') errors.name = 'Give this debt a name.'
  else if (name.length > 80) errors.name = 'The name can be at most 80 characters.'

  const kind = f.kind
  if (!KINDS.some((k) => k.value === kind)) errors.kind = 'Choose the type of debt.'

  const lender = s(f.lender)
  if (lender.length > 80) errors.lender = 'The lender can be at most 80 characters.'

  const asOfDate = s(f.asOfDate)
  if (asOfDate === '') errors.asOfDate = 'Enter the date these figures are true.'
  else if (!isRealDate(asOfDate)) errors.asOfDate = 'Enter a real date.'
  else if (typeof today === 'string' && asOfDate > today) errors.asOfDate = 'This date cannot be in the future. Use the date the figures were last true.'

  const principal = money(f.principal, 'Principal owed', errors, 'principal', { required: true, allowZero: true })
  const accrued = money(f.accruedInterest, 'Unpaid interest', errors, 'accruedInterest', { required: false, allowZero: true })

  let rate = null
  const rateText = s(f.ratePct)
  if (rateText === '') errors.ratePct = 'Enter the yearly interest rate. Use 0 if there is none.'
  else if (!MONEY_RE.test(rateText)) errors.ratePct = 'The rate must be a number with at most 2 decimals, for example 10.5.'
  else {
    rate = Number(rateText)
    if (rate > 100) { errors.ratePct = 'The rate must be between 0 and 100.'; rate = null }
    else if (kind === 'interest_free' && rate !== 0) { errors.ratePct = 'An interest-free debt has a rate of 0.'; rate = null }
  }

  const payment = money(f.monthlyPayment, 'Monthly payment', errors, 'monthlyPayment', { required: false, allowZero: false })

  let months = null
  const monthsText = s(f.remainingMonths)
  if (monthsText !== '') {
    if (!INT_RE.test(monthsText) || Number(monthsText) < 1 || Number(monthsText) > 600) errors.remainingMonths = 'Months remaining must be a whole number from 1 to 600.'
    else months = Number(monthsText)
  }

  let dueDay = null
  const dueText = s(f.dueDay)
  if (dueText !== '') {
    if (!INT_RE.test(dueText) || Number(dueText) < 1 || Number(dueText) > 31) errors.dueDay = 'The due day must be a whole number from 1 to 31.'
    else dueDay = Number(dueText)
  }

  if (Object.keys(errors).length > 0) return { ok: false, errors }
  return {
    ok: true,
    values: {
      name, kind, lender: lender === '' ? null : lender, as_of_date: asOfDate,
      as_of_outstanding: principal, as_of_accrued_interest: accrued == null ? 0 : accrued,
      annual_rate_pct: rate, monthly_payment: payment, remaining_months: months, due_day: dueDay,
    },
  }
}

/** A stored row, as the text a form shows. */
export function rowToForm(row) {
  const t = (v) => (v == null ? '' : String(v))
  return {
    name: t(row.name), kind: row.kind || 'term_loan', lender: t(row.lender), asOfDate: t(row.as_of_date),
    principal: t(row.as_of_outstanding), accruedInterest: t(row.as_of_accrued_interest), ratePct: t(row.annual_rate_pct),
    monthlyPayment: t(row.monthly_payment), remainingMonths: t(row.remaining_months), dueDay: t(row.due_day),
  }
}

/** True when an edit changes a figure every calculation starts from (needs the user's confirmation). */
export function openingFiguresChanged(row, values) {
  return (
    Number(row.as_of_outstanding) !== Number(values.as_of_outstanding) ||
    Number(row.as_of_accrued_interest) !== Number(values.as_of_accrued_interest) ||
    Number(row.annual_rate_pct) !== Number(values.annual_rate_pct) ||
    String(row.as_of_date).slice(0, 10) !== values.as_of_date
  )
}

/** Total still owed on the as-of date, in whole paise (so 0.1 + 0.2 style sums stay exact). */
export function totalOwedPaise(row) {
  return Math.round(Number(row.as_of_outstanding) * 100) + Math.round(Number(row.as_of_accrued_interest || 0) * 100)
}

/**
 * What the card may show for a debt. Cleared and credit-card rows never reach the engine.
 *   { state: 'cleared' }
 *   { state: 'estimate' }                          credit card: opening figures and rate only, labelled an estimate
 *   { state: 'projection', emi?, schedule? }       loan / interest-free, calculated from the PRINCIPAL on the as-of date
 * All figures are calculated scenarios, not a statement from the lender. Unpaid interest is not part of the projection.
 */
export function debtView(row) {
  if (totalOwedPaise(row) === 0) return { state: 'cleared' }
  if (row.kind === 'credit_card') return { state: 'estimate' }
  const principal = Number(row.as_of_outstanding)
  if (!(principal > 0)) return { state: 'projection' } // only unpaid interest is owed: nothing to project
  const rate = Number(row.annual_rate_pct)
  const out = { state: 'projection' }
  if (row.remaining_months != null) {
    const e = computeEmi({ principal, annualRatePct: rate, months: Number(row.remaining_months) })
    if (e.ok) out.emi = e.emi
  }
  if (row.monthly_payment != null) {
    const sc = buildSchedule({ principal, annualRatePct: rate, payment: Number(row.monthly_payment) })
    if (sc.ok) out.schedule = { paysOff: sc.paysOff, months: sc.months, totalInterest: sc.totalInterest, reason: sc.reason || null }
  }
  return out
}

export function ordinal(n) {
  const v = n % 100
  if (v >= 11 && v <= 13) return `${n}th`
  return `${n}${({ 1: 'st', 2: 'nd', 3: 'rd' })[n % 10] || 'th'}`
}
/** 'the 5th of each month'; 29 to 31 say what happens in a shorter month. */
export function dueDayText(n) {
  if (n == null) return null
  return n > 28 ? `the ${ordinal(n)} of each month (the last day in shorter months)` : `the ${ordinal(n)} of each month`
}
