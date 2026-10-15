// Plain Node test runner - no framework, no new dependency.
// Run with: node src/lib/debtEngine.test.js   (also under TZ=Asia/Kolkata, America/Los_Angeles, Pacific/Auckland)
//
// Reference values: computed independently in Python (Decimal, half-up, integer paise) and re-checked in a spreadsheet
// (LibreOffice formulas). The planner values (E9, E10) were additionally rebuilt month by month in a spreadsheet.
import assert from 'node:assert'
import { readFileSync } from 'node:fs'
import {
  computeEmi, buildSchedule, payoffMonths, impliedAnnualRate, replayDebt, nextDueDate, planDebts, comparePlans,
} from './debtEngine.js'

let passed = 0
let failed = 0
function test(name, fn) {
  try {
    fn()
    console.log(`  PASS  ${name}`)
    passed++
  } catch (err) {
    console.log(`  FAIL  ${name}`)
    console.log(`        ${err.message}`)
    failed++
  }
}
console.log('debtEngine tests\n')

const paise = (x) => Math.round(x * 100)
const sched = (o) => buildSchedule(o)
const emiOf = (principal, annualRatePct, months) => computeEmi({ principal, annualRatePct, months }).emi

// deterministic pseudo-random numbers for the generated checks (tests only)
function lcg(seed) {
  let s = seed >>> 0
  return () => {
    s = (Math.imul(s, 1664525) + 1013904223) >>> 0
    return s / 4294967296
  }
}
const deepFreeze = (o) => {
  if (o && typeof o === 'object' && !Object.isFrozen(o)) {
    Object.freeze(o)
    Object.values(o).forEach(deepFreeze)
  }
  return o
}

// ---- E1: rounding rule ----
test('E1: monthly interest is rounded half away from zero on integer paise (6+ hand-picked cases)', () => {
  const first = (principal, rate) => sched({ principal, annualRatePct: rate, payment: 1000000 }).rows[0].interest
  assert.strictEqual(first(1.5, 12), 0.02) // 150 paise x 1% = 1.5 paise -> 2
  assert.strictEqual(first(0.5, 12), 0.01) // 0.5 paise -> 1
  assert.strictEqual(first(2.5, 12), 0.03) // 2.5 paise -> 3
  assert.strictEqual(first(0.1, 60), 0.01) // exactly 0.5 paise -> 1
  assert.strictEqual(first(0.1, 59.9), 0) // 0.499 paise -> 0
  assert.strictEqual(first(100000, 12), 1000)
  assert.strictEqual(first(84151.39, 12), 841.51) // 841.5139 -> 841.51
  assert.strictEqual(first(92115.12, 12), 921.15) // 921.1512 -> 921.15
  assert.strictEqual(first(100, 9.35), 0.78) // 100 x 9.35 / 1200 = 0.77916 -> 0.78 (rate with 2 decimals, integer path)
})

// ---- E2-E5: loan reference values ----
test('E2: 100,000 / 12% / 12 -> EMI 8,884.88, interest 6,618.53, last payment 8,884.85', () => {
  assert.strictEqual(emiOf(100000, 12, 12), 8884.88)
  const s = sched({ principal: 100000, annualRatePct: 12, payment: 8884.88, termMonths: 12 })
  assert.strictEqual(s.months, 12)
  assert.strictEqual(s.totalInterest, 6618.53)
  assert.strictEqual(s.finalPayment, 8884.85)
  assert.strictEqual(s.totalPaid, 106618.53)
  assert.strictEqual(s.remainingBalance, 0)
  assert.strictEqual(s.rows[11].balance, 0)
  assert.strictEqual(s.endedBy, 'cleared-naturally')
})
test('E3: 500,000 / 9% / 60 -> EMI 10,379.18, interest 122,750.59, last payment 10,378.97', () => {
  assert.strictEqual(emiOf(500000, 9, 60), 10379.18)
  const s = sched({ principal: 500000, annualRatePct: 9, payment: 10379.18, termMonths: 60 })
  assert.strictEqual(s.months, 60)
  assert.strictEqual(s.totalInterest, 122750.59)
  assert.strictEqual(s.finalPayment, 10378.97)
})
test('E4: 1,000,000 / 8.5% / 240 -> EMI 8,678.23, interest 1,082,776.63, last payment 8,679.66', () => {
  assert.strictEqual(emiOf(1000000, 8.5, 240), 8678.23)
  const s = sched({ principal: 1000000, annualRatePct: 8.5, payment: 8678.23, termMonths: 240 })
  assert.strictEqual(s.months, 240)
  assert.strictEqual(s.totalInterest, 1082776.63)
  assert.strictEqual(s.finalPayment, 8679.66)
  assert.strictEqual(s.endedBy, 'term-adjusted')
})
test('E5: 50,000 / 0% / 10 -> EMI 5,000.00, interest 0.00', () => {
  assert.strictEqual(emiOf(50000, 0, 10), 5000)
  const s = sched({ principal: 50000, annualRatePct: 0, payment: 5000 })
  assert.strictEqual(s.months, 10)
  assert.strictEqual(s.totalInterest, 0)
})
test('E6: payoffMonths 100,000 at 12%, payment 5,000 -> 23 months', () => {
  const p = payoffMonths({ principal: 100000, annualRatePct: 12, payment: 5000 })
  assert.deepStrictEqual(p, { ok: true, paysOff: true, months: 23 })
})

