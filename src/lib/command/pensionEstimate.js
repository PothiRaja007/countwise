// P10 (Money Inbox command layer) — the PENSION ESTIMATE ANSWER (QUERY_PENSION_ESTIMATE), the Money Inbox side.
//
// CountWise has no record of PF that was actually paid. The PF / Pension page works out an ESTIMATE from the
// Basic salary of the active salary structure and the verified rules for a date. This module words that
// estimate for Money Inbox and decides which questions it answers:
//
//   pensionQuestionFromResult(result)      → true for a ready, available, unambiguous pension question
//   pensionQuestionFromChoice(choiceId)    → true for the "Show my pension estimate" button
//   looksLikePensionEstimateRequest(text)  → true for a plain "pension estimate" request with no amount in it
//   pensionAnswer(input, { formatMoney })  → the frozen answer
//   pensionDataProblem()                   → the "couldn't read your data" answer
//
// THE RULES IT KEEPS:
//   - Every answer says it is an ESTIMATE and that CountWise does not record PF payments. It never says,
//     or implies, that the user paid an amount (decision 4).
//   - Employer parts are always marked "Not part of your balance". Nothing here is income or a balance.
//   - A rule that is not available for the date gives "Rate unavailable" and NO number. A zero is never substituted.
//   - No active structure, or no confirmed Basic salary, gives a plain message and a way to open Salary.
//   - It reads nothing and writes nothing: the screen reads the data and calls the existing PF engine, then
//     passes the results in.
//
// PURE. Imports only its sibling modules. No database, no screen code, no clock, no randomness.
// Results are deeply frozen and inputs are never changed.

import { deepFreeze, isIntentAvailable } from './intents.js'

// ---------- the words (pinned by tests) ----------
export const PENSION_MESSAGES = deepFreeze({
  headline: "CountWise doesn't record PF payments. This is an estimate from your salary structure, not a record of what you paid.",
  noStructure: 'You have no active salary structure, so there is no estimate to show.',
  noBasic: 'Your active salary structure has no confirmed Basic salary amount, so there is no estimate to show.',
  noneAvailable: (dateText) => `No verified rule is available for ${dateText}, so there is no estimate to show.`,
  dataProblem: "I couldn't read your data, so I'm not showing a number. Please try again.",
  employeePF: 'Employee PF (monthly)',
  employerEPF: 'Employer EPF (monthly)',
  eps: 'EPS (monthly)',
  unavailable: 'Rate unavailable',
  notYourBalance: 'Not part of your balance',
  epsLimit: 'uncapped, the wage ceiling is not modelled',
  basis: (basicText, label, dateText) => `Monthly figures as of ${dateText}, from a Basic salary of ${basicText} in "${label}".`,
  partial: 'A rate that is not available is not guessed and not shown as zero.',
  note: 'This is only an estimate. Nothing was changed.',
  openSalary: 'Open Salary',
  openPension: 'Open PF / Pension',
})

export const PENSION_ACTIONS = deepFreeze({ salary: 'open_salary', pension: 'open_pension' })
const CHOICE_ID = 'pension_estimate'

// ---------- which questions it answers ----------
/** A ready, built, unambiguous pension question from the interpreter. */
export function pensionQuestionFromResult(result) {
  if (!result || result.kind !== 'query' || !result.pending || result.pending.intent !== 'QUERY_PENSION_ESTIMATE') return false
  const p = result.pending
  return isIntentAvailable(p.intent) && p.status === 'ready' && Array.isArray(result.asks) && result.asks.length === 0
    && Array.isArray(p.ambiguities) && p.ambiguities.length === 0 && Array.isArray(p.missing) && p.missing.length === 0
}

/** The clarification's "Show my pension estimate" button. */
export function pensionQuestionFromChoice(choiceId) {
  return choiceId === CHOICE_ID && isIntentAvailable('QUERY_PENSION_ESTIMATE')
}

const SCHEME = '(?:pension|pf|epf|provident\\s+fund)'
const REQUESTS = [
  new RegExp(`^(?:show|tell|give)(?:\\s+me)?\\s+(?:my|the)\\s+${SCHEME}\\s+(?:estimate|contribution|contributions|amount|breakdown)$`, 'i'),
  new RegExp(`^(?:my\\s+)?${SCHEME}\\s+(?:estimate|contribution|contributions|breakdown)$`, 'i'),
]
/** A plain "pension estimate" request with nothing else in it. Any digit means it is not one. */
export function looksLikePensionEstimateRequest(text) {
  if (typeof text !== 'string') return false
  const s = text.replace(/\s+/g, ' ').trim().replace(/[.!?]+$/, '')
  return !!s && s.length <= 60 && !/\d/.test(s) && REQUESTS.some((re) => re.test(s))
}

