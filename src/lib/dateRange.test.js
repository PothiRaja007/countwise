// Plain Node test runner — no framework, no new dependency.
// Run with: node src/lib/dateRange.test.js
import assert from 'node:assert'
import { toISODate, fromISODate, addDays, periodRange, previousRange, formatShortDate } from './dateRange.js'

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

console.log('dateRange tests\n')

test('toISODate/fromISODate round-trip', () => {
  const d = new Date(2026, 7, 30) // 30 Aug 2026
  const iso = toISODate(d)
  assert.strictEqual(iso, '2026-08-30')
  const back = fromISODate(iso)
  assert.strictEqual(back.getFullYear(), 2026)
  assert.strictEqual(back.getMonth(), 7)
  assert.strictEqual(back.getDate(), 30)
})

test('addDays moves forward and backward correctly, including across a month boundary', () => {
  const d = new Date(2026, 7, 30)
  assert.strictEqual(toISODate(addDays(d, 1)), '2026-08-31')
  assert.strictEqual(toISODate(addDays(d, 2)), '2026-09-01')
  assert.strictEqual(toISODate(addDays(d, -30)), '2026-07-31')
})

test('periodRange produces an inclusive range of exactly `days` length ending at endDate', () => {
  const end = new Date(2026, 7, 30)
  const { start, end: rangeEnd } = periodRange(30, end)
  assert.strictEqual(rangeEnd, '2026-08-30')
  assert.strictEqual(start, '2026-08-01') // 30 days inclusive: Aug 1 through Aug 30
})

test('previousRange is the same length and ends the day before the current range starts, with no overlap', () => {
  const current = periodRange(30, new Date(2026, 7, 30))
  const previous = previousRange(30, current.start)
  assert.strictEqual(previous.end, '2026-07-31', 'previous range should end the day before current.start')
  assert.notStrictEqual(previous.start, current.start)
  assert.ok(previous.end < current.start, 'previous range must not overlap the current range')
})

test('formatShortDate returns a non-empty, day-and-month formatted string', () => {
  const label = formatShortDate('2026-08-30')
  assert.strictEqual(typeof label, 'string')
  assert.ok(label.length > 0)
  assert.ok(label.includes('30'), 'should include the day number')
})

console.log(`\n${passed} passed, ${failed} failed`)
if (failed > 0) process.exit(1)
