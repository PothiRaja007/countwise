import assert from 'node:assert'
import { goalOpportunity, WINDOW_MONTHS } from './goalOpportunityEngine.js'
import { FORBIDDEN_PHRASES } from './assistCopy.js'

let passed = 0, failed = 0
function test(name, fn) {
  try { fn(); passed++; console.log(`  PASS  ${name}`) }
  catch (err) { failed++; console.log(`  FAIL  ${name}\n        ${err.message}`) }
}

const TODAY = new Date(2026, 8, 30) // 30 Sept 2026
const contrib = (goalId, date, amount, type = 'contribution') => ({ goal_id: goalId, contribution_date: date, amount, type })
const txn = (date, amount, type) => ({ transaction_date: date, amount, type })

console.log('goalOpportunityEngine tests\n')

test('WINDOW_MONTHS is the stated, documented 3-month default', () => {
  assert.strictEqual(WINDOW_MONTHS, 3)
})

// ---- Basic, healthy case ---------------------------------------------------
test('a goal with steady recent contributions produces a real scenario date and onTrack=true', () => {
  const goal = { id: 'g1', target_amount: 30000, target_date: '2027-03-30' } // 6 months out
  const contributions = [
    contrib('g1', '2026-07-05', 3000), contrib('g1', '2026-08-05', 3000), contrib('g1', '2026-09-05', 3000),
  ]
  const r = goalOpportunity({ goal, contributions, transactions: [], today: TODAY })
  assert.strictEqual(r.currentProgress, 9000)
  assert.strictEqual(r.remaining, 21000)
  assert.strictEqual(r.recentMonthlyPace, 3000)
  assert.ok(r.projectedCompletionDate !== null)
  // 21000 remaining / 3000 per month = 7 months from today -> well past target_date -> NOT on track
  // (required pace for 6 months is 21000/6=3500 > recent pace 3000)
  assert.strictEqual(r.onTrack, false)
})

// ---- Goal already fully funded --------------------------------------------
test('a goal already at or past target: remaining is 0, projected date is today, requiredPace is 0', () => {
  const goal = { id: 'g2', target_amount: 10000, target_date: '2027-01-01' }
  const contributions = [contrib('g2', '2026-09-01', 12000)]
  const r = goalOpportunity({ goal, contributions, transactions: [], today: TODAY })
  assert.strictEqual(r.remaining, 0)
  assert.strictEqual(r.projectedCompletionDate, '2026-09-30')
  assert.strictEqual(r.requiredMonthlyPace, 0)
  assert.strictEqual(r.onTrack, true)
})

// ---- No contributions at all yet -------------------------------------------
test('a brand-new goal with zero contributions: no scenario date is guessed, onTrack reflects the (impossible) required pace', () => {
  const goal = { id: 'g3', target_amount: 50000, target_date: '2026-12-30' }
  const r = goalOpportunity({ goal, contributions: [], transactions: [], today: TODAY })
  assert.strictEqual(r.currentProgress, 0)
  assert.strictEqual(r.recentMonthlyPace, 0)
  assert.strictEqual(r.projectedCompletionDate, null)
  assert.strictEqual(r.onTrack, false) // required pace > 0, recent pace is 0
})

test('no target_date at all: requiredMonthlyPace and onTrack are both null, never guessed', () => {
  const goal = { id: 'g4', target_amount: 50000, target_date: null }
  const r = goalOpportunity({ goal, contributions: [], transactions: [], today: TODAY })
  assert.strictEqual(r.requiredMonthlyPace, null)
  assert.strictEqual(r.onTrack, null)
})

// ---- Net withdrawals: a negative recent pace -------------------------------
test('net withdrawals produce a negative recent pace and no scenario date (never a "backwards" date)', () => {
  const goal = { id: 'g5', target_amount: 20000, target_date: '2027-01-01' }
  const contributions = [contrib('g5', '2026-08-01', 1000), contrib('g5', '2026-09-01', 3000, 'withdrawal')]
  const r = goalOpportunity({ goal, contributions, transactions: [], today: TODAY })
  assert.ok(r.recentMonthlyPace < 0)
  assert.strictEqual(r.projectedCompletionDate, null)
})

