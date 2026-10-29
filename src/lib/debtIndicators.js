// D6 - the debt indicators. PURE: no database, no storage, no clock (the caller passes "today"), no React.
//
// Where every number comes from (nothing is calculated a second time):
//   - A debt with at least one counted linked payment: the figures that the Debts page already shows, computed by
//     debtPayments.computeDebtFigures -> debtEngine.replayDebt (D1/D4b). This file only adds them up.
//   - A debt without a counted payment: its OPENING figures (principal + unpaid interest) on the date they were recorded.
//     These are never presented as a current balance.
//   - Income: financialEngine.totalIncome, unchanged.
//
// Definitions (the same text is shown on screen):
//   Total owed          Sum over ACTIVE debts of: owed today (calculated from opening figures + linked payments, principal + unpaid
//                       interest) for debts with a counted linked payment; opening total (principal + unpaid interest on the
//                       opening date) for the others. A cleared debt counts as 0 because its own figures say so. A debt with
//                       no valid figure is LEFT OUT AND COUNTED AS "no figure", never silently treated as zero.
//   Monthly required    Sum of the monthly payment of active debts that are not cleared and have a valid monthly payment.
//                       The others are listed with the reason.
//   Payment burden      Monthly required payments / average monthly income of the last 3 COMPLETE calendar months, in percent.
//                       Income must be recorded (at least one income transaction above zero) in each of the 3 months.
//   Interest paid       Sum of interestPaid from the replay: interest covered by the linked payments since the opening date of
//                       each debt. Payments before that date, and payments that are not linked, are not included.
//   Repayment progress  Sum of principalRepaid / Sum of (principalRepaid + principal still outstanding), over the debts that
//                       have calculated figures. The replay conserves principal: principalRepaid + principal outstanding =
//                       principal on the opening date, so this is the share of the opening principal repaid since then.
//                       Unpaid interest is not part of it. (Closed debts are not part of any indicator.)
import { totalOwedPaise, isRealDate } from './debtForm.js'
import { totalIncome } from './financialEngine.js'

export const COPY = {
  heading: 'Debt indicators',
  basis: 'Calculated from your figures and linked payments. Not a lender statement. Not financial advice.',
  totalLabel: 'Total owed',
  totalLabelMixed: 'Total owed (mixed basis)',
  totalLabelOpening: 'Total owed (opening figures)',
  totalLabelCalculated: 'Total owed (calculated)',
  totalComponents: 'Every amount is principal plus unpaid interest. Nothing else (fees, penalties) is included. An overpayment is shown but not subtracted from any total.',
  calculatedMeaning: 'Calculated: as of today, from the opening figures with interest added each month and your linked payments applied.',
  openingMeaning: 'Opening figure: as of its own date only. Interest since that date and any payment not linked are not reflected.',
  notVerified: 'A calculated total, not a verified current balance.',
  mixedWarning: 'Mixed basis: this total adds amounts calculated from linked payments to opening figures that are not current. It is not a verified current debt balance.',
  openingOnly: 'Every amount in this total is an opening figure on the date shown, not a current balance.',
  estimateNote: 'Includes credit-card figures, which are estimates.',
  paymentsUnavailable: "Linked payments couldn't be loaded, so owed amounts, interest paid and progress can't be shown. Use Retry payments above.",
  noActiveDebts: 'No active debts, so there is nothing to show.',
  noTotal: 'No valid figure is available for any active debt, so no total is shown.',
  monthlyLabel: 'Monthly required payments',
  noMonthly: 'No active debt has a usable monthly payment.',
  burdenLabel: 'Payment burden',
  burdenDefinition: 'Monthly required payments divided by the average monthly income of the last 3 complete months.',
  notEnoughIncome: 'Not enough income recorded.',
  incomeUnavailable: "Income couldn't be loaded, so the payment burden isn't shown.",
  noPaymentsForBurden: 'No monthly payments to compare with income.',
  interestLabel: 'Interest paid to date',
  interestDefinition: "Interest covered by your linked payments since the date of each debt's opening figures.",
  progressLabel: 'Repayment progress',
  progressDefinition: 'Share of the principal on the opening-figures date that your linked payments have repaid since then. Unpaid interest is not part of it.',
  needsLinkedPayment: 'Needs at least one linked payment that counts.',
  noPrincipal: 'No principal on the opening-figures date, so there is no progress to show.',
  closedNote: 'Closed debts are not included.',
  reasonNoPayment: 'No monthly payment entered',
  reasonBadPayment: 'Monthly payment is not valid',
  reasonCleared: 'Cleared',
  reasonBadFigures: 'Figures are not valid',
  reasonFailed: 'Linked payments could not be calculated',
  reasonNoInfo: 'No calculated figures are available',
}

const paise = (x) => Math.round(Number(x) * 100)
const rupees = (p) => p / 100
const iso10 = (s) => String(s == null ? '' : s).slice(0, 10)
const finite = (x) => typeof x === 'number' && Number.isFinite(x)
const pct1 = (num, den) => Math.round((num * 1000) / den) / 10 // percent with one decimal, from integers

