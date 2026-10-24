// D5 - repayment planner: pure glue between the Debts screen and the existing engine (debtEngine.comparePlans).
// No network, no database, no clock (today is always a parameter), no React. Nothing in this file writes anything,
// and nothing here is saved: the planner inputs live in the screen and are gone on reload.
//
// What it does
//   1. selectPlannerDebts: which debts can be planned, with which starting balance, and why each other debt is left out.
//   2. parseBudget / parseLump: strict reading of what the user typed (never NaN, never a guess).
//   3. runPlanner: calls comparePlans and turns the answer (or the refusal) into plain, advice-free sentences and dates.
//
// Every figure is a CALCULATED scenario from the stated figures. The starting balance is PRINCIPAL ONLY: unpaid interest
// is not included (the engine takes principal only), and the screen says so. Credit cards are estimates.
import { comparePlans } from './debtEngine.js'
import { MAX_MONEY } from './debtForm.js'

export const MAX_PLAN_MONTHS = 600 // the engine's own stop: 50 years

// ---------- wording (one place, so one wording test can scan all of it) ----------

export const COPY = {
  heading: 'Repayment planner',
  basis: 'Calculated from your figures. Not a lender statement. Not financial advice.',
  principalOnly: 'The starting balance is the principal only. Unpaid interest is not included.',
  estimateLabel: 'Estimate',
  estimateNote: 'Estimate: a credit card is included, and its figures are rough.',
  monthLabelNote: 'Dates are by month. Month 1 is the month after today.',
  cannotLoadPayments: "Linked payments couldn't be loaded, so the planner can't use today's balances. Use Retry payments above.",
  noDebts: 'Add a debt to see repayment scenarios.',
  noneToPlan: 'None of your debts can be planned yet. See the reasons below.',
  inputsHeading: 'Your numbers',
  budgetLabel: 'Monthly budget for all debts (₹)',
  budgetHint: 'Leave empty to use the required payments only.',
  lumpHeading: 'One-time extra payment (optional)',
  lumpAmountLabel: 'Amount (₹)',
  lumpMonthLabel: 'In month number',
  lumpHint: 'Enter both, or leave both empty.',
  scenarioBaseline: 'Required payments only',
  scenarioAvalanche: 'Avalanche: highest interest rate first',
  scenarioSnowball: 'Snowball: smallest balance first',
  baselineNote: 'Baseline: every debt gets only its required payment.',
  rollNote: 'In the avalanche and snowball scenarios the whole budget is used every month. When a debt is cleared, its payment moves to the next debt.',
  notWithin50: 'Does not pay off within 50 years',
  snowballNote: 'Snowball is a valid way to order payments. Clearing a small debt earlier matters to some people for reasons these numbers do not show.',
  snowballOrderNote: 'Snowball puts extra money on the smallest remaining balance, whatever its interest rate. Adding money can change which debt is paid first, so total interest can go up as well as down.',
  lumpIgnoredNote: 'The one-time payment and any extra budget apply to the avalanche and snowball scenarios only.',
  sameResultOneDebt: 'With one debt, both methods give the same result.',
  noComparison: 'At least one method does not pay off within 50 years, so there is no interest comparison.',
  invalidBudget: 'Enter the budget as a number with at most 2 decimals, above zero.',
  budgetTooBig: 'That budget is too large.',
  invalidLumpPair: 'Enter both the amount and the month for the one-time payment, or leave both empty.',
  invalidLumpAmount: 'Enter the one-time amount as a number with at most 2 decimals, above zero.',
  invalidLumpMonth: `Enter the month as a whole number from 1 to ${MAX_PLAN_MONTHS}.`,
  engineFailed: "The planner couldn't calculate these figures. Nothing is shown rather than a wrong number.",
}

const REASON = {
  closed: 'Closed',
  cleared: 'Cleared',
  noPrincipal: 'No principal outstanding (only unpaid interest remains)',
  noPayment: 'No monthly payment entered',
  paymentsFailed: 'Linked payments could not be calculated',
  invalidFigures: 'Figures are not valid',
}

// ---------- small helpers ----------

const isNum = (x) => typeof x === 'number' && Number.isFinite(x)
const ISO_RE = /^(\d{4})-(\d{2})-(\d{2})$/
const iso10 = (v) => String(v == null ? '' : v).slice(0, 10)
const monthIdx = (iso) => {
  const g = ISO_RE.exec(iso)
  if (!g) return null
  const m = Number(g[2]), d = Number(g[3])
  return m >= 1 && m <= 12 && d >= 1 && d <= 31 ? Number(g[1]) * 12 + (m - 1) : null
}
const MONTH_NAMES = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec']
const monthText = (idx) => `${MONTH_NAMES[((idx % 12) + 12) % 12]} ${Math.floor(idx / 12)}`
const paise = (n) => Math.round(Number(n) * 100)
const rupees = (p) => p / 100
const money = (n) => `₹${Number(n).toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`

