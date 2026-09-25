// Plain Node test runner — no framework, no new dependency.
// Run with: node src/lib/reminderEngine.test.js
import assert from 'node:assert'
import { daysSince, isReminderEligible } from './reminderEngine.js'

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

console.log('reminderEngine tests\n')

const NOW = new Date('2026-09-06T12:00:00.000Z')
const DAY_MS = 24 * 60 * 60 * 1000

function hoursAgo(hours, from = NOW) {
  return new Date(from.getTime() - hours * 60 * 60 * 1000).toISOString()
}
function daysAgo(days, from = NOW) {
  return new Date(from.getTime() - days * DAY_MS).toISOString()
}

// ---- daysSince ----
test('daysSince: null date returns null', () => {
  assert.strictEqual(daysSince(null, NOW), null)
})

test('daysSince: exact fractional days elapsed', () => {
  const d = daysAgo(2.5)
  assert.ok(Math.abs(daysSince(d, NOW) - 2.5) < 0.0001)
})

// ---- New user, never transacted ----
test('isReminderEligible: brand-new user (lastTransactionAt null) is never eligible', () => {
  const result = isReminderEligible(
    { lastTransactionAt: null, reminderAfterDays: 2, lastReminderSentAt: null },
    NOW
  )
  assert.strictEqual(result, false, 'a user who has never logged anything should not be shamed with a reminder')
})

// ---- Exactly at the threshold ----
test('isReminderEligible: exactly at the threshold is eligible (>=, not >)', () => {
  const result = isReminderEligible(
    { lastTransactionAt: daysAgo(2), reminderAfterDays: 2, lastReminderSentAt: null },
    NOW
  )
  assert.strictEqual(result, true)
})

// ---- Just under the threshold ----
test('isReminderEligible: just under the threshold is not eligible', () => {
  const result = isReminderEligible(
    { lastTransactionAt: hoursAgo(47), reminderAfterDays: 2, lastReminderSentAt: null },
    NOW
  )
  assert.strictEqual(result, false)
})

// ---- Just over the threshold ----
test('isReminderEligible: just over the threshold is eligible', () => {
  const result = isReminderEligible(
    { lastTransactionAt: hoursAgo(49), reminderAfterDays: 2, lastReminderSentAt: null },
    NOW
  )
  assert.strictEqual(result, true)
})

// ---- Reminder already sent since the last activity ----
test('isReminderEligible: reminder already sent after the last transaction blocks re-firing', () => {
  const result = isReminderEligible(
    {
      lastTransactionAt: daysAgo(5),
      reminderAfterDays: 2,
      lastReminderSentAt: daysAgo(1), // sent more recently than the transaction
    },
    NOW
  )
  assert.strictEqual(result, false)
})

// ---- Reminder sent at the exact same instant as the transaction ----
test('isReminderEligible: reminder sent at the same instant as the transaction blocks re-firing (strict <)', () => {
  const tx = daysAgo(5)
  const result = isReminderEligible(
    { lastTransactionAt: tx, reminderAfterDays: 2, lastReminderSentAt: tx },
    NOW
  )
  assert.strictEqual(result, false)
})

// ---- Cycle reset: reminder sent before the last activity, then inactivity resumed ----
test('isReminderEligible: reminder sent before the last transaction resets the cycle', () => {
  const result = isReminderEligible(
    {
      lastTransactionAt: daysAgo(3), // user came back and logged something
      reminderAfterDays: 2,
      lastReminderSentAt: daysAgo(10), // old reminder, well before that activity
    },
    NOW
  )
  assert.strictEqual(result, true, 'fresh activity after an old reminder should re-arm eligibility once inactivity resumes')
})

// ---- Cycle reset case, but not enough new inactivity has passed yet ----
test('isReminderEligible: cycle reset but threshold not yet reached again', () => {
  const result = isReminderEligible(
    {
      lastTransactionAt: daysAgo(1), // recent activity
      reminderAfterDays: 2,
      lastReminderSentAt: daysAgo(10), // old reminder, irrelevant now
    },
    NOW
  )
  assert.strictEqual(result, false, 'even though the old reminder no longer blocks it, only 1 day has passed since the new activity')
})

console.log(`\n${passed} passed, ${failed} failed`)
if (failed > 0) process.exit(1)
