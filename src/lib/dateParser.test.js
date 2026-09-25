// Plain Node test runner — no framework, no new dependency.
// Run with: node src/lib/dateParser.test.js
import assert from 'node:assert'
import { parseDate } from './dateParser.js'

let passed = 0
let failed = 0

function test(name, fn) {
  try {
    fn()
    passed++
    console.log(`✓ ${name}`)
  } catch (err) {
    failed++
    console.log(`✗ ${name}`)
    console.log(`  ${err.message}`)
  }
}

// Fixed reference date so tests are deterministic regardless of when they run.
// 2026-08-25 is a Tuesday.
const REF = new Date(2026, 7, 25) // month is 0-indexed: 7 = August

test('"today" resolves to the reference date', () => {
  assert.strictEqual(parseDate('today', REF), '2026-08-25')
})

test('"yesterday" resolves to one day before', () => {
  assert.strictEqual(parseDate('yesterday', REF), '2026-08-24')
})

test('"tomorrow" resolves to one day after', () => {
  assert.strictEqual(parseDate('tomorrow', REF), '2026-08-26')
})

test('"last Monday" resolves to the Monday before this week, not today\'s week if today is Monday', () => {
  // REF is a Tuesday (2026-08-25), so "last Monday" is 2026-08-24
  assert.strictEqual(parseDate('last Monday', REF), '2026-08-24')
})

test('"last Monday" skips today even when today is a Monday', () => {
  const monday = new Date(2026, 7, 24) // 2026-08-24 is a Monday
  // "last Monday" said on a Monday should mean the previous Monday, not today
  assert.strictEqual(parseDate('last monday', monday), '2026-08-17')
})

test('bare weekday name resolves to the most recent occurrence, including today', () => {
  // REF is a Tuesday, so bare "tuesday" should resolve to today itself
  assert.strictEqual(parseDate('tuesday', REF), '2026-08-25')
})

test('bare weekday name resolves to the most recent past occurrence when not today', () => {
  // "friday" relative to a Tuesday reference should be the Friday before
  assert.strictEqual(parseDate('friday', REF), '2026-08-21')
})

test('ISO date passes through unchanged', () => {
  assert.strictEqual(parseDate('paid rent on 2026-08-10', REF), '2026-08-10')
})

test('"25 Aug" style date resolves using the reference year', () => {
  assert.strictEqual(parseDate('lunch on 25 Aug', REF), '2026-08-25')
})

test('"Aug 25" style date resolves the same as "25 Aug"', () => {
  assert.strictEqual(parseDate('lunch on Aug 25', REF), '2026-08-25')
})

test('dd/mm/yyyy date resolves correctly', () => {
  assert.strictEqual(parseDate('bill paid 10/08/2026', REF), '2026-08-10')
})

test('a string with no date defaults to the reference date (today)', () => {
  assert.strictEqual(parseDate('coffee 80', REF), '2026-08-25')
})

console.log(`\n${passed} passed, ${failed} failed`)
if (failed > 0) process.exit(1)
