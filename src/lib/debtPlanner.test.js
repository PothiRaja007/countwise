// D5 - tests for the repayment planner glue (debtPlanner.js).
// The planner's numbers come from the existing engine (debtEngine.comparePlans). To avoid checking the engine against
// itself, this file carries its OWN month-by-month simulation (a different structure, written from the stated rules,
// in BigInt paise) and compares every scenario with it, on fixed and on random debt sets. Plain node, no framework.
import assert from 'node:assert'
import {
  COPY, MAX_PLAN_MONTHS, monthAfter, parseBudget, parseLump, selectPlannerDebts, runPlanner, sumMinimums, monthlyInterest, methodComparison, warningText,
} from './debtPlanner.js'
import { comparePlans } from './debtEngine.js'
import { computeDebtFigures, annotateLinks } from './debtPayments.js'

let passed = 0, failed = 0
function test(name, fn) {
  try { fn(); passed++; console.log(`  PASS  ${name}`) } catch (err) { failed++; console.log(`  FAIL  ${name}\n        ${String(err.message).split('\n').join('\n        ')}`) }
}

// ---------- the independent simulation ----------
// Stated model: every month (1) interest is added to every open debt, rounded to the paisa, half up; (2) every open debt
// receives its required payment (never more than it owes); (3) what is left of the budget goes to the target debt, then
// the next; (4) a one-time payment is added to what is left in its month. Avalanche orders by highest rate, snowball by
// smallest balance (after interest and required payments); ties by name, then id. Baseline = required payments only.
function simulate({ debts, budget, strategy, lump }) {
  const P = (x) => BigInt(Math.round(x * 100))
  const st = debts.map((d) => ({ id: d.id, name: d.name, rate: d.annualRatePct, r100: BigInt(Math.round(d.annualRatePct * 100)), min: P(d.minPayment), bal: P(d.balance), interest: 0n, payoff: null }))
  let totalInterest = 0n, totalPaid = 0n, months = 0
  const tie = (a, b) => (a.name < b.name ? -1 : a.name > b.name ? 1 : String(a.id) < String(b.id) ? -1 : String(a.id) > String(b.id) ? 1 : 0)
  while (months < 600 && st.some((s) => s.bal > 0n)) {
    months++
    for (const s of st) {
      if (s.bal <= 0n) continue
      const i = (s.bal * s.r100 * 2n + 120000n) / 240000n
      s.bal += i; s.interest += i; totalInterest += i
    }
    let left = P(budget)
    for (const s of st) {
      if (s.bal <= 0n) continue
      const pay = s.min < s.bal ? s.min : s.bal
      s.bal -= pay; totalPaid += pay; left -= pay
    }
    if (strategy !== 'none') {
      if (lump && months === lump.month) left += P(lump.amount)
      const open = st.filter((s) => s.bal > 0n)
      open.sort(strategy === 'avalanche' ? (a, b) => (b.rate - a.rate) || tie(a, b) : (a, b) => (a.bal < b.bal ? -1 : a.bal > b.bal ? 1 : tie(a, b)))
      for (const s of open) {
        if (left <= 0n) break
        const pay = left < s.bal ? left : s.bal
        s.bal -= pay; totalPaid += pay; left -= pay
      }
    }
    for (const s of st) if (s.bal === 0n && s.payoff === null) s.payoff = months
  }
  const remaining = st.reduce((a, s) => a + s.bal, 0n)
  return {
    months, paysOff: remaining === 0n, totalInterest: Number(totalInterest) / 100, totalPaid: Number(totalPaid) / 100, remaining: Number(remaining) / 100,
    perDebt: st.map((s) => ({ id: s.id, payoff: s.payoff, interest: Number(s.interest) / 100 })),
  }
}

// ---------- fixtures ----------
const D = (id, name, balance, rate, min, extra = {}) => ({ id, name, balance, annualRatePct: rate, minPayment: min, estimate: false, ...extra })
const SETS = {
  one: [D('a', 'Bike loan', 100000, 12, 5000)],
  two: [D('a', 'Bike loan', 100000, 12, 5000), D('b', 'Card', 30000, 36, 1500)],
  three: [D('a', 'Home', 500000, 9, 10500), D('b', 'Phone', 20000, 0, 2000), D('c', 'Education', 150000, 11.5, 4000)],
  tie: [D('b', 'Beta', 40000, 18, 2500), D('a', 'Alpha', 40000, 18, 2500)],
  small: [D('a', 'Tiny', 1000.55, 24, 600), D('b', 'Big', 250000.25, 8.75, 5000)],
}
const today = '2026-10-15'

function compareToSim(debts, budget, lump, label) {
  const res = runPlanner({ debts, budgetText: String(budget), lumpAmount: lump ? String(lump.amount) : '', lumpMonth: lump ? String(lump.month) : '', today })
  assert.strictEqual(res.status, 'ok', `${label}: ${JSON.stringify(res)}`)
  for (const sc of res.scenarios) {
    const sim = simulate({ debts, budget, strategy: sc.key === 'baseline' ? 'none' : sc.key, lump })
    assert.strictEqual(sc.paysOff, sim.paysOff, `${label} ${sc.key} paysOff`)
    assert.strictEqual(sc.totalInterest, sim.totalInterest, `${label} ${sc.key} totalInterest`)
    assert.strictEqual(sc.totalPaid, sim.totalPaid, `${label} ${sc.key} totalPaid`)
    assert.strictEqual(sc.remaining, sim.remaining, `${label} ${sc.key} remaining`)
    if (sim.paysOff) assert.strictEqual(sc.months, sim.months, `${label} ${sc.key} months`)
    for (const p of sc.perDebt) {
      const s = sim.perDebt.find((x) => x.id === p.id)
      assert.strictEqual(p.payoffMonth, s.payoff, `${label} ${sc.key} ${p.id} payoff month`)
      assert.strictEqual(p.interest, s.interest, `${label} ${sc.key} ${p.id} interest`)
    }
  }
  return res
}

