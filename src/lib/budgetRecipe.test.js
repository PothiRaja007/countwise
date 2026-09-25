// Plain Node test runner — no framework, no new dependency.
// Run with: node src/lib/budgetRecipe.test.js
import assert from 'node:assert'
import {
  parseRecipeAmount,
  parseRecipeInput,
  mergeByCategory,
  suggestFromHistory,
  suggestFromProfile,
  recentIncomeTotal,
} from './budgetRecipe.js'

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

console.log('budgetRecipe tests\n')

const FOOD_ID = 'cat-food'
const TRANSPORT_ID = 'cat-transport'
const RENT_ID = 'cat-rent'
const SUBS_ID = 'cat-subs'

const RULES = [
  { keyword: 'coffee', category_id: FOOD_ID, priority: 0 },
  { keyword: 'lunch', category_id: FOOD_ID, priority: 0 },
  { keyword: 'uber', category_id: TRANSPORT_ID, priority: 0 },
  { keyword: 'bus', category_id: TRANSPORT_ID, priority: 0 },
  { keyword: 'fuel', category_id: TRANSPORT_ID, priority: 0 },
  { keyword: 'rent', category_id: RENT_ID, priority: 0 },
  { keyword: 'netflix', category_id: SUBS_ID, priority: 0 },
  { keyword: 'spotify', category_id: SUBS_ID, priority: 0 },
]

// ---- K-notation ----
test('parseRecipeAmount: understands K-notation', () => {
  assert.strictEqual(parseRecipeAmount('1k'), 1000)
  assert.strictEqual(parseRecipeAmount('2k'), 2000)
  assert.strictEqual(parseRecipeAmount('2.5k'), 2500)
  assert.strictEqual(parseRecipeAmount('10k'), 10000)
  assert.strictEqual(parseRecipeAmount('1.2k'), 1200)
})

test('parseRecipeAmount: "2k" is never read as "2"', () => {
  assert.notStrictEqual(parseRecipeAmount('rent 2k'), 2)
  assert.strictEqual(parseRecipeAmount('rent 2k'), 2000)
})

test('parseRecipeAmount: still handles plain numbers via the existing parser', () => {
  assert.strictEqual(parseRecipeAmount('rent 8000'), 8000)
  assert.strictEqual(parseRecipeAmount('₹500'), 500)
})

// ---- parseRecipeInput: pooled multi-expense parsing ----
test('parseRecipeInput: parses a full pooled list with K-notation and plain numbers', () => {
  const candidates = parseRecipeInput('rent 8k, fuel 2k, netflix 149, spotify 119', RULES)
  assert.strictEqual(candidates.length, 4)
  assert.strictEqual(candidates[0].categoryId, RENT_ID)
  assert.strictEqual(candidates[0].amount, 8000)
  assert.strictEqual(candidates[1].categoryId, TRANSPORT_ID)
  assert.strictEqual(candidates[1].amount, 2000)
  assert.strictEqual(candidates[2].amount, 149)
  assert.strictEqual(candidates[3].amount, 119)
  candidates.forEach((c) => assert.strictEqual(c.source, 'user'))
})

test('parseRecipeInput: natural-text clause still parses amount and category', () => {
  const candidates = parseRecipeInput('I spend 8k on rent and about 2k on fuel', RULES)
  // splitClauses only splits on comma/"and" - this becomes 2 clauses.
  assert.strictEqual(candidates.length, 2)
  assert.strictEqual(candidates[0].amount, 8000)
  assert.strictEqual(candidates[0].categoryId, RENT_ID)
  assert.strictEqual(candidates[1].amount, 2000)
  assert.strictEqual(candidates[1].categoryId, TRANSPORT_ID)
})

// ---- missing amount / missing category: never fabricated ----
test('parseRecipeInput: a clause with no amount returns amount null and requiresReview true', () => {
  const candidates = parseRecipeInput('coffee', RULES)
  assert.strictEqual(candidates[0].amount, null)
  assert.strictEqual(candidates[0].requiresReview, true)
})

test('parseRecipeInput: a clause matching no category rule is flagged for review even with an amount', () => {
  const candidates = parseRecipeInput('mystery expense 500', RULES)
  assert.strictEqual(candidates[0].amount, 500)
  assert.strictEqual(candidates[0].categoryId, null)
  assert.strictEqual(candidates[0].requiresReview, true)
})

// ---- mergeByCategory ----
test('mergeByCategory: sums same-category candidates into one row', () => {
  const candidates = parseRecipeInput('netflix 149, spotify 119', RULES)
  const merged = mergeByCategory(candidates)
  assert.strictEqual(merged.length, 1)
  assert.strictEqual(merged[0].categoryId, SUBS_ID)
  assert.strictEqual(merged[0].amount, 268)
})

test('mergeByCategory: never merges candidates with an unresolved category', () => {
  const candidates = [
    { categoryId: null, amount: 500, source: 'user', requiresReview: true },
    { categoryId: null, amount: 300, source: 'user', requiresReview: true },
  ]
  const merged = mergeByCategory(candidates)
  assert.strictEqual(merged.length, 2, 'two unmatched clauses stay two separate rows')
})

test('mergeByCategory: different categories stay on separate rows', () => {
  const candidates = parseRecipeInput('rent 8000, fuel 2000', RULES)
  const merged = mergeByCategory(candidates)
  assert.strictEqual(merged.length, 2)
})

