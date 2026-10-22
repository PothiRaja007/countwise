import assert from 'node:assert/strict'
import {
  chunk, readAllPages, readByIds, paymentErrorMessage, annotateLinks, replayInput, computeDebtFigures, quietMonths,
  isSuggestedCategory, isEligible, collectUnlinked, splitSuggestions, paymentsExportRows,
  READ_CHUNK, PICKER_LIMIT, DISCLOSURE, NOT_EXPENSE_NOTE, DUPLICATE_LINK_MESSAGE, NOT_EXPENSE_MESSAGE, MISSING_MESSAGE,
} from './debtPayments.js'
import { replayDebt, buildSchedule } from './debtEngine.js'

let passed = 0, failed = 0
async function test(name, fn) {
  try { await fn(); passed++; console.log(`  PASS  ${name}`) } catch (e) { failed++; console.log(`  FAIL  ${name}\n        ${e.message}`) }
}

const TODAY = '2026-10-15'
const loan = (o = {}) => ({ id: 'd3', name: 'Bike loan', kind: 'term_loan', status: 'active', as_of_date: '2026-08-01', as_of_outstanding: 60000, as_of_accrued_interest: 0, annual_rate_pct: 12, monthly_payment: 3000, remaining_months: 24, due_day: 10, ...o })
const tx = (id, o = {}) => ({ id, type: 'expense', amount: 5000, transaction_date: '2026-09-05', description: id, account_id: 'a1', category_id: null, ...o })
const mapOf = (list) => new Map(list.map((t) => [t.id, t]))
const accounts = new Map([['a1', 'SBI'], ['a2', 'HDFC']])
const link = (id, transaction_id, created_at = '2026-10-10T00:00:00Z') => ({ id, transaction_id, created_at })
const annotate = (debt, links, txs, today = TODAY) => annotateLinks({ debt, links, txById: mapOf(txs), accountNames: accounts, today })

console.log('debtPayments tests\n')

// ---------- reading in chunks ----------
await test('P1: chunk splits at the size and keeps order', () => {
  assert.deepEqual(chunk([1, 2, 3, 4, 5], 2), [[1, 2], [3, 4], [5]])
  assert.deepEqual(chunk([], 100), [])
  assert.equal(READ_CHUNK, 100)
  assert.equal(chunk(Array.from({ length: 250 }, (_, i) => i)).map((c) => c.length).join(','), '100,100,50')
})
await test('P2: readAllPages asks for ranges of at most 100 rows and stops at the first short page', async () => {
  const calls = []
  const all = Array.from({ length: 250 }, (_, i) => ({ id: i }))
  const r = await readAllPages(async (from, to) => { calls.push([from, to]); return { data: all.slice(from, to + 1), error: null } })
  assert.equal(r.error, null); assert.equal(r.data.length, 250)
  assert.deepEqual(calls, [[0, 99], [100, 199], [200, 299]])
  assert.ok(calls.every(([a, b]) => b - a + 1 <= 100))
})
await test('P3: readAllPages with exactly 200 rows reads a third (empty) page; with 0 rows reads one page', async () => {
  const calls = []
  const rows = Array.from({ length: 200 }, (_, i) => ({ id: i }))
  const r = await readAllPages(async (from, to) => { calls.push(from); return { data: rows.slice(from, to + 1), error: null } })
  assert.equal(r.data.length, 200); assert.deepEqual(calls, [0, 100, 200])
  const e = await readAllPages(async () => ({ data: [], error: null }))
  assert.deepEqual(e, { data: [], error: null })
})
await test('P4: a failing page fails the whole read (no half list is returned)', async () => {
  let n = 0
  const r = await readAllPages(async () => (++n === 2 ? { data: null, error: { code: 'X' } } : { data: Array.from({ length: 100 }, (_, i) => ({ id: i })), error: null }))
  assert.equal(r.data, null); assert.equal(r.error.code, 'X')
})
await test('P5: readAllPages never returns a list that may be cut short: the safety stop is an error', async () => {
  const r = await readAllPages(async () => ({ data: Array.from({ length: 100 }, (_, i) => ({ id: i })), error: null }), 100, 3)
  assert.equal(r.data, null); assert.equal(r.error.code, 'TOO_MANY')
})
await test('P6: readByIds sends each id once, at most 100 per request, and joins the results', async () => {
  const sizes = []
  const ids = [...Array.from({ length: 230 }, (_, i) => `t${i}`), 't1', 't2']
  const r = await readByIds(async (part) => { sizes.push(part.length); return { data: part.map((id) => ({ id })), error: null } }, ids)
  assert.deepEqual(sizes, [100, 100, 30]); assert.equal(r.data.length, 230); assert.equal(r.error, null)
  assert.deepEqual(await readByIds(async () => { throw new Error('must not be called') }, []), { data: [], error: null })
  const bad = await readByIds(async () => ({ data: null, error: { code: 'X' } }), ['a'])
  assert.equal(bad.data, null); assert.equal(bad.error.code, 'X')
})

