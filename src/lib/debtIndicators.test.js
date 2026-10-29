// D6 - tests for the debt indicators (debtIndicators.js).
// The indicators add up figures that the Debts page already shows (debtPayments.computeDebtFigures -> debtEngine.replayDebt).
// To avoid checking that pipeline against itself, this file carries its OWN replay (BigInt paise, month buckets, written
// from the stated rules) and its own sums, and compares every indicator with them, on fixed and on random debt sets.
import assert from 'node:assert'
import { computeIndicators, incomeWindow, COPY, ALL_COPY } from './debtIndicators.js'
import { computeDebtFigures, annotateLinks } from './debtPayments.js'
import { replayDebt } from './debtEngine.js'

let passed = 0, failed = 0
function test(name, fn) {
  try { fn(); passed++; console.log(`  PASS  ${name}`) } catch (err) { failed++; console.log(`  FAIL  ${name}\n        ${String(err.message).split('\n').join('\n        ')}`) }
}

const today = '2026-10-24'
const P = (x) => BigInt(Math.round(Number(x) * 100))
const R = (p) => Number(p) / 100
const monthIdx = (iso) => Number(iso.slice(0, 4)) * 12 + Number(iso.slice(5, 7)) - 1

// ---------- the independent replay ----------
// Model: months are counted from the month of the opening figures. Each month: interest on the principal is added (rounded
// half up to the paisa); then that month's counted payments go to unpaid interest first, then principal; anything beyond
// what is owed is "overpaid". Payments dated in the opening month after the opening date fall into month 1. If today is
// still in the opening month, nothing is applied yet.
function refReplay(debt, payments) {
  const asOf = String(debt.as_of_date).slice(0, 10)
  const buckets = monthIdx(today) - monthIdx(asOf)
  let principal = P(debt.as_of_outstanding), accrued = P(debt.as_of_accrued_interest || 0)
  const r100 = BigInt(Math.round(Number(debt.annual_rate_pct) * 100))
  const paid = new Map()
  for (const p of payments) {
    if (p.date <= asOf || p.date > today) continue
    const k = Math.max(1, monthIdx(p.date) - monthIdx(asOf))
    if (k > buckets) continue
    paid.set(k, (paid.get(k) || 0n) + P(p.amount))
  }
  let interestPaid = 0n, principalRepaid = 0n
  for (let k = 1; k <= buckets; k++) {
    accrued += (principal * r100 * 2n + 120000n) / 240000n
    const pay = paid.get(k) || 0n
    const toI = pay < accrued ? pay : accrued
    const toP = pay - toI < principal ? pay - toI : principal
    accrued -= toI; principal -= toP; interestPaid += toI; principalRepaid += toP
  }
  return { buckets, owed: principal + accrued, principal, interestPaid, principalRepaid }
}

// ---------- building the page's data the way the page does ----------
let seq = 0
const debtRow = (o) => ({ id: `d${++seq}`, name: `Debt ${seq}`, kind: 'term_loan', lender: null, as_of_date: '2026-06-01', as_of_outstanding: 100000, as_of_accrued_interest: 0, annual_rate_pct: 12, monthly_payment: 5000, remaining_months: null, due_day: null, status: 'active', ...o })
function infoFor(debts, paymentsByDebt) {
  const map = new Map()
  for (const d of debts) {
    const pays = paymentsByDebt[d.id] || []
    const links = pays.map((p, i) => ({ id: `l${d.id}-${i}`, debt_id: d.id, transaction_id: `t${d.id}-${i}`, created_at: '2026-01-01T00:00:00Z' }))
    const txById = new Map(pays.map((p, i) => [`t${d.id}-${i}`, { id: `t${d.id}-${i}`, type: p.type || 'expense', amount: p.amount, transaction_date: p.date, description: 'EMI', account_id: 'a1' }]))
    const rows = annotateLinks({ debt: d, links, txById, accountNames: new Map([['a1', 'Bank']]), today })
    map.set(d.id, { linkedCount: rows.length, figures: computeDebtFigures(d, rows, today), quiet: null })
  }
  return map
}
const inc = (date, amount = 30000) => ({ type: 'income', amount, transaction_date: date })
const INCOME_OK = [inc('2026-07-05', 30000), inc('2026-08-05', 31000), inc('2026-09-05', 32000)]