const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec']

/** The last 3 COMPLETE calendar months before the month of `today` ('YYYY-MM-DD'), oldest first. null for a bad date. */
export function incomeWindow(today) {
  const t = iso10(today)
  if (!isRealDate(t)) return null
  const y = Number(t.slice(0, 4)), m = Number(t.slice(5, 7))
  const base = y * 12 + (m - 1)
  const months = []
  for (let back = 3; back >= 1; back--) {
    const idx = base - back
    const yy = Math.floor(idx / 12), mm = (idx % 12) + 1
    const last = new Date(Date.UTC(yy, mm, 0)).getUTCDate()
    const key = `${String(yy).padStart(4, '0')}-${String(mm).padStart(2, '0')}`
    months.push({ key, label: `${MONTHS[mm - 1]} ${yy}`, start: `${key}-01`, end: `${key}-${String(last).padStart(2, '0')}` })
  }
  return { months, start: months[0].start, end: months[2].end }
}

function validRow(d) {
  return d && typeof d === 'object'
    && isRealDate(iso10(d.as_of_date))
    && finite(Number(d.as_of_outstanding)) && Number(d.as_of_outstanding) >= 0
    && finite(Number(d.as_of_accrued_interest || 0)) && Number(d.as_of_accrued_interest || 0) >= 0
}

/**
 * One item per ACTIVE debt.
 *   basis 'calculated'  figures from the replay of counted linked payments
 *   basis 'opening'     opening figures (no counted payment, or payments still waiting in the opening month)
 *   basis 'none'        no usable figure (reason says why)
 *   basis 'unknown'     the linked payments are not available, so it cannot be known whether payments change the figure
 */
function classify(d, infoByDebt) {
  const base = { id: d?.id, name: d?.name || 'Debt', kind: d?.kind, estimate: d?.kind === 'credit_card', asOf: null, owedPaise: null, cleared: false, waiting: 0, reason: null, figures: null }
  if (!validRow(d)) return { ...base, basis: 'none', reason: COPY.reasonBadFigures }
  const asOf = iso10(d.as_of_date)
  const openingPaise = totalOwedPaise(d)
  if (!Number.isSafeInteger(openingPaise) || openingPaise < 0) return { ...base, basis: 'none', reason: COPY.reasonBadFigures }
  if (infoByDebt == null) return { ...base, basis: 'unknown', asOf, owedPaise: openingPaise, cleared: openingPaise === 0 }
  const info = infoByDebt.get(d.id)
  if (!info || !info.figures) return { ...base, basis: 'none', reason: COPY.reasonNoInfo }
  const f = info.figures
  if (f.kind === 'failed') return { ...base, basis: 'none', reason: COPY.reasonFailed }
  if (f.kind === 'figures') {
    const nums = [f.owedToday, f.principal, f.interest, f.principalRepaid, f.interestPaid]
    if (!nums.every(finite) || nums.some((n) => n < 0)) return { ...base, basis: 'none', reason: COPY.reasonBadFigures }
    return { ...base, basis: 'calculated', asOf, owedPaise: paise(f.owedToday), principalPaise: paise(f.principal), interestPaise: paise(f.interest), overpaidPaise: finite(f.overpaid) ? paise(f.overpaid) : 0, cleared: paise(f.owedToday) === 0, estimate: base.estimate || !!f.estimate, figures: f }
  }
  // 'none' (no counted payment) and 'same-month' (payments waiting): the opening figures are all there is
  return { ...base, basis: 'opening', asOf, owedPaise: openingPaise, principalPaise: paise(d.as_of_outstanding), interestPaise: paise(d.as_of_accrued_interest || 0), cleared: openingPaise === 0, waiting: f.kind === 'same-month' ? Number(f.paymentsWaiting) || 0 : 0 }
}

function monthlyRequired(items, debtsById) {
  let totalP = 0, count = 0
  const skipped = []
  for (const it of items) {
    if (it.cleared && it.basis !== 'none') { skipped.push({ id: it.id, name: it.name, reason: COPY.reasonCleared }); continue }
    const raw = debtsById.get(it.id)?.monthly_payment
    if (raw == null) { skipped.push({ id: it.id, name: it.name, reason: COPY.reasonNoPayment }); continue }
    const p = paise(raw)
    if (!finite(Number(raw)) || !(p > 0) || !Number.isSafeInteger(p)) { skipped.push({ id: it.id, name: it.name, reason: COPY.reasonBadPayment }); continue }
    totalP += p; count++
  }
  return { status: count > 0 ? 'ok' : 'none', amount: rupees(totalP), amountPaise: totalP, count, skipped }
}