/** The calendar month that is `n` months after the month of `today`: monthAfter('2026-10-15', 1) -> 'Nov 2026'. null if bad input. */
export function monthAfter(today, n) {
  const idx = monthIdx(iso10(today))
  if (idx == null || !Number.isInteger(n) || n < 0) return null
  return monthText(idx + n)
}

// ---------- 1. which debts can be planned ----------

/**
 * @param debts       the debt rows (any status)
 * @param infoByDebt  Map(debtId -> { linkedCount, figures }) from the D4b calculation (figures from computeDebtFigures)
 * @returns { included: [{ id, name, kind, balance, annualRatePct, minPayment, estimate, source, paymentsUsed, asOf }],
 *            excluded: [{ id, name, reason }] }
 * The starting balance is the PRINCIPAL outstanding today from D4b when at least one payment is counted and the engine
 * could apply it; otherwise the opening principal. `source` says which one was used ('payments' | 'opening').
 */
export function selectPlannerDebts(debts, infoByDebt) {
  const included = []
  const excluded = []
  for (const d of Array.isArray(debts) ? debts : []) {
    const name = typeof d?.name === 'string' && d.name ? d.name : 'Debt'
    const out = (reason) => excluded.push({ id: d?.id, name, reason })
    if (!d || d.status === 'closed') { out(REASON.closed); continue }

    const info = infoByDebt && typeof infoByDebt.get === 'function' ? infoByDebt.get(d.id) : null
    const figures = info && info.figures ? info.figures : null
    if (figures && figures.kind === 'failed') { out(REASON.paymentsFailed); continue }

    let balance
    let source = 'opening'
    let paymentsUsed = 0
    if (figures && figures.kind === 'figures') {
      if (figures.cleared) { out(REASON.cleared); continue }
      balance = figures.principal
      source = 'payments'
      paymentsUsed = figures.paymentsUsed
    } else {
      balance = Number(d.as_of_outstanding)
      const owed = paise(d.as_of_outstanding) + paise(d.as_of_accrued_interest || 0)
      if (owed === 0) { out(REASON.cleared); continue }
    }
    if (!isNum(balance) || balance < 0) { out(REASON.invalidFigures); continue }
    if (paise(balance) === 0) { out(REASON.noPrincipal); continue }

    const minPayment = d.monthly_payment == null ? null : Number(d.monthly_payment)
    if (minPayment == null || !(minPayment > 0)) { out(REASON.noPayment); continue }
    const rate = Number(d.annual_rate_pct)
    if (!isNum(rate) || rate < 0 || rate > 100 || !isNum(minPayment)) { out(REASON.invalidFigures); continue }

    included.push({
      id: d.id,
      name,
      kind: d.kind,
      balance: rupees(paise(balance)),
      annualRatePct: rate,
      minPayment,
      estimate: d.kind === 'credit_card',
      source,
      paymentsUsed,
      asOf: iso10(d.as_of_date),
    })
  }
  return { included, excluded }
}

// ---------- 2. reading what the user typed ----------

const MONEY_RE = /^\d{1,12}(\.\d{1,2})?$/
function readMoney(text) {
  const t = String(text == null ? '' : text).replace(/,/g, '').trim()
  if (!MONEY_RE.test(t)) return null
  const n = Number(t)
  return n > 0 ? n : null
}

/** Budget text -> { ok:true, value|null } (null = use the required payments) or { ok:false, message }. */
export function parseBudget(text) {
  const t = String(text == null ? '' : text).trim()
  if (t === '') return { ok: true, value: null }
  const n = readMoney(t)
  if (n == null) return { ok: false, message: COPY.invalidBudget }
  if (n > MAX_MONEY) return { ok: false, message: COPY.budgetTooBig }
  return { ok: true, value: n }
}

/** Lump-sum texts -> { ok:true, value:null | {amount, month} } or { ok:false, message }. */
export function parseLump(amountText, monthText_) {
  const a = String(amountText == null ? '' : amountText).trim()
  const m = String(monthText_ == null ? '' : monthText_).trim()
  if (a === '' && m === '') return { ok: true, value: null }
  if (a === '' || m === '') return { ok: false, message: COPY.invalidLumpPair }
  const amount = readMoney(a)
  if (amount == null || amount > MAX_MONEY) return { ok: false, message: COPY.invalidLumpAmount }
  if (!/^\d{1,3}$/.test(m)) return { ok: false, message: COPY.invalidLumpMonth }
  const month = Number(m)
  if (!Number.isInteger(month) || month < 1 || month > MAX_PLAN_MONTHS) return { ok: false, message: COPY.invalidLumpMonth }
  return { ok: true, value: { amount, month } }
}