// ---- E7: replay reference ----
const E7 = {
  asOfDate: '2026-01-31',
  asOfOutstanding: 100000,
  annualRatePct: 12,
  payments: [{ date: '2026-02-15', amount: 8884.88 }, { date: '2026-03-15', amount: 8884.88 }, { date: '2026-05-15', amount: 8884.88 }],
  today: '2026-05-31',
}
test('E7: replay with a missed month (simple interest on principal, unpaid interest paid first)', () => {
  const r = replayDebt(E7)
  assert.strictEqual(r.ok, true)
  assert.deepStrictEqual(r.months.map((m) => m.month), ['2026-02', '2026-03', '2026-04', '2026-05'])
  assert.deepStrictEqual(r.months.map((m) => m.interest), [1000, 921.15, 841.51, 841.51])
  assert.deepStrictEqual(r.months.map((m) => m.principalAfter), [92115.12, 84151.39, 84151.39, 76949.53])
  assert.deepStrictEqual(r.months.map((m) => m.accruedAfter), [0, 0, 841.51, 0])
  assert.deepStrictEqual(r.months.map((m) => m.overdue), [false, false, true, false])
  assert.strictEqual(r.interestPaid, 3604.17)
  assert.strictEqual(r.principalRepaid, 23050.47)
  assert.strictEqual(r.interestAccrued, 3604.17)
  assert.strictEqual(r.totalOwed, 76949.53)
  assert.strictEqual(r.outstandingPrincipal, 76949.53)
  assert.strictEqual(r.accruedInterest, 0)
  assert.strictEqual(r.overdueMonths, 1)
  assert.strictEqual(r.belowInterestMonths, 0)
})

// ---- E8: the rounded schedule is the source of truth ----
function closedForm(P, a, A) {
  const r = a / 1200
  if (r === 0) return Math.ceil(P / A)
  if (A <= P * r) return null
  return Math.ceil(-Math.log(1 - (P * r) / A) / Math.log(1 + r) - 1e-12)
}
let e8Cases = 0
let e8Disagree = []
test('E8: payoffMonths equals the rounded schedule on 972 grid cases; the closed formula stays within 1 month', () => {
  for (const P of [10000, 25000, 50000, 100000, 250000, 1000000]) {
    for (const a of [0, 5, 8.5, 9, 12, 15, 18, 24, 36]) {
      for (const n of [6, 12, 24, 36, 60, 120]) {
        for (const adj of [0, 1, -1]) {
          const pay = (paise(emiOf(P, a, n)) + adj) / 100
          const s = sched({ principal: P, annualRatePct: a, payment: pay })
          const p = payoffMonths({ principal: P, annualRatePct: a, payment: pay })
          assert.ok(s.ok && p.ok)
          if (!s.paysOff) continue
          e8Cases++
          assert.strictEqual(p.months, s.months, `${P}/${a}/${n}/${pay}`)
          const c = closedForm(P, a, pay)
          assert.ok(c !== null && Math.abs(c - s.months) <= 1, `closed form off by more than 1: ${P}/${a}/${n}/${pay}`)
          if (c !== s.months) e8Disagree.push([P, a, pay, s.months, c])
        }
      }
    }
  }
  assert.strictEqual(e8Cases, 972)
})
test('E8: named boundary cases where the formula and the rounded schedule differ (schedule wins)', () => {
  const named = [
    [10000, 18, 916.8, 13, 12],
    [25000, 12, 2221.22, 13, 12],
    [25000, 18, 4388.13, 6, 7],
    [25000, 18, 903.81, 37, 36],
    [100000, 15, 17403.38, 6, 7],
  ]
  for (const [P, a, pay, sm, cf] of named) {
    assert.strictEqual(payoffMonths({ principal: P, annualRatePct: a, payment: pay }).months, sm, `schedule ${P}/${a}/${pay}`)
    assert.strictEqual(closedForm(P, a, pay), cf, `formula ${P}/${a}/${pay}`)
  }
  console.log(`        (info) grid cases where formula and schedule differ: ${e8Disagree.length} of ${e8Cases}`)
})

// ---- E9 / E10: planner reference values ----
const A1 = { id: 'A', name: 'A', balance: 50000, annualRatePct: 24, minPayment: 2500 }
const B1 = { id: 'B', name: 'B', balance: 20000, annualRatePct: 12, minPayment: 1000 }
const pm = (p, id) => p.perDebt.find((d) => d.id === id)
test('E9: planner baseline, avalanche, snowball (A 50,000 @24% min 2,500; B 20,000 @12% min 1,000; budget 6,000)', () => {
  const none = planDebts({ debts: [A1, B1], monthlyBudget: 6000, strategy: 'none' })
  assert.strictEqual(none.months, 26)
  assert.strictEqual(none.totalInterest, 16920.6)
  assert.strictEqual(pm(none, 'A').payoffMonth, 26)
  assert.strictEqual(pm(none, 'A').interest, 14493.64)
  assert.strictEqual(pm(none, 'B').payoffMonth, 23)
  assert.strictEqual(pm(none, 'B').interest, 2426.96)
  const av = planDebts({ debts: [A1, B1], monthlyBudget: 6000, strategy: 'avalanche' })
  assert.strictEqual(av.months, 14)
  assert.strictEqual(av.totalInterest, 8270.37)
  assert.strictEqual(pm(av, 'A').payoffMonth, 12)
  assert.strictEqual(pm(av, 'B').payoffMonth, 14)
  const sn = planDebts({ debts: [A1, B1], monthlyBudget: 6000, strategy: 'snowball' })
  assert.strictEqual(sn.months, 14)
  assert.strictEqual(sn.totalInterest, 9645.29)
  assert.strictEqual(pm(sn, 'B').payoffMonth, 6)
  assert.strictEqual(pm(sn, 'A').payoffMonth, 14)
})
const A2 = { ...A1, annualRatePct: 12 }
const B2 = { ...B1, annualRatePct: 24 }
test('E10: when the highest rate is also the smallest balance, avalanche = snowball', () => {
  const av = planDebts({ debts: [A2, B2], monthlyBudget: 6000, strategy: 'avalanche' })
  const sn = planDebts({ debts: [A2, B2], monthlyBudget: 6000, strategy: 'snowball' })
  assert.deepStrictEqual(av, sn)
  assert.strictEqual(av.months, 13)
  assert.strictEqual(av.totalInterest, 5615.62)
  assert.strictEqual(pm(av, 'B').payoffMonth, 7)
})

