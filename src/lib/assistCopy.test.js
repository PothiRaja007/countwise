import assert from 'node:assert'
import { describeObservation } from './assistCopy.js'
import { computeObservations } from './assistEngine.js'

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

// Deterministic stand-in for formatCurrency, so figures are easy to find.
const fmt = (n) => `Rs${n}`

const FORBIDDEN = [
  'should', 'must', 'overspend', 'overspent', 'waste', 'wasted', 'careless',
  'bad', 'guilty', 'try to', 'need to', 'you could save', 'warning', 'danger',
  'irresponsible', 'reckless', 'fail',
]

const textOf = (obs) => {
  const d = describeObservation(obs, fmt)
  return `${d.headline} ${d.detail}`
}

// Hand-built edge observations, covering every branch of the copy.
const EDGE = [
  { type: 'spend-vs-last-month', figures: { current: 3000, previous: 2000, change: 1000, percentChange: 50 } },
  { type: 'spend-vs-last-month', figures: { current: 1500, previous: 3000, change: -1500, percentChange: -50 } },
  { type: 'spend-vs-last-month', figures: { current: 2000, previous: 2000, change: 0, percentChange: 0 } },
  { type: 'category-change', figures: { categoryName: 'Food', current: 3000, previous: 2000, change: 1000, percentChange: 50, isNew: false } },
  { type: 'category-change', figures: { categoryName: 'Food', current: 0, previous: 1200, change: -1200, percentChange: -100, isNew: false } },
  { type: 'category-change', figures: { categoryName: 'Fun', current: 800, previous: 0, change: 800, percentChange: null, isNew: true } },
  { type: 'budget-status', figures: { categoryName: 'Food', budgetAmount: 10000, spent: 8000, remaining: 2000, percentUsed: 80, over: false } },
  { type: 'budget-status', figures: { categoryName: 'Food', budgetAmount: 10000, spent: 9960, remaining: 40, percentUsed: 99.6, over: false } },
  { type: 'budget-status', figures: { categoryName: 'Food', budgetAmount: 10000, spent: 10000, remaining: 0, percentUsed: 100, over: false } },
  { type: 'budget-status', figures: { categoryName: 'Food', budgetAmount: 10000, spent: 10500, remaining: -500, percentUsed: 105, over: true } },
]

// Observations produced by the real engine from a realistic dataset.
function realObservations() {
  const cats = [
    { id: 'food', name: 'Food', kind: 'expense' },
    { id: 'transport', name: 'Transport', kind: 'expense' },
    { id: 'fun', name: 'Fun', kind: 'expense' },
  ]
  const t = (date, amount, category_id) => ({ transaction_date: date, amount, category_id, type: 'expense' })
  return computeObservations({
    today: new Date(2026, 8, 15),
    categories: cats,
    transactions: [
      t('2026-08-05', 2000, 'food'), t('2026-09-05', 4200, 'food'),
      t('2026-08-06', 1800, 'transport'), t('2026-09-06', 900, 'transport'),
      t('2026-09-07', 800, 'fun'),
    ],
    budgets: [{ id: 'b1', category_id: 'food', amount: 5000, period_start: '2026-09-01', period_end: '2026-09-30' }],
  }).observations
}

console.log('assistCopy tests\n')

test('every branch produces a non-empty headline and detail', () => {
  for (const obs of EDGE) {
    const d = describeObservation(obs, fmt)
    assert.ok(d.headline.length > 0, `empty headline for ${JSON.stringify(obs)}`)
    assert.ok(d.detail.length > 0, `empty detail for ${JSON.stringify(obs)}`)
  }
})

test('figures appear verbatim in the text', () => {
  const t = textOf(EDGE[0])
  assert.ok(t.includes('Rs3000'))
  assert.ok(t.includes('Rs2000'))
  assert.ok(t.includes('Rs1000'))
  assert.ok(t.includes('50%'))
})

test('direction words follow the sign of the change', () => {
  assert.ok(textOf(EDGE[0]).includes('higher than'))
  assert.ok(textOf(EDGE[0]).includes('more'))
  assert.ok(textOf(EDGE[1]).includes('lower than'))
  assert.ok(textOf(EDGE[1]).includes('less'))
  assert.ok(textOf(EDGE[2]).includes('about the same as'))
})

test('a decrease shows the size of the drop as a positive number', () => {
  assert.ok(textOf(EDGE[1]).includes('Rs1500 less'))
  assert.ok(!textOf(EDGE[1]).includes('-'.concat('1500')))
})

test('a new category says "nothing recorded", never "you spent nothing"', () => {
  const t = textOf(EDGE[5])
  assert.ok(t.includes('nothing recorded'))
  assert.ok(!/you spent nothing/i.test(t))
})

test('a near-limit budget floors the percentage: 99.6% never reads as 100%', () => {
  const t = textOf(EDGE[7])
  assert.ok(t.includes('99%'))
  assert.ok(!t.includes('100%'))
})

test('reaching a budget exactly is worded as reached, not over', () => {
  const t = textOf(EDGE[8])
  assert.ok(t.includes('reached'))
  assert.ok(!t.includes('over its budget'))
})

test('over a budget reports the overage as a positive number', () => {
  const t = textOf(EDGE[9])
  assert.ok(t.includes('over its budget'))
  assert.ok(t.includes('Rs500 over'))
})

test('tone guard: no advice, judgment, prediction or alarm words in any branch', () => {
  const all = [...EDGE, ...realObservations()]
  for (const obs of all) {
    const t = textOf(obs).toLowerCase()
    for (const word of FORBIDDEN) {
      const re = new RegExp(`\\b${word}\\b`, 'i')
      assert.ok(!re.test(t), `"${word}" found in: ${t}`)
    }
  }
})

test('no NaN, undefined or Infinity ever reaches the text', () => {
  const all = [...EDGE, ...realObservations()]
  for (const obs of all) {
    const t = textOf(obs)
    assert.ok(!/NaN|undefined|Infinity|null/.test(t), `bad token in: ${t}`)
  }
})

test('real engine output round-trips into readable text', () => {
  const obs = realObservations()
  assert.ok(obs.length > 0)
  for (const o of obs) {
    const d = describeObservation(o, fmt)
    assert.ok(d.headline && d.detail)
  }
})

test('an unknown observation type yields empty strings rather than throwing', () => {
  assert.deepStrictEqual(describeObservation({ type: 'mystery', figures: {} }, fmt), { headline: '', detail: '' })
})

console.log(`\n${passed} passed, ${failed} failed`)
if (failed > 0) process.exit(1)
