// Spending Context (Phase 32) — the shared vocabulary.
//
// An optional label on an EXPENSE saying why it was spent, from a closed
// set. A tag, not a journal: no free text. It records context only; it
// never changes a balance, an income figure or an expense total.
//
// Single source of truth for the UI (edit form, row tag) and the engine.
// The database enforces the same list with a CHECK constraint
// (supabase/phase32_1_spending_context.sql); spendingContext.test.js
// fails if the two ever drift apart, because a mismatch would otherwise
// only surface as a runtime error on save.
//
// Wording is descriptive, never judgmental — "Unplanned", not "impulse" or
// "craving" — matching the tone rules Financial Assist already follows.

export const SPENDING_CONTEXTS = [
  { value: 'planned', label: 'Planned', description: 'You meant to buy it: on a list, budgeted, or a known need.' },
  { value: 'routine', label: 'Routine', description: 'Regular or habitual: a commute, subscriptions, a daily coffee.' },
  { value: 'social', label: 'Social', description: 'Spent because of, or together with, other people.' },
  { value: 'unplanned', label: 'Unplanned', description: 'A spur-of-the-moment purchase.' },
]

export const SPENDING_CONTEXT_VALUES = SPENDING_CONTEXTS.map((c) => c.value)

export function isValidContext(value) {
  return SPENDING_CONTEXT_VALUES.includes(value)
}

export function contextLabel(value) {
  return SPENDING_CONTEXTS.find((c) => c.value === value)?.label ?? null
}

export function contextDescription(value) {
  return SPENDING_CONTEXTS.find((c) => c.value === value)?.description ?? null
}

/**
 * The value to WRITE to the database for a transaction of `type`.
 *
 * Two database rules make this function necessary rather than a nicety
 * (both confirmed against a real Postgres):
 *   - context is allowed ONLY on an expense, so editing an expense into
 *     income or a transfer must send null or the whole save is rejected;
 *   - an empty string is not null and is rejected too, so "no context"
 *     must always be sent as null, never "".
 * Anything not in the allowed set is dropped to null rather than sent.
 */
export function contextForType(type, value) {
  return type === 'expense' && isValidContext(value) ? value : null
}