// ---------- fixtures ----------
function fixed() {
  const loan = debtRow({ name: 'Bike loan', as_of_date: '2026-06-01', as_of_outstanding: 60000, as_of_accrued_interest: 250, annual_rate_pct: 12, monthly_payment: 3000 })
  const bare = debtRow({ name: 'Education loan', as_of_date: '2026-10-01', as_of_outstanding: 250000, as_of_accrued_interest: 1000, annual_rate_pct: 9.5, monthly_payment: 5000 })
  const card = debtRow({ name: 'Card', kind: 'credit_card', as_of_date: '2026-07-10', as_of_outstanding: 80000, as_of_accrued_interest: 0, annual_rate_pct: 36, monthly_payment: 3000 })
  const done = debtRow({ name: 'Old EMI', as_of_date: '2026-08-01', as_of_outstanding: 4000, as_of_accrued_interest: 0, annual_rate_pct: 0, monthly_payment: 2000 })
  const closed = debtRow({ name: 'Closed one', status: 'closed', as_of_outstanding: 9999, monthly_payment: 1111 })
  const pays = {
    [loan.id]: [{ date: '2026-07-05', amount: 5000 }, { date: '2026-08-05', amount: 5000 }, { date: '2026-09-05', amount: 5000 }],
    [card.id]: [{ date: '2026-08-15', amount: 6000 }],
    [done.id]: [{ date: '2026-08-20', amount: 2000 }, { date: '2026-09-20', amount: 2500 }], // 4,000 owed: overpaid
  }
  return { debts: [loan, bare, card, done, closed], pays, loan, bare, card, done, closed }
}

test('I1: the income window is the 3 complete months before this month (year change, leap February, bad date)', () => {
  assert.deepStrictEqual(incomeWindow('2026-10-24').months.map((m) => [m.key, m.start, m.end]), [['2026-07', '2026-07-01', '2026-07-31'], ['2026-08', '2026-08-01', '2026-08-31'], ['2026-09', '2026-09-01', '2026-09-30']])
  assert.deepStrictEqual(incomeWindow('2026-01-05').months.map((m) => m.key), ['2025-10', '2025-11', '2025-12'])
  const leap = incomeWindow('2028-03-01'); assert.deepStrictEqual(leap.months.map((m) => m.end), ['2027-12-31', '2028-01-31', '2028-02-29'])
  assert.strictEqual(incomeWindow('2027-03-01').months[2].end, '2027-02-28')
  assert.strictEqual(incomeWindow('2026-13-01'), null); assert.strictEqual(incomeWindow(''), null); assert.strictEqual(incomeWindow(undefined), null)
  assert.strictEqual(incomeWindow('2026-10-24').start, '2026-07-01'); assert.strictEqual(incomeWindow('2026-10-24').end, '2026-09-30')
})

test('I2: a mixed set: every indicator equals the independent calculation', () => {
  const { debts, pays, loan, bare, card, done } = fixed()
  const out = computeIndicators({ debts, infoByDebt: infoFor(debts, pays), incomeRows: INCOME_OK, today })
  const rl = refReplay(loan, pays[loan.id]), rc = refReplay(card, pays[card.id]), rd = refReplay(done, pays[done.id])
  const openBare = P(bare.as_of_outstanding) + P(bare.as_of_accrued_interest)
  assert.strictEqual(out.total.status, 'ok')
  assert.strictEqual(out.total.amount, R(rl.owed + rc.owed + rd.owed + openBare))
  assert.deepStrictEqual(out.total.calculated, { count: 3, amount: R(rl.owed + rc.owed + rd.owed) })
  assert.deepStrictEqual(out.total.opening, { count: 1, amount: R(openBare) })
  assert.strictEqual(out.total.mixed, true); assert.strictEqual(out.total.openingOnly, false); assert.strictEqual(out.total.hasEstimate, true)
  assert.strictEqual(out.total.partial, false)
  assert.strictEqual(out.interest.amount, R(rl.interestPaid + rc.interestPaid + rd.interestPaid))
  assert.strictEqual(out.interest.debtCount, 3); assert.strictEqual(out.interest.withoutCount, 1)
  const rep = rl.principalRepaid + rc.principalRepaid + rd.principalRepaid
  const den = rep + rl.principal + rc.principal + rd.principal
  assert.strictEqual(out.progress.percent, Math.round(Number((rep * 1000n) / den) + (Number((rep * 10000n) / den) % 10 >= 5 ? 1 : 0)) / 10)
  assert.strictEqual(out.progress.repaid, R(rep))
  assert.strictEqual(out.progress.openingPrincipal, R(den))
  // closed debts are in nothing
  assert.strictEqual(out.activeCount, 4); assert.ok(!out.items.some((i) => i.name === 'Closed one'))
  // monthly required: cleared "Old EMI" is left out and said so
  assert.strictEqual(out.monthly.amount, 3000 + 5000 + 3000)
  assert.deepStrictEqual(out.monthly.skipped.map((s) => [s.name, s.reason]), [['Old EMI', COPY.reasonCleared]])
  // burden: 11,000 / average of 30,000 31,000 32,000 = 11,000 / 31,000 = 35.5%
  assert.strictEqual(out.burden.status, 'ok'); assert.strictEqual(out.burden.percent, 35.5); assert.strictEqual(out.burden.averageIncome, 31000)
})

