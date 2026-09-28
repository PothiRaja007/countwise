import assert from 'node:assert'
import {
  computeObservations,
  monthToDateWindows,
  toISODateLocal,
  MIN_ABSOLUTE_CHANGE,
  MIN_PERCENT_CHANGE,
  MAX_OBSERVATIONS,
  MAX_CATEGORY_CHANGES,
} from './assistEngine.js'
import { budgetSpent } from './budgetEngine.js'

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

// today = 15 Sep 2026 (local). Current window: Sep 1-15. Previous: Aug 1-15.
const TODAY = new Date(2026, 8, 15)

const CATS = [
  { id: 'food', name: 'Food', kind: 'expense' },
  { id: 'transport', name: 'Transport', kind: 'expense' },
  { id: 'rent', name: 'Rent', kind: 'expense' },
  { id: 'fun', name: 'Fun', kind: 'expense' },
  { id: 'bills', name: 'Bills', kind: 'expense' },
  { id: 'salary', name: 'Salary', kind: 'income' },
]

const tx = (date, amount, category_id = 'food', type = 'expense') => ({
  transaction_date: date,
  amount,
  category_id,
  type,
})

const run = (transactions, budgets = []) =>
  computeObservations({ transactions, budgets, categories: CATS, today: TODAY })

const budget = (id, category_id, amount) => ({
  id,
  category_id,
  amount,
  period_start: '2026-09-01',
  period_end: '2026-09-30',
})

const ids = (result) => result.observations.map((o) => o.id)

console.log('assistEngine tests\n')

// ---- Windows -------------------------------------------------------------

test('mid-month windows: Sep 1-15 vs Aug 1-15', () => {
  const w = monthToDateWindows(new Date(2026, 8, 15))
  assert.deepStrictEqual(w.current, { start: '2026-09-01', end: '2026-09-15' })
  assert.deepStrictEqual(w.previous, { start: '2026-08-01', end: '2026-08-15' })
})

test('Mar 31 clamps the previous window to Feb 28 (non-leap year)', () => {
  const w = monthToDateWindows(new Date(2026, 2, 31))
  assert.deepStrictEqual(w.previous, { start: '2026-02-01', end: '2026-02-28' })
})

test('Mar 31 in a leap year clamps to Feb 29', () => {
  const w = monthToDateWindows(new Date(2028, 2, 31))
  assert.deepStrictEqual(w.previous, { start: '2028-02-01', end: '2028-02-29' })
})

test('January rolls the previous window back into December of the prior year', () => {
  const w = monthToDateWindows(new Date(2026, 0, 15))
  assert.deepStrictEqual(w.previous, { start: '2025-12-01', end: '2025-12-15' })
})

test('the 1st of a month compares day 1 with day 1', () => {
  const w = monthToDateWindows(new Date(2026, 8, 1))
  assert.deepStrictEqual(w.current, { start: '2026-09-01', end: '2026-09-01' })
  assert.deepStrictEqual(w.previous, { start: '2026-08-01', end: '2026-08-01' })
})

test('dates come from LOCAL parts: 00:30 local on the 15th is still the 15th', () => {
  assert.strictEqual(toISODateLocal(new Date(2026, 8, 15, 0, 30)), '2026-09-15')
})

// ---- Comparability -------------------------------------------------------

test('no previous-month spending: not comparable, no comparison observations, nothing infinite', () => {
  const r = run([tx('2026-09-10', 5000, 'food')])
  assert.strictEqual(r.comparable, false)
  assert.deepStrictEqual(r.observations, [])
})

test('empty inputs and omitted arguments are safe', () => {
  assert.deepStrictEqual(computeObservations({ today: TODAY }), { observations: [], comparable: false })
  assert.deepStrictEqual(computeObservations(), computeObservations({}))
})

// ---- Exclusions ----------------------------------------------------------