// ---------- dates ----------
test('P1: month numbers become month names, across year ends', () => {
  assert.strictEqual(monthAfter('2026-10-15', 0), 'Oct 2026')
  assert.strictEqual(monthAfter('2026-10-15', 1), 'Nov 2026')
  assert.strictEqual(monthAfter('2026-10-15', 2), 'Dec 2026')
  assert.strictEqual(monthAfter('2026-10-15', 3), 'Jan 2027')
  assert.strictEqual(monthAfter('2026-12-31', 1), 'Jan 2027')
  assert.strictEqual(monthAfter('2026-01-01', 12), 'Jan 2027')
  assert.strictEqual(monthAfter('2026-10-15', 23), 'Sep 2028')
  assert.strictEqual(monthAfter('2026-10-15', 600), 'Oct 2076')
  assert.strictEqual(monthAfter('2026-02-28', 1), 'Mar 2026')
})
test('P2: bad date input gives null, never a wrong month', () => {
  for (const bad of [undefined, null, '', 'abc', '2026-13-01', '2026-00-10', '2026-10-00', '2026-10-32', '26-10-15']) assert.strictEqual(monthAfter(bad, 1), null, String(bad))
  assert.strictEqual(monthAfter('2026-10-15T10:00:00Z', 1), 'Nov 2026')
  assert.strictEqual(monthAfter('2026-10-15', -1), null)
  assert.strictEqual(monthAfter('2026-10-15', 1.5), null)
  assert.strictEqual(monthAfter('2026-10-15', NaN), null)
})
test('P3: the date text does not depend on the machine time zone (string arithmetic only)', () => {
  assert.strictEqual(monthAfter('2026-10-31', 1), 'Nov 2026')
  assert.strictEqual(monthAfter('2026-03-01', 1), 'Apr 2026')
})

// ---------- reading what the user typed ----------
test('P4: budget text is read strictly', () => {
  assert.deepStrictEqual(parseBudget(''), { ok: true, value: null })
  assert.deepStrictEqual(parseBudget('   '), { ok: true, value: null })
  assert.deepStrictEqual(parseBudget('12000'), { ok: true, value: 12000 })
  assert.deepStrictEqual(parseBudget('12,000.50'), { ok: true, value: 12000.5 })
  for (const bad of ['0', '-5', 'abc', '1e3', '12.345', '1 000', '₹500', 'Infinity', 'NaN', '.5', '5.']) assert.strictEqual(parseBudget(bad).ok, false, bad)
  assert.strictEqual(parseBudget('100000000001').ok, false)
  assert.strictEqual(parseBudget('1234567890123').ok, false)
})
test('P5: lump-sum texts are read strictly, and only as a pair', () => {
  assert.deepStrictEqual(parseLump('', ''), { ok: true, value: null })
  assert.deepStrictEqual(parseLump('50000', '3'), { ok: true, value: { amount: 50000, month: 3 } })
  assert.deepStrictEqual(parseLump('500.5', '600'), { ok: true, value: { amount: 500.5, month: 600 } })
  for (const [a, m] of [['50000', ''], ['', '3'], ['0', '3'], ['-1', '3'], ['abc', '3'], ['5', '0'], ['5', '601'], ['5', '1.5'], ['5', 'x'], ['5', '-2'], ['5', '1000']]) assert.strictEqual(parseLump(a, m).ok, false, `${a}/${m}`)
  assert.strictEqual(parseLump('50000', '').message, COPY.invalidLumpPair)
})

// ---------- which debts are planned ----------
const baseDebt = (o = {}) => ({ id: 'd1', name: 'Bike loan', kind: 'term_loan', status: 'active', as_of_date: '2026-08-01', as_of_outstanding: 60000, as_of_accrued_interest: 0, annual_rate_pct: 12, monthly_payment: 3000, remaining_months: null, ...o })
const info = (figures, linkedCount = 0) => ({ linkedCount, figures })