// ---- E11: schedule invariants ----
test('E11: schedule invariants over 40 combinations', () => {
  const rnd = lcg(11)
  const rates = [0, 6, 8.5, 12, 18, 24]
  for (let k = 0; k < 40; k++) {
    const P = Math.round((1000 + rnd() * 900000) * 100) / 100
    const a = rates[Math.floor(rnd() * rates.length)]
    const n = 6 + Math.floor(rnd() * 120)
    const pay = emiOf(P, a, n)
    const s = sched({ principal: P, annualRatePct: a, payment: pay, termMonths: n })
    assert.strictEqual(s.ok, true)
    let principalSum = 0
    let prev = P
    for (const r of s.rows) {
      assert.strictEqual(paise(r.payment), paise(r.interest) + paise(r.principal))
      principalSum += paise(r.principal)
      assert.ok(r.balance < prev || r.balance === 0, 'balance must fall')
      prev = r.balance
    }
    assert.strictEqual(principalSum, paise(P))
    assert.strictEqual(s.rows[s.rows.length - 1].balance, 0)
    assert.strictEqual(s.remainingBalance, 0)
  }
})

// ---- E12: schedule edges ----
test('E12: schedule edges and termMonths cases', () => {
  // rate 0, 1 month
  assert.strictEqual(sched({ principal: 1200, annualRatePct: 0, payment: 400 }).months, 3)
  const one = sched({ principal: 1000, annualRatePct: 12, payment: 2000 })
  assert.strictEqual(one.months, 1)
  assert.strictEqual(one.finalPayment, 1010)
  // payment equal to / below the first-month interest
  for (const pay of [1000, 999.99, 500]) {
    const s = sched({ principal: 100000, annualRatePct: 12, payment: pay })
    assert.strictEqual(s.ok, true)
    assert.strictEqual(s.paysOff, false)
    assert.strictEqual(s.reason, 'payment-not-above-interest')
    assert.deepStrictEqual(s.rows, [])
    assert.strictEqual(s.endedBy, null)
  }
  // payment larger than the balance
  assert.strictEqual(sched({ principal: 500, annualRatePct: 12, payment: 100000 }).finalPayment, 505)
  // termMonths (1): rounding only
  const t1 = sched({ principal: 1000000, annualRatePct: 8.5, payment: 8678.23, termMonths: 240 })
  assert.strictEqual(t1.endedBy, 'term-adjusted')
  assert.strictEqual(t1.finalPayment, 8679.66)
  assert.strictEqual(t1.finalPaymentDifference, 1.43)
  assert.deepStrictEqual(t1.rows.map((r) => r.adjusted).lastIndexOf(true), 239)
  assert.strictEqual(t1.rows.filter((r) => r.adjusted).length, 1)
  // (2) large adjustment
  const t2 = sched({ principal: 100000, annualRatePct: 12, payment: 2000, termMonths: 12 })
  assert.strictEqual(t2.endedBy, 'term-adjusted')
  assert.strictEqual(t2.months, 12)
  assert.strictEqual(t2.totalInterest, 11317.49)
  assert.strictEqual(t2.finalPayment, 89317.49)
  assert.strictEqual(t2.finalPaymentDifference, 87317.49)
  assert.strictEqual(t2.rows[11].adjusted, true)
  // (3) cleared early
  const t3 = sched({ principal: 100000, annualRatePct: 12, payment: 20000, termMonths: 12 })
  assert.strictEqual(t3.endedBy, 'cleared-naturally')
  assert.strictEqual(t3.months, 6)
  assert.strictEqual(t3.finalPayment, 3111.71)
  assert.ok(t3.rows.every((r) => r.adjusted === false))
  assert.ok(t3.finalPaymentDifference < 0)
  // (4) the cap is reached
  const t4 = sched({ principal: 100000, annualRatePct: 12, payment: 1001 })
  assert.strictEqual(t4.endedBy, 'max-months')
  assert.strictEqual(t4.paysOff, false)
  assert.strictEqual(t4.reason, 'exceeds-max-months')
  assert.strictEqual(t4.months, 600)
  assert.ok(t4.remainingBalance > 0)
  // (5) term greater than the cap
  assert.deepStrictEqual(sched({ principal: 1000, annualRatePct: 5, payment: 100, termMonths: 601 }), { ok: false, reason: 'invalid-input' })
  assert.deepStrictEqual(sched({ principal: 1000, annualRatePct: 5, payment: 100, termMonths: 24, maxMonths: 12 }), { ok: false, reason: 'invalid-input' })
  // (6) a term never hides a non-amortizing payment
  const t6 = sched({ principal: 100000, annualRatePct: 12, payment: 1000, termMonths: 12 })
  assert.strictEqual(t6.reason, 'payment-not-above-interest')
  assert.strictEqual(t6.endedBy, null)
  // invalid and huge
  assert.deepStrictEqual(sched({ principal: 0, annualRatePct: 12, payment: 100 }), { ok: false, reason: 'invalid-input' })
  const big = sched({ principal: 1e9, annualRatePct: 12, payment: 1.5e7 })
  assert.strictEqual(big.ok, true)
  assert.ok(Number.isFinite(big.totalInterest) && big.totalInterest > 0)
})

