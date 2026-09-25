// Plain Node test runner — no framework, no new dependency.
// Run with: node src/lib/budgetEngine.test.js
import assert from 'node:assert'
import { budgetSpent, budgetRemaining, budgetPercentUsed, isBudgetOverAmount } from './budgetEngine.js'

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

console.log('budgetEngine tests\n')

const FOOD = 'cat-food'
const TRANSPORT = 'cat-transport'
const WALLET = 'acc-wallet'
const BANK = 'acc-bank'

const budget = { category_id: FOOD, amount: 5000, period_start: '2026-08-01', period_end: '2026-08-31' }

// ---- normal under-budget case ----
test('budgetSpent/Remaining/PercentUsed: normal under-budget case', () => {
  const transactions = [
    { category_id: FOOD, type: 'expense', amount: 1200, transaction_date: '2026-08-05' },
    { category_id: FOOD, type: 'expense', amount: 800, transaction_date: '2026-08-12' },
  ]
  assert.strictEqual(budgetSpent(transactions, budget), 2000)
  assert.strictEqual(budgetRemaining(transactions, budget), 3000)
  assert.strictEqual(budgetPercentUsed(transactions, budget), 40)
  assert.strictEqual(isBudgetOverAmount(transactions, budget), false)
})

// ---- exactly-at-100% case ----
test('exactly-at-100%: remaining is 0, not over, percent is exactly 100', () => {
  const transactions = [{ category_id: FOOD, type: 'expense', amount: 5000, transaction_date: '2026-08-10' }]
  assert.strictEqual(budgetSpent(transactions, budget), 5000)
  assert.strictEqual(budgetRemaining(transactions, budget), 0)
  assert.strictEqual(budgetPercentUsed(transactions, budget), 100)
  assert.strictEqual(isBudgetOverAmount(transactions, budget), false, 'exactly spending the budget is not "over" it')
})

// ---- over-budget case ----
test('over-budget: remaining goes negative, percent exceeds 100, isBudgetOverAmount is true', () => {
  const transactions = [
    { category_id: FOOD, type: 'expense', amount: 4000, transaction_date: '2026-08-03' },
    { category_id: FOOD, type: 'expense', amount: 2000, transaction_date: '2026-08-20' },
  ]
  assert.strictEqual(budgetSpent(transactions, budget), 6000)
  assert.strictEqual(budgetRemaining(transactions, budget), -1000)
  assert.strictEqual(budgetPercentUsed(transactions, budget), 120)
  assert.strictEqual(isBudgetOverAmount(transactions, budget), true)
})

// ---- income/transfer/goal-contribution-shaped rows never affect the result ----
test('income and transfer transactions in the same category never count toward spend', () => {
  const transactions = [
    { category_id: FOOD, type: 'expense', amount: 1000, transaction_date: '2026-08-05' },
    { category_id: FOOD, type: 'income', amount: 900, transaction_date: '2026-08-06' },
    { category_id: FOOD, type: 'transfer', amount: 5000, transaction_date: '2026-08-07' },
  ]
  assert.strictEqual(budgetSpent(transactions, budget), 1000, 'only the expense row should count')
})

test('transactions outside the category, or outside the period, never count toward spend', () => {
  const transactions = [
    { category_id: FOOD, type: 'expense', amount: 1000, transaction_date: '2026-08-05' },
    { category_id: TRANSPORT, type: 'expense', amount: 2000, transaction_date: '2026-08-05' }, // wrong category
    { category_id: FOOD, type: 'expense', amount: 3000, transaction_date: '2026-07-15' }, // wrong period
  ]
  assert.strictEqual(budgetSpent(transactions, budget), 1000)
})

test('budgetPercentUsed guards against a zero amount instead of dividing by zero', () => {
  const zeroBudget = { category_id: FOOD, amount: 0, period_start: '2026-08-01', period_end: '2026-08-31' }
  const transactions = [{ category_id: FOOD, type: 'expense', amount: 500, transaction_date: '2026-08-05' }]
  assert.strictEqual(budgetPercentUsed(transactions, zeroBudget), 0)
})

console.log(`\n${passed} passed, ${failed} failed`)
if (failed > 0) process.exit(1)
