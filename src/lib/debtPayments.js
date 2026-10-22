// D4b - debt payments: pure logic. No network, no database, no clock (today is always a parameter).
//
// A debt payment is an ordinary EXPENSE transaction that the user links to a debt by hand. The link table
// (debt_payments, D4a) stores only "this debt <- this transaction". The amount and the date are read live from the
// transaction (decision W4), so editing or deleting a linked transaction changes the debt on the next load.
//
// Nothing in this file writes anything. The page does the reads and the two writes (link, unlink); this file turns
// what was read into what the screen shows, using the existing deterministic engine (debtEngine.replayDebt).
import { replayDebt, buildSchedule } from './debtEngine.js'

export const READ_CHUNK = 100 // Supabase returns a limited number of rows per request: always read in chunks
export const PICKER_LIMIT = 200 // newest unlinked expenses offered in the picker (W12)
export const MAX_PICKER_PAGES = 60 // safety stop: at most 6,000 transactions scanned for one picker
export const MAX_READ_PAGES = 500 // safety stop for reading all of a user's links (50,000 links)
export const QUIET_MONTHS = 2 // "No payment linked in N months" shows from this many calendar months

export const DISCLOSURE = 'Amounts and dates come from your transactions. If you edit or delete a linked transaction, this debt changes.'
export const NOT_EXPENSE_NOTE = 'Not counted: this is no longer an expense'

const iso10 = (v) => String(v == null ? '' : v).slice(0, 10)
const ISO_RE = /^(\d{4})-(\d{2})-(\d{2})$/
const monthIdx = (iso) => { const g = ISO_RE.exec(iso); return g ? Number(g[1]) * 12 + (Number(g[2]) - 1) : null }
const paise = (n) => Math.round(Number(n) * 100)
const MONTH_NAMES = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec']
const monthLabel = (idx) => `${MONTH_NAMES[((idx % 12) + 12) % 12]} ${Math.floor(idx / 12)}`

// ---------- chunked reading (the database client is passed in, so these stay testable) ----------

export function chunk(list, size = READ_CHUNK) {
  const out = []
  for (let i = 0; i < list.length; i += size) out.push(list.slice(i, i + size))
  return out
}

/** Read every row, one page of at most `size` rows at a time. readPage(from, to) -> { data, error }. */
export async function readAllPages(readPage, size = READ_CHUNK, maxPages = MAX_READ_PAGES) {
  const all = []
  for (let page = 0; page < maxPages; page++) {
    const res = await readPage(page * size, page * size + size - 1)
    if (res.error) return { data: null, error: res.error }
    const rows = res.data || []
    all.push(...rows)
    if (rows.length < size) return { data: all, error: null }
  }
  // Never hand back a list that may be cut short as if it were complete.
  return { data: null, error: { message: 'too many rows to read', code: 'TOO_MANY' } }
}

/** Read the rows whose id is in `ids`, at most `size` ids per request. readChunk(idsChunk) -> { data, error }. */
export async function readByIds(readChunk, ids, size = READ_CHUNK) {
  const all = []
  for (const part of chunk([...new Set(ids)], size)) {
    const res = await readChunk(part)
    if (res.error) return { data: null, error: res.error }
    all.push(...(res.data || []))
  }
  return { data: all, error: null }
}

// ---------- database errors -> plain sentences ----------

export const DUPLICATE_LINK_MESSAGE = 'This payment is already linked to a debt.'
export const NOT_EXPENSE_MESSAGE = 'Only an expense can be a debt payment.'
export const MISSING_MESSAGE = 'That transaction or debt no longer exists.'

export function paymentErrorMessage(error, fallback) {
  const code = error && error.code
  const text = String((error && error.message) || '')
  if (code === '23505' || /debt_payments_transaction_id_key/.test(text)) return DUPLICATE_LINK_MESSAGE
  if (code === '23514' || /must be an expense/.test(text)) return NOT_EXPENSE_MESSAGE
  if (code === '23503') return MISSING_MESSAGE
  return fallback
}

// ---------- the linked payments of one debt ----------

/**
 * One row per link, with what the screen needs and whether the engine counts it.
 *   links:         [{ id, transaction_id, created_at }]            (this debt's links)
 *   txById:        Map(id -> { type, amount, transaction_date, description, account_id })
 *   accountNames:  Map(account id -> name)
 * status: 'counted' | 'not-expense' | 'before-as-of' | 'after-today' | 'invalid' | 'missing'.
 * Newest payment first. A row that is not counted says why; nothing is hidden and nothing is guessed.
 */