// ---- E13: implied annual rate ----
test('E13: impliedAnnualRate round trip, two-sided range, mid-range example', () => {
  for (const rate of [0.5, 1, 2, 3.5, 5, 7.25, 8.5, 9, 10, 12, 13.5, 15, 18, 20, 24, 30, 36, 48, 60, 80]) {
    const emi = emiOf(250000, rate, 36)
    const r = impliedAnnualRate({ principal: 250000, payment: emi, months: 36 })
    assert.strictEqual(r.ok, true)
    assert.ok(Math.abs(r.annualRatePct - rate) < 0.01, `rate ${rate} -> ${r.annualRatePct}`)
  }
  const nz = (payment) => impliedAnnualRate({ principal: 100000, payment, months: 12 })
  assert.deepStrictEqual(nz(8333.32), { ok: false, reason: 'no-solution' })
  assert.deepStrictEqual(nz(13499.59), { ok: false, reason: 'no-solution' })
  assert.deepStrictEqual(nz(8333.33), { ok: true, annualRatePct: 0 })
  assert.deepStrictEqual(nz(13499.58), { ok: true, annualRatePct: 100 })
  assert.ok(Math.abs(nz(8884.88).annualRatePct - 12) < 0.01)
  // end points when the rounded EMI differs from the unrounded one (a payment exactly at an end returns that end)
  assert.deepStrictEqual(impliedAnnualRate({ principal: 100000, payment: 16666.67, months: 6 }), { ok: true, annualRatePct: 0 }) // 0% EMI rounds up
  assert.deepStrictEqual(impliedAnnualRate({ principal: 100000, payment: 21850.75, months: 6 }), { ok: true, annualRatePct: 100 }) // 100% EMI rounds down
  assert.deepStrictEqual(impliedAnnualRate({ principal: 100000, payment: 16666.66, months: 6 }), { ok: false, reason: 'no-solution' })
  assert.deepStrictEqual(impliedAnnualRate({ principal: 100000, payment: 21850.76, months: 6 }), { ok: false, reason: 'no-solution' })
  // total payments cover the principal but the payment is too large for any rate up to 100%
  assert.deepStrictEqual(impliedAnnualRate({ principal: 100000, payment: 50000, months: 12 }), { ok: false, reason: 'no-solution' })
})

// ---- E14: replay edges ----
test('E14: replay edges', () => {
  const base = { asOfDate: '2026-01-15', asOfOutstanding: 10000, annualRatePct: 12 }
  // payment in the as-of month after the as-of date goes to bucket 1
  let r = replayDebt({ ...base, payments: [{ date: '2026-01-20', amount: 1000 }], today: '2026-02-28' })
  assert.strictEqual(r.months[0].month, '2026-02')
  assert.strictEqual(r.months[0].paid, 1000)
  // payment on the as-of date is ignored; so is a payment after today
  r = replayDebt({ ...base, payments: [{ date: '2026-01-15', amount: 5000 }, { date: '2026-03-01', amount: 5000 }], today: '2026-02-28' })
  assert.strictEqual(r.paymentsApplied, 0)
  // overpayment
  r = replayDebt({ ...base, asOfOutstanding: 1000, payments: [{ date: '2026-02-10', amount: 5000 }], today: '2026-02-28' })
  assert.strictEqual(r.totalOwed, 0)
  assert.strictEqual(r.overpaid, 3990)
  assert.strictEqual(r.paymentsApplied, 1010)
  // a payment below accrued interest
  r = replayDebt({ ...base, payments: [{ date: '2026-02-10', amount: 50 }], today: '2026-02-28' })
  assert.strictEqual(r.belowInterestMonths, 1)
  assert.strictEqual(r.accruedInterest, 50)
  assert.strictEqual(r.outstandingPrincipal, 10000)
  assert.strictEqual(r.interestPaid, 50)
  assert.strictEqual(r.principalRepaid, 0)
  // no payments: every month overdue except the current one
  r = replayDebt({ ...base, payments: [], today: '2026-05-10' })
  assert.deepStrictEqual(r.months.map((m) => m.overdue), [true, true, true, false])
  assert.strictEqual(r.overdueMonths, 3)
  assert.strictEqual(r.interestPaid, 0)
  // unpaid interest at the start is paid first
  r = replayDebt({ ...base, asOfAccruedInterest: 200, payments: [{ date: '2026-02-10', amount: 500 }], today: '2026-02-28' })
  assert.strictEqual(r.months[0].interestPaid, 300) // 200 carried + 100 new
  assert.strictEqual(r.months[0].principalPaid, 200)
  assert.strictEqual(r.outstandingPrincipal, 9800)
  // today inside the as-of month: no buckets
  r = replayDebt({ ...base, payments: [{ date: '2026-01-20', amount: 500 }], today: '2026-01-31' })
  assert.deepStrictEqual(r.months, [])
  assert.strictEqual(r.totalOwed, 10000)
  // a debt that is already zero is never "overdue"
  r = replayDebt({ ...base, asOfOutstanding: 0, payments: [], today: '2026-05-10' })
  assert.strictEqual(r.overdueMonths, 0)
  // several payments in one bucket are summed
  r = replayDebt({ ...base, payments: [{ date: '2026-02-03', amount: 400 }, { date: '2026-02-20', amount: 600 }], today: '2026-02-28' })
  assert.strictEqual(r.months[0].paid, 1000)
})

// ---- E15: next due date ----
test('E15: nextDueDate', () => {
  const nd = (dueDay, today) => nextDueDate({ dueDay, today }).date
  assert.strictEqual(nd(31, '2026-02-10'), '2026-02-28')
  assert.strictEqual(nd(31, '2028-02-10'), '2028-02-29')
  assert.strictEqual(nd(31, '2026-04-05'), '2026-04-30')
  assert.strictEqual(nd(15, '2026-12-20'), '2027-01-15')
  assert.strictEqual(nd(15, '2026-06-15'), '2026-06-15') // today on the due day returns today
  assert.strictEqual(nd(15, '2026-06-14'), '2026-06-15')
  assert.strictEqual(nd(15, '2026-06-16'), '2026-07-15')
  assert.strictEqual(nd(31, '2026-01-31'), '2026-01-31')
  assert.strictEqual(nd(31, '2026-03-31'), '2026-03-31')
  assert.strictEqual(nd(30, '2026-01-31'), '2026-02-28') // passed the 30th, February has 28
})