// ---------- messages ----------
await test('P7: database errors become the three plain sentences; anything else uses the fallback', () => {
  assert.equal(paymentErrorMessage({ code: '23505', message: 'duplicate key value violates unique constraint "debt_payments_transaction_id_key"' }, 'f'), 'This payment is already linked to a debt.')
  assert.equal(paymentErrorMessage({ code: '23514', message: 'a debt payment must be an expense transaction' }, 'f'), 'Only an expense can be a debt payment.')
  assert.equal(paymentErrorMessage({ code: '23503', message: 'violates foreign key' }, 'f'), 'That transaction or debt no longer exists.')
  assert.equal(paymentErrorMessage({ message: 'duplicate key value violates unique constraint "debt_payments_transaction_id_key"' }, 'f'), DUPLICATE_LINK_MESSAGE)
  assert.equal(paymentErrorMessage({ message: 'a debt payment must be an expense transaction' }, 'f'), NOT_EXPENSE_MESSAGE)
  assert.equal(paymentErrorMessage({ code: 'X', message: 'boom' }, 'fallback'), 'fallback')
  assert.equal(paymentErrorMessage(null, 'fallback'), 'fallback')
  assert.equal(MISSING_MESSAGE, 'That transaction or debt no longer exists.')
})
await test('P8: the disclosure and the not-counted wording are exactly as approved', () => {
  assert.equal(DISCLOSURE, 'Amounts and dates come from your transactions. If you edit or delete a linked transaction, this debt changes.')
  assert.equal(NOT_EXPENSE_NOTE, 'Not counted: this is no longer an expense')
})

