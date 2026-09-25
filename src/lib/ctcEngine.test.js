// Plain Node test runner — no framework, no new dependency.
// Run with: node src/lib/ctcEngine.test.js
import assert from 'node:assert'
import {
  sumByCategory,
  estimatedGrossAnnual,
  estimatedMonthlyTakeHome,
  hasIncompleteComponents,
} from './ctcEngine.js'

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

console.log('ctcEngine tests\n')

const complete = [
  { name: 'Basic Salary', category: 'basic', annual_amount: 600000, is_recurring_monthly: true },
  { name: 'HRA', category: 'hra', annual_amount: 240000, is_recurring_monthly: true },
  { name: 'Special Allowance', category: 'special_allowance', annual_amount: 120000, is_recurring_monthly: true },
  { name: 'Employer PF', category: 'employer_pf', annual_amount: 72000, is_recurring_monthly: true },
  { name: 'Gratuity', category: 'gratuity', annual_amount: 28846, is_recurring_monthly: false },
  { name: 'Variable Pay', category: 'variable_pay', annual_amount: 100000, is_recurring_monthly: false },
]

// ---- sumByCategory: complete component set ----
test('sumByCategory: correct per-category sums for a complete set', () => {
  const { totals, incomplete } = sumByCategory(complete)
  assert.strictEqual(totals.basic, 600000)
  assert.strictEqual(totals.hra, 240000)
  assert.strictEqual(totals.special_allowance, 120000)
  assert.strictEqual(totals.employer_pf, 72000)
  assert.strictEqual(totals.gratuity, 28846)
  assert.strictEqual(totals.variable_pay, 100000)
  assert.strictEqual(incomplete.length, 0)
})

// ---- sumByCategory: a null amount is excluded from totals and flagged ----
test('sumByCategory: null annual_amount excluded from totals, surfaced as incomplete', () => {
  const components = [
    { name: 'Basic Salary', category: 'basic', annual_amount: 500000 },
    { name: 'Unclear allowance', category: 'other', annual_amount: null },
  ]
  const { totals, incomplete } = sumByCategory(components)
  assert.strictEqual(totals.basic, 500000)
  assert.strictEqual(totals.other, undefined, 'a null-amount component must never contribute a guessed value')
  assert.strictEqual(incomplete.length, 1)
  assert.strictEqual(incomplete[0].name, 'Unclear allowance')
})

// ---- sumByCategory: a needs_clarification category is also treated as incomplete ----
test('sumByCategory: needs_clarification category is excluded from totals even with an amount', () => {
  const components = [
    { name: 'Basic Salary', category: 'basic', annual_amount: 500000 },
    { name: 'Mystery line item', category: 'needs_clarification', annual_amount: 15000 },
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

// ---- estimatedGrossAnnual: employer_pf and gratuity excluded ----
test('estimatedGrossAnnual: excludes employer_pf and gratuity, includes everything else', () => {
  const result = estimatedGrossAnnual(complete)
  // 600000 + 240000 + 120000 + 100000 = 1060000 (employer_pf and gratuity left out)
  assert.strictEqual(result.annualGross, 1060000)
  assert.deepStrictEqual(result.excludedCategories.sort(), ['employer_pf', 'gratuity'])
  assert.strictEqual(typeof result.assumption, 'string')
  assert.ok(result.assumption.length > 0, 'the exclusion assumption must be stated, not silent')
  assert.strictEqual(result.hasIncompleteAmounts, false)
})

test('estimatedGrossAnnual: a component with a null amount does not inflate or break the total', () => {
  const components = [
    { name: 'Basic Salary', category: 'basic', annual_amount: 500000 },
    { name: 'Employer PF', category: 'employer_pf', annual_amount: 60000 },
    { name: 'Unconfirmed bonus', category: 'variable_pay', annual_amount: null },
  ]
  const result = estimatedGrossAnnual(components)
  assert.strictEqual(result.annualGross, 500000)
  assert.strictEqual(result.hasIncompleteAmounts, true)
})

test('estimatedGrossAnnual: empty component list returns a zeroed, non-crashing result', () => {
  const result = estimatedGrossAnnual([])
  assert.strictEqual(result.annualGross, 0)
  assert.strictEqual(result.hasIncompleteAmounts, false)
})

// ---- estimatedMonthlyTakeHome: always approximate, never a bare confident number ----
test('estimatedMonthlyTakeHome: returns an approximate, assumption-carrying estimate', () => {
  const result = estimatedMonthlyTakeHome(complete)
  assert.strictEqual(result.monthlyEstimate, Math.round((1060000 / 12) * 100) / 100)
  assert.strictEqual(result.isApproximate, true)
  assert.ok(Array.isArray(result.assumptions) && result.assumptions.length > 0)
  assert.strictEqual(result.hasIncompleteAmounts, false)
})

test('estimatedMonthlyTakeHome: empty component list does not crash', () => {
  const result = estimatedMonthlyTakeHome([])
  assert.strictEqual(result.monthlyEstimate, 0)
  assert.strictEqual(result.isApproximate, true)
})

// ---- hasIncompleteComponents ----
test('hasIncompleteComponents: false for a fully complete set', () => {
  assert.strictEqual(hasIncompleteComponents(complete), false)
})

test('hasIncompleteComponents: true when any component has a null amount', () => {
  const components = [...complete, { name: 'Joining Bonus', category: 'other', annual_amount: null }]
  assert.strictEqual(hasIncompleteComponents(components), true)
})

test('hasIncompleteComponents: true when any component is needs_clarification, even with an amount', () => {
  const components = [...complete, { name: 'Mystery line item', category: 'needs_clarification', annual_amount: 15000 }]
  assert.strictEqual(hasIncompleteComponents(components), true)
})

test('hasIncompleteComponents: false for an empty list', () => {
  assert.strictEqual(hasIncompleteComponents([]), false)
})

console.log(`\n${passed} passed, ${failed} failed`)
if (failed > 0) process.exit(1)