// ---- suggestFromHistory: exclusion + rounding ----
test('suggestFromHistory: excludes categories already covered elsewhere', () => {
  const reference = new Date('2026-09-01')
  const transactions = [
    { category_id: FOOD_ID, type: 'expense', amount: 1000, transaction_date: '2026-08-05' },
    { category_id: FOOD_ID, type: 'expense', amount: 1200, transaction_date: '2026-07-05' },
    { category_id: TRANSPORT_ID, type: 'expense', amount: 500, transaction_date: '2026-08-10' },
    { category_id: TRANSPORT_ID, type: 'expense', amount: 700, transaction_date: '2026-07-10' },
  ]
  const candidates = suggestFromHistory(transactions, [FOOD_ID], reference)
  assert.strictEqual(candidates.length, 1)
  assert.strictEqual(candidates[0].categoryId, TRANSPORT_ID)
  assert.strictEqual(candidates[0].source, 'history')
  assert.strictEqual(candidates[0].reason, 'Based on recent spending')
})

test('suggestFromHistory: rounds the suggested amount to the nearest ₹50 (documented, deterministic)', () => {
  const reference = new Date('2026-09-01')
  // 500, 700, 600 across 3 months -> average 600 exactly, already a multiple of 50
  const transactions = [
    { category_id: FOOD_ID, type: 'expense', amount: 500, transaction_date: '2026-08-05' },
    { category_id: FOOD_ID, type: 'expense', amount: 700, transaction_date: '2026-07-05' },
    { category_id: FOOD_ID, type: 'expense', amount: 600, transaction_date: '2026-06-05' },
  ]
  const candidates = suggestFromHistory(transactions, [], reference)
  assert.strictEqual(candidates[0].amount, 600)
})

test('suggestFromHistory: a non-round average rounds to the nearest ₹50', () => {
  const reference = new Date('2026-09-01')
  // average = (613 + 612) / 2 = 612.5 -> nearest 50 -> 600
  // (12.5 away from 600 vs 37.5 away from 650)
  const transactions = [
    { category_id: FOOD_ID, type: 'expense', amount: 613, transaction_date: '2026-08-05' },
    { category_id: FOOD_ID, type: 'expense', amount: 612, transaction_date: '2026-07-05' },
  ]
  const candidates = suggestFromHistory(transactions, [], reference)
  assert.strictEqual(candidates[0].amount, 600)
})

test('suggestFromHistory: a category appearing in only 1 of 3 months is not suggested', () => {
  const reference = new Date('2026-09-01')
  const transactions = [{ category_id: FOOD_ID, type: 'expense', amount: 1000, transaction_date: '2026-08-05' }]
  const candidates = suggestFromHistory(transactions, [], reference)
  assert.strictEqual(candidates.length, 0)
})

test('suggestFromHistory: income and transfer rows never contribute', () => {
  const reference = new Date('2026-09-01')
  const transactions = [
    { category_id: FOOD_ID, type: 'expense', amount: 1000, transaction_date: '2026-08-05' },
    { category_id: FOOD_ID, type: 'income', amount: 9000, transaction_date: '2026-08-06' },
    { category_id: FOOD_ID, type: 'expense', amount: 1000, transaction_date: '2026-07-05' },
    { category_id: FOOD_ID, type: 'transfer', amount: 5000, transaction_date: '2026-07-06' },
  ]
  const candidates = suggestFromHistory(transactions, [], reference)
  assert.strictEqual(candidates[0].amount, 1000)
})

test('suggestFromHistory: no evidence means no suggestion at all (never fabricated)', () => {
  assert.deepStrictEqual(suggestFromHistory([], [], new Date('2026-09-01')), [])
})

// ---- suggestFromProfile: never carries a confirmed amount, matches real categories ----
test('suggestFromProfile: every suggestion has amount null and requiresReview true', () => {
  const candidates = suggestFromProfile('student', [])
  assert.ok(candidates.length > 0)
  candidates.forEach((c) => {
    assert.strictEqual(c.amount, null, 'profile suggestions must never carry a confirmed amount')
    assert.strictEqual(c.requiresReview, true)
    assert.strictEqual(c.source, 'profile')
  })
})

test('suggestFromProfile: student and employed lists use real default category names', () => {
  const REAL_DEFAULTS = ['Transport', 'Food', 'Mobile Recharge', 'Education', 'Subscriptions', 'Rent']
  const student = suggestFromProfile('student', [])
  const employed = suggestFromProfile('employed', [])
  ;[...student, ...employed].forEach((c) => assert.ok(REAL_DEFAULTS.includes(c.categoryName), `${c.categoryName} should be a real category name`))
})

test('suggestFromProfile: excludes category names already covered elsewhere', () => {
  const candidates = suggestFromProfile('student', ['Food', 'Transport'])
  const names = candidates.map((c) => c.categoryName)
  assert.ok(!names.includes('Food'))
  assert.ok(!names.includes('Transport'))
})

test('suggestFromProfile: an unrecognized income type (e.g. "mixed") returns no suggestions', () => {
  assert.deepStrictEqual(suggestFromProfile('mixed', []), [])
})

// ---- recentIncomeTotal ----
test('recentIncomeTotal: sums income only, for the given period', () => {
  const transactions = [
    { type: 'income', amount: 20000, transaction_date: '2026-08-01' },
    { type: 'expense', amount: 500, transaction_date: '2026-08-02' },
    { type: 'income', amount: 5000, transaction_date: '2026-07-15' }, // outside period
  ]
  assert.strictEqual(recentIncomeTotal(transactions, '2026-08-01', '2026-08-31'), 20000)
})

test('recentIncomeTotal: 0 when there are no confirmed income transactions (caller hides the comparison)', () => {
  const transactions = [{ type: 'expense', amount: 500, transaction_date: '2026-08-02' }]
  assert.strictEqual(recentIncomeTotal(transactions, '2026-08-01', '2026-08-31'), 0)
})

console.log(`\n${passed} passed, ${failed} failed`)
if (failed > 0) process.exit(1)