// ---------- 3. run the plans ----------

/** One month of interest on a balance, in rupees, rounded the same way the engine rounds (to the paisa, half up). */
export function monthlyInterest(balance, annualRatePct) {
  return rupees(Math.round((paise(balance) * annualRatePct) / 1200))
}

export function sumMinimums(debts) {
  return rupees(debts.reduce((a, d) => a + paise(d.minPayment), 0))
}

function scenarioView(key, label, plan, debts, today, estimate) {
  const byId = new Map(debts.map((d) => [d.id, d]))
  const paysOff = plan.paysOff === true
  return {
    key,
    label,
    paysOff,
    months: paysOff ? plan.months : null,
    endLabel: paysOff ? monthAfter(today, plan.months) : null,
    totalInterest: plan.totalInterest,
    totalPaid: plan.totalPaid,
    remaining: plan.remainingPrincipal,
    estimate,
    perDebt: plan.perDebt.map((p) => ({
      id: p.id,
      name: byId.get(p.id)?.name || 'Debt',
      payoffMonth: p.payoffMonth,
      payoffLabel: p.payoffMonth == null ? null : monthAfter(today, p.payoffMonth),
      interest: p.interest,
      remaining: p.remaining,
    })),
  }
}

const planOk = (p) => p && p.ok === true && typeof p.paysOff === 'boolean' && isNum(p.months) && isNum(p.totalInterest) && isNum(p.totalPaid) && isNum(p.remainingPrincipal) && Array.isArray(p.perDebt)
  && p.perDebt.every((x) => isNum(x.interest) && isNum(x.remaining))

function refusalMessage(res, debts) {
  if (res.reason === 'budget-below-minimums') {
    return `Your budget is ${money(res.shortfall)} short of the required payments.`
  }
  if (res.reason === 'minimum-below-interest') {
    const d = debts.find((x) => x.id === res.debtId)
    if (d) {
      return `The monthly payment for ${d.name} (${money(d.minPayment)}) does not cover one month's interest (${money(monthlyInterest(d.balance, d.annualRatePct))}), so this debt would never pay off. Change the debt's monthly payment to plan.`
    }
  }
  return COPY.engineFailed
}

/** The interest comparison between the two methods, as one sentence. Numbers only. */
export function methodComparison(cmp, debtCount) {
  const { avalanche, snowball } = cmp
  if (debtCount === 1) return { text: COPY.sameResultOneDebt, kind: 'same' }
  if (!avalanche.paysOff || !snowball.paysOff) return { text: COPY.noComparison, kind: 'none' }
  const diffP = paise(snowball.totalInterest) - paise(avalanche.totalInterest) // > 0: avalanche costs less
  if (diffP > 0) return { text: `For these figures, avalanche costs ${money(rupees(diffP))} less interest than snowball.`, kind: 'avalanche' }
  if (diffP < 0) return { text: `For these figures, snowball costs ${money(rupees(-diffP))} less interest than avalanche.`, kind: 'snowball' }
  return { text: 'For these figures, both methods cost the same interest.', kind: 'same' }
}

/**
 * D5 correction. Snowball re-ranks debts by remaining balance every month, so added money can change the payoff order and
 * sometimes RAISE total interest. For the snowball scenario only, each kind of added money is compared with the SAME snowball
 * plan without it, every other input held constant:
 *   lump   - the one-time payment: same budget, no one-time payment
 *   budget - the extra monthly budget: same one-time payment (if any), budget cut to the required payments
 *   both   - only when both were entered: required payments only and no one-time payment
 * A warning is made only when the plan WITH the added money costs more interest (exact to the paisa) and both plans pay off
 * within 50 years. Returns null when the engine gives an unusable answer (the caller then shows the generic failure).
 */
function snowballChecks({ engine, input, budget, minimums, extra, lump, withPlan }) {
  const ask = (monthlyBudget, lumpSum) => {
    let c
    try { c = engine({ debts: input, monthlyBudget, lumpSum: lumpSum || undefined }) } catch { return null }
    return c && c.ok === true && planOk(c.snowball) ? c.snowball : null
  }
  const specs = []
  if (lump) specs.push({ kind: 'lump', budget, lump: null })
  if (extra > 0) specs.push({ kind: 'budget', budget: minimums, lump })
  if (lump && extra > 0) specs.push({ kind: 'both', budget: minimums, lump: null })
  const checks = []
  for (const sp of specs) {
    const without = ask(sp.budget, sp.lump)
    if (!without) return null
    const comparable = withPlan.paysOff && without.paysOff
    const diffP = comparable ? paise(withPlan.totalInterest) - paise(without.totalInterest) : null
    checks.push({
      kind: sp.kind,
      comparable,
      withInterest: withPlan.totalInterest,
      withoutInterest: without.totalInterest,
      difference: diffP == null ? null : rupees(diffP), // with minus without; positive means the added money costs more
      higher: diffP != null && diffP > 0,
    })
  }
  return checks
}

