// Phase 37 — Goal / Savings Opportunity Intelligence.
//
// Pure, deterministic. Composes EXISTING engine functions rather than
// re-summing anything: goalProgress() and suggestedMonthlyPace() are
// reused unchanged from financialEngine.js/goalEngine.js; netCashFlow()
// is reused unchanged too. This file's only new contribution is the
// "recent observed pace" calculation and the comparison between the
// pieces — not a new way of summing money.
//
// Per the roadmap's own instruction for this phase: "Any projected
// result must remain clearly identified as a scenario/estimate rather
// than a guarantee." Concretely, every value below belongs to one of
// three buckets, and the UI that renders this must keep them visually
// distinct (same discipline as Financial Assist's Observed/Pattern/
// Scenario/Potential split):
//
//   OBSERVED   — a fact already true in the data: currentProgress,
//                recentMonthlyPace, avgMonthlyNetCashFlow.
//   SCENARIO   — "if the recent pace continues" arithmetic:
//                projectedCompletionDate. Explicitly conditional, and
//                null whenever that condition (a positive recent pace)
//                doesn't hold — never guessed to fill the gap.
//   POTENTIAL  — a plain side-by-side fact, never a suggestion: the gap
//                between avgMonthlyNetCashFlow and recentMonthlyPace is
//                returned as a NUMBER (surplusGap), with no "you should"
//                framing anywhere in this file. Wording that turns it
//                into advice belongs nowhere in this codebase, per the
//                forbidden-phrase rule already enforced for Financial
//                Assist (see assistCopy.js's FORBIDDEN_PHRASES).
//
// Stated limitation, not hidden: the look-back window is a fixed
// WINDOW_MONTHS, not adapted to how long the goal has actually existed.
// A goal created two weeks ago will show a thin, noisy recent pace over
// that same fixed window — the number is still honestly computed from
// real data, just from less of it.

import { goalProgress, netCashFlow } from './financialEngine.js'
import { suggestedMonthlyPace } from './goalEngine.js'

export const WINDOW_MONTHS = 3
const MS_PER_MONTH = 1000 * 60 * 60 * 24 * 30.44 // same average-month constant goalEngine.js already uses

function toISODateLocal(date) {
  const y = date.getFullYear()
  const m = String(date.getMonth() + 1).padStart(2, '0')
  const d = String(date.getDate()).padStart(2, '0')
  return `${y}-${m}-${d}`
}

function monthsAgoISO(today, months) {
  const d = new Date(today.getFullYear(), today.getMonth() - months, today.getDate())
  return toISODateLocal(d)
}

function addMonthsISO(today, months) {
  // months may be fractional (e.g. 4.2 months) — convert via average-month
  // milliseconds rather than Date's integer-month arithmetic, so a
  // fractional projection doesn't get silently truncated to whole months.
  return toISODateLocal(new Date(today.getTime() + months * MS_PER_MONTH))
}

/**
 * @param {{
 *   goal: { id: string, target_amount: number, target_date: string|null },
 *   contributions: Array<{ goal_id: string, amount: number, type: 'contribution'|'withdrawal', contribution_date: string }>,
 *   transactions: Array<{ type: string, amount: number, transaction_date: string }>,
 *   today?: Date,
 *   windowMonths?: number,
 * }}
 */
export function goalOpportunity({ goal, contributions, transactions, today = new Date(), windowMonths = WINDOW_MONTHS }) {
  const todayISO = toISODateLocal(today)
  const windowStart = monthsAgoISO(today, windowMonths)

  const currentProgress = goalProgress(contributions, goal.id)
  const remaining = Math.max(goal.target_amount - currentProgress, 0)
  const requiredMonthlyPace = suggestedMonthlyPace(goal, currentProgress, today)

  // OBSERVED: this goal's own actual contribution activity in the window.
  const recentNet = contributions
    .filter((c) => c.goal_id === goal.id && c.contribution_date >= windowStart && c.contribution_date <= todayISO)
    .reduce((sum, c) => (c.type === 'contribution' ? sum + c.amount : sum - c.amount), 0)
  const recentMonthlyPace = recentNet / windowMonths

  // OBSERVED: overall net cash flow in the same window — reused, not re-summed.
  const avgMonthlyNetCashFlow = netCashFlow(transactions, windowStart, todayISO) / windowMonths

  // SCENARIO: only when the recent pace is actually positive — a flat or
  // negative recent pace never reaches the goal, so no date is projected
  // (not "very far in the future", just null: nothing to show here).
  let projectedCompletionDate = null
  if (remaining === 0) projectedCompletionDate = todayISO
  else if (recentMonthlyPace > 0) projectedCompletionDate = addMonthsISO(today, remaining / recentMonthlyPace)

  // "On track" only has meaning when there's a required pace to compare
  // against (a goal needs a target_date for that) — null otherwise, not
  // guessed into true or false.
  const onTrack = requiredMonthlyPace === null ? null : requiredMonthlyPace <= 0 ? true : recentMonthlyPace >= requiredMonthlyPace

  // POTENTIAL: a plain fact, not a suggestion — how much of the window's
  // net cash flow went toward this goal's recent pace, vs not.
  const surplusGap = avgMonthlyNetCashFlow - recentMonthlyPace

  return {
    windowMonths,
    currentProgress,
    remaining,
    requiredMonthlyPace,
    recentMonthlyPace,
    avgMonthlyNetCashFlow,
    projectedCompletionDate,
    onTrack,
    surplusGap,
  }
}