// ---------- annotating the links ----------
await test('P9: a linked expense inside the window is counted, with its account name', () => {
  const rows = annotate(loan(), [link('l1', 'p1')], [tx('p1')])
  assert.equal(rows.length, 1)
  assert.deepEqual(rows[0], { linkId: 'l1', transactionId: 'p1', linkedAt: '2026-10-10T00:00:00Z', date: '2026-09-05', amount: 5000, description: 'p1', accountName: 'SBI', type: 'expense', status: 'counted', counted: true, note: null })
})
await test('P10 (W5): a linked transaction that became income or a transfer is NOT counted and says so', () => {
  const rows = annotate(loan(), [link('l1', 'a'), link('l2', 'b')], [tx('a', { type: 'income' }), tx('b', { type: 'transfer' })])
  assert.deepEqual(rows.map((r) => [r.status, r.counted, r.note]), [['not-expense', false, 'Not counted: this is no longer an expense'], ['not-expense', false, 'Not counted: this is no longer an expense']])
})
await test('P11 (W7): the date window is strictly after the as-of date through today, inclusive', () => {
  const rows = annotate(loan(), [link('l1', 'on'), link('l2', 'next'), link('l3', 'today'), link('l4', 'tomorrow')], [
    tx('on', { transaction_date: '2026-08-01' }), tx('next', { transaction_date: '2026-08-02' }), tx('today', { transaction_date: TODAY }), tx('tomorrow', { transaction_date: '2026-10-16' }),
  ])
  const by = Object.fromEntries(rows.map((r) => [r.transactionId, r.status]))
  assert.deepEqual(by, { on: 'before-as-of', next: 'counted', today: 'counted', tomorrow: 'after-today' })
})
await test('P12: an unreadable amount or date, or a missing transaction, is shown as not counted (never NaN)', () => {
  const rows = annotate(loan(), [link('l1', 'a'), link('l2', 'b'), link('l3', 'c'), link('l4', 'gone')], [
    tx('a', { amount: 'abc' }), tx('b', { amount: 0 }), tx('c', { transaction_date: 'not-a-date' }),
  ])
  assert.deepEqual(rows.map((r) => r.status).sort(), ['invalid', 'invalid', 'invalid', 'missing'])
  assert.ok(rows.every((r) => !r.counted && r.note))
  const gone = rows.find((r) => r.status === 'missing')
  assert.equal(gone.amount, null); assert.equal(gone.date, null)
})
await test('P13: newest payment first; same date: most recently linked first; the order is stable', () => {
  const rows = annotate(loan(), [link('l1', 'a', '2026-10-01T00:00:00Z'), link('l2', 'b', '2026-10-03T00:00:00Z'), link('l3', 'c', '2026-10-02T00:00:00Z'), link('l4', 'd', '2026-10-02T00:00:00Z')], [
    tx('a', { transaction_date: '2026-09-01' }), tx('b', { transaction_date: '2026-09-01' }), tx('c', { transaction_date: '2026-10-01' }), tx('d', { transaction_date: '2026-10-01' }),
  ])
  assert.deepEqual(rows.map((r) => r.linkId), ['l3', 'l4', 'l2', 'l1'])
})
await test('P14: a numeric amount sent as text is read as a number; the description may be empty', () => {
  const rows = annotate(loan(), [link('l1', 'a')], [tx('a', { amount: '1250.50', description: null })])
  assert.equal(rows[0].amount, 1250.5); assert.equal(rows[0].description, null); assert.equal(rows[0].counted, true)
})

// ---------- mapping to the engine ----------
await test('P15: replayInput maps the debt row and ONLY the counted payments to replayDebt', () => {
  const rows = annotate(loan({ as_of_accrued_interest: '120.50', as_of_outstanding: '60000.00', annual_rate_pct: '12.00' }), [link('l1', 'a'), link('l2', 'b'), link('l3', 'c')], [
    tx('a', { amount: 5000, transaction_date: '2026-09-05' }), tx('b', { type: 'income' }), tx('c', { transaction_date: '2026-07-01' }),
  ])
  assert.deepEqual(replayInput(loan({ as_of_accrued_interest: '120.50', as_of_outstanding: '60000.00', annual_rate_pct: '12.00' }), rows, TODAY), {
    asOfDate: '2026-08-01', asOfOutstanding: 60000, asOfAccruedInterest: 120.5, annualRatePct: 12, payments: [{ date: '2026-09-05', amount: 5000 }], today: TODAY,
  })
})