export function annotateLinks({ debt, links, txById, accountNames, today }) {
  const asOf = iso10(debt.as_of_date)
  const rows = []
  for (const link of links || []) {
    const tx = txById.get(link.transaction_id)
    const base = { linkId: link.id, transactionId: link.transaction_id, linkedAt: link.created_at || null }
    if (!tx) {
      rows.push({ ...base, date: null, amount: null, description: null, accountName: null, type: null, status: 'missing', counted: false, note: 'Not counted: this transaction could not be loaded' })
      continue
    }
    const date = iso10(tx.transaction_date)
    const amount = Number(tx.amount)
    const view = { ...base, date, amount, description: tx.description || null, accountName: accountNames.get(tx.account_id) || null, type: tx.type }
    let status = 'counted'
    let note = null
    if (tx.type !== 'expense') { status = 'not-expense'; note = NOT_EXPENSE_NOTE }
    else if (!ISO_RE.test(date) || !Number.isFinite(amount) || !(amount > 0)) { status = 'invalid'; note = 'Not counted: the amount or date is not valid' }
    else if (date <= asOf) { status = 'before-as-of'; note = 'Not counted: dated on or before the date your figures are from' }
    else if (date > today) { status = 'after-today'; note = 'Not counted yet: dated after today' }
    rows.push({ ...view, status, counted: status === 'counted', note })
  }
  // Newest date first; ties: most recently linked first, then by link id so the order never wobbles.
  const desc = (x, y) => (x === y ? 0 : x < y ? 1 : -1)
  rows.sort((a, b) => desc(a.date || '', b.date || '') || desc(String(a.linkedAt || ''), String(b.linkedAt || '')) || -desc(String(a.linkId), String(b.linkId)))
  return rows
}

// ---------- the calculated figures ----------

/** The engine's input for a debt and its counted payments. Money enters as given; the engine works in paise. */
export function replayInput(debt, rows, today) {
  return {
    asOfDate: iso10(debt.as_of_date),
    asOfOutstanding: Number(debt.as_of_outstanding),
    asOfAccruedInterest: Number(debt.as_of_accrued_interest || 0),
    annualRatePct: Number(debt.annual_rate_pct),
    payments: rows.filter((r) => r.counted).map((r) => ({ date: r.date, amount: r.amount })),
    today,
  }
}

/**
 * What the card shows for a debt, once it has linked payments.
 *   { kind: 'none' }      no payment is counted: the card keeps showing the opening figures (nothing is invented)
 *   { kind: 'same-month' } payments are counted but today is still in the month of the opening figures. The engine works
 *                         month by month and has not closed a month yet, so it cannot apply them: said plainly, not hidden.
 *   { kind: 'failed' }    the engine refused the input: the card shows a plain fallback, never NaN or a made-up number
 *   { kind: 'figures', ... }
 * remaining_months is never touched. A credit card is an estimate and never gets a payoff schedule.
 */
// `engine` exists only so tests can watch which engine functions are called (and feed them bad numbers).
export function computeDebtFigures(debt, rows, today, engine = { replayDebt, buildSchedule }) {
  const counted = rows.filter((r) => r.counted)
  if (counted.length === 0) return { kind: 'none' }
  let res
  try { res = engine.replayDebt(replayInput(debt, rows, today)) } catch { return { kind: 'failed' } }
  if (!res || !res.ok) return { kind: 'failed' }
  if (!Array.isArray(res.months) || res.months.length === 0) {
    const asOfIdx = monthIdx(iso10(debt.as_of_date))
    return { kind: 'same-month', paymentsWaiting: counted.length, from: asOfIdx == null ? null : monthLabel(asOfIdx + 1) }
  }
  const nums = [res.outstandingPrincipal, res.accruedInterest, res.totalOwed, res.principalRepaid, res.interestPaid, res.overpaid]
  if (!nums.every((n) => typeof n === 'number' && Number.isFinite(n))) return { kind: 'failed' }

  const estimate = debt.kind === 'credit_card'
  const cleared = paise(res.totalOwed) === 0
  let schedule = null
  // Never call the schedule with a zero balance, and never for a card.
  if (!estimate && !cleared && res.outstandingPrincipal > 0 && debt.monthly_payment != null) {
    const sc = engine.buildSchedule({ principal: res.outstandingPrincipal, annualRatePct: Number(debt.annual_rate_pct), payment: Number(debt.monthly_payment) })
    if (sc && sc.ok) schedule = { paysOff: sc.paysOff, months: sc.months, totalInterest: sc.totalInterest, reason: sc.reason || null }
  }
  return {
    kind: 'figures',
    estimate,
    cleared,
    owedToday: res.totalOwed,
    principal: res.outstandingPrincipal,
    interest: res.accruedInterest,
    principalRepaid: res.principalRepaid,
    interestPaid: res.interestPaid,
    overpaid: res.overpaid,
    paymentsUsed: counted.length,
    schedule,
  }
}

