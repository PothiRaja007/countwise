// Plain Node test runner — no framework, no new dependency.
// Run with: node src/lib/goalEngine.test.js
import assert from 'node:assert'
import { suggestedMonthlyPace, goalStatusLabel, progressPercent } from './goalEngine.js'

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

console.log('goalEngine tests\n')

// ---- suggestedMonthlyPace: with a target date ----
test('suggestedMonthlyPace: splits remaining amount across remaining months', () => {
  const today = new Date('2026-08-01')
  const goal = { target_amount: 12000, target_date: '2026-11-09' } // ~3 months + a few days out
  const pace = suggestedMonthlyPace(goal, 0, today)
  // ~3.28 months remaining, remaining amount 12000 -> roughly 3600-3700/month
  assert.ok(pace > 3400 && pace < 3800, `expected pace between 3400 and 3800, got ${pace}`)
})

test('suggestedMonthlyPace: accounts for progress already made', () => {
  const today = new Date('2026-08-01')
  const goal = { target_amount: 12000, target_date: '2026-10-01' } // 2 months out
  const pace = suggestedMonthlyPace(goal, 6000, today)
  // remaining = 6000 over ~2 months -> ~3000/month
  assert.ok(pace > 2800 && pace < 3200, `expected pace around 3000, got ${pace}`)
})

// ---- suggestedMonthlyPace: no target date ----
test('suggestedMonthlyPace: returns null when there is no target date', () => {
  const goal = { target_amount: 5000, target_date: null }
  assert.strictEqual(suggestedMonthlyPace(goal, 1000), null, 'no deadline means no pace to suggest')
})

// ---- suggestedMonthlyPace: already met ----
test('suggestedMonthlyPace: returns 0 once the target is already met', () => {
  const today = new Date('2026-08-01')
  const goal = { target_amount: 5000, target_date: '2026-12-01' }
  assert.strictEqual(suggestedMonthlyPace(goal, 5000, today), 0, 'nothing left to pace toward')
  assert.strictEqual(suggestedMonthlyPace(goal, 6000, today), 0, 'over target should also be 0, not negative')
})

// ---- suggestedMonthlyPace: target date already passed ----
test('suggestedMonthlyPace: returns null when the target date has already passed', () => {
  const today = new Date('2026-08-01')
  const goal = { target_amount: 5000, target_date: '2026-07-01' }
  assert.strictEqual(suggestedMonthlyPace(goal, 1000, today), null, 'a passed deadline has no forward-looking pace')
})

// ---- goalStatusLabel: active ----
test('goalStatusLabel: active goal with future or no target date stays active', () => {
  const today = new Date('2026-08-01')
  assert.strictEqual(goalStatusLabel({ status: 'active', target_date: '2026-12-01' }, today), 'active')
  assert.strictEqual(goalStatusLabel({ status: 'active', target_date: null }, today), 'active')
})

// ---- goalStatusLabel: completed ----
test('goalStatusLabel: stored completed status is authoritative', () => {
  const today = new Date('2026-08-01')
  assert.strictEqual(goalStatusLabel({ status: 'completed', target_date: '2026-01-01' }, today), 'completed')
})

// ---- goalStatusLabel: archived ----
test('goalStatusLabel: stored archived status is authoritative even past its date', () => {
  const today = new Date('2026-08-01')
  assert.strictEqual(goalStatusLabel({ status: 'archived', target_date: '2026-01-01' }, today), 'archived')
})

// ---- goalStatusLabel: overdue ----
test('goalStatusLabel: active goal past its target date becomes overdue', () => {
  const today = new Date('2026-08-01')
  assert.strictEqual(goalStatusLabel({ status: 'active', target_date: '2026-07-01' }, today), 'overdue')
})

// ---- progressPercent: normal case ----
test('progressPercent: reflects a straightforward partial progress', () => {
  const result = progressPercent(2500, 10000)
  assert.strictEqual(result.percent, 25, 'should be 25%')
  assert.strictEqual(result.overage, 0, 'no overage when under target')
})

// ---- progressPercent: capped at 100 with overage ----
test('progressPercent: caps at 100% and reports the real overage separately', () => {
  const result = progressPercent(11000, 10000)
  assert.strictEqual(result.percent, 100, 'display percent must cap at 100, not 110')
  assert.strictEqual(result.overage, 1000, 'overage should report the real ₹1,000 excess')
})

// ---- progressPercent: zero progress ----
test('progressPercent: zero progress is 0%, not negative or NaN', () => {
  const result = progressPercent(0, 5000)
  assert.strictEqual(result.percent, 0)
  assert.strictEqual(result.overage, 0)
})

console.log(`\n${passed} passed, ${failed} failed`)
if (failed > 0) process.exit(1)