// ---------- the calculated figures ----------
const two = () => annotate(loan(), [link('l1', 'p1'), link('l2', 'p2')], [tx('p1', { transaction_date: '2026-09-05' }), tx('p2', { transaction_date: '2026-10-05' })])
await test('P16: two EMI payments give the exact engine figures (worked by hand: 60,000 at 12%)', () => {
  const f = computeDebtFigures(loan(), two(), TODAY)
  // Sep: interest 600, pay 5000 -> principal 55,600. Oct: interest 556, pay 5000 -> principal 51,156.
  assert.equal(f.kind, 'figures')
  assert.equal(f.owedToday, 51156); assert.equal(f.principal, 51156); assert.equal(f.interest, 0)
  assert.equal(f.principalRepaid, 8844); assert.equal(f.interestPaid, 1156); assert.equal(f.overpaid, 0)
  assert.equal(f.paymentsUsed, 2); assert.equal(f.estimate, false); assert.equal(f.cleared, false)
})
await test('P17: the figures equal replayDebt called directly, and the debt row is not changed (remaining_months is never counted down)', () => {
  const debt = loan(); const before = JSON.stringify(debt)
  const rows = two()
  const f = computeDebtFigures(debt, rows, TODAY)
  const direct = replayDebt({ asOfDate: '2026-08-01', asOfOutstanding: 60000, asOfAccruedInterest: 0, annualRatePct: 12, payments: [{ date: '2026-09-05', amount: 5000 }, { date: '2026-10-05', amount: 5000 }], today: TODAY })
  assert.equal(f.owedToday, direct.totalOwed); assert.equal(f.principalRepaid, direct.principalRepaid); assert.equal(f.interestPaid, direct.interestPaid)
  assert.equal(JSON.stringify(debt), before); assert.equal(debt.remaining_months, 24)
})
await test('P18: with no counted payment the result is "none" (the card keeps the opening figures, nothing is invented)', () => {
  assert.deepEqual(computeDebtFigures(loan(), [], TODAY), { kind: 'none' })
  const onlyIncome = annotate(loan(), [link('l1', 'a')], [tx('a', { type: 'income' })])
  assert.deepEqual(computeDebtFigures(loan(), onlyIncome, TODAY), { kind: 'none' })
})
await test('P19: a transaction edited to income drops out of the figures; edited back it counts again (live amounts)', () => {
  const counted = computeDebtFigures(loan(), two(), TODAY)
  const edited = annotate(loan(), [link('l1', 'p1'), link('l2', 'p2')], [tx('p1', { transaction_date: '2026-09-05' }), tx('p2', { transaction_date: '2026-10-05', type: 'income' })])
  const f = computeDebtFigures(loan(), edited, TODAY)
  assert.equal(f.paymentsUsed, 1); assert.ok(f.owedToday > counted.owedToday)
  const changed = annotate(loan(), [link('l1', 'p1'), link('l2', 'p2')], [tx('p1', { transaction_date: '2026-09-05', amount: 1000 }), tx('p2', { transaction_date: '2026-10-05' })])
  assert.ok(computeDebtFigures(loan(), changed, TODAY).owedToday > counted.owedToday, 'a smaller linked amount leaves more owed')
})
await test('P20: payments that clear the debt show Cleared and no schedule is built for a zero balance', () => {
  const debt = loan({ kind: 'interest_free', annual_rate_pct: 0, as_of_outstanding: 10000, monthly_payment: 5000 })
  const rows = annotate(debt, [link('l1', 'a'), link('l2', 'b')], [tx('a', { amount: 5000 }), tx('b', { amount: 5000, transaction_date: '2026-10-05' })])
  const f = computeDebtFigures(debt, rows, TODAY)
  assert.equal(f.cleared, true); assert.equal(f.owedToday, 0); assert.equal(f.schedule, null); assert.equal(f.overpaid, 0)
})
await test('P21: an overpayment is reported as overpaid, the balance stays 0, and it counts as cleared', () => {
  const debt = loan({ kind: 'interest_free', annual_rate_pct: 0, as_of_outstanding: 1000, monthly_payment: null })
  const rows = annotate(debt, [link('l1', 'a')], [tx('a', { amount: 1500 })])
  const f = computeDebtFigures(debt, rows, TODAY)
  assert.equal(f.cleared, true); assert.equal(f.owedToday, 0); assert.equal(f.overpaid, 500); assert.equal(f.principalRepaid, 1000)
})
await test('P22: a loan with a monthly payment gets a schedule from the principal outstanding TODAY, never from the opening principal', () => {
  const f = computeDebtFigures(loan(), two(), TODAY)
  assert.ok(f.schedule && f.schedule.paysOff)
  assert.ok(f.schedule.months < 24 + 1)
  const fromToday = computeDebtFigures(loan({ monthly_payment: 3000 }), two(), TODAY)
  assert.deepEqual(fromToday.schedule, f.schedule)
  const noPayment = computeDebtFigures(loan({ monthly_payment: null }), two(), TODAY)
  assert.equal(noPayment.schedule, null)
})
await test('P23 (W8): a credit card is an estimate and never gets a payoff schedule', () => {
  const card = loan({ kind: 'credit_card', monthly_payment: 3000 })
  const f = computeDebtFigures(card, annotate(card, [link('l1', 'p1')], [tx('p1')]), TODAY)
  assert.equal(f.kind, 'figures'); assert.equal(f.estimate, true); assert.equal(f.schedule, null)
})
await test('P24: when the engine refuses, the result is "failed" with no numbers (never NaN)', () => {
  const rowsFor = (d) => annotate(d, [link('l1', 'p1')], [tx('p1')])
  assert.deepEqual(computeDebtFigures(loan({ annual_rate_pct: 'abc' }), rowsFor(loan()), TODAY), { kind: 'failed' })
  assert.deepEqual(computeDebtFigures(loan({ as_of_outstanding: -5 }), rowsFor(loan()), TODAY), { kind: 'failed' })
  assert.deepEqual(computeDebtFigures(loan({ as_of_date: '2026-12-01' }), rowsFor(loan({ as_of_date: '2026-01-01' })), TODAY), { kind: 'failed' }, 'figures dated in the future')
  assert.deepEqual(computeDebtFigures(loan(), rowsFor(loan()), 'garbage'), { kind: 'failed' })
})
await test('P25: today still in the month of the figures: payments are waiting, said plainly (the engine closes no month yet)', () => {
  const debt = loan({ as_of_date: '2026-10-01' })
  const rows = annotate(debt, [link('l1', 'p1')], [tx('p1', { transaction_date: '2026-10-05' })])
  assert.deepEqual(computeDebtFigures(debt, rows, TODAY), { kind: 'same-month', paymentsWaiting: 1, from: 'Nov 2026' })
  const dec = loan({ as_of_date: '2026-12-15' })
  assert.deepEqual(computeDebtFigures(dec, annotate(dec, [link('l1', 'p1')], [tx('p1', { transaction_date: '2026-12-20' })], '2026-12-28'), '2026-12-28'), { kind: 'same-month', paymentsWaiting: 1, from: 'Jan 2027' })
})
await test('P26: many payments (120 over ten years) equal the engine and stay finite', () => {
  const debt = loan({ as_of_date: '2016-01-01', as_of_outstanding: 500000, annual_rate_pct: 8.5, monthly_payment: null })
  const txs = [], links = []
  for (let i = 0; i < 120; i++) {
    const y = 2016 + Math.floor(i / 12), m = String((i % 12) + 1).padStart(2, '0')
    txs.push(tx(`m${i}`, { amount: 6200, transaction_date: `${y}-${m}-05` })); links.push(link(`k${i}`, `m${i}`))
  }
  const rows = annotate(debt, links, txs, '2026-01-31')
  const f = computeDebtFigures(debt, rows, '2026-01-31')
  const direct = replayDebt({ asOfDate: '2016-01-01', asOfOutstanding: 500000, asOfAccruedInterest: 0, annualRatePct: 8.5, payments: txs.map((t) => ({ date: t.transaction_date, amount: t.amount })), today: '2026-01-31' })
  assert.equal(f.kind, 'figures'); assert.equal(f.paymentsUsed, 120); assert.equal(f.owedToday, direct.totalOwed)
  assert.ok(Number.isFinite(f.owedToday) && Number.isFinite(f.interestPaid))
})
await test('P27: paise-exact sums: 0.1 + 0.2 style amounts do not drift', () => {
  const debt = loan({ kind: 'interest_free', annual_rate_pct: 0, as_of_outstanding: 1, monthly_payment: null })
  const rows = annotate(debt, [link('l1', 'a'), link('l2', 'b')], [tx('a', { amount: 0.1 }), tx('b', { amount: 0.2, transaction_date: '2026-09-06' })])
  const f = computeDebtFigures(debt, rows, TODAY)
  assert.equal(f.owedToday, 0.7); assert.equal(f.principalRepaid, 0.3)
})