test('I3: debts without a counted payment use their opening figures, labelled as such with the date; waiting payments are said', () => {
  const a = debtRow({ name: 'A', as_of_date: '2026-10-01', as_of_outstanding: 1000, as_of_accrued_interest: 50 })
  const b = debtRow({ name: 'B', as_of_date: '2026-03-01', as_of_outstanding: 2000 })
  const out = computeIndicators({ debts: [a, b], infoByDebt: infoFor([a, b], { [a.id]: [{ date: '2026-10-10', amount: 300 }] }), incomeRows: null, today })
  assert.strictEqual(out.total.openingOnly, true); assert.strictEqual(out.total.mixed, false)
  assert.strictEqual(out.total.amount, 3050)
  const ia = out.items.find((i) => i.name === 'A'), ib = out.items.find((i) => i.name === 'B')
  assert.deepStrictEqual([ia.basis, ia.asOf, ia.waiting], ['opening', '2026-10-01', 1]) // paid in the opening month: waiting, not applied
  assert.deepStrictEqual([ib.basis, ib.asOf, ib.waiting], ['opening', '2026-03-01', 0])
  assert.strictEqual(out.interest.status, 'needs-payment'); assert.strictEqual(out.progress.status, 'needs-payment')
  assert.strictEqual(out.interest.text, COPY.needsLinkedPayment)
})

test('I4: missing or invalid figures are disclosed and never treated as zero', () => {
  const ok = debtRow({ name: 'Fine', as_of_outstanding: 5000 })
  const bad = [
    debtRow({ name: 'NaN', as_of_outstanding: 'abc' }), debtRow({ name: 'Negative', as_of_outstanding: -5 }),
    debtRow({ name: 'BadDate', as_of_date: '2026-02-30' }), debtRow({ name: 'NoDate', as_of_date: null }),
    debtRow({ name: 'BadInterest', as_of_accrued_interest: -1 }),
  ]
  const debts = [ok, ...bad]
  const info = infoFor([ok], {}); // the bad ones: even with an info entry nothing may be assumed
  const out = computeIndicators({ debts, infoByDebt: info, incomeRows: null, today })
  assert.strictEqual(out.total.status, 'ok'); assert.strictEqual(out.total.partial, true)
  assert.deepStrictEqual(out.total.noFigure.map((n) => n.name).sort(), ['BadDate', 'BadInterest', 'NaN', 'Negative', 'NoDate'])
  assert.ok(out.total.noFigure.every((n) => n.reason === COPY.reasonBadFigures))
  assert.strictEqual(out.total.amount, 5000) // the five are not in the sum, and not hidden
  // failed replay (figures dated in the future) and a missing info entry are disclosed too
  const future = debtRow({ name: 'Future', as_of_date: '2026-12-01' })
  const lonely = debtRow({ name: 'Lonely' })
  const out2 = computeIndicators({ debts: [ok, future, lonely], infoByDebt: infoFor([ok], {}), incomeRows: null, today })
  assert.deepStrictEqual(out2.total.noFigure.map((n) => [n.name, n.reason]).sort(), [['Future', COPY.reasonNoInfo], ['Lonely', COPY.reasonNoInfo]])
  const failedInfo = new Map([[ok.id, { figures: { kind: 'failed' } }]])
  const out3 = computeIndicators({ debts: [ok], infoByDebt: failedInfo, incomeRows: null, today })
  assert.strictEqual(out3.total.status, 'none'); assert.deepStrictEqual(out3.total.noFigure, [{ id: ok.id, name: 'Fine', reason: COPY.reasonFailed }])
  // nothing valid anywhere: no total at all, never "0"
  assert.strictEqual(computeIndicators({ debts: bad, infoByDebt: new Map(), incomeRows: null, today }).total.status, 'none')
})

