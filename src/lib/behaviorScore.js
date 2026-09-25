// Live Behavior Score calculation — no Supabase calls, no side effects.
// The score is derived from the user's real transactions and goal
// contributions for the selected period. It is intentionally non-judgmental:
// flags describe patterns, not personal qualities.

function toNumber(value) {
  const number = Number(value)
  return Number.isFinite(number) ? number : 0
}

function dateOnly(value) {
  if (value instanceof Date) {
    return new Date(value.getFullYear(), value.getMonth(), value.getDate())
  }

  const text = String(value || '')
  const match = text.match(/^(\d{4})-(\d{2})-(\d{2})/)
  if (match) return new Date(Number(match[1]), Number(match[2]) - 1, Number(match[3]))

  const parsed = new Date(value)
  return new Date(parsed.getFullYear(), parsed.getMonth(), parsed.getDate())
}

function isInPeriod(value, periodStart, periodEnd) {
  const date = dateOnly(value)
  const start = dateOnly(periodStart)
  const end = dateOnly(periodEnd)
  return date >= start && date <= end
}

function roundToOne(value) {
  return Number(value.toFixed(1))
}

/**
 * Compute the unified Behavior Score for a period.
 *
 * Expected transaction shape:
 *   { type: 'income'|'expense'|'transfer', amount, transaction_date }
 *
 * Expected goal contribution shape:
 *   { type: 'contribution'|'withdrawal', amount, contribution_date, goal_id }
 *
 * Expected goal shape:
 *   { id, status }
 *
 * @returns {{ stars: number, flags: Array, stats: Object, sufficientData: boolean }}
 */
export function computeBehaviorScore({
  transactions = [],
  goals = [],
  goalContributions = [],
  periodStart,
  periodEnd,
}) {
  const periodTransactions = transactions.filter((t) => isInPeriod(t.transaction_date, periodStart, periodEnd))
  const income = periodTransactions
    .filter((t) => t.type === 'income')
    .reduce((sum, t) => sum + toNumber(t.amount), 0)
  const expense = periodTransactions
    .filter((t) => t.type === 'expense')
    .reduce((sum, t) => sum + toNumber(t.amount), 0)

  const activeGoals = goals.filter((goal) => goal.status === 'active')
  const periodContributions = goalContributions.filter((c) =>
    isInPeriod(c.contribution_date, periodStart, periodEnd)
  )
  const positiveGoalContributions = periodContributions
    .filter((c) => c.type === 'contribution')
    .reduce((sum, c) => sum + toNumber(c.amount), 0)

  const flags = []

  // Flag 1: early-period burn — more than 35% of period income spent
  // during the first three calendar days of the selected period.
  const start = dateOnly(periodStart)
  const day3Cutoff = new Date(start)
  day3Cutoff.setDate(day3Cutoff.getDate() + 3)

  const earlySpend = periodTransactions
    .filter((t) => {
      if (t.type !== 'expense') return false
      const date = dateOnly(t.transaction_date)
      return date >= start && date < day3Cutoff
    })
    .reduce((sum, t) => sum + toNumber(t.amount), 0)

  if (income > 0 && earlySpend / income > 0.35) {
    const pct = Math.round((earlySpend / income) * 100)
    flags.push({
      flag_type: 'early_period_burn',
      description: `${pct}% of income was spent in the first 3 days`,
      severity: pct > 55 ? 3 : 2,
    })
  }

  // Flag 2: expenses exceeded income during the selected period.
  if (expense > income && income > 0) {
    flags.push({
      flag_type: 'overspend',
      description: 'Expenses were higher than income for this period',
      severity: 3,
    })
  }

  // Flag 3: the user has active goals but made no contribution during
  // the selected period. Withdrawals alone do not count as contributions.
  if (activeGoals.length > 0 && positiveGoalContributions === 0) {
    flags.push({
      flag_type: 'no_savings_contribution',
      description: 'No contribution was made to an active savings goal this period',
      severity: 1,
    })
  }

  // Keep the original simple weighted model: start at 5, apply small
  // penalties, and never let the displayed score fall below 1 star.
  const penalty = flags.reduce((sum, flag) => sum + flag.severity, 0) * 0.4
  const stars = Math.max(1, Math.min(5, roundToOne(5 - penalty)))

  const sufficientData = periodTransactions.length > 0 || periodContributions.length > 0 || goals.length > 0

  return {
    stars,
    flags,
    sufficientData,
    stats: {
      income,
      expense,
      netCashFlow: income - expense,
      earlySpend,
      goalContributions: positiveGoalContributions,
      activeGoalCount: activeGoals.length,
      transactionCount: periodTransactions.length,
    },
  }
}