await test('P37: nothing is scheduled for a zero balance or a card, and the schedule starts from the principal outstanding today', () => {
  const calls = []
  const spy = { replayDebt, buildSchedule: (a) => { calls.push(a); return { ok: true, paysOff: true, months: 3, totalInterest: 10 } } }
  const interestFree = loan({ kind: 'interest_free', annual_rate_pct: 0, as_of_outstanding: 10000, monthly_payment: 5000 })
  const paid = annotate(interestFree, [link('l1', 'a'), link('l2', 'b')], [tx('a', { amount: 5000 }), tx('b', { amount: 5000, transaction_date: '2026-10-05' })])
  assert.equal(computeDebtFigures(interestFree, paid, TODAY, spy).cleared, true)
  assert.deepEqual(calls, [], 'buildSchedule must not be called for a cleared debt')
  const over = annotate(interestFree, [link('l1', 'a')], [tx('a', { amount: 15000 })])
  computeDebtFigures(interestFree, over, TODAY, spy)
  assert.deepEqual(calls, [], 'nor for an overpaid one')
  const card = loan({ kind: 'credit_card', monthly_payment: 3000 })
  computeDebtFigures(card, annotate(card, [link('l1', 'p1')], [tx('p1')]), TODAY, spy)
  assert.deepEqual(calls, [], 'nor for a credit card')
  computeDebtFigures(loan(), two(), TODAY, spy)
  assert.equal(calls.length, 1); assert.equal(calls[0].principal, 51156, 'from the principal outstanding today, not 60,000'); assert.equal(calls[0].payment, 3000); assert.equal(calls[0].annualRatePct, 12)
  computeDebtFigures(loan({ monthly_payment: null }), two(), TODAY, spy)
  assert.equal(calls.length, 1, 'no monthly payment: no schedule')
})
await test('P38: an engine that throws or returns a non-number gives "failed", never NaN or a made-up figure', () => {
  const good = replayDebt(replayInput(loan(), two(), TODAY))
  const mk = (patch) => ({ replayDebt: () => ({ ...good, ...patch }), buildSchedule })
  for (const bad of [NaN, Infinity, undefined, null, '5']) {
    for (const key of ['outstandingPrincipal', 'accruedInterest', 'totalOwed', 'principalRepaid', 'interestPaid', 'overpaid']) {
      assert.deepEqual(computeDebtFigures(loan(), two(), TODAY, mk({ [key]: bad })), { kind: 'failed' }, `${key}=${String(bad)}`)
    }
  }
  assert.deepEqual(computeDebtFigures(loan(), two(), TODAY, { replayDebt: () => { throw new Error('boom') }, buildSchedule }), { kind: 'failed' })
  assert.deepEqual(computeDebtFigures(loan(), two(), TODAY, { replayDebt: () => null, buildSchedule }), { kind: 'failed' })
  assert.deepEqual(computeDebtFigures(loan(), two(), TODAY, { replayDebt: () => ({ ok: false, reason: 'invalid-input' }), buildSchedule }), { kind: 'failed' })
})

