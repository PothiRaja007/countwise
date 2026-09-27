// Parses a user-typed amount string into a real number, tolerating the
// formatting a person actually types or a field displays back to them —
// comma-grouped digits (Indian-style: 9,49,608) and an optional leading
// ₹ symbol. Number() alone cannot parse either of these and silently
// returns NaN, which is the root cause of the CTC Explorer save bug this
// file fixes.
//
// Returns a finite number, or null if the input genuinely can't be
// parsed as an amount — never NaN, never a guess.
export function parseAmountInput(text) {
  if (typeof text !== 'string') return null

  const cleaned = text.trim().replace(/^₹\s*/, '').replace(/,/g, '')
  if (cleaned.length === 0) return null

  const value = Number(cleaned)
  return Number.isFinite(value) ? value : null
}
