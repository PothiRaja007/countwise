// Plain Node test runner — no framework, no new dependency.
// Run with: node src/lib/errorMessages.test.js
import assert from 'node:assert'
import { friendlyError } from './errorMessages.js'

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

console.log('errorMessages tests\n')

test('a network-failure-shaped error gets a connection message, not its raw text', () => {
  const raw = 'TypeError: Failed to fetch'
  const result = friendlyError({ message: raw })
  assert.notStrictEqual(result, raw)
  assert.ok(!result.includes('Failed to fetch'), 'raw message text must never appear in the result')
  assert.strictEqual(result, "Couldn't connect. Check your connection and try again.")
})

test('a Postgres RLS/permission-denied error gets a permission message, not its raw text', () => {
  const raw = 'permission denied for table transactions'
  const result = friendlyError({ code: '42501', message: raw })
  assert.notStrictEqual(result, raw)
  assert.ok(!result.includes('permission denied'), 'raw message text must never appear in the result')
  assert.strictEqual(result, "You don't have permission to do that.")
})

test('a PostgREST "no rows" error gets a not-found message, not its raw text', () => {
  const raw = 'JSON object requested, multiple (or no) rows returned'
  const result = friendlyError({ code: 'PGRST116', message: raw })
  assert.notStrictEqual(result, raw)
  assert.strictEqual(result, "That couldn't be found. It may have been removed.")
})

test('an unrecognized error falls back to the default message', () => {
  const raw = 'duplicate key value violates unique constraint "xyz_pkey_2049"'
  const result = friendlyError({ message: raw })
  assert.notStrictEqual(result, raw)
  assert.ok(!result.includes('xyz_pkey_2049'), 'raw message text must never appear in the result')
  assert.strictEqual(result, 'Something went wrong. Please try again.')
})

test('an unrecognized error uses a page-supplied custom fallback when given one', () => {
  const result = friendlyError({ message: 'some unrecognized failure' }, "Couldn't load your transactions. Please try again.")
  assert.strictEqual(result, "Couldn't load your transactions. Please try again.")
})

test('a null or undefined error does not throw, and still returns the fallback', () => {
  assert.strictEqual(friendlyError(null), 'Something went wrong. Please try again.')
  assert.strictEqual(friendlyError(undefined), 'Something went wrong. Please try again.')
})

test('an error with no message property falls back cleanly', () => {
  const result = friendlyError({ code: 'SOME_CODE' }, 'Custom fallback.')
  assert.strictEqual(result, 'Custom fallback.')
})

console.log(`\n${passed} passed, ${failed} failed`)
if (failed > 0) process.exit(1)