function burden(monthly, incomeRows, today) {
  const win = incomeWindow(today)
  if (monthly.status !== 'ok') return { status: 'no-payments', text: COPY.noPaymentsForBurden, months: win ? win.months : [] }
  if (!win) return { status: 'no-income', text: COPY.notEnoughIncome, months: [] }
  if (!Array.isArray(incomeRows)) return { status: 'income-unavailable', text: COPY.incomeUnavailable, months: win.months }
  const clean = incomeRows.filter((t) => t && t.type === 'income' && finite(Number(t.amount)) && Number(t.amount) > 0)
    .map((t) => ({ ...t, amount: Number(t.amount), transaction_date: iso10(t.transaction_date) }))
  const perMonth = win.months.map((m) => {
    const inMonth = clean.filter((t) => t.transaction_date >= m.start && t.transaction_date <= m.end)
    return { ...m, count: inMonth.length, amountPaise: paise(totalIncome(inMonth, m.start, m.end)) }
  })
  if (perMonth.some((m) => m.count === 0 || !(m.amountPaise > 0))) return { status: 'no-income', text: COPY.notEnoughIncome, months: perMonth }
  const sumP = perMonth.reduce((a, m) => a + m.amountPaise, 0)
  const percent = pct1(monthly.amountPaise * 3, sumP)
  if (!finite(percent)) return { status: 'no-income', text: COPY.notEnoughIncome, months: perMonth }
  return { status: 'ok', percent, monthlyRequired: monthly.amount, averageIncome: rupees(Math.round(sumP / 3)), months: perMonth }
}

/**
 * @param debts       the user's debt rows (any status; only active ones are used)
 * @param infoByDebt  Map(debtId -> { figures }) from the Debts page, or null when the linked payments are not available
 *                    (the Overview card, or a failed load). With null, owed / interest / progress are 'unavailable'.
 * @param incomeRows  transactions with at least { type, amount, transaction_date }, or null when they could not be read
 * @param today       'YYYY-MM-DD'
 */
export function computeIndicators({ debts, infoByDebt = null, incomeRows = null, today } = {}) {
  const list = Array.isArray(debts) ? debts : []
  const active = list.filter((d) => d && d.status === 'active')
  const debtsById = new Map(active.map((d) => [d.id, d]))
  const items = active.map((d) => classify(d, infoByDebt))
  const paymentsKnown = infoByDebt != null
  const monthly = monthlyRequired(items, debtsById)
  const out = {
    activeCount: active.length,
    items,
    paymentsKnown,
    monthly,
    burden: burden(monthly, incomeRows, today),
  }
  // ---- total owed ----
  if (active.length === 0) out.total = { status: 'no-debts' }
  else if (!paymentsKnown) out.total = { status: 'unavailable' }
  else {
    const noFigure = items.filter((i) => i.basis === 'none').map((i) => ({ id: i.id, name: i.name, reason: i.reason }))
    const calc = items.filter((i) => i.basis === 'calculated')
    const opening = items.filter((i) => i.basis === 'opening')
    const sumP = (xs) => xs.reduce((a, i) => a + i.owedPaise, 0)
    if (calc.length + opening.length === 0) out.total = { status: 'none', noFigure }
    else {
      out.total = {
        status: 'ok',
        amount: rupees(sumP(calc) + sumP(opening)),
        calculated: { count: calc.length, amount: rupees(sumP(calc)) },
        opening: { count: opening.length, amount: rupees(sumP(opening)) },
        mixed: calc.length > 0 && opening.length > 0,
        openingOnly: calc.length === 0,
        hasEstimate: [...calc, ...opening].some((i) => i.estimate),
        noFigure,
        partial: noFigure.length > 0,
      }
    }
  }
  // ---- interest paid and progress (only debts with calculated figures) ----
  const withFigures = items.filter((i) => i.basis === 'calculated')
  if (active.length === 0) { out.interest = { status: 'no-debts' }; out.progress = { status: 'no-debts' } }
  else if (!paymentsKnown) { out.interest = { status: 'unavailable' }; out.progress = { status: 'unavailable' } }
  else if (withFigures.length === 0) { out.interest = { status: 'needs-payment', text: COPY.needsLinkedPayment }; out.progress = { status: 'needs-payment', text: COPY.needsLinkedPayment } }
  else {
    const without = active.length - withFigures.length
    const interestP = withFigures.reduce((a, i) => a + paise(i.figures.interestPaid), 0)
    out.interest = { status: 'ok', amount: rupees(interestP), debtCount: withFigures.length, withoutCount: without, hasEstimate: withFigures.some((i) => i.estimate) }
    const repaidP = withFigures.reduce((a, i) => a + paise(i.figures.principalRepaid), 0)
    const denP = withFigures.reduce((a, i) => a + paise(i.figures.principalRepaid) + paise(i.figures.principal), 0)
    out.progress = denP > 0
      ? { status: 'ok', percent: pct1(repaidP, denP), repaid: rupees(repaidP), openingPrincipal: rupees(denP), debtCount: withFigures.length, withoutCount: without, hasEstimate: withFigures.some((i) => i.estimate) }
      : { status: 'no-principal', text: COPY.noPrincipal }
  }
  return out
}

/** Every fixed sentence (for the wording test). */
export const ALL_COPY = () => Object.values(COPY)
