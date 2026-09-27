// Plain Node test runner — no framework, no new dependency.
// Run with: node src/lib/ctcExtraction.test.js
import assert from 'node:assert'
import { validateExtractedComponents, CTC_EXTRACTION_CATEGORIES } from './ctcExtraction.js'

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

console.log('ctcExtraction tests\n')

test('a well-formed response passes through unchanged, in the same shape manual entry uses', () => {
  const raw = [
    { name: 'Basic Salary', category: 'basic', annual_amount: 600000 },
    { name: 'HRA', category: 'hra', annual_amount: 240000 },
  ]
  const result = validateExtractedComponents(raw)
  assert.deepStrictEqual(result, raw)
})

test('an amount Gemini could not determine stays null — never guessed', () => {
  const result = validateExtractedComponents([{ name: 'Joining Bonus', category: 'variable_pay', annual_amount: null }])
  assert.strictEqual(result[0].annual_amount, null)
})

test('a category outside the allowed list is coerced to "other", not trusted or crashed on', () => {
  const result = validateExtractedComponents([{ name: 'Mystery Perk', category: 'stock_options', annual_amount: 50000 }])
  assert.strictEqual(result[0].category, 'other')
})

test('every allowed category passes through as-is', () => {
  for (const category of CTC_EXTRACTION_CATEGORIES) {
    const result = validateExtractedComponents([{ name: 'X', category, annual_amount: 1000 }])
    assert.strictEqual(result[0].category, category)
  }
})

test('a non-number amount (e.g. a stray string) is coerced to null, not passed through', () => {
  const result = validateExtractedComponents([{ name: 'Basic', category: 'basic', annual_amount: '600000' }])
  assert.strictEqual(result[0].annual_amount, null)
})

test('a zero or negative amount is coerced to null, same as an unclear one', () => {
  const zero = validateExtractedComponents([{ name: 'Basic', category: 'basic', annual_amount: 0 }])
  const negative = validateExtractedComponents([{ name: 'Basic', category: 'basic', annual_amount: -500 }])
  assert.strictEqual(zero[0].annual_amount, null)
  assert.strictEqual(negative[0].annual_amount, null)
})

test('an entry with no usable name is dropped rather than crashing the page', () => {
  const result = validateExtractedComponents([
    { name: '', category: 'basic', annual_amount: 1000 },
    { name: '   ', category: 'basic', annual_amount: 1000 },
    { category: 'basic', annual_amount: 1000 },
    { name: 'Real Component', category: 'basic', annual_amount: 1000 },
  ])
  assert.strictEqual(result.length, 1)
  assert.strictEqual(result[0].name, 'Real Component')
})

test('a name is trimmed', () => {
  const result = validateExtractedComponents([{ name: '  Basic Salary  ', category: 'basic', annual_amount: 1000 }])
  assert.strictEqual(result[0].name, 'Basic Salary')
})

test('a non-array response (e.g. Gemini/network returned something unexpected) yields an empty list, never throws', () => {
  assert.deepStrictEqual(validateExtractedComponents(null), [])
  assert.deepStrictEqual(validateExtractedComponents(undefined), [])
  assert.deepStrictEqual(validateExtractedComponents({ not: 'an array' }), [])
  assert.deepStrictEqual(validateExtractedComponents('a string'), [])
})

test('an empty array input yields an empty array output', () => {
  assert.deepStrictEqual(validateExtractedComponents([]), [])
})

console.log(`\n${passed} passed, ${failed} failed`)
if (failed > 0) process.exit(1)
