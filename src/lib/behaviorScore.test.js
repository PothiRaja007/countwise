import assert from 'node:assert/strict'
import { computeBehaviorScore } from './behaviorScore.js'

const periodStart = '2026-08-01'
const periodEnd = '2026-08-31'

function tx(type, amount, date) {
  return { type, amount, transaction_date: date }
}

// 1. No activity yet: neutral score + insufficient-data state.
{
  const result = computeBehaviorScore({
    transactions: [],
    goals: [],
    goalContributions: [],
    periodStart,
    periodEnd,
  })
  assert.equal(result.stars, 5)
  assert.equal(result.flags.length, 0)
  assert.equal(result.sufficientData, false)
}

// 2. Healthy period with income and spending, no goals.
{
  const result = computeBehaviorScore({
    transactions: [tx('income', 25000, '2026-08-01'), tx('expense', 1200, '2026-08-10')],
    goals: [],
    goalContributions: [],
    periodStart,
    periodEnd,
  })
  assert.equal(result.stars, 5)
  assert.equal(result.flags.length, 0)
  assert.equal(result.stats.netCashFlow, 23800)
}

// 3. Early-month burn is detected using the new transaction schema.
{
  const result = computeBehaviorScore({
    transactions: [
      tx('income', 10000, '2026-08-01'),
      tx('expense', 4000, '2026-08-02'),
    ],
    goals: [],
    goalContributions: [],
    periodStart,
    periodEnd,
  })
  assert.equal(result.flags[0].flag_type, 'early_period_burn')
  assert.equal(result.flags[0].description, '40% of income was spent in the first 3 days')
}

// 4. Overspend is detected, while transfers are ignored.
{
  const result = computeBehaviorScore({
    transactions: [
      tx('income', 5000, '2026-08-01'),
      tx('expense', 6000, '2026-08-15'),
      { type: 'transfer', amount: 9000, transaction_date: '2026-08-15' },
    ],
    goals: [],
    goalContributions: [],
    periodStart,
    periodEnd,
  })
  assert.equal(result.stats.income, 5000)
  assert.equal(result.stats.expense, 6000)
  assert.equal(result.flags.some((flag) => flag.flag_type === 'overspend'), true)
}

// 5. Active goals with a contribution should not trigger the no-contribution flag.
{
  const result = computeBehaviorScore({
    transactions: [tx('income', 10000, '2026-08-01')],
    goals: [{ id: 'goal-1', status: 'active' }],
    goalContributions: [
      { goal_id: 'goal-1', type: 'contribution', amount: 1000, contribution_date: '2026-08-12' },
    ],
    periodStart,
    periodEnd,
  })
  assert.equal(result.flags.some((flag) => flag.flag_type === 'no_savings_contribution'), false)
  assert.equal(result.stats.goalContributions, 1000)
}

console.log('Behavior Score tests: 5/5 passed')