export const warningText = (kind, amount) => {
  const x = money(amount)
  if (kind === 'lump') return `With the one-time payment, the snowball scenario costs ${x} more interest than the same snowball plan without it (same monthly budget).`
  if (kind === 'budget') return `With the extra monthly budget, the snowball scenario costs ${x} more interest than the same snowball plan at the required payments only (same one-time payment, if any).`
  return `With the extra monthly budget and the one-time payment together, the snowball scenario costs ${x} more interest than the same snowball plan with required payments only and no one-time payment.`
}

/**
 * @param debts       the included debts from selectPlannerDebts
 * @param budgetText  what the user typed ('' = required payments only)
 * @param lumpAmount, lumpMonth  what the user typed ('' and '' = none)
 * @param today       'YYYY-MM-DD'
 * @param engine      comparePlans (a parameter only so tests can feed it a failing or lying engine)
 * @returns one of
 *   { status: 'empty' }
 *   { status: 'invalid', message }
 *   { status: 'refused', message, reason }
 *   { status: 'failed', message }
 *   { status: 'ok', budget, minimums, extra, lump, estimate, scenarios: [baseline, avalanche, snowball],
 *     savings: { avalanche, snowball } (interest saved vs baseline, or null), monthsSooner: {..}, comparison,
 *     snowballChecks (each kind of added money against the same snowball plan without it), snowballWarnings (only those that cost more) }
 */
export function runPlanner({ debts, budgetText = '', lumpAmount = '', lumpMonth = '', today, engine = comparePlans } = {}) {
  if (!Array.isArray(debts) || debts.length === 0) return { status: 'empty' }
  const b = parseBudget(budgetText)
  if (!b.ok) return { status: 'invalid', message: b.message }
  const l = parseLump(lumpAmount, lumpMonth)
  if (!l.ok) return { status: 'invalid', message: l.message }

  const minimums = sumMinimums(debts)
  const budget = b.value == null ? minimums : b.value
  const input = debts.map((d) => ({ id: d.id, name: d.name, balance: d.balance, annualRatePct: d.annualRatePct, minPayment: d.minPayment }))

  let cmp
  try { cmp = engine({ debts: input, monthlyBudget: budget, lumpSum: l.value || undefined }) } catch { return { status: 'failed', message: COPY.engineFailed } }
  if (!cmp || cmp.ok !== true) {
    if (cmp && cmp.reason && cmp.reason !== 'invalid-input' && cmp.reason !== 'no-debts') {
      return { status: 'refused', reason: cmp.reason, message: refusalMessage(cmp, debts) }
    }
    return { status: 'failed', message: COPY.engineFailed }
  }
  if (!planOk(cmp.baseline) || !planOk(cmp.avalanche) || !planOk(cmp.snowball)) return { status: 'failed', message: COPY.engineFailed }
  if (!isNum(cmp.avalancheVsSnowballInterest)) return { status: 'failed', message: COPY.engineFailed }

  const extraAmount = rupees(paise(budget) - paise(minimums))
  const checks = snowballChecks({ engine, input, budget, minimums, extra: extraAmount, lump: l.value, withPlan: cmp.snowball })
  if (!checks) return { status: 'failed', message: COPY.engineFailed }
  const snowballWarnings = checks.filter((c) => c.higher).map((c) => ({ kind: c.kind, difference: c.difference, text: warningText(c.kind, c.difference) }))

  const estimate = debts.some((d) => d.estimate)
  const scenarios = [
    scenarioView('baseline', COPY.scenarioBaseline, cmp.baseline, debts, today, estimate),
    scenarioView('avalanche', COPY.scenarioAvalanche, cmp.avalanche, debts, today, estimate),
    scenarioView('snowball', COPY.scenarioSnowball, cmp.snowball, debts, today, estimate),
  ]
  const [base, av, sn] = scenarios
  const saved = (s) => (base.paysOff && s.paysOff ? rupees(paise(base.totalInterest) - paise(s.totalInterest)) : null)
  const sooner = (s) => (base.paysOff && s.paysOff ? base.months - s.months : null)
  return {
    status: 'ok',
    budget,
    minimums,
    extra: extraAmount,
    lump: l.value,
    estimate,
    scenarios,
    savings: { avalanche: saved(av), snowball: saved(sn) },
    monthsSooner: { avalanche: sooner(av), snowball: sooner(sn) },
    comparison: methodComparison(cmp, debts.length),
    snowballChecks: checks,
    snowballWarnings,
  }
}

/** Every sentence the planner can show on its own (for the wording test). Dynamic sentences are built by the functions above. */
export const ALL_COPY = () => Object.values(COPY)