test('P6: with no counted payment the opening principal is used, and the source says so', () => {
  const r = selectPlannerDebts([baseDebt()], new Map([['d1', info({ kind: 'none' })]]))
  assert.strictEqual(r.excluded.length, 0)
  assert.strictEqual(r.included[0].balance, 60000)
  assert.strictEqual(r.included[0].source, 'opening')
  assert.strictEqual(r.included[0].paymentsUsed, 0)
  assert.strictEqual(r.included[0].minPayment, 3000)
})
test('P7: with a counted payment the principal outstanding TODAY from D4b is used (real figures, not a stub)', () => {
  const debt = baseDebt()
  const tx = new Map([['t1', { id: 't1', type: 'expense', amount: 3000, transaction_date: '2026-09-05', description: 'EMI', account_id: 'a1' }], ['t2', { id: 't2', type: 'expense', amount: 3000, transaction_date: '2026-10-05', description: 'EMI', account_id: 'a1' }]])
  const rows = annotateLinks({ debt, links: [{ id: 'l1', transaction_id: 't1', created_at: '2026-09-06' }, { id: 'l2', transaction_id: 't2', created_at: '2026-10-06' }], txById: tx, accountNames: new Map([['a1', 'Bank']]), today })
  const figures = computeDebtFigures(debt, rows, today)
  assert.strictEqual(figures.kind, 'figures')
  const r = selectPlannerDebts([debt], new Map([['d1', info(figures, 2)]]))
  assert.strictEqual(r.included[0].balance, figures.principal)
  assert.ok(figures.principal < 60000)
  assert.strictEqual(r.included[0].source, 'payments')
  assert.strictEqual(r.included[0].paymentsUsed, 2)
})
test('P8: same-month figures (payments waiting) fall back to the opening principal', () => {
  const r = selectPlannerDebts([baseDebt()], new Map([['d1', info({ kind: 'same-month', paymentsWaiting: 1, from: 'Nov 2026' }, 1)]]))
  assert.strictEqual(r.included[0].balance, 60000)
  assert.strictEqual(r.included[0].source, 'opening')
})
test('P9: every excluded debt is listed with its reason; none disappears', () => {
  const debts = [
    baseDebt({ id: 'c', name: 'Closed one', status: 'closed' }),
    baseDebt({ id: 'z', name: 'Cleared at start', as_of_outstanding: 0 }),
    baseDebt({ id: 'n', name: 'No payment', monthly_payment: null }),
    baseDebt({ id: 'f', name: 'Failed figures' }),
    baseDebt({ id: 'p', name: 'Cleared by payments' }),
    baseDebt({ id: 'i', name: 'Interest only', as_of_outstanding: 0, as_of_accrued_interest: 120 }),
    baseDebt({ id: 'ok', name: 'Fine' }),
  ]
  const m = new Map([
    ['f', info({ kind: 'failed' })],
    ['p', info({ kind: 'figures', cleared: true, principal: 0, owedToday: 0, paymentsUsed: 4 }, 4)],
  ])
  const r = selectPlannerDebts(debts, m)
  assert.deepStrictEqual(r.included.map((d) => d.id), ['ok'])
  const reason = (id) => r.excluded.find((x) => x.id === id).reason
  assert.strictEqual(reason('c'), 'Closed')
  assert.strictEqual(reason('z'), 'Cleared')
  assert.strictEqual(reason('n'), 'No monthly payment entered')
  assert.strictEqual(reason('f'), 'Linked payments could not be calculated')
  assert.strictEqual(reason('p'), 'Cleared')
  assert.match(reason('i'), /No principal outstanding/)
  assert.strictEqual(r.included.length + r.excluded.length, debts.length)
})
test('P10: a zero or negative payment counts as "no monthly payment"; bad figures are excluded, not guessed', () => {
  const r = selectPlannerDebts([baseDebt({ id: 'a', monthly_payment: 0 }), baseDebt({ id: 'b', annual_rate_pct: 'x' }), baseDebt({ id: 'c', annual_rate_pct: 120 }), baseDebt({ id: 'd', as_of_outstanding: -5 })], new Map())
  assert.strictEqual(r.included.length, 0)
  assert.deepStrictEqual(r.excluded.map((x) => x.reason), ['No monthly payment entered', 'Figures are not valid', 'Figures are not valid', 'Figures are not valid'])
})
test('P11: a credit card is included and marked as an estimate; a loan is not', () => {
  const r = selectPlannerDebts([baseDebt({ id: 'card', name: 'Card', kind: 'credit_card' }), baseDebt({ id: 'loan' })], new Map())
  assert.strictEqual(r.included.find((d) => d.id === 'card').estimate, true)
  assert.strictEqual(r.included.find((d) => d.id === 'loan').estimate, false)
})
test('P12: missing or odd input never throws', () => {
  assert.deepStrictEqual(selectPlannerDebts(undefined, undefined), { included: [], excluded: [] })
  assert.deepStrictEqual(selectPlannerDebts([null, undefined], null).excluded.length, 2)
  assert.strictEqual(selectPlannerDebts([baseDebt()], undefined).included.length, 1)
})

// ---------- hand-checked reference ----------
test('P13: one debt, 100,000 at 12%, paid 5,000 a month, clears in 23 months (design-plan reference, also closed-form)', () => {
  const closedForm = Math.ceil(-Math.log(1 - (100000 * 0.01) / 5000) / Math.log(1.01))
  assert.strictEqual(closedForm, 23)
  const res = runPlanner({ debts: SETS.one, today })
  assert.strictEqual(res.status, 'ok')
  const base = res.scenarios[0]
  assert.strictEqual(base.months, 23)
  assert.strictEqual(base.endLabel, 'Sep 2028')
  assert.strictEqual(base.perDebt[0].payoffLabel, 'Sep 2028')
})
test('P14: with one debt, avalanche, snowball and baseline give the same result; the page says so', () => {
  const res = runPlanner({ debts: SETS.one, today })
  const [b, a, s] = res.scenarios
  assert.deepStrictEqual([a.months, a.totalInterest, a.totalPaid], [b.months, b.totalInterest, b.totalPaid])
  assert.deepStrictEqual([s.months, s.totalInterest, s.totalPaid], [b.months, b.totalInterest, b.totalPaid])
  assert.strictEqual(res.comparison.text, COPY.sameResultOneDebt)
})
test('P15: a 0% debt gives the exact instalment arithmetic: 20,000 at 2,000 a month = 10 months, no interest', () => {
  const res = runPlanner({ debts: [D('p', 'Phone', 20000, 0, 2000)], today })
  assert.strictEqual(res.scenarios[0].months, 10)
  assert.strictEqual(res.scenarios[0].totalInterest, 0)
  assert.strictEqual(res.scenarios[0].totalPaid, 20000)
})