// ---------- "No payment linked in N months" ----------
await test('P28 (W11): quiet months counts calendar months since the last counted payment, and only from 2', () => {
  const rows = annotate(loan(), [link('l1', 'p1')], [tx('p1', { transaction_date: '2026-09-05' })])
  assert.equal(quietMonths(loan(), rows, TODAY), null, 'last payment last month: nothing to say')
  assert.equal(quietMonths(loan(), rows, '2026-11-02'), 2)
  assert.equal(quietMonths(loan(), rows, '2027-03-31'), 6)
  assert.equal(quietMonths(loan({ as_of_date: '2026-08-31' }), [], '2026-09-30'), null, 'one month after the figures')
  assert.equal(quietMonths(loan({ as_of_date: '2026-08-31' }), [], '2026-10-01'), 2, 'counts from the as-of date when nothing is linked')
})
await test('P29: a payment that is not counted does not reset the quiet months', () => {
  const rows = annotate(loan(), [link('l1', 'a')], [tx('a', { type: 'income', transaction_date: '2026-10-10' })])
  assert.equal(quietMonths(loan(), rows, TODAY), 2, 'Aug figures, today Oct: 2 months')
})

// ---------- the picker ----------
await test('P30 (W7): eligibility: an expense, strictly after the as-of date, through today inclusive, not linked', () => {
  const d = loan(); const none = new Set()
  assert.equal(isEligible(tx('a', { transaction_date: '2026-08-01' }), d, TODAY, none), false, 'the as-of day itself')
  assert.equal(isEligible(tx('a', { transaction_date: '2026-08-02' }), d, TODAY, none), true)
  assert.equal(isEligible(tx('a', { transaction_date: TODAY }), d, TODAY, none), true, 'today is included')
  assert.equal(isEligible(tx('a', { transaction_date: '2026-10-16' }), d, TODAY, none), false)
  assert.equal(isEligible(tx('a', { type: 'income' }), d, TODAY, none), false)
  assert.equal(isEligible(tx('a', { type: 'transfer' }), d, TODAY, none), false)
  assert.equal(isEligible(tx('a'), d, TODAY, new Set(['a'])), false, 'already linked')
  assert.equal(isEligible(tx('a', { amount: 0 }), d, TODAY, none), false)
  assert.equal(isEligible(null, d, TODAY, none), false)
})
const pageReader = (rows) => async (from, to) => ({ data: rows.slice(from, to + 1), error: null })
const manyTx = (n, prefix = 'x') => Array.from({ length: n }, (_, i) => tx(`${prefix}${String(i).padStart(4, '0')}`, { transaction_date: '2026-09-10' }))
await test('P31 (W12): 201 eligible expenses -> the 200 newest are returned and `more` is true; exactly 200 -> `more` is false', async () => {
  const a = await collectUnlinked({ readPage: pageReader(manyTx(201)), debt: loan(), today: TODAY, linkedIds: new Set() })
  assert.equal(a.rows.length, PICKER_LIMIT); assert.equal(a.more, true); assert.equal(a.rows[0].id, 'x0000'); assert.equal(a.rows[199].id, 'x0199')
  const b = await collectUnlinked({ readPage: pageReader(manyTx(200)), debt: loan(), today: TODAY, linkedIds: new Set() })
  assert.equal(b.rows.length, 200); assert.equal(b.more, false)
  const c = await collectUnlinked({ readPage: pageReader(manyTx(5)), debt: loan(), today: TODAY, linkedIds: new Set() })
  assert.equal(c.rows.length, 5); assert.equal(c.more, false)
})
await test('P32: already-linked expenses never use up the 200: the scan continues past them', async () => {
  const rows = manyTx(450)
  const linked = new Set(rows.slice(0, 150).map((r) => r.id))
  const calls = []
  const r = await collectUnlinked({ readPage: async (f, t) => { calls.push([f, t]); return { data: rows.slice(f, t + 1), error: null } }, debt: loan(), today: TODAY, linkedIds: linked })
  assert.equal(r.rows.length, 200); assert.equal(r.rows[0].id, 'x0150'); assert.equal(r.more, true)
  assert.ok(r.rows.every((x) => !linked.has(x.id)))
  assert.ok(calls.every(([f, t]) => t - f + 1 <= 100), 'never more than 100 rows per request')
})
await test('P33: rows the server should not have sent (income, transfer, outside the window, duplicates) are ignored', async () => {
  const rows = [tx('ok1'), tx('inc', { type: 'income' }), tx('tr', { type: 'transfer' }), tx('old', { transaction_date: '2026-07-01' }), tx('fut', { transaction_date: '2026-12-01' }), tx('ok1'), tx('ok2')]
  const r = await collectUnlinked({ readPage: pageReader(rows), debt: loan(), today: TODAY, linkedIds: new Set() })
  assert.deepEqual(r.rows.map((x) => x.id), ['ok1', 'ok2'])
})
await test('P34: a read error is returned, not swallowed; the safety stop reports that more may exist', async () => {
  const bad = await collectUnlinked({ readPage: async () => ({ data: null, error: { code: 'X' } }), debt: loan(), today: TODAY, linkedIds: new Set() })
  assert.equal(bad.rows, null); assert.equal(bad.error.code, 'X')
  const endless = await collectUnlinked({ readPage: async (f) => ({ data: manyTx(100, `p${f}-`).map((t) => ({ ...t, type: 'income' })), error: null }), debt: loan(), today: TODAY, linkedIds: new Set(), maxPages: 3 })
  assert.equal(endless.more, true); assert.deepEqual(endless.rows, [])
})
await test('P35: suggestions: EMI / Loan categories first, everything else still listed, order inside each group kept', () => {
  const names = new Map([['c7', 'EMI/Loan'], ['c8', 'Home loan'], ['c1', 'Food'], ['c9', 'Premium'], ['c10', 'Loans']])
  const rows = [tx('a', { category_id: 'c1' }), tx('b', { category_id: 'c7' }), tx('c', { category_id: null }), tx('d', { category_id: 'c8' }), tx('e', { category_id: 'c9' }), tx('f', { category_id: 'c10' })]
  const { suggested, others } = splitSuggestions(rows, names)
  assert.deepEqual(suggested.map((r) => r.id), ['b', 'd', 'f'])
  assert.deepEqual(others.map((r) => r.id), ['a', 'c', 'e'])
  assert.equal(suggested.length + others.length, rows.length)
  for (const n of ['EMI', 'emi/loan', 'Loan', 'Car loan EMI']) assert.equal(isSuggestedCategory(n), true, n)
  for (const n of ['Premium', 'Demi', 'Food', '', null, undefined]) assert.equal(isSuggestedCategory(n), false, String(n))
})