/**
 * Whole calendar months since the latest counted payment (or since the as-of date when none is counted), when that is
 * QUIET_MONTHS or more. null otherwise. This is a prompt to link a payment, never a statement that anything is overdue.
 */
export function quietMonths(debt, rows, today) {
  const counted = rows.filter((r) => r.counted).map((r) => r.date).sort()
  const last = counted.length ? counted[counted.length - 1] : iso10(debt.as_of_date)
  const a = monthIdx(last), b = monthIdx(today)
  if (a == null || b == null) return null
  const n = b - a
  return n >= QUIET_MONTHS ? n : null
}

// ---------- the picker ----------

const SUGGEST_RE = /\b(emi|loans?)\b/i
/** The categories whose expenses are suggested first: any category named EMI or Loan (e.g. the seeded "EMI/Loan"). */
export const isSuggestedCategory = (name) => SUGGEST_RE.test(String(name || ''))

/** True when this transaction may be offered: an expense, strictly after the as-of date, through today, not linked. */
export function isEligible(tx, debt, today, linkedIds) {
  if (!tx || tx.type !== 'expense') return false
  const date = iso10(tx.transaction_date)
  if (!ISO_RE.test(date) || !(Number(tx.amount) > 0)) return false
  if (date <= iso10(debt.as_of_date) || date > today) return false
  return !linkedIds.has(tx.id)
}

/**
 * The PICKER_LIMIT newest eligible expenses. readPage(from, to) returns the user's expenses in the window, newest first.
 * Pages are read until enough UNLINKED ones are found, so already-linked transactions never eat the 200. `more` says
 * that eligible transactions exist beyond the ones returned (or that the safety stop was reached).
 */
export async function collectUnlinked({ readPage, debt, today, linkedIds, limit = PICKER_LIMIT, size = READ_CHUNK, maxPages = MAX_PICKER_PAGES }) {
  const picked = []
  const seen = new Set()
  for (let page = 0; page < maxPages; page++) {
    const res = await readPage(page * size, page * size + size - 1)
    if (res.error) return { rows: null, more: false, error: res.error }
    const rows = res.data || []
    for (const tx of rows) {
      if (seen.has(tx.id) || !isEligible(tx, debt, today, linkedIds)) continue
      seen.add(tx.id)
      picked.push(tx)
    }
    if (picked.length > limit) return { rows: picked.slice(0, limit), more: true, error: null }
    if (rows.length < size) return { rows: picked, more: false, error: null }
  }
  return { rows: picked.slice(0, limit), more: true, error: null }
}

/** Suggested (EMI / Loan) first, then everything else; each group keeps its newest-first order. Nothing is dropped. */
export function splitSuggestions(rows, categoryNames) {
  const suggested = [], others = []
  for (const tx of rows) (isSuggestedCategory(categoryNames.get(tx.category_id)) ? suggested : others).push(tx)
  return { suggested, others }
}

// ---------- export rows ----------

/** One flat row per link for the payments CSV (the CSV builder lives in debtExport.js). */
export function paymentsExportRows(debts, rowsByDebt) {
  const out = []
  for (const debt of debts) {
    for (const r of rowsByDebt.get(debt.id) || []) {
      out.push({
        debt_name: debt.name, debt_status: debt.status, transaction_date: r.date, amount: r.amount, description: r.description,
        account: r.accountName, transaction_type: r.type, counted: r.counted ? 'yes' : 'no', not_counted_reason: r.note,
        linked_on: r.linkedAt ? String(r.linkedAt).slice(0, 10) : null,
      })
    }
  }
  return out
}