// ---------- against the independent simulation ----------
test('P16: every scenario equals the independent simulation on the fixed sets (budget = minimums)', () => {
  for (const [name, set] of Object.entries(SETS)) compareToSim(set, sumMinimums(set), null, name)
})
test('P17: ... with extra budget', () => {
  for (const [name, set] of Object.entries(SETS)) compareToSim(set, sumMinimums(set) + 2500, null, `${name}+extra`)
})
test('P18: ... with a one-time payment (several months, including month 1 and the month a debt clears)', () => {
  for (const [name, set] of Object.entries(SETS)) {
    for (const month of [1, 2, 7, 24]) compareToSim(set, sumMinimums(set) + 1000, { amount: 40000, month }, `${name} lump@${month}`)
  }
})
test('P19: ... when the one-time payment is larger than all the debts (it cannot overpay)', () => {
  const res = compareToSim(SETS.two, sumMinimums(SETS.two), { amount: 99999999, month: 1 }, 'huge lump')
  assert.strictEqual(res.scenarios[1].months, 1)
  assert.ok(res.scenarios[1].totalPaid <= 130000 * 1.4)
})

function rng(seed) { let a = seed >>> 0; return () => { a |= 0; a = (a + 0x6D2B79F5) | 0; let t = Math.imul(a ^ (a >>> 15), 1 | a); t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t; return ((t ^ (t >>> 14)) >>> 0) / 4294967296 } }
function randomSet(r) {
  const n = 1 + Math.floor(r() * 5)
  const debts = []
  for (let i = 0; i < n; i++) {
    const balance = Math.round((500 + r() * 400000) * 100) / 100
    const rate = r() < 0.15 ? 0 : Math.round(r() * 3600) / 100
    const interest = (balance * rate) / 1200
    const min = Math.round((interest + 20 + r() * Math.max(100, balance * 0.04)) * 100) / 100
    debts.push(D(`d${i}`, `Debt ${String.fromCharCode(65 + Math.floor(r() * 6))}${i}`, balance, rate, min))
  }
  return debts
}
test('P20: 300 random debt sets: every scenario equals the independent simulation (budget, extra, lump)', () => {
  const r = rng(20261023)
  let count = 0
  for (let k = 0; k < 300; k++) {
    const set = randomSet(r)
    const mins = sumMinimums(set)
    const budget = Math.round((mins * (1 + r() * 0.4)) * 100) / 100
    const lump = r() < 0.5 ? { amount: Math.round(r() * 80000 * 100) / 100 + 1, month: 1 + Math.floor(r() * 30) } : null
    compareToSim(set, budget, lump, `random#${k}`)
    count++
  }
  assert.strictEqual(count, 300)
})

// ---------- properties ----------
test('P21: avalanche interest is never more than snowball interest (random sets; tolerance 0.05 for paisa rounding, count of paisa cases reported)', () => {
  const r = rng(77)
  let worst = 0
  for (let k = 0; k < 300; k++) {
    const set = randomSet(r)
    const budget = Math.round(sumMinimums(set) * (1 + r() * 0.5) * 100) / 100
    const res = runPlanner({ debts: set, budgetText: String(budget), today })
    assert.strictEqual(res.status, 'ok')
    const [, a, s] = res.scenarios
    if (!(a.paysOff && s.paysOff)) continue
    worst = Math.max(worst, a.totalInterest - s.totalInterest)
  }
  assert.ok(worst <= 0.05, `avalanche cost more than snowball by ${worst}`)
})
test('P22: a one-time payment never increases AVALANCHE interest, and a higher budget never increases AVALANCHE interest', () => {
  const r = rng(404)
  for (let k = 0; k < 200; k++) {
    const set = randomSet(r)
    const mins = sumMinimums(set)
    const budget = Math.round(mins * (1 + r() * 0.3) * 100) / 100
    const plain = runPlanner({ debts: set, budgetText: String(budget), today })
    const withLump = runPlanner({ debts: set, budgetText: String(budget), lumpAmount: String(1000 + Math.floor(r() * 50000)), lumpMonth: String(1 + Math.floor(r() * 20)), today })
    const higher = runPlanner({ debts: set, budgetText: String(Math.round((budget + 500 + r() * 3000) * 100) / 100), today })
    assert.ok(withLump.scenarios[1].totalInterest <= plain.scenarios[1].totalInterest + 0.001, `lump raised avalanche interest (${k})`)
    assert.ok(higher.scenarios[1].totalInterest <= plain.scenarios[1].totalInterest + 0.001, `higher budget raised avalanche interest (${k})`)
  }
})
test('P22b: KNOWN LIMIT, pinned: with SNOWBALL a one-time payment (or a higher budget) can raise total interest, because it can change which debt is targeted next. The design plan said a lump sum never could; for snowball that is not true, so the page never claims it', () => {
  const set = [D('d0', 'Debt E0', 211397.34, 0.25, 4743.96), D('d1', 'Debt A1', 383322.62, 28.57, 17906.83)]
  const plain = runPlanner({ debts: set, budgetText: '24705.47', today })
  const withLump = runPlanner({ debts: set, budgetText: '24705.47', lumpAmount: '5183', lumpMonth: '9', today })
  assert.ok(withLump.scenarios[1].totalInterest <= plain.scenarios[1].totalInterest, 'avalanche must still not rise')
  assert.ok(withLump.scenarios[2].totalInterest > plain.scenarios[2].totalInterest, 'snowball rises in this case')
  assert.strictEqual(Math.round((withLump.scenarios[2].totalInterest - plain.scenarios[2].totalInterest) * 100) / 100, 24.67)
  // and both are still exactly what the independent simulation says
  compareToSim(set, 24705.47, { amount: 5183, month: 9 }, 'pinned snowball case')
  // a higher budget can do the same (random set 131 of seed 404): found by the property run, kept as a count so the claim stays honest
  const r = rng(404)
  let snowballBudgetRises = 0
  for (let k = 0; k < 200; k++) {
    const s2 = randomSet(r)
    const b2 = Math.round(sumMinimums(s2) * (1 + r() * 0.3) * 100) / 100
    r(); r() // the two draws the lump test makes
    const p = runPlanner({ debts: s2, budgetText: String(b2), today })
    const h = runPlanner({ debts: s2, budgetText: String(Math.round((b2 + 500 + r() * 3000) * 100) / 100), today })
    if (h.scenarios[2].totalInterest > p.scenarios[2].totalInterest + 0.001) snowballBudgetRises++
  }
  assert.strictEqual(snowballBudgetRises, 2, 'the pinned count of snowball budget rises in this seeded set')
})
test('P23: baseline ignores the budget and the one-time payment; the other two scenarios never cost more than baseline', () => {
  const a = runPlanner({ debts: SETS.three, today })
  const b = runPlanner({ debts: SETS.three, budgetText: '60000', lumpAmount: '50000', lumpMonth: '2', today })
  assert.deepStrictEqual(a.scenarios[0], b.scenarios[0])
  assert.strictEqual(a.extra, 0)
  assert.strictEqual(b.extra, 43500)
  for (const i of [1, 2]) {
    assert.ok(a.scenarios[i].totalInterest <= a.scenarios[0].totalInterest, `scenario ${i} costs more than baseline`)
    assert.ok(b.scenarios[i].totalInterest <= a.scenarios[0].totalInterest)
  }
  assert.match(COPY.rollNote, /payment moves to the next debt/)
})
test('P24: results are repeatable and order of the debts does not change the result (ties by name, then id)', () => {
  const one = runPlanner({ debts: SETS.tie, budgetText: '7000', today })
  const two = runPlanner({ debts: [...SETS.tie].reverse(), budgetText: '7000', today })
  const key = (res) => res.scenarios.map((s) => [s.key, s.months, s.totalInterest, s.perDebt.map((p) => [p.id, p.payoffMonth]).sort()])
  assert.deepStrictEqual(key(one), key(two))
  assert.deepStrictEqual(key(runPlanner({ debts: SETS.tie, budgetText: '7000', today })), key(one))
})
test('P25: savings and months-sooner are against the baseline, and only when both plans pay off', () => {
  const res = runPlanner({ debts: SETS.two, budgetText: String(sumMinimums(SETS.two) + 3000), today })
  const [b, a, s] = res.scenarios
  assert.strictEqual(res.savings.avalanche, Math.round((b.totalInterest - a.totalInterest) * 100) / 100)
  assert.strictEqual(res.savings.snowball, Math.round((b.totalInterest - s.totalInterest) * 100) / 100)
  assert.strictEqual(res.monthsSooner.avalanche, b.months - a.months)
  assert.ok(res.savings.avalanche > 0 && res.monthsSooner.avalanche > 0)
})

