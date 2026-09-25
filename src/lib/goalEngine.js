// Pure calculation functions for the Goals feature — no Supabase calls,
// no side effects. Same pattern as financialEngine.js: takes plain data in,
// returns plain data out, fully unit-testable in isolation.
//
// Expected shapes:
//   goal: { id, target_amount, target_date (nullable), status, updated_at }
//   currentProgress: number — the output of financialEngine.js's goalProgress()

/**
 * Suggested ₹/month figure to hit a goal's target by its target_date,
 * based on however much progress has already been made.
 *
 * Returns null when there's no target_date to pace against — there is
 * nothing to suggest a monthly figure toward without a deadline.
 *
 * This function only returns a number (or null). It makes no promise
 * about whether the goal will actually be reached — any "no guarantee"
 * language belongs in the UI copy that displays this number, not here.
 */
export function suggestedMonthlyPace(goal, currentProgress, today = new Date()) {
  if (!goal.target_date) return null

  const remaining = goal.target_amount - currentProgress
  if (remaining <= 0) return 0

  const target = new Date(goal.target_date)
  const msRemaining = target.getTime() - today.getTime()

  // Target date already passed — no forward-looking monthly figure makes sense.
  if (msRemaining <= 0) return null

  const msPerMonth = 1000 * 60 * 60 * 24 * 30.44 // average month length
  const monthsRemaining = msRemaining / msPerMonth

  // Less than a month left: treat as "one final month" rather than dividing
  // by a fractional month and producing an inflated number.
  const divisor = Math.max(monthsRemaining, 1)

  return remaining / divisor
}

/**
 * Display status for a goal: 'active', 'completed', 'archived', or 'overdue'.
 *
 * - 'archived' and 'completed' are read straight from the stored status —
 *   once a goal is archived or completed, that's authoritative.
 * - An active goal whose target_date has passed becomes 'overdue' for
 *   display purposes, even though its stored status is still 'active'.
 * - Per spec §36, "overdue" must never be rendered as "failed" in the UI —
 *   that wording lives wherever this label is displayed, not here.
 */
export function goalStatusLabel(goal, today = new Date()) {
  if (goal.status === 'archived') return 'archived'
  if (goal.status === 'completed') return 'completed'

  if (goal.target_date) {
    const target = new Date(goal.target_date)
    if (target.getTime() < today.getTime()) return 'overdue'
  }

  return 'active'
}

/**
 * Progress percentage toward a goal's target, capped at 100 per §34
 * ("if over target, show 100% complete" not 110%).
 *
 * Returns { percent, overage } so the UI can optionally surface how much
 * over target the goal is (e.g. "₹1,000 over target") without the capped
 * percent losing that information.
 */
export function progressPercent(currentProgress, targetAmount) {
  if (!targetAmount || targetAmount <= 0) {
    return { percent: 0, overage: 0 }
  }

  const rawPercent = (currentProgress / targetAmount) * 100
  const overage = currentProgress > targetAmount ? currentProgress - targetAmount : 0

  return {
    percent: Math.min(100, Math.max(0, rawPercent)),
    overage,
  }
}