test('income and transfers never affect any figure', () => {
  const r = run([
    tx('2026-08-10', 2000, 'food'),
    tx('2026-09-10', 3000, 'food'),
    tx('2026-09-10', 9999, 'salary', 'income'),
    tx('2026-09-11', 7777, null, 'transfer'),
  ])
  const overall = r.observations.find((o) => o.type === 'spend-vs-last-month')
  assert.strictEqual(overall.figures.current, 3000)
  assert.strictEqual(overall.figures.previous, 2000)
})

test('uncategorized expenses count toward the overall total but never appear as a category', () => {
  const r = run([tx('2026-08-10', 1000, null), tx('2026-09-10', 2000, null)])
  const overall = r.observations.find((o) => o.type === 'spend-vs-last-month')
  assert.strictEqual(overall.figures.change, 1000)
  assert.strictEqual(r.observations.filter((o) => o.type === 'category-change').length, 0)
})

test('income categories are never treated as spending categories', () => {
  const r = run([tx('2026-08-10', 2000, 'food'), tx('2026-09-10', 9000, 'salary', 'income')])
  assert.strictEqual(r.observations.filter((o) => o.id === 'category-change:salary').length, 0)
})

// ---- Materiality ---------------------------------------------------------

test('a change below the absolute floor is not mentioned', () => {
  const r = run([tx('2026-08-10', 1000, 'food'), tx('2026-09-10', 1400, 'food')]) // +400
  assert.deepStrictEqual(ids(r), [])
})

test('a change below the percent floor is not mentioned, even if large in rupees', () => {
  const r = run([tx('2026-08-10', 10000, 'food'), tx('2026-09-10', 10600, 'food')]) // +600, 6%
  assert.deepStrictEqual(ids(r), [])
})

test('the boundary is inclusive: exactly Rs 500 and exactly 20% is mentioned', () => {
  assert.strictEqual(MIN_ABSOLUTE_CHANGE, 500)
  assert.strictEqual(MIN_PERCENT_CHANGE, 20)
  const r = run([tx('2026-08-10', 2500, 'food'), tx('2026-09-10', 3000, 'food')])
  assert.ok(ids(r).includes('spend-vs-last-month'))
  assert.ok(ids(r).includes('category-change:food'))
})

test('one rupee under the boundary is not mentioned', () => {
  const r = run([tx('2026-08-10', 2500, 'food'), tx('2026-09-10', 2999, 'food')])
  assert.deepStrictEqual(ids(r), [])
})

test('a decrease is surfaced with a negative change', () => {
  const r = run([tx('2026-08-10', 3000, 'food'), tx('2026-09-10', 1500, 'food')])
  const food = r.observations.find((o) => o.id === 'category-change:food')
  assert.strictEqual(food.figures.change, -1500)
  assert.strictEqual(food.figures.percentChange, -50)
})

test('a category with spending now and none before is "new", but only above the floor', () => {
  const base = [tx('2026-08-10', 2000, 'food')]
  const above = run([...base, tx('2026-09-10', 800, 'fun')])
  const fun = above.observations.find((o) => o.id === 'category-change:fun')
  assert.strictEqual(fun.figures.isNew, true)
  assert.strictEqual(fun.figures.percentChange, null)
  const below = run([...base, tx('2026-09-10', 400, 'fun')])
  assert.strictEqual(below.observations.filter((o) => o.id === 'category-change:fun').length, 0)
})

test('only the top categories by absolute change are kept', () => {
  assert.strictEqual(MAX_CATEGORY_CHANGES, 3)
  const r = run([
    tx('2026-08-10', 1000, 'food'), tx('2026-09-10', 2000, 'food'), // +1000
    tx('2026-08-10', 1000, 'transport'), tx('2026-09-10', 3000, 'transport'), // +2000
    tx('2026-08-10', 1000, 'rent'), tx('2026-09-10', 2500, 'rent'), // +1500
    tx('2026-08-10', 1000, 'fun'), tx('2026-09-10', 1800, 'fun'), // +800
  ])
  const cats = r.observations.filter((o) => o.type === 'category-change').map((o) => o.figures.categoryId)
  assert.deepStrictEqual(cats, ['transport', 'rent', 'food'])
})