// ---------- refusals ----------
test('P26: a budget below the required payments is refused, saying by how much it falls short', () => {
  const res = runPlanner({ debts: SETS.three, budgetText: '10000', today })
  assert.strictEqual(res.status, 'refused')
  assert.strictEqual(res.reason, 'budget-below-minimums')
  assert.strictEqual(res.message, 'Your budget is ₹6,500.00 short of the required payments.')
  assert.ok(!('scenarios' in res))
})
test('P27: a payment that does not cover one month of interest is refused, naming the debt and the interest', () => {
  const res = runPlanner({ debts: [D('x', 'Slow loan', 100000, 12, 900)], today })
  assert.strictEqual(res.status, 'refused')
  assert.strictEqual(res.reason, 'minimum-below-interest')
  assert.match(res.message, /Slow loan/)
  assert.match(res.message, /₹900\.00/)
  assert.match(res.message, /₹1,000\.00/)
  assert.match(res.message, /would never pay off/)
  assert.strictEqual(monthlyInterest(100000, 12), 1000)
  assert.strictEqual(monthlyInterest(101, 7), 0.59) // 58.92 paise rounds half-up to 59, not down to 58
})
test('P28: a payment exactly equal to the interest is refused too (it never reduces the debt)', () => {
  assert.strictEqual(runPlanner({ debts: [D('x', 'Edge', 100000, 12, 1000)], today }).status, 'refused')
  assert.strictEqual(runPlanner({ debts: [D('x', 'Edge', 100000, 12, 1000.01)], today }).status, 'ok')
})
test('P29: a plan that cannot finish within 50 years says so, and shows no date', () => {
  const res = runPlanner({ debts: [D('x', 'Very slow', 1000000, 12, 10001)], today })
  assert.strictEqual(res.status, 'ok')
  const base = res.scenarios[0]
  assert.strictEqual(base.paysOff, false)
  assert.strictEqual(base.months, null)
  assert.strictEqual(base.endLabel, null)
  assert.strictEqual(base.perDebt[0].payoffLabel, null)
  assert.ok(base.remaining > 0)
  assert.strictEqual(res.savings.avalanche, null)
  assert.ok(COPY.notWithin50.includes('50 years'))
})
test('P30: bad typed input is reported in a sentence and nothing is calculated', () => {
  for (const [b, la, lm] of [['abc', '', ''], ['0', '', ''], ['5000', '100', ''], ['5000', '', '3'], ['5000', 'x', '3'], ['5000', '100', '0'], ['5000', '100', '601']]) {
    const res = runPlanner({ debts: SETS.two, budgetText: b, lumpAmount: la, lumpMonth: lm, today })
    assert.strictEqual(res.status, 'invalid', `${b}/${la}/${lm}`)
    assert.ok(res.message && !('scenarios' in res))
  }
})
test('P31: no debts gives "empty"; an engine that throws, refuses oddly or returns bad numbers gives a safe fallback, never NaN', () => {
  assert.strictEqual(runPlanner({ debts: [], today }).status, 'empty')
  assert.strictEqual(runPlanner({ today }).status, 'empty')
  const bad = (engine) => runPlanner({ debts: SETS.two, today, engine })
  assert.strictEqual(bad(() => { throw new Error('boom') }).status, 'failed')
  assert.strictEqual(bad(() => null).status, 'failed')
  assert.strictEqual(bad(() => ({ ok: false, reason: 'invalid-input' })).status, 'failed')
  const good = comparePlans({ debts: SETS.two, monthlyBudget: sumMinimums(SETS.two) })
  const lie = (patch) => bad(() => ({ ...good, ...patch }))
  assert.strictEqual(lie({ baseline: { ...good.baseline, totalInterest: NaN } }).status, 'failed')
  assert.strictEqual(lie({ avalanche: { ...good.avalanche, months: Infinity } }).status, 'failed')
  assert.strictEqual(lie({ snowball: { ...good.snowball, perDebt: [{ id: 'a', interest: 'x', remaining: 1 }] } }).status, 'failed')
  assert.strictEqual(lie({ avalancheVsSnowballInterest: undefined }).status, 'failed')
  const res = bad(() => good)
  assert.strictEqual(res.status, 'ok')
  const text = JSON.stringify(res)
  assert.ok(!/NaN|Infinity|undefined/.test(text))
})