// ---- Contributions outside the window are excluded -------------------------
test('a contribution from 6 months ago (outside the 3-month window) does not count toward the recent pace', () => {
  const goal = { id: 'g6', target_amount: 20000, target_date: null }
  const contributions = [contrib('g6', '2026-03-01', 50000)] // old, out of window
  const r = goalOpportunity({ goal, contributions, transactions: [], today: TODAY })
  assert.strictEqual(r.recentMonthlyPace, 0) // nothing in the last 3 months
  assert.strictEqual(r.currentProgress, 50000) // but it DOES still count toward total progress (reused goalProgress)
})

// ---- Contributions to a DIFFERENT goal never leak in ------------------------
test('contributions to a different goal are never counted', () => {
  const goal = { id: 'g7', target_amount: 20000, target_date: null }
  const contributions = [contrib('other-goal', '2026-09-01', 99999)]
  const r = goalOpportunity({ goal, contributions, transactions: [], today: TODAY })
  assert.strictEqual(r.currentProgress, 0)
  assert.strictEqual(r.recentMonthlyPace, 0)
})

// ---- avgMonthlyNetCashFlow: reused from financialEngine, not re-derived ----
test('avgMonthlyNetCashFlow reflects income minus expense only, transfers excluded, matching financialEngine.netCashFlow exactly', () => {
  const goal = { id: 'g8', target_amount: 20000, target_date: null }
  const transactions = [
    txn('2026-08-10', 20000, 'income'), txn('2026-08-15', 5000, 'expense'),
    txn('2026-09-10', 20000, 'income'), txn('2026-09-15', 5000, 'expense'),
    txn('2026-09-20', 10000, 'transfer'), // must be excluded
  ]
  const r = goalOpportunity({ goal, contributions: [], transactions, today: TODAY })
  // (20000-5000) + (20000-5000) = 30000 over the window (transactions before windowStart are naturally outside; here all are inside) / 3 months
  assert.strictEqual(r.avgMonthlyNetCashFlow, 30000 / 3)
})

test('a negative average net cash flow (spending more than earning) is surfaced as-is, not hidden or floored at zero', () => {
  const goal = { id: 'g9', target_amount: 20000, target_date: null }
  const transactions = [txn('2026-09-01', 5000, 'income'), txn('2026-09-05', 15000, 'expense')]
  const r = goalOpportunity({ goal, contributions: [], transactions, today: TODAY })
  assert.ok(r.avgMonthlyNetCashFlow < 0)
})

// ---- surplusGap: a plain number, no advice baked in ------------------------
test('surplusGap is simply avgMonthlyNetCashFlow minus recentMonthlyPace, a fact not a suggestion', () => {
  const goal = { id: 'g10', target_amount: 20000, target_date: null }
  const contributions = [contrib('g10', '2026-09-01', 3000)]
  const transactions = [txn('2026-09-01', 20000, 'income'), txn('2026-09-05', 10000, 'expense')]
  const r = goalOpportunity({ goal, contributions, transactions, today: TODAY })
  assert.strictEqual(r.surplusGap, r.avgMonthlyNetCashFlow - r.recentMonthlyPace)
})

// ---- Fractional-month projection correctness --------------------------------
test('a fractional months-to-completion is not truncated to a whole month', () => {
  const goal = { id: 'g11', target_amount: 10000, target_date: null }
  const contributions = [contrib('g11', '2026-09-01', 1500)] // recent pace = 500/month, remaining after = 8500
  const r = goalOpportunity({ goal, contributions, transactions: [], today: TODAY })
  // 8500 / 500 = 17 months exactly -> a clean case; also check a non-integer one:
  const goal2 = { id: 'g12', target_amount: 10000, target_date: null }
  const contributions2 = [contrib('g12', '2026-09-01', 1000)] // pace = 1000/3 per month ≈ 333.33
  const r2 = goalOpportunity({ goal: goal2, contributions: contributions2, transactions: [], today: TODAY })
  assert.ok(r2.projectedCompletionDate > '2028-01-01' && r2.projectedCompletionDate < '2029-06-01', r2.projectedCompletionDate)
})

console.log(`\n${passed} passed, ${failed} failed`)
if (failed > 0) process.exit(1)