test('I5: monthly required payments: unusable payments are skipped with the reason; cleared and closed debts are not added', () => {
  const a = debtRow({ name: 'A', monthly_payment: 1500.5 }), b = debtRow({ name: 'B', monthly_payment: null }), c = debtRow({ name: 'C', monthly_payment: 0 })
  const d = debtRow({ name: 'D', monthly_payment: -5 }), e = debtRow({ name: 'E', monthly_payment: 'x' }), f = debtRow({ name: 'F', as_of_outstanding: 0, as_of_accrued_interest: 0, monthly_payment: 700 })
  const g = debtRow({ name: 'G', status: 'closed', monthly_payment: 900 })
  const out = computeIndicators({ debts: [a, b, c, d, e, f, g], infoByDebt: infoFor([a, b, c, d, e, f], {}), incomeRows: null, today })
  assert.strictEqual(out.monthly.amount, 1500.5); assert.strictEqual(out.monthly.count, 1)
  assert.deepStrictEqual(out.monthly.skipped.map((s) => [s.name, s.reason]), [['B', COPY.reasonNoPayment], ['C', COPY.reasonBadPayment], ['D', COPY.reasonBadPayment], ['E', COPY.reasonBadPayment], ['F', COPY.reasonCleared]])
  const none = computeIndicators({ debts: [b], infoByDebt: infoFor([b], {}), incomeRows: INCOME_OK, today })
  assert.strictEqual(none.monthly.status, 'none'); assert.strictEqual(none.burden.status, 'no-payments'); assert.strictEqual(none.burden.text, COPY.noPaymentsForBurden)
})

test('I6: payment burden: needs income in each of the 3 months; boundary dates; zero or non-income rows do not count', () => {
  const a = debtRow({ monthly_payment: 10000 })
  const run = (rows) => computeIndicators({ debts: [a], infoByDebt: infoFor([a], {}), incomeRows: rows, today }).burden
  assert.strictEqual(run(INCOME_OK).percent, Math.round((10000 * 3 * 1000) / 93000) / 10)
  assert.strictEqual(run([inc('2026-07-05'), inc('2026-08-05')]).status, 'no-income')
  assert.strictEqual(run([inc('2026-07-05'), inc('2026-08-05')]).text, COPY.notEnoughIncome)
  assert.strictEqual(run([]).status, 'no-income')
  // boundaries: 2026-06-30 and 2026-10-01 are outside; 2026-07-01 and 2026-09-30 are inside
  assert.strictEqual(run([inc('2026-06-30'), inc('2026-08-05'), inc('2026-09-05'), inc('2026-10-01')]).status, 'no-income')
  assert.strictEqual(run([inc('2026-07-01', 30000), inc('2026-08-05', 30000), inc('2026-09-30', 30000)]).percent, 33.3)
  // zero, negative, text and expense rows are not income
  const junk = [{ type: 'income', amount: 0, transaction_date: '2026-07-05' }, { type: 'income', amount: -4, transaction_date: '2026-07-06' }, { type: 'income', amount: 'x', transaction_date: '2026-07-07' }, { type: 'expense', amount: 50000, transaction_date: '2026-07-08' }, { type: 'transfer', amount: 50000, transaction_date: '2026-07-09' }]
  assert.strictEqual(run([...junk, inc('2026-08-05'), inc('2026-09-05')]).status, 'no-income')
  // several incomes in a month add up
  assert.strictEqual(run([inc('2026-07-05', 10000), inc('2026-07-20', 20000), inc('2026-08-05', 30000), inc('2026-09-05', 30000)]).averageIncome, 30000)
  // income could not be read: said, not guessed
  const un = run(null); assert.strictEqual(un.status, 'income-unavailable'); assert.strictEqual(un.text, COPY.incomeUnavailable)
  // timestamps are cut to the date
  assert.strictEqual(run([inc('2026-07-05T10:00:00Z'), inc('2026-08-05T23:59:59Z'), inc('2026-09-30T00:00:00Z')]).status, 'ok')
})