// ---------- estimates ----------
test('P32: any plan that includes a credit card is marked as an estimate in every scenario', () => {
  const res = runPlanner({ debts: [D('a', 'Loan', 50000, 12, 3000), D('c', 'Card', 20000, 36, 1500, { estimate: true })], today })
  assert.strictEqual(res.estimate, true)
  assert.ok(res.scenarios.every((s) => s.estimate === true))
  const none = runPlanner({ debts: SETS.two, today })
  assert.strictEqual(none.estimate, false)
  assert.ok(none.scenarios.every((s) => s.estimate === false))
})

// ---------- the comparison sentence ----------
test('P33: the interest comparison says which method costs less for this data, in numbers', () => {
  const res = runPlanner({ debts: SETS.three, budgetText: String(sumMinimums(SETS.three) + 4000), today })
  const diff = Math.round((res.scenarios[2].totalInterest - res.scenarios[1].totalInterest) * 100) / 100
  assert.ok(diff >= 0)
  if (diff > 0) assert.match(res.comparison.text, /^For these figures, avalanche costs ₹[\d,]+\.\d\d less interest than snowball\.$/)
  else assert.match(res.comparison.text, /same interest/)
  const mk = (ai, si, ap = true, sp = true) => ({ avalanche: { paysOff: ap, totalInterest: ai }, snowball: { paysOff: sp, totalInterest: si } })
  assert.strictEqual(methodComparison(mk(100, 150), 2).kind, 'avalanche')
  assert.strictEqual(methodComparison(mk(150, 100), 2).kind, 'snowball')
  assert.strictEqual(methodComparison(mk(100, 100), 2).kind, 'same')
  assert.strictEqual(methodComparison(mk(100, 150, false), 2).text, COPY.noComparison)
  assert.strictEqual(methodComparison(mk(100, 150), 1).text, COPY.sameResultOneDebt)
})