// ---- E16: planner properties ----
const idnt = (p, start) => Math.abs((paise(p.totalPaid) + paise(p.remainingPrincipal)) - (paise(start) + paise(p.totalInterest))) === 0
test('E16: planner properties', () => {
  // single debt, budget = minimum: all three agree
  const one = { id: 'x', name: 'x', balance: 50000, annualRatePct: 15, minPayment: 3000 }
  const n0 = planDebts({ debts: [one], monthlyBudget: 3000, strategy: 'none' })
  const n1 = planDebts({ debts: [one], monthlyBudget: 3000, strategy: 'avalanche' })
  const n2 = planDebts({ debts: [one], monthlyBudget: 3000, strategy: 'snowball' })
  assert.deepStrictEqual(n0, n1)
  assert.deepStrictEqual(n1, n2)
  // a lump sum never increases interest; more budget never increases interest
  for (const strategy of ['avalanche', 'snowball']) {
    const base = planDebts({ debts: [A1, B1], monthlyBudget: 6000, strategy })
    for (const month of [1, 3, 8, 14]) {
      const l = planDebts({ debts: [A1, B1], monthlyBudget: 6000, strategy, lumpSum: { month, amount: 10000 } })
      assert.ok(l.totalInterest <= base.totalInterest, `lump month ${month}`)
    }
    let last = Infinity
    for (const b of [3500, 4000, 5000, 6000, 8000, 12000]) {
      const p = planDebts({ debts: [A1, B1], monthlyBudget: b, strategy })
      assert.ok(p.totalInterest <= last, `budget ${b}`)
      last = p.totalInterest
    }
  }
  // exact shortfall and the minimum-below-interest rule
  assert.deepStrictEqual(planDebts({ debts: [A1, B1], monthlyBudget: 3000, strategy: 'avalanche' }), { ok: false, reason: 'budget-below-minimums', shortfall: 500 })
  assert.deepStrictEqual(planDebts({ debts: [A1, { ...B1, minPayment: 200 }], monthlyBudget: 6000, strategy: 'avalanche' }), { ok: false, reason: 'minimum-below-interest', debtId: 'B' })
  // identity for completed and incomplete plans
  const start = 70000
  for (const strategy of ['none', 'avalanche', 'snowball']) {
    const p = planDebts({ debts: [A1, B1], monthlyBudget: 6000, strategy })
    assert.ok(idnt(p, start), strategy)
    assert.strictEqual(p.remainingPrincipal, 0)
    assert.strictEqual(p.paysOff, true)
  }
  // a zero-balance debt is skipped, not an error
  const z = planDebts({ debts: [A1, B1, { id: 'Z', name: 'Z', balance: 0, annualRatePct: 10, minPayment: 100 }], monthlyBudget: 6000, strategy: 'avalanche' })
  assert.strictEqual(z.perDebt.length, 2)
  // ties: equal rate -> by name, then id
  const t1 = { id: 'b', name: 'beta', balance: 10000, annualRatePct: 12, minPayment: 500 }
  const t2 = { id: 'a', name: 'alpha', balance: 10000, annualRatePct: 12, minPayment: 500 }
  const tie = planDebts({ debts: [t1, t2], monthlyBudget: 3000, strategy: 'avalanche' })
  const alpha = tie.perDebt.find((d) => d.id === 'a')
  const beta = tie.perDebt.find((d) => d.id === 'b')
  assert.ok(alpha.payoffMonth <= beta.payoffMonth)
})

// ---- E16 (added after the mutation run): lump-sum timing with exact values ----
test('E16: lump-sum timing, exact values (Python oracle and spreadsheet agree on all of them)', () => {
  // [month, amount, avalanche: months, interest, A payoff, B payoff, snowball: months, interest, A payoff, B payoff]
  const table = [
    [3, 10000, 12, 6414.87, 9, 12, 12, 7741.46, 12, 4],
    [1, 10000, 11, 5946.64, 9, 11, 12, 7501.26, 12, 3],
    [2, 5000, 13, 7158.74, 11, 13, 13, 8613.59, 13, 5],
    [8, 15000, 11, 7291.22, 9, 11, 11, 8281.63, 11, 6],
  ]
  for (const [month, amount, am, ai, aA, aB, sm, si, sA, sB] of table) {
    const av = planDebts({ debts: [A1, B1], monthlyBudget: 6000, strategy: 'avalanche', lumpSum: { month, amount } })
    const sn = planDebts({ debts: [A1, B1], monthlyBudget: 6000, strategy: 'snowball', lumpSum: { month, amount } })
    assert.deepStrictEqual([av.months, av.totalInterest, pm(av, 'A').payoffMonth, pm(av, 'B').payoffMonth], [am, ai, aA, aB], `avalanche lump ${month}`)
    assert.deepStrictEqual([sn.months, sn.totalInterest, pm(sn, 'A').payoffMonth, pm(sn, 'B').payoffMonth], [sm, si, sA, sB], `snowball lump ${month}`)
  }
  // the same lump sum one month later gives a different (here higher) interest total
  const early = planDebts({ debts: [A1, B1], monthlyBudget: 6000, strategy: 'avalanche', lumpSum: { month: 2, amount: 10000 } })
  const late = planDebts({ debts: [A1, B1], monthlyBudget: 6000, strategy: 'avalanche', lumpSum: { month: 3, amount: 10000 } })
  assert.ok(early.totalInterest < late.totalInterest)
})

// ---- E17: comparePlans ----
test('E17: comparePlans', () => {
  const c = comparePlans({ debts: [A1, B1], monthlyBudget: 6000 })
  assert.strictEqual(c.ok, true)
  assert.strictEqual(c.baseline.totalInterest, 16920.6)
  assert.strictEqual(c.savingsVsBaseline.avalanche, 8650.23)
  assert.strictEqual(c.savingsVsBaseline.snowball, 7275.31)
  assert.strictEqual(c.avalancheVsSnowballInterest, 1374.92)
  assert.deepStrictEqual(comparePlans({ debts: [A1, B1], monthlyBudget: 3000 }), { ok: false, reason: 'budget-below-minimums', shortfall: 500, failedPlan: 'avalanche' })
  const bad = comparePlans({ debts: [A1, { ...B1, minPayment: 200 }], monthlyBudget: 6000 })
  assert.strictEqual(bad.ok, false)
  assert.strictEqual(bad.failedPlan, 'baseline')
  assert.strictEqual(bad.reason, 'minimum-below-interest')
  assert.strictEqual(bad.debtId, 'B')
  const lump = comparePlans({ debts: [A1, B1], monthlyBudget: 6000, lumpSum: { month: 2, amount: 5000 } })
  assert.ok(lump.avalanche.totalInterest < c.avalanche.totalInterest)
  assert.strictEqual(lump.baseline.totalInterest, c.baseline.totalInterest) // the baseline never uses a lump sum
})

