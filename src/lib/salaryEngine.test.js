// Plain Node test runner — no framework, no new dependency.
// Run with: node src/lib/salaryEngine.test.js
import assert from 'node:assert'
import { sumByCategory, estimatedGrossMonthly, estimatedTakeHomeMonthly, hasIncompleteComponents } from './salaryEngine.js'

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

console.log('salaryEngine tests\n')

const complete = [
  { name: 'Basic', category: 'basic', monthly_amount: 40000 },
  { name: 'HRA/Allowances', category: 'allowance', monthly_amount: 15000 },
  { name: 'Employee PF', category: 'employee_deduction', monthly_amount: 4800 },
  { name: 'Professional Tax', category: 'employee_deduction', monthly_amount: 200 },
  { name: 'Employer PF', category: 'employer_contribution', monthly_amount: 4800 },
  { name: 'Meal Card', category: 'other', monthly_amount: 2000 },
]

// ---- sumByCategory: complete component set ----
test('sumByCategory: correct per-category sums for a complete set', () => {
  const { totals, incomplete } = sumByCategory(complete)
  assert.strictEqual(totals.basic, 40000)
  assert.strictEqual(totals.allowance, 15000)
  assert.strictEqual(totals.employee_deduction, 5000) // 4800 + 200, two rows same category
  assert.strictEqual(totals.employer_contribution, 4800)
  assert.strictEqual(totals.other, 2000)
  assert.strictEqual(incomplete.length, 0)
})

// ---- sumByCategory: a null amount is excluded from totals and flagged ----
test('sumByCategory: null monthly_amount excluded from totals, surfaced as incomplete', () => {
  const components = [
    { name: 'Basic', category: 'basic', monthly_amount: 40000 },
    { name: 'Unclear component', category: 'other', monthly_amount: null },
  ]
  const { totals, incomplete } = sumByCategory(components)
  assert.strictEqual(totals.basic, 40000)
  assert.strictEqual(totals.other, undefined, 'a null-amount component must never contribute a guessed value')
  assert.strictEqual(incomplete.length, 1)
  assert.strictEqual(incomplete[0].name, 'Unclear component')
})

// ---- sumByCategory: a needs_clarification category is also treated as incomplete ----
test('sumByCategory: needs_clarification category is excluded from totals even with an amount', () => {
  const components = [
    { name: 'Basic', category: 'basic', monthly_amount: 40000 },
    { name: 'Mystery line item', category: 'needs_clarification', monthly_amount: 1500 },
  ]
  const { totals, incomplete } = sumByCategory(components)
  assert.strictEqual(totals.needs_clarification, undefined)
  assert.strictEqual(incomplete.length, 1)
  assert.strictEqual(incomplete[0].name, 'Mystery line item')
})

// ---- sumByCategory: empty list doesn't crash ----
test('sumByCategory: empty component list returns zeroed/empty state without crashing', () => {
  const { totals, incomplete } = sumByCategory([])
  assert.deepStrictEqual(totals, {})
  assert.deepStrictEqual(incomplete, [])
})

// ---- estimatedGrossMonthly: only basic + allowance count ----
test('estimatedGrossMonthly: sums only basic + allowance, excludes deductions/contributions/other', () => {
  const gross = estimatedGrossMonthly(complete)
  // 40000 + 15000 = 55000 — employee_deduction, employer_contribution,
  // and other must all be left out
  assert.strictEqual(gross, 55000)
})

test('estimatedGrossMonthly: a null-amount basic/allowance component contributes nothing, does not crash', () => {
  const components = [
    { name: 'Basic', category: 'basic', monthly_amount: 40000 },
    { name: 'Unconfirmed allowance', category: 'allowance', monthly_amount: null },
  ]
  assert.strictEqual(estimatedGrossMonthly(components), 40000)
})

test('estimatedGrossMonthly: empty component list returns 0, not a crash', () => {
  assert.strictEqual(estimatedGrossMonthly([]), 0)
})

// ---- estimatedTakeHomeMonthly: gross minus employee_deduction only ----
test('estimatedTakeHomeMonthly: subtracts only employee_deduction from gross', () => {
  const takeHome = estimatedTakeHomeMonthly(complete)
  // gross 55000 - employee_deduction 5000 (4800 + 200) = 50000
  // employer_contribution and other must not affect this at all
  assert.strictEqual(takeHome, 50000)
})

test('estimatedTakeHomeMonthly: no employee_deduction components means take-home equals gross', () => {
  const components = [
    { name: 'Basic', category: 'basic', monthly_amount: 30000 },
    { name: 'Allowance', category: 'allowance', monthly_amount: 5000 },
  ]
  assert.strictEqual(estimatedTakeHomeMonthly(components), estimatedGrossMonthly(components))
  assert.strictEqual(estimatedTakeHomeMonthly(components), 35000)
})

test('estimatedTakeHomeMonthly: empty component list returns 0, not a crash', () => {
  assert.strictEqual(estimatedTakeHomeMonthly([]), 0)
})

// ---- hasIncompleteComponents ----
test('hasIncompleteComponents: false for a fully complete set', () => {
  assert.strictEqual(hasIncompleteComponents(complete), false)
})

test('hasIncompleteComponents: true when any component has a null amount', () => {
  const components = [...complete, { name: 'Bonus', category: 'other', monthly_amount: null }]
  assert.strictEqual(hasIncompleteComponents(components), true)
})

test('hasIncompleteComponents: true when any component is needs_clarification, even with an amount', () => {
  const components = [...complete, { name: 'Mystery line item', category: 'needs_clarification', monthly_amount: 1500 }]
  assert.strictEqual(hasIncompleteComponents(components), true)
})

test('hasIncompleteComponents: false for an empty list', () => {
  assert.strictEqual(hasIncompleteComponents([]), false)
})

console.log(`\n${passed} passed, ${failed} failed`)
if (failed > 0) process.exit(1)
