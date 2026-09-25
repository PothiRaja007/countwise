// Pure function — no Supabase, no DOM. This only validates client-side
// before submission; it never changes what actually gets sent to
// supabase.auth.signUp()/updateUser(), which stay exactly as they were.

// Exported so the UI checklist can iterate over every rule (to show both
// met and unmet items) using the exact same label strings validatePassword()
// puts in its failures list — one source of truth, not two copies of the
// same five strings that could drift apart.
export const PASSWORD_RULE_LABELS = [
  'At least 8 characters',
  'At least one capital letter',
  'At least one lowercase letter',
  'At least one number',
  'At least one symbol',
]

/**
 * @param {string} password
 * @returns {{ valid: boolean, failures: string[] }} failures lists only
 *   the unmet rules, in the same order as PASSWORD_RULE_LABELS — an empty
 *   or missing password fails every rule rather than throwing.
 */
export function validatePassword(password) {
  const pwd = password || ''
  const failures = []

  if (pwd.length < 8) failures.push(PASSWORD_RULE_LABELS[0])
  if (!/[A-Z]/.test(pwd)) failures.push(PASSWORD_RULE_LABELS[1])
  if (!/[a-z]/.test(pwd)) failures.push(PASSWORD_RULE_LABELS[2])
  if (!/[0-9]/.test(pwd)) failures.push(PASSWORD_RULE_LABELS[3])
  if (!/[^A-Za-z0-9]/.test(pwd)) failures.push(PASSWORD_RULE_LABELS[4])

  return { valid: failures.length === 0, failures }
}
