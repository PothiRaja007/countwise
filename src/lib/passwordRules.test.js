// Plain Node test runner — no framework, no new dependency.
// Run with: node src/lib/passwordRules.test.js
import assert from 'node:assert'
import { validatePassword, PASSWORD_RULE_LABELS } from './passwordRules.js'

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

console.log('passwordRules tests\n')

test('a password meeting every rule is valid with no failures', () => {
  const result = validatePassword('Str0ng!Pass')
  assert.strictEqual(result.valid, true)
  assert.deepStrictEqual(result.failures, [])
})

test('missing length only: 7 chars but has upper/lower/digit/symbol', () => {
  const result = validatePassword('Str0ng!')
  assert.strictEqual(result.valid, false)
  assert.deepStrictEqual(result.failures, ['At least 8 characters'])
})

test('missing uppercase only', () => {
  const result = validatePassword('str0ng!pass')
  assert.strictEqual(result.valid, false)
  assert.deepStrictEqual(result.failures, ['At least one capital letter'])
})

test('missing lowercase only', () => {
  const result = validatePassword('STR0NG!PASS')
  assert.strictEqual(result.valid, false)
  assert.deepStrictEqual(result.failures, ['At least one lowercase letter'])
})

test('missing digit only', () => {
  const result = validatePassword('Strong!Pass')
  assert.strictEqual(result.valid, false)
  assert.deepStrictEqual(result.failures, ['At least one number'])
})

test('missing symbol only', () => {
  const result = validatePassword('Str0ngPass')
  assert.strictEqual(result.valid, false)
  assert.deepStrictEqual(result.failures, ['At least one symbol'])
})

test('empty string fails every rule', () => {
  const result = validatePassword('')
  assert.strictEqual(result.valid, false)
  assert.deepStrictEqual(result.failures, PASSWORD_RULE_LABELS)
})

test('missing/undefined password is treated the same as empty, does not throw', () => {
  const result = validatePassword(undefined)
  assert.strictEqual(result.valid, false)
  assert.deepStrictEqual(result.failures, PASSWORD_RULE_LABELS)
})

test('a password missing multiple rules lists all of them, in rule order', () => {
  const result = validatePassword('lower')
  assert.strictEqual(result.valid, false)
  assert.deepStrictEqual(result.failures, [
    'At least 8 characters',
    'At least one capital letter',
    'At least one number',
    'At least one symbol',
  ])
})

console.log(`\n${passed} passed, ${failed} failed`)
if (failed > 0) process.exit(1)