test('I7: interest paid and progress: needs a counted payment; cleared debts keep their history; no principal gives no percentage', () => {
  const none = debtRow({ name: 'None' })
  assert.strictEqual(computeIndicators({ debts: [none], infoByDebt: infoFor([none], {}), incomeRows: null, today }).progress.status, 'needs-payment')
  const done = debtRow({ name: 'Done', as_of_date: '2026-08-01', as_of_outstanding: 4000, annual_rate_pct: 0 })
  const out = computeIndicators({ debts: [done], infoByDebt: infoFor([done], { [done.id]: [{ date: '2026-08-20', amount: 4000 }] }), incomeRows: null, today })
  assert.strictEqual(out.progress.percent, 100); assert.strictEqual(out.interest.amount, 0)
  assert.strictEqual(out.total.amount, 0) // a recorded, calculated zero: cleared
  // only unpaid interest at the opening date: nothing to repay in principal
  const intOnly = debtRow({ name: 'IntOnly', as_of_date: '2026-08-01', as_of_outstanding: 0, as_of_accrued_interest: 500, annual_rate_pct: 12 })
  const out2 = computeIndicators({ debts: [intOnly], infoByDebt: infoFor([intOnly], { [intOnly.id]: [{ date: '2026-08-20', amount: 100 }] }), incomeRows: null, today })
  assert.strictEqual(out2.progress.status, 'no-principal'); assert.strictEqual(out2.interest.status, 'ok'); assert.strictEqual(out2.interest.amount, 100)
  // a payment dated before the opening date is not counted
  const early = debtRow({ name: 'Early', as_of_date: '2026-08-01' })
  const out3 = computeIndicators({ debts: [early], infoByDebt: infoFor([early], { [early.id]: [{ date: '2026-07-20', amount: 4000 }] }), incomeRows: null, today })
  assert.strictEqual(out3.interest.status, 'needs-payment')
})

test('I8: linked payments not available: owed, interest and progress say so; monthly payments and burden still work; nothing is guessed', () => {
  const { debts } = fixed()
  const out = computeIndicators({ debts, infoByDebt: null, incomeRows: INCOME_OK, today })
  assert.strictEqual(out.paymentsKnown, false)
  for (const k of ['total', 'interest', 'progress']) assert.strictEqual(out[k].status, 'unavailable')
  assert.strictEqual(out.monthly.status, 'ok'); assert.strictEqual(out.burden.status, 'ok')
  assert.strictEqual(computeIndicators({ debts: [], infoByDebt: null, today }).total.status, 'no-debts')
  assert.strictEqual(computeIndicators({ debts: [fixed().closed], infoByDebt: new Map(), today }).total.status, 'no-debts')
  assert.strictEqual(computeIndicators({ debts: undefined, today }).activeCount, 0)
})

// ---------- random sets against the independent replay ----------
function rng(seed) { let a = seed >>> 0; return () => { a |= 0; a = (a + 0x6D2B79F5) | 0; let t = Math.imul(a ^ (a >>> 15), 1 | a); t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t; return ((t ^ (t >>> 14)) >>> 0) / 4294967296 } }
const r2 = (x) => Math.round(x * 100) / 100
function randomWorld(r) {
  const n = 1 + Math.floor(r() * 5), debts = [], pays = {}
  for (let i = 0; i < n; i++) {
    const d = debtRow({
      name: `R${i}`, kind: r() < 0.2 ? 'credit_card' : 'term_loan',
      as_of_date: `2026-0${3 + Math.floor(r() * 7)}-${String(1 + Math.floor(r() * 28)).padStart(2, '0')}`,
      as_of_outstanding: r() < 0.08 ? 0 : r2(1000 + r() * 400000), as_of_accrued_interest: r() < 0.5 ? 0 : r2(r() * 5000),
      annual_rate_pct: r() < 0.15 ? 0 : r2(r() * 36), monthly_payment: r() < 0.2 ? null : r2(500 + r() * 20000), status: r() < 0.12 ? 'closed' : 'active',
    })
    debts.push(d)
    const np = r() < 0.4 ? 0 : Math.floor(r() * 6)
    pays[d.id] = Array.from({ length: np }, () => ({ date: `2026-${String(3 + Math.floor(r() * 8)).padStart(2, '0')}-${String(1 + Math.floor(r() * 28)).padStart(2, '0')}`, amount: r2(300 + r() * (r() < 0.1 ? 500000 : 20000)) }))
  }
  return { debts, pays }
}