// ---- E18: determinism and no mutation ----
test('E18: same input twice gives deep-equal output; frozen inputs are untouched', () => {
  const debts = deepFreeze([{ ...A1 }, { ...B1 }])
  const pays = deepFreeze(E7.payments.map((p) => ({ ...p })))
  const calls = [
    () => computeEmi(deepFreeze({ principal: 100000, annualRatePct: 12, months: 12 })),
    () => buildSchedule(deepFreeze({ principal: 100000, annualRatePct: 12, payment: 8884.88, termMonths: 12 })),
    () => payoffMonths(deepFreeze({ principal: 100000, annualRatePct: 12, payment: 5000 })),
    () => impliedAnnualRate(deepFreeze({ principal: 100000, payment: 8884.88, months: 12 })),
    () => replayDebt(deepFreeze({ ...E7, payments: pays })),
    () => nextDueDate(deepFreeze({ dueDay: 31, today: '2026-02-10' })),
    () => planDebts(deepFreeze({ debts, monthlyBudget: 6000, strategy: 'avalanche', lumpSum: { month: 2, amount: 100 } })),
    () => comparePlans(deepFreeze({ debts, monthlyBudget: 6000 })),
  ]
  for (const call of calls) assert.deepStrictEqual(call(), call())
})

// ---- E19: purity guard ----
const SRC = readFileSync(new URL('./debtEngine.js', import.meta.url), 'utf8')
test('E19: the engine imports nothing but financialEngine.js and has no network, clock or randomness', () => {
  const imports = [...SRC.matchAll(/^\s*import\s[^\n]*from\s+'([^']+)'/gm)].map((m) => m[1])
  for (const i of imports) assert.strictEqual(i, './financialEngine.js')
  for (const banned of [/supabase/i, /fetch\(/, /Date\.now/, /new Date\(\)/, /Math\.random/, /require\(/, /import\(/]) {
    assert.ok(!banned.test(SRC), `banned pattern ${banned}`)
  }
})

// ---- fixtures shared by E20, E22, E24 ----
const plans = [
  planDebts({ debts: [A1, B1], monthlyBudget: 6000, strategy: 'avalanche' }),
  planDebts({ debts: [A1, B1], monthlyBudget: 6000, strategy: 'snowball' }),
  planDebts({ debts: [A1, B1], monthlyBudget: 6000, strategy: 'none' }),
  planDebts({ debts: [{ id: 1, name: 'x', balance: 100000, annualRatePct: 12, minPayment: 1001 }], monthlyBudget: 1001, strategy: 'avalanche' }),
  planDebts({ debts: [{ id: 1, name: 'x', balance: 100000, annualRatePct: 12, minPayment: 1001 }, { id: 2, name: 'y', balance: 50000, annualRatePct: 12, minPayment: 501 }], monthlyBudget: 1502, strategy: 'snowball' }),
  planDebts({ debts: [A1, B1], monthlyBudget: 6000, strategy: 'avalanche', lumpSum: { month: 3, amount: 10000 } }),
]
const schedules = [
  sched({ principal: 100000, annualRatePct: 12, payment: 8884.88, termMonths: 12 }),
  sched({ principal: 1000000, annualRatePct: 8.5, payment: 8678.23, termMonths: 240 }),
  sched({ principal: 100000, annualRatePct: 12, payment: 2000, termMonths: 12 }),
  sched({ principal: 100000, annualRatePct: 12, payment: 1001 }),
  sched({ principal: 100000, annualRatePct: 12, payment: 1000 }),
  sched({ principal: 50000, annualRatePct: 0, payment: 5000 }),
]
const replays = [
  replayDebt(E7),
  replayDebt({ ...E7, payments: [], today: '2027-05-31' }),
  replayDebt({ ...E7, asOfOutstanding: 500, payments: [{ date: '2026-02-02', amount: 9000 }] }),
]
const walk = (v, fn, path = '') => {
  if (Array.isArray(v)) v.forEach((x, i) => walk(x, fn, `${path}[${i}]`))
  else if (v && typeof v === 'object') for (const [k, x] of Object.entries(v)) walk(x, fn, `${path}.${k}`, fn(k, x, path))
  else fn(path.split('.').pop(), v, path)
}
const everyOutput = () => [...plans, ...schedules, ...replays, comparePlans({ debts: [A1, B1], monthlyBudget: 6000 }), computeEmi({ principal: 1, annualRatePct: 0, months: 1 })]

// ---- E20 ----
test('E20: no output value is NaN, Infinity or a negative balance', () => {
  for (const out of everyOutput()) {
    walk(out, (key, val, path) => {
      if (typeof val === 'number') {
        assert.ok(Number.isFinite(val), `non-finite at ${path}`)
        if (/balance|principal|owed|remaining|accrued/i.test(String(key))) assert.ok(val >= 0, `negative at ${path}`)
      }
    })
  }
})

// ---- E21: replay identity ----
test('E21: replay identities hold exactly in paise on 200 generated cases', () => {
  const rnd = lcg(2121)
  const rates = [0, 5, 8.5, 9.35, 12, 24, 36]
  let checked = 0
  for (let k = 0; k < 200; k++) {
    const y = 2025 + Math.floor(rnd() * 2)
    const asOfM = 1 + Math.floor(rnd() * 12)
    const asOfD = 1 + Math.floor(rnd() * 28)
    const asOfDate = `${y}-${String(asOfM).padStart(2, '0')}-${String(asOfD).padStart(2, '0')}`
    const span = 1 + Math.floor(rnd() * 14)
    const idx = y * 12 + asOfM - 1 + span
    const today = `${Math.floor(idx / 12)}-${String((idx % 12) + 1).padStart(2, '0')}-${String(1 + Math.floor(rnd() * 28)).padStart(2, '0')}`
    const payments = []
    for (let j = 0, n = Math.floor(rnd() * 9); j < n; j++) {
      const pi = y * 12 + asOfM - 1 + Math.floor(rnd() * (span + 1))
      payments.push({
        date: `${Math.floor(pi / 12)}-${String((pi % 12) + 1).padStart(2, '0')}-${String(1 + Math.floor(rnd() * 28)).padStart(2, '0')}`,
        amount: Math.round((50 + rnd() * (rnd() < 0.15 ? 400000 : 12000)) * 100) / 100,
      })
    }
    const asOfOutstanding = Math.round(rnd() * 5000000) / 100
    const asOfAccruedInterest = rnd() < 0.3 ? Math.round(rnd() * 50000) / 100 : 0
    const r = replayDebt({ asOfDate, asOfOutstanding, asOfAccruedInterest, annualRatePct: rates[Math.floor(rnd() * rates.length)], payments, today })
    assert.strictEqual(r.ok, true, `${asOfDate} ${today}`)
    assert.strictEqual(paise(asOfOutstanding) + paise(asOfAccruedInterest) + paise(r.interestAccrued) - paise(r.paymentsApplied), paise(r.totalOwed))
    assert.strictEqual(paise(asOfOutstanding) - paise(r.principalRepaid), paise(r.outstandingPrincipal))
    assert.strictEqual(paise(r.paymentsApplied), paise(r.interestPaid) + paise(r.principalRepaid))
    assert.strictEqual(paise(r.totalOwed), paise(r.outstandingPrincipal) + paise(r.accruedInterest))
    checked++
  }
  assert.strictEqual(checked, 200)
})

// ---- E22: invalid-input sweep ----
test('E22: every function returns its stated reason for bad input, never throws, never returns NaN', () => {
  const okRep = { ...E7 }
  const cases = [
    [computeEmi, { principal: 0, annualRatePct: 12, months: 12 }, 'invalid-input'],
    [computeEmi, { principal: -5, annualRatePct: 12, months: 12 }, 'invalid-input'],
    [computeEmi, { principal: 1000, annualRatePct: 12, months: 0 }, 'invalid-input'],
    [computeEmi, { principal: 1000, annualRatePct: 12, months: 1.5 }, 'invalid-input'],
    [computeEmi, { principal: 1000, annualRatePct: 101, months: 12 }, 'invalid-input'],
    [computeEmi, { principal: 1000, annualRatePct: -1, months: 12 }, 'invalid-input'],
    [computeEmi, { principal: NaN, annualRatePct: 12, months: 12 }, 'invalid-input'],
    [computeEmi, { principal: Infinity, annualRatePct: 12, months: 12 }, 'invalid-input'],
    [computeEmi, undefined, 'invalid-input'],
    [buildSchedule, { principal: 1000, annualRatePct: 12, payment: 0 }, 'invalid-input'],
    [buildSchedule, { principal: 1000, annualRatePct: 12, payment: NaN }, 'invalid-input'],
    [buildSchedule, { principal: 1000, annualRatePct: 120, payment: 100 }, 'invalid-input'],
    [buildSchedule, { principal: 1000, annualRatePct: 12, payment: 100, termMonths: 0 }, 'invalid-input'],
    [buildSchedule, { principal: 1000, annualRatePct: 12, payment: 100, termMonths: 2.5 }, 'invalid-input'],
    [buildSchedule, { principal: 1000, annualRatePct: 12, payment: 100, maxMonths: 0 }, 'invalid-input'],
    [buildSchedule, { principal: 1000, annualRatePct: 12, payment: 100, maxMonths: 601 }, 'invalid-input'],
    [payoffMonths, { principal: 1000, annualRatePct: 12, payment: -1 }, 'invalid-input'],
    [payoffMonths, {}, 'invalid-input'],
    [impliedAnnualRate, { principal: 0, payment: 100, months: 12 }, 'invalid-input'],
    [impliedAnnualRate, { principal: 1000, payment: 0, months: 12 }, 'invalid-input'],
    [impliedAnnualRate, { principal: 1000, payment: 100, months: 0 }, 'invalid-input'],
    [impliedAnnualRate, { principal: 1000, payment: NaN, months: 12 }, 'invalid-input'],
    [impliedAnnualRate, { principal: 1000, payment: 10, months: 12 }, 'no-solution'],
    [replayDebt, { ...okRep, asOfDate: '2026-02-30' }, 'invalid-input'],
    [replayDebt, { ...okRep, asOfDate: '2026-1-5' }, 'invalid-input'],
    [replayDebt, { ...okRep, today: 'nope' }, 'invalid-input'],
    [replayDebt, { ...okRep, asOfOutstanding: -1 }, 'invalid-input'],
    [replayDebt, { ...okRep, asOfOutstanding: NaN }, 'invalid-input'],
    [replayDebt, { ...okRep, asOfAccruedInterest: -5 }, 'invalid-input'],
    [replayDebt, { ...okRep, annualRatePct: 150 }, 'invalid-input'],
    [replayDebt, { ...okRep, payments: 'x' }, 'invalid-input'],
    [replayDebt, { ...okRep, payments: [{ date: '2026-02-10', amount: 0 }] }, 'invalid-input'],
    [replayDebt, { ...okRep, payments: [{ date: '2026-02-40', amount: 5 }] }, 'invalid-input'],
    [replayDebt, { ...okRep, payments: [null] }, 'invalid-input'],
    [replayDebt, { ...okRep, today: '2025-12-31' }, 'today-before-as-of'],
    [nextDueDate, { dueDay: 0, today: '2026-02-10' }, 'invalid-input'],
    [nextDueDate, { dueDay: 32, today: '2026-02-10' }, 'invalid-input'],
    [nextDueDate, { dueDay: 5.5, today: '2026-02-10' }, 'invalid-input'],
    [nextDueDate, { dueDay: 5, today: '2026-13-01' }, 'invalid-input'],
    [planDebts, { debts: 'x', monthlyBudget: 100, strategy: 'avalanche' }, 'invalid-input'],
    [planDebts, { debts: [A1], monthlyBudget: NaN, strategy: 'avalanche' }, 'invalid-input'],
    [planDebts, { debts: [A1], monthlyBudget: 6000, strategy: 'random' }, 'invalid-input'],
    [planDebts, { debts: [{ ...A1, id: undefined }], monthlyBudget: 6000, strategy: 'avalanche' }, 'invalid-input'],
    [planDebts, { debts: [{ ...A1, name: '' }], monthlyBudget: 6000, strategy: 'avalanche' }, 'invalid-input'],
    [planDebts, { debts: [{ ...A1, balance: -1 }], monthlyBudget: 6000, strategy: 'avalanche' }, 'invalid-input'],
    [planDebts, { debts: [{ ...A1, annualRatePct: 200 }], monthlyBudget: 6000, strategy: 'avalanche' }, 'invalid-input'],
    [planDebts, { debts: [{ ...A1, minPayment: 0 }], monthlyBudget: 6000, strategy: 'avalanche' }, 'invalid-input'],
    [planDebts, { debts: [A1], monthlyBudget: 6000, strategy: 'avalanche', lumpSum: { month: 0, amount: 5 } }, 'invalid-input'],
    [planDebts, { debts: [A1], monthlyBudget: 6000, strategy: 'avalanche', lumpSum: { month: 2, amount: -5 } }, 'invalid-input'],
    [planDebts, { debts: [A1], monthlyBudget: 6000, strategy: 'avalanche', lumpSum: 'x' }, 'invalid-input'],
    [planDebts, { debts: [], monthlyBudget: 6000, strategy: 'avalanche' }, 'no-debts'],
    [planDebts, { debts: [{ ...A1, balance: 0 }], monthlyBudget: 6000, strategy: 'avalanche' }, 'no-debts'],
    [comparePlans, { debts: [A1], monthlyBudget: NaN }, 'invalid-input'],
  ]
  for (const [fn, args, reason] of cases) {
    let out
    assert.doesNotThrow(() => { out = fn(args) }, `${fn.name} threw for ${JSON.stringify(args)}`)
    assert.strictEqual(out.ok, false, `${fn.name} ${JSON.stringify(args)}`)
    assert.strictEqual(out.reason, reason, `${fn.name} ${JSON.stringify(args)} -> ${out.reason}`)
    walk(out, (k, v) => { if (typeof v === 'number') assert.ok(Number.isFinite(v)) })
  }
})

// ---- E23: incomplete plans ----
test('E23: plans that reach the month cap report remaining principal and keep the identity', () => {
  const one = { id: 1, name: 'x', balance: 100000, annualRatePct: 12, minPayment: 1001 }
  const p = planDebts({ debts: [one], monthlyBudget: 1001, strategy: 'avalanche' })
  assert.strictEqual(p.ok, true)
  assert.strictEqual(p.paysOff, false)
  assert.strictEqual(p.months, 600)
  assert.strictEqual(p.totalPaid, 600600)
  assert.strictEqual(p.totalInterest, 561548.7)
  assert.strictEqual(p.remainingPrincipal, 60948.7)
  assert.strictEqual(p.perDebt[0].payoffMonth, null)
  assert.strictEqual(p.perDebt[0].remaining, 60948.7)
  assert.ok(idnt(p, 100000))
  // two debts incomplete, and with a lump sum
  const two = [one, { id: 2, name: 'y', balance: 50000, annualRatePct: 12, minPayment: 501 }]
  for (const strategy of ['avalanche', 'snowball']) {
    const q = planDebts({ debts: two, monthlyBudget: 1502, strategy })
    assert.strictEqual(q.paysOff, false)
    assert.ok(q.remainingPrincipal > 0)
    assert.ok(idnt(q, 150000), strategy)
    const l = planDebts({ debts: two, monthlyBudget: 1502, strategy, lumpSum: { month: 5, amount: 20000 } })
    assert.ok(idnt(l, 150000), `${strategy} lump`)
    assert.ok(l.remainingPrincipal < q.remainingPrincipal)
  }
  // the same plans completed with a larger budget: remaining principal is 0 and the identity still holds
  const done = planDebts({ debts: two, monthlyBudget: 6000, strategy: 'avalanche' })
  assert.strictEqual(done.paysOff, true)
  assert.strictEqual(done.remainingPrincipal, 0)
  assert.ok(idnt(done, 150000))
  // maxMonths smaller than needed
  const short = planDebts({ debts: [A1, B1], monthlyBudget: 6000, strategy: 'avalanche', maxMonths: 6 })
  assert.strictEqual(short.paysOff, false)
  assert.strictEqual(short.months, 6)
  assert.ok(idnt(short, 70000))
})

// ---- E24: calculated, never confirmed ----
test('E24: every result of buildSchedule, replayDebt and planDebts is a calculated scenario', () => {
  const withBasis = [...schedules.filter((s) => s.ok), ...replays, ...plans.filter((p) => p.ok)]
  assert.ok(withBasis.length >= 12)
  for (const out of withBasis) assert.strictEqual(out.basis, 'calculated')
  // an entered payment figure does not change it
  assert.strictEqual(sched({ principal: 100000, annualRatePct: 12, payment: 8884.88 }).basis, 'calculated')
  // a term-adjusted result and an incomplete plan are part of the sweep
  assert.ok(schedules.some((s) => s.endedBy === 'term-adjusted'))
  assert.ok(plans.some((p) => p.ok && !p.paysOff))
  // no key anywhere contains "confirmed" or "lender"
  for (const out of everyOutput()) walk(out, (k) => assert.ok(!/confirmed|lender/i.test(String(k)), `key ${k}`))
  // and no quoted string in the source (comments removed) says it either
  const code = SRC.replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '').replace(/([^:'"`])\/\/.*$/gm, '$1')
  const literals = code.match(/'(?:[^'\\\n]|\\.)*'|"(?:[^"\\\n]|\\.)*"|`(?:[^`\\]|\\.)*`/g) || []
  assert.ok(literals.length > 10)
  for (const l of literals) assert.ok(!/confirmed|lender/i.test(l), `literal ${l}`)
})

console.log(`\n${passed} passed, ${failed} failed`)
if (failed > 0) process.exit(1)
