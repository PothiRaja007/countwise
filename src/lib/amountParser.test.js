import assert from 'node:assert'
import { parseAmountInput } from './amountParser.js'

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

console.log('amountParser tests\n')

test('plain number string parses correctly', () => {
  assert.strictEqual(parseAmountInput('1200000'), 1200000)
})

test('comma-grouped (Indian-style) number parses correctly', () => {
  assert.strictEqual(parseAmountInput('9,49,608'), 949608)
})

test('₹-prefixed comma-grouped number parses correctly', () => {
  assert.strictEqual(parseAmountInput('₹9,49,608'), 949608)
})

test('₹ with a space after it still parses', () => {
  assert.strictEqual(parseAmountInput('₹ 50000'), 50000)
})

test('leading/trailing whitespace is tolerated', () => {
  assert.strictEqual(parseAmountInput('  50000  '), 50000)
})

test('empty string returns null, not NaN or zero', () => {
  assert.strictEqual(parseAmountInput(''), null)
})

test('whitespace-only string returns null', () => {
  assert.strictEqual(parseAmountInput('   '), null)
})

test('non-numeric garbage returns null', () => {
  assert.strictEqual(parseAmountInput('abc'), null)
})

test('non-string input returns null rather than throwing', () => {
  assert.strictEqual(parseAmountInput(null), null)
  assert.strictEqual(parseAmountInput(undefined), null)
  assert.strictEqual(parseAmountInput(12345), null)
})

test('a decimal amount parses correctly', () => {
  assert.strictEqual(parseAmountInput('1234.56'), 1234.56)
})

console.log(`\n${passed} passed, ${failed} failed`)
if (failed > 0) process.exit(1)