// ---- Budgets -------------------------------------------------------------

test('a budget under 80% used produces no observation', () => {
  const r = run([tx('2026-09-05', 7999, 'food')], [budget('b1', 'food', 10000)]) // 79.99%
  assert.strictEqual(r.observations.filter((o) => o.type === 'budget-status').length, 0)
})

test('a budget at exactly 80% is mentioned', () => {
  const r = run([tx('2026-09-05', 8000, 'food')], [budget('b1', 'food', 10000)])
  const b = r.observations.find((o) => o.type === 'budget-status')
  assert.strictEqual(b.figures.percentUsed, 80)
  assert.strictEqual(b.figures.over, false)
  assert.strictEqual(b.severity, 'notice')
})

test('exactly 100% is "reached", not "over"', () => {
  const r = run([tx('2026-09-05', 10000, 'food')], [budget('b1', 'food', 10000)])
  const b = r.observations.find((o) => o.type === 'budget-status')
  assert.strictEqual(b.figures.over, false)
  assert.strictEqual(b.figures.remaining, 0)
})

test('spending past the amount is "over", with a negative remaining', () => {
  const r = run([tx('2026-09-05', 10500, 'food')], [budget('b1', 'food', 10000)])
  const b = r.observations.find((o) => o.type === 'budget-status')
  assert.strictEqual(b.figures.over, true)
  assert.strictEqual(b.figures.remaining, -500)
})

test('budget figures come straight from budgetEngine, not re-derived', () => {
  const txs = [tx('2026-09-05', 9000, 'food'), tx('2026-08-20', 4000, 'food')]
  const b = budget('b1', 'food', 10000)
  const r = run(txs, [b])
  const obs = r.observations.find((o) => o.type === 'budget-status')
  assert.strictEqual(obs.figures.spent, budgetSpent(txs, b))
  assert.strictEqual(obs.figures.spent, 9000) // the August spend is outside the budget's own period
})

test('a budget whose period does not include today is ignored', () => {
  const ended = { ...budget('b1', 'food', 1000), period_start: '2026-08-01', period_end: '2026-08-31' }
  const r = run([tx('2026-08-10', 5000, 'food')], [ended])
  assert.strictEqual(r.observations.filter((o) => o.type === 'budget-status').length, 0)
})

// ---- Ordering and cap ----------------------------------------------------

test('order is: budget notices, then overall spending, then categories', () => {
  const rank = { 'budget-status': 0, 'spend-vs-last-month': 1, 'category-change': 2 }
  const r = run(
    [
      tx('2026-08-10', 2000, 'food'), tx('2026-09-10', 9000, 'food'),
      tx('2026-08-10', 1000, 'transport'), tx('2026-09-10', 2500, 'transport'),
    ],
    [budget('b1', 'food', 10000)]
  )
  const ranks = r.observations.map((o) => rank[o.type])
  assert.deepStrictEqual(ranks, [...ranks].sort((a, b) => a - b))
  assert.strictEqual(r.observations[0].type, 'budget-status')
})

test('over-budget notices come before merely-near ones', () => {
  const txs = [tx('2026-09-05', 10500, 'food'), tx('2026-09-05', 9000, 'rent')]
  const r = run(txs, [budget('near', 'rent', 10000), budget('over', 'food', 10000)])
  assert.deepStrictEqual(ids(r).slice(0, 2), ['budget-status:over', 'budget-status:near'])
})

test('output is capped', () => {
  assert.strictEqual(MAX_OBSERVATIONS, 6)
  const budgets = Array.from({ length: 8 }, (_, i) => budget(`b${i}`, 'food', 10000))
  const r = run([tx('2026-09-05', 9000, 'food')], budgets)
  assert.strictEqual(r.observations.length, 6)
})

console.log(`\n${passed} passed, ${failed} failed`)
if (failed > 0) process.exit(1)
