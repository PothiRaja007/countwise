// Pure functions for in-app inactivity reminders (Phase 20, §6.7). No
// Supabase calls here — this file only ever sees plain values/timestamps
// that the caller already fetched, same pattern as financialEngine.js.

/**
 * Days elapsed between `dateString` and `now`, as a fractional number
 * (not floored) so boundary comparisons in isReminderEligible() are exact
 * rather than off-by-a-day depending on rounding direction.
 *
 * @param {string|null} dateString - an ISO timestamp, or null
 * @param {Date} [now]
 * @returns {number|null} null when dateString is null/undefined
 */
export function daysSince(dateString, now = new Date()) {
  if (!dateString) return null
  const then = new Date(dateString).getTime()
  const current = now instanceof Date ? now.getTime() : new Date(now).getTime()
  return (current - then) / (1000 * 60 * 60 * 24)
}

/**
 * @param {{lastTransactionAt: string|null, reminderAfterDays: number, lastReminderSentAt: string|null}} params
 * @param {Date} [now]
 * @returns {boolean}
 */
export function isReminderEligible({ lastTransactionAt, reminderAfterDays, lastReminderSentAt }, now = new Date()) {
  // A brand-new user who has never logged a single transaction hasn't had
  // a chance to build a "checking in" habit yet. Flagging them as overdue
  // before they've ever used Money Inbox would shame someone on day one,
  // which is the exact opposite of this feature's gentle-nudge intent.
  // Decision: no prior activity at all => never eligible.
  if (!lastTransactionAt) return false

  const elapsed = daysSince(lastTransactionAt, now)
  if (elapsed < reminderAfterDays) return false

  // No reminder ever sent — nothing to check it against, so the threshold
  // above is the only gate.
  if (!lastReminderSentAt) return true

  const lastTransactionMs = new Date(lastTransactionAt).getTime()
  const lastReminderMs = new Date(lastReminderSentAt).getTime()

  // Eligible again only if the most recent reminder predates the most
  // recent transaction — i.e. the user came back, logged something, then
  // went quiet again ("cycle reset"). A reminder sent at or after the
  // last transaction means nothing new has happened since it was shown,
  // so it should not fire again.
  return lastReminderMs < lastTransactionMs
}