test('I9: the replay conserves principal and interest (the identities the indicators rest on), 300 random debts', () => {
  const r = rng(321); let checked = 0
  for (let k = 0; k < 300; k++) {
    const d = debtRow({ as_of_date: `2026-0${1 + Math.floor(r() * 8)}-${String(1 + Math.floor(r() * 28)).padStart(2, '0')}`, as_of_outstanding: r2(r() * 300000), as_of_accrued_interest: r2(r() * 8000), annual_rate_pct: r2(r() * 36) })
    const pays = Array.from({ length: Math.floor(r() * 7) }, () => ({ date: `2026-${String(1 + Math.floor(r() * 10)).padStart(2, '0')}-${String(1 + Math.floor(r() * 28)).padStart(2, '0')}`, amount: r2(100 + r() * 40000) }))
    const res = replayDebt({ asOfDate: d.as_of_date, asOfOutstanding: d.as_of_outstanding, asOfAccruedInterest: d.as_of_accrued_interest, annualRatePct: d.annual_rate_pct, payments: pays, today })
    if (!res.ok || res.months.length === 0) continue
    checked++
    assert.strictEqual(P(res.principalRepaid) + P(res.outstandingPrincipal), P(d.as_of_outstanding), `principal ${k}`)
    assert.strictEqual(P(d.as_of_accrued_interest) + P(res.interestAccrued), P(res.interestPaid) + P(res.accruedInterest), `interest ${k}`)
    const inWindow = pays.filter((p) => p.date > d.as_of_date && p.date <= today).reduce((a, p) => a + P(p.amount), 0n)
    assert.strictEqual(P(res.interestPaid) + P(res.principalRepaid) + P(res.overpaid), inWindow, `payments ${k}`)
    const ref = refReplay(d, pays)
    assert.strictEqual(P(res.interestPaid), ref.interestPaid, `ref interest ${k}`); assert.strictEqual(P(res.principalRepaid), ref.principalRepaid, `ref principal ${k}`)
  }
  assert.ok(checked > 200, `only ${checked} replays checked`)
})

test('I10: 300 random worlds: every indicator equals the independent calculation; no NaN or Infinity anywhere', () => {
  const r = rng(808); let mixed = 0, someOk = 0
  for (let k = 0; k < 300; k++) {
    const { debts, pays } = randomWorld(r)
    const activeDebts = debts.filter((d) => d.status === 'active')
    const rows = r() < 0.6 ? INCOME_OK : [inc('2026-07-05', r2(5000 + r() * 90000)), inc('2026-08-05', r2(5000 + r() * 90000)), inc('2026-09-05', r2(5000 + r() * 90000)), inc('2026-07-20', r2(r() * 5000))]
    const out = computeIndicators({ debts, infoByDebt: infoFor(debts, pays), incomeRows: rows, today })
    assert.doesNotMatch(JSON.stringify(out), /NaN|Infinity|undefined/, `world ${k}`)
    assert.strictEqual(out.activeCount, activeDebts.length)
    if (activeDebts.length === 0) { assert.strictEqual(out.total.status, 'no-debts'); continue }
    let owed = 0n, calcOwed = 0n, openOwed = 0n, ip = 0n, rep = 0n, den = 0n, nCalc = 0, nOpen = 0, monthly = 0n, nMonthly = 0
    for (const d of activeDebts) {
      const ref = refReplay(d, pays[d.id] || [])
      const counted = (pays[d.id] || []).filter((p) => p.date > d.as_of_date && p.date <= today)
      const hasCounted = counted.length > 0
      let cleared
      if (hasCounted && ref.buckets > 0) { nCalc++; owed += ref.owed; calcOwed += ref.owed; ip += ref.interestPaid; rep += ref.principalRepaid; den += ref.principalRepaid + ref.principal; cleared = ref.owed === 0n }
      else { const o = P(d.as_of_outstanding) + P(d.as_of_accrued_interest); nOpen++; owed += o; openOwed += o; cleared = o === 0n }
      if (!cleared && d.monthly_payment != null) { monthly += P(d.monthly_payment); nMonthly++ }
    }
    assert.strictEqual(out.total.status, 'ok'); assert.strictEqual(out.total.amount, R(owed), `total ${k}`)
    assert.deepStrictEqual([out.total.calculated.count, out.total.opening.count], [nCalc, nOpen])
    assert.strictEqual(out.total.mixed, nCalc > 0 && nOpen > 0); assert.strictEqual(out.total.openingOnly, nCalc === 0)
    assert.strictEqual(out.monthly.amount, R(monthly), `monthly ${k}`); assert.strictEqual(out.monthly.count, nMonthly)
    if (nCalc > 0) { assert.strictEqual(out.interest.amount, R(ip), `interest ${k}`); if (den > 0n) assert.strictEqual(out.progress.repaid, R(rep), `repaid ${k}`); else assert.strictEqual(out.progress.status, 'no-principal') } else assert.strictEqual(out.interest.status, 'needs-payment')
    if (out.total.mixed) mixed++
    someOk++
  }
  assert.ok(mixed > 30 && someOk > 200, `mixed ${mixed}, ok ${someOk}`)
})