// ---------- wording (advice boundary) ----------
const BANNED = [/\bshould\b/i, /\brecommend/i, /\badvis(e|ed|es|ing)\b/i, /\bsuggest/i, /\bbest\b/i, /\bbetter\b/i, /\bideal/i, /\boptimal/i, /\bmust\b/i, /\bought\b/i, /\byou need\b/i, /\bwe (think|believe)\b/i, /\bsmart/i, /\bwise/i, /\bguarantee/i, /\bsafe\b/i, /\bbeat\b/i, /\bfastest\b/i, /\bcheapest\b/i, /\bavoid\b/i, /\bdon'?t\b/i]
test('P34: no planner sentence gives advice (fixed copy and every generated sentence)', () => {
  const sentences = Object.values(COPY).slice()
  const res = runPlanner({ debts: SETS.three, budgetText: String(sumMinimums(SETS.three) + 4000), lumpAmount: '30000', lumpMonth: '3', today })
  sentences.push(res.comparison.text)
  for (const debts of [SETS.one, SETS.two, SETS.tie]) sentences.push(runPlanner({ debts, today }).comparison.text)
  sentences.push(runPlanner({ debts: SETS.three, budgetText: '1000', today }).message)
  sentences.push(runPlanner({ debts: [D('x', 'Slow', 100000, 12, 900)], today }).message)
  sentences.push(runPlanner({ debts: SETS.two, budgetText: 'abc', today }).message)
  sentences.push(...res.scenarios.map((s) => s.label))
  for (const t of sentences) {
    assert.ok(typeof t === 'string' && t.length > 0)
    for (const re of BANNED) assert.ok(!re.test(t), `advice wording ${re} in: ${t}`)
  }
})
test('P35: the required disclosures are present: not a lender statement, not advice, principal only, estimate, month-level dates', () => {
  assert.match(COPY.basis, /Not a lender statement/)
  assert.match(COPY.basis, /Not financial advice/)
  assert.match(COPY.principalOnly, /Unpaid interest is not included/)
  assert.match(COPY.estimateNote, /Estimate/)
  assert.match(COPY.monthLabelNote, /Month 1 is the month after today/)
  assert.match(COPY.snowballNote, /not show/)
  assert.match(COPY.snowballNote, /valid way/)
})
test('P36: the wording scanner itself works (it flags advice and passes numbers)', () => {
  const flags = (t) => BANNED.some((re) => re.test(t))
  assert.ok(flags('You should pay the card first.'))
  assert.ok(flags('We recommend avalanche.'))
  assert.ok(flags('This is the best method.'))
  assert.ok(flags('You must increase your budget.'))
  assert.ok(!flags('For these figures, avalanche costs ₹1,200.00 less interest than snowball.'))
})

test('P37: sum of minimums is exact to the paisa', () => {
  assert.strictEqual(sumMinimums([D('a', 'A', 1, 1, 0.1), D('b', 'B', 1, 1, 0.2)]), 0.3)
  assert.strictEqual(sumMinimums(SETS.three), 16500)
  assert.strictEqual(MAX_PLAN_MONTHS, 600)
})

// ---------- D5 correction (Option A): the snowball order explanation and the calculated warning ----------
const BIG_LUMP = [D('d0', 'DK0', 394756.98, 29.67, 11123.41), D('d1', 'DW1', 284911.67, 1.04, 4789.97), D('d2', 'DR2', 471407.23, 0.3, 6495.15), D('d3', 'DJ3', 342916.59, 9.43, 3678.68)]
const BIG_BUDGET = [D('d0', 'DH0', 146182.35, 33.4, 7239.61), D('d1', 'DC1', 367420.2, 30.96, 11664.32), D('d2', 'DE2', 92757.11, 0, 3742.51), D('d3', 'DU3', 344884.98, 10.41, 5054.08)]
const snowSim = (debts, budget, lump) => simulate({ debts, budget, strategy: 'snowball', lump })
const cents = (x) => Math.round(x * 100)

test('W1: the pinned small case: a warning for the one-time payment, with the exact difference, equal to the independent simulation', () => {
  const set = [D('d0', 'Debt E0', 211397.34, 0.25, 4743.96), D('d1', 'Debt A1', 383322.62, 28.57, 17906.83)]
  const res = runPlanner({ debts: set, budgetText: '24705.47', lumpAmount: '5183', lumpMonth: '9', today })
  const withLump = snowSim(set, 24705.47, { amount: 5183, month: 9 }), without = snowSim(set, 24705.47, null)
  assert.strictEqual(cents(withLump.totalInterest - without.totalInterest), 2467)
  const w = res.snowballWarnings.find((x) => x.kind === 'lump')
  assert.ok(w, 'warning present')
  assert.strictEqual(w.difference, 24.67)
  assert.strictEqual(cents(w.difference), cents(withLump.totalInterest - without.totalInterest))
  assert.strictEqual(w.text, 'With the one-time payment, the snowball scenario costs ₹24.67 more interest than the same snowball plan without it (same monthly budget).')
  // the other comparison (extra monthly budget vs required payments only) holds the same one-time payment and does NOT rise here
  const b = res.snowballChecks.find((x) => x.kind === 'budget')
  assert.strictEqual(b.higher, false)
  assert.strictEqual(cents(b.difference), cents(snowSim(set, 24705.47, { amount: 5183, month: 9 }).totalInterest - snowSim(set, 22650.79, { amount: 5183, month: 9 }).totalInterest))
  assert.strictEqual(res.snowballWarnings.length, 1)
})

test('W2: the large one-time-payment case (+48,332.36): the warning shows the exact amount, matching the independent simulation', () => {
  const lump = { amount: 10589.01, month: 16 }
  const res = runPlanner({ debts: BIG_LUMP, budgetText: '32918.99', lumpAmount: '10589.01', lumpMonth: '16', today })
  const d = cents(snowSim(BIG_LUMP, 32918.99, lump).totalInterest - snowSim(BIG_LUMP, 32918.99, null).totalInterest)
  assert.strictEqual(d, 4833236)
  const w = res.snowballWarnings.find((x) => x.kind === 'lump')
  assert.ok(w); assert.strictEqual(cents(w.difference), d)
  assert.match(w.text, /₹48,332\.36 more interest/)
  // every other input is held constant: the "without" plan is exactly the same plan with only the one-time payment removed
  const chk = res.snowballChecks.find((x) => x.kind === 'lump')
  assert.strictEqual(chk.withInterest, snowSim(BIG_LUMP, 32918.99, lump).totalInterest)
  assert.strictEqual(chk.withoutInterest, snowSim(BIG_LUMP, 32918.99, null).totalInterest)
})

test('W3: the large extra-budget case (+35,373.03 over required payments only): warning with the exact amount; the one-time-payment comparison does not apply', () => {
  const mins = 27700.52
  const res = runPlanner({ debts: BIG_BUDGET, budgetText: '28401.74', today })
  assert.strictEqual(sumMinimums(BIG_BUDGET), mins)
  const d = cents(snowSim(BIG_BUDGET, 28401.74, null).totalInterest - snowSim(BIG_BUDGET, mins, null).totalInterest)
  assert.strictEqual(d, 3537303)
  assert.deepStrictEqual(res.snowballWarnings.map((w) => w.kind), ['budget'])
  assert.strictEqual(cents(res.snowballWarnings[0].difference), d)
  assert.match(res.snowballWarnings[0].text, /^With the extra monthly budget, the snowball scenario costs ₹35,373\.03 more interest than the same snowball plan at the required payments only/)
  assert.strictEqual(res.snowballChecks.length, 1)
})

test('W4: both added together: three comparisons, each holding the other input constant; each warning only when its own plan costs more', () => {
  const lump = { amount: 5183, month: 9 }
  const set = [D('d0', 'Debt E0', 211397.34, 0.25, 4743.96), D('d1', 'Debt A1', 383322.62, 28.57, 17906.83)]
  const res = runPlanner({ debts: set, budgetText: '24705.47', lumpAmount: '5183', lumpMonth: '9', today })
  assert.deepStrictEqual(res.snowballChecks.map((c) => c.kind), ['lump', 'budget', 'both'])
  const sim = (b, l) => snowSim(set, b, l).totalInterest
  const want = { lump: sim(24705.47, lump) - sim(24705.47, null), budget: sim(24705.47, lump) - sim(22650.79, lump), both: sim(24705.47, lump) - sim(22650.79, null) }
  for (const c of res.snowballChecks) { assert.strictEqual(cents(c.difference), cents(want[c.kind]), c.kind); assert.strictEqual(c.higher, cents(want[c.kind]) > 0, c.kind) }
  assert.deepStrictEqual(res.snowballWarnings.map((w) => w.kind), ['lump'])
})

test('W5: no warning when interest does not increase (and none when nothing was added)', () => {
  // nothing added: no comparisons at all
  for (const k of Object.keys(SETS)) {
    const res = runPlanner({ debts: SETS[k], budgetText: '', today })
    assert.deepStrictEqual(res.snowballChecks, [], k); assert.deepStrictEqual(res.snowballWarnings, [], k)
  }
  // added money that lowers snowball interest: difference is negative and no warning
  const res = runPlanner({ debts: SETS.two, budgetText: '9000', lumpAmount: '10000', lumpMonth: '3', today })
  assert.ok(res.snowballChecks.length === 3)
  for (const c of res.snowballChecks) { assert.ok(c.difference < 0 && c.higher === false, c.kind) }
  assert.deepStrictEqual(res.snowballWarnings, [])
})

test('W6: the warning exists exactly when the independent simulation says snowball interest went up (random sets, one-time payment, extra budget, both)', () => {
  const r = rng(909)
  let warned = 0, quiet = 0
  for (let k = 0; k < 250; k++) {
    const s2 = randomSet(r)
    const mins = sumMinimums(s2)
    const b2 = Math.round((mins + 300 + r() * 4000) * 100) / 100
    const lump = { amount: Math.round((500 + r() * 15000) * 100) / 100, month: 1 + Math.floor(r() * 24) }
    const res = runPlanner({ debts: s2, budgetText: String(b2), lumpAmount: String(lump.amount), lumpMonth: String(lump.month), today })
    if (res.status !== 'ok') continue
    const want = { lump: [b2, lump, b2, null], budget: [b2, lump, mins, lump], both: [b2, lump, mins, null] }
    for (const c of res.snowballChecks) {
      const [wb, wl, ob, ol] = want[c.kind]
      const a = snowSim(s2, wb, wl), o = snowSim(s2, ob, ol)
      if (!(a.paysOff && o.paysOff)) { assert.strictEqual(c.higher, false); continue }
      const d = cents(a.totalInterest) - cents(o.totalInterest)
      assert.strictEqual(cents(c.difference), d, `${k} ${c.kind}`)
      assert.strictEqual(res.snowballWarnings.some((w) => w.kind === c.kind), d > 0, `${k} ${c.kind}`)
      d > 0 ? warned++ : quiet++
    }
  }
  assert.ok(quiet > 400, `only ${quiet} non-warning comparisons`)
  assert.ok(warned >= 1, 'the random run should include at least one warning')
})

test('W7: when one of the two plans does not pay off within 50 years there is no rupee difference and no warning (no comparison on partial figures)', () => {
  const set = [D('a', 'Slow', 10000000, 12, 100001)] // without extra money this never finishes within 600 months
  for (const lump of ['5000000', '100']) {
    const res = runPlanner({ debts: set, budgetText: '100001', lumpAmount: lump, lumpMonth: '2', today })
    assert.strictEqual(res.status, 'ok')
    const c = res.snowballChecks[0]
    assert.strictEqual(c.comparable, false, lump); assert.strictEqual(c.difference, null, lump); assert.strictEqual(c.higher, false, lump)
    assert.deepStrictEqual(res.snowballWarnings, [], lump)
  }
})

test('W8: a lying or failing engine on the extra comparisons gives the generic failure, never a made-up warning', () => {
  const set = [D('d0', 'Debt E0', 211397.34, 0.25, 4743.96), D('d1', 'Debt A1', 383322.62, 28.57, 17906.83)]
  let calls = 0
  const flaky = (a) => { calls++; if (calls > 1) throw new Error('boom'); return comparePlans(a) }
  const res = runPlanner({ debts: set, budgetText: '24705.47', lumpAmount: '5183', lumpMonth: '9', today, engine: flaky })
  assert.strictEqual(res.status, 'failed'); assert.strictEqual(res.message, COPY.engineFailed)
  calls = 0
  const bad = (a) => { calls++; const c = comparePlans(a); return calls > 1 ? { ...c, snowball: { ...c.snowball, totalInterest: NaN } } : c }
  assert.strictEqual(runPlanner({ debts: set, budgetText: '24705.47', lumpAmount: '5183', lumpMonth: '9', today, engine: bad }).status, 'failed')
})

test('W9: the explanation is fixed text: smallest remaining balance, whatever the rate; interest can go up as well as down; no advice words', () => {
  assert.match(COPY.snowballOrderNote, /smallest remaining balance, whatever its interest rate/)
  assert.match(COPY.snowballOrderNote, /can go up as well as down/)
  assert.match(COPY.snowballNote, /valid way to order payments/) // the earlier sentence stays
  for (const text of [COPY.snowballOrderNote, warningText('lump', 24.67), warningText('budget', 1), warningText('both', 1)]) for (const re of BANNED) assert.ok(!re.test(text), `${re} in ${text}`)
  assert.ok(warningText('lump', 24.67).includes('₹24.67'))
})

console.log(`\n${passed} passed, ${failed} failed`)
if (failed > 0) process.exit(1)
