import assert from 'node:assert'
import { ADVANCED_INSIGHTS_SCHEMA, buildAdvancedInsightsPrompt, validateAdvancedInsights, MAX_INSIGHTS_CHARS } from './advancedInsights.js'

let passed = 0, failed = 0
function test(name, fn) {
  try { fn(); passed++; console.log(`  PASS  ${name}`) }
  catch (err) { failed++; console.log(`  FAIL  ${name}\n        ${err.message}`) }
}

console.log('advancedInsights tests\n')

test('schema is exactly one required string field, nothing else', () => {
  assert.deepStrictEqual(ADVANCED_INSIGHTS_SCHEMA, {
    type: 'object', properties: { summary: { type: 'string' } }, required: ['summary'], additionalProperties: false,
  })
})

test('the prompt includes every section heading and line verbatim, and states every rule the validator enforces', () => {
  const sections = [
    { heading: 'Money patterns', lines: ['Food spending is higher than at this point last month.'] },
    { heading: 'Goals', lines: ['Emergency fund: recent pace \u20b93,000/month.'] },
    { heading: 'Behavior', lines: ['Expenses were higher than income for this period'] },
  ]
  const p = buildAdvancedInsightsPrompt(sections)
  assert.ok(p.includes('Money patterns:'))
  assert.ok(p.includes('Food spending is higher than at this point last month.'))
  assert.ok(p.includes('Emergency fund: recent pace \u20b93,000/month.'))
  assert.ok(p.includes('Expenses were higher than income for this period'))
  for (const rule of ['Do not calculate, round, abbreviate', 'Do not give advice', 'Do not judge', 'guarantee, promise, definitely', 'Do not mention dates or months']) {
    assert.ok(p.includes(rule), `missing rule: ${rule}`)
  }
})

test('a section with no lines is dropped from the prompt body entirely (nothing to summarize for it)', () => {
  const p = buildAdvancedInsightsPrompt([{ heading: 'Goals', lines: [] }, { heading: 'Behavior', lines: ['x'] }])
  assert.ok(!p.includes('Goals:'))
  assert.ok(p.includes('Behavior:'))
})

// ---- Figures spanning all three domains, via the reused {figures} shape --
const FIGURES = [
  { figures: { current: 4100, previous: 2400, change: 1700, percentChange: 71 } }, // Financial Assist observation
  { figures: { recentMonthlyPace: 3000, avgMonthlyNetCashFlow: 9000 } }, // goal opportunity
  { figures: { stars: 3.5, income: 25000, expense: 30000 } }, // behavior score
]

test('a number from ANY of the three domains (money/goals/behavior) is accepted — proves figures genuinely compose', () => {
  assert.strictEqual(validateAdvancedInsights('Food spending rose by 1700.', FIGURES).ok, true)
  assert.strictEqual(validateAdvancedInsights('The recent pace was 3000.', FIGURES).ok, true)
  assert.strictEqual(validateAdvancedInsights('Expenses were 30000 against income of 25000.', FIGURES).ok, true)
})

test('a fabricated number not present in ANY domain is rejected', () => {
  assert.strictEqual(validateAdvancedInsights('Spending rose by 9999.', FIGURES).ok, false)
})

test('advice, certainty, and investment language are all rejected (the union of every existing safeguard)', () => {
  for (const t of ['You should save more.', 'This guarantees a comfortable future.', 'Consider investing in mutual funds.']) {
    assert.strictEqual(validateAdvancedInsights(t, FIGURES).ok, false, t)
  }
})

test('empty, overlong, and non-string text are all rejected', () => {
  assert.strictEqual(validateAdvancedInsights('', FIGURES).ok, false)
  assert.strictEqual(validateAdvancedInsights(null, FIGURES).ok, false)
  assert.strictEqual(validateAdvancedInsights('a'.repeat(MAX_INSIGHTS_CHARS + 1), FIGURES).ok, false)
  assert.strictEqual(validateAdvancedInsights('a'.repeat(MAX_INSIGHTS_CHARS), FIGURES).ok, true)
})

test('text with no numbers at all is accepted (a purely qualitative summary is valid)', () => {
  assert.strictEqual(validateAdvancedInsights('Spending patterns and goal activity were recorded across the period.', FIGURES).ok, true)
})

test('an empty figures list correctly rejects every number (nothing to summarize, nothing is allowed)', () => {
  assert.strictEqual(validateAdvancedInsights('Spending rose by 1700.', []).ok, false)
})

console.log(`\n${passed} passed, ${failed} failed`)
if (failed > 0) process.exit(1)