test('I11: inputs are not changed and the same input gives the same output', () => {
  const { debts, pays } = fixed(); const info = infoFor(debts, pays)
  const freeze = (o) => { Object.values(o).forEach((v) => v && typeof v === 'object' && !Object.isFrozen(v) && freeze(v)); return Object.freeze(o) }
  debts.forEach(freeze); const rows = INCOME_OK.map((x) => Object.freeze({ ...x }))
  const a = computeIndicators({ debts, infoByDebt: info, incomeRows: rows, today }), b = computeIndicators({ debts, infoByDebt: info, incomeRows: rows, today })
  assert.deepStrictEqual(a, b)
})

test('I12: the words: required statements are present, nothing reads as advice', () => {
  const BANNED = [/\bshould\b/i, /\brecommend/i, /\badvis(e|ed|es|ing)\b/i, /\bsuggest/i, /\bbest\b/i, /\bbetter\b/i, /\bideal/i, /\boptimal/i, /\bmust\b/i, /\bought\b/i, /\byou need\b/i, /\bwe (think|believe)\b/i, /\bsmart/i, /\bwise/i, /\bguarantee/i, /\bsafe\b/i, /\bfastest\b/i, /\bcheapest\b/i, /\bavoid\b/i, /\bdon'?t\b/i, /\b(high|low|healthy|unhealthy|risky|dangerous|good|bad|heavy|manageable|comfortable|worrying)\b/i]
  for (const t of ALL_COPY()) for (const re of BANNED) assert.ok(!re.test(t), `${re} in: ${t}`)
  assert.match(COPY.basis, /Not a lender statement\. Not financial advice\./)
  assert.match(COPY.mixedWarning, /not a verified current debt balance/)
  assert.match(COPY.notVerified, /not a verified current balance/)
  assert.match(COPY.openingOnly, /not a current balance/)
  assert.match(COPY.estimateNote, /estimates/)
  assert.match(COPY.notEnoughIncome, /^Not enough income recorded\.$/)
  assert.ok(ALL_COPY().length > 25)
})

test('I13: only debts whose status is exactly active are counted (a closed or unknown status is in no indicator)', () => {
  const a = debtRow({ name: 'A', status: 'active', as_of_outstanding: 1000, monthly_payment: 100 })
  const c = debtRow({ name: 'C', status: 'closed', as_of_outstanding: 5000, monthly_payment: 200 })
  const w = debtRow({ name: 'W', status: 'archived', as_of_outstanding: 7000, monthly_payment: 300 })
  const ind = computeIndicators({ debts: [a, c, w], infoByDebt: infoFor([a, c, w], {}), incomeRows: INCOME_OK, today })
  assert.strictEqual(ind.activeCount, 1); assert.strictEqual(ind.monthly.amount, 100); assert.strictEqual(ind.total.amount, 1000)
})

test('I14: both bases are principal + unpaid interest; an overpayment is shown but never subtracted; payment-read failure withdraws the total', () => {
  const calc = debtRow({ name: 'Calc', as_of_date: '2026-08-01', as_of_outstanding: 20000, annual_rate_pct: 12, monthly_payment: 1000 })
  const over = debtRow({ name: 'Over', as_of_date: '2026-08-01', as_of_outstanding: 1000, annual_rate_pct: 0, monthly_payment: 500 })
  const open = debtRow({ name: 'Open', as_of_date: '2026-06-01', as_of_outstanding: 7000, as_of_accrued_interest: 250.5, annual_rate_pct: 24 })
  const debts = [calc, over, open]
  const pays = { [calc.id]: [{ date: '2026-09-05', amount: 1000 }], [over.id]: [{ date: '2026-09-05', amount: 1800 }] }
  const ind = computeIndicators({ debts, infoByDebt: infoFor(debts, pays), incomeRows: INCOME_OK, today })
  const byName = Object.fromEntries(ind.items.map((i) => [i.name, i]))
  const rc = refReplay(calc, pays[calc.id])
  assert.strictEqual(byName.Calc.basis, 'calculated'); assert.strictEqual(byName.Calc.owedPaise, Number(rc.owed))
  for (const i of ind.items) assert.strictEqual(i.principalPaise + i.interestPaise, i.owedPaise, i.name + ': owed is exactly principal + unpaid interest')
  // the opening figure is NOT aged: 24% for months have passed, yet it stays 7,000 + 250.50
  assert.strictEqual(byName.Open.basis, 'opening'); assert.strictEqual(byName.Open.owedPaise, 725050)
  // overpayment: owed is floored at 0 for that debt, the excess is reported separately, and no total is reduced by it
  assert.strictEqual(byName.Over.owedPaise, 0); assert.strictEqual(byName.Over.cleared, true); assert.strictEqual(byName.Over.overpaidPaise, 80000)
  assert.strictEqual(ind.total.amount, (Number(rc.owed) + 725050) / 100)
  assert.ok(ind.total.mixed && !ind.total.openingOnly)
  // payments not readable: no total at all, not an opening-only total
  assert.strictEqual(computeIndicators({ debts, infoByDebt: null, incomeRows: INCOME_OK, today }).total.status, 'unavailable')
  // a failed calculation is named, not replaced by the opening figure
  const bad = infoFor([calc], pays); bad.get(calc.id).figures = { kind: 'failed' }
  const f = computeIndicators({ debts: [calc], infoByDebt: bad, incomeRows: INCOME_OK, today })
  assert.strictEqual(f.total.status, 'none'); assert.strictEqual(f.total.noFigure[0].reason, COPY.reasonFailed)
})

test('I15: a credit card with counted linked payments is calculated AND still an estimate everywhere; a loan is not',()=>{
  const card = debtRow({ name: 'Card', kind: 'credit_card', as_of_date: '2026-08-01', as_of_outstanding: 30000, annual_rate_pct: 36, monthly_payment: 2000 })
  const loan = debtRow({ name: 'Loan', kind: 'term_loan', as_of_date: '2026-08-01', as_of_outstanding: 30000, annual_rate_pct: 12, monthly_payment: 2000 })
  const pays = { [card.id]: [{ date: '2026-09-05', amount: 2000 }], [loan.id]: [{ date: '2026-09-05', amount: 2000 }] }
  const both = [card, loan]
  const ind = computeIndicators({ debts: both, infoByDebt: infoFor(both, pays), incomeRows: INCOME_OK, today })
  const by = Object.fromEntries(ind.items.map((i) => [i.name, i]))
  assert.strictEqual(by.Card.basis, 'calculated'); assert.strictEqual(by.Card.estimate, true); assert.strictEqual(by.Loan.basis, 'calculated'); assert.strictEqual(by.Loan.estimate, false)
  assert.strictEqual(ind.total.hasEstimate, true); assert.strictEqual(ind.interest.hasEstimate, true); assert.strictEqual(ind.progress.hasEstimate, true)
  // the flag comes from the debt kind itself, even if the figures object carried no estimate flag
  const info = infoFor(both, pays); info.get(card.id).figures = { ...info.get(card.id).figures, estimate: false }
  const ind2 = computeIndicators({ debts: both, infoByDebt: info, incomeRows: INCOME_OK, today })
  assert.strictEqual(ind2.items.find((i) => i.name === 'Card').estimate, true); assert.strictEqual(ind2.total.hasEstimate, true)
  // loans only: no estimate anywhere
  const ind3 = computeIndicators({ debts: [loan], infoByDebt: infoFor([loan], pays), incomeRows: INCOME_OK, today })
  assert.strictEqual(ind3.total.hasEstimate, false); assert.strictEqual(ind3.interest.hasEstimate, false); assert.strictEqual(ind3.progress.hasEstimate, false)
})

console.log(`\n${passed} passed, ${failed} failed`)
if (failed > 0) process.exit(1)