// ---------- the answer ----------
const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec']
function dateLabel(iso) {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(String(iso))
  return m && MONTHS[Number(m[2]) - 1] ? `${Number(m[3])} ${MONTHS[Number(m[2]) - 1]} ${m[1]}` : String(iso)
}

const ACTION_SALARY = { id: PENSION_ACTIONS.salary, label: PENSION_MESSAGES.openSalary }
const ACTION_PENSION = { id: PENSION_ACTIONS.pension, label: PENSION_MESSAGES.openPension }

function message(headline, action) {
  return deepFreeze({ ok: false, intent: 'QUERY_PENSION_ESTIMATE', answerKind: 'estimated', headline, rows: [], basis: null, partial: false, note: PENSION_MESSAGES.note, action })
}

/** The answer for a read that failed. It has no number. */
export function pensionDataProblem() {
  return message(PENSION_MESSAGES.dataProblem, null)
}

const rateText = (item) => (Number.isFinite(item.rateUsed) ? `${item.rateUsed}% of Basic` : null)
const join = (...parts) => parts.filter(Boolean).join(' · ')

function row(label, item, extras, formatMoney) {
  if (!item || item.status !== 'ok' || !Number.isFinite(item.amount)) {
    return { label, value: PENSION_MESSAGES.unavailable, note: item && typeof item.reason === 'string' && item.reason ? item.reason : null, ok: false }
  }
  return { label, value: formatMoney(item.amount), note: join(rateText(item), ...extras), ok: true }
}

/**
 * `input`: { status: 'no_structure' | 'no_basic' | 'ok' | 'unreadable', structureLabel, basicMonthly, breakdown, calculationDate }
 * `breakdown` is the existing PF engine's result, passed in untouched.
 */
export function pensionAnswer(input, { formatMoney } = {}) {
  if (!input || typeof input !== 'object') throw new TypeError('pensionAnswer needs an input')
  if (typeof formatMoney !== 'function') throw new TypeError('pensionAnswer needs a formatMoney function')
  if (input.status === 'unreadable') return pensionDataProblem()
  if (input.status === 'no_structure') return message(PENSION_MESSAGES.noStructure, ACTION_SALARY)
  if (input.status === 'no_basic') return message(PENSION_MESSAGES.noBasic, ACTION_SALARY)
  if (input.status !== 'ok') throw new TypeError(`Unknown input status: ${input.status}`)

  const b = input.breakdown && input.breakdown.retirementBenefits
  if (!b || !Number.isFinite(input.basicMonthly)) return pensionDataProblem()
  const dateText = dateLabel(input.calculationDate)
  const rows = [
    row(PENSION_MESSAGES.employeePF, b.employeePF, [`as of ${dateText}`], formatMoney),
    row(PENSION_MESSAGES.employerEPF, b.employerEPF, [PENSION_MESSAGES.notYourBalance], formatMoney),
    row(PENSION_MESSAGES.eps, b.eps, [PENSION_MESSAGES.epsLimit, PENSION_MESSAGES.notYourBalance], formatMoney),
  ]
  if (rows.every((r) => !r.ok)) return message(PENSION_MESSAGES.noneAvailable(dateText), ACTION_PENSION)
  // An employer row without a number still says it is not part of the balance.
  const clean = rows.map((r) => ({ label: r.label, value: r.value, note: r.ok || r.label === PENSION_MESSAGES.employeePF ? r.note : join(r.note, PENSION_MESSAGES.notYourBalance) || null }))
  return deepFreeze({
    ok: true, intent: 'QUERY_PENSION_ESTIMATE', answerKind: 'estimated',
    headline: PENSION_MESSAGES.headline,
    rows: clean.map((r) => (r.note ? r : { label: r.label, value: r.value })),
    basis: PENSION_MESSAGES.basis(formatMoney(input.basicMonthly), String(input.structureLabel || 'your salary structure'), dateText),
    partial: rows.some((r) => !r.ok), note: PENSION_MESSAGES.note, action: ACTION_PENSION,
  })
}