// ---------- export rows ----------
await test('P36: export rows: one per link, stored details only (no ids), the reason when not counted', () => {
  const d = loan()
  const rows = annotate(d, [link('l1', 'a'), link('l2', 'b')], [tx('a', { description: 'EMI' }), tx('b', { type: 'income', description: 'Refund' })])
  const out = paymentsExportRows([d, loan({ id: 'd9', name: 'Other' })], new Map([['d3', rows]]))
  assert.equal(out.length, 2)
  assert.deepEqual(Object.keys(out[0]), ['debt_name', 'debt_status', 'transaction_date', 'amount', 'description', 'account', 'transaction_type', 'counted', 'not_counted_reason', 'linked_on'])
  const byDesc = Object.fromEntries(out.map((r) => [r.description, r]))
  assert.equal(byDesc.EMI.counted, 'yes'); assert.equal(byDesc.EMI.not_counted_reason, null); assert.equal(byDesc.EMI.linked_on, '2026-10-10')
  assert.equal(byDesc.Refund.counted, 'no'); assert.equal(byDesc.Refund.not_counted_reason, 'Not counted: this is no longer an expense')
  assert.ok(out.every((r) => !('linkId' in r) && !('transactionId' in r) && !('user_id' in r)))
})

console.log(`\n${passed} passed, ${failed} failed`)
if (failed > 0) process.exit(1)
