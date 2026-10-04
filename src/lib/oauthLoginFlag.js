// Remembers, for a few minutes, that the user just started a Google sign-in in
// this tab. Google sign-in leaves the page and comes back, so AuthContext needs
// this note to know the new session came from Google (and send the same
// "new sign-in" notification that password logins send).
const KEY = 'cw:oauth-login'
const MAX_AGE_MS = 5 * 60 * 1000

export function markOAuthLogin() {
  try { sessionStorage.setItem(KEY, String(Date.now())) } catch { /* storage unavailable */ }
}

export function clearOAuthLogin() {
  try { sessionStorage.removeItem(KEY) } catch { /* storage unavailable */ }
}

// Returns true at most ONCE per Google sign-in, then forgets the note.
export function consumeOAuthLogin() {
  try {
    const started = Number(sessionStorage.getItem(KEY))
    sessionStorage.removeItem(KEY)
    return Number.isFinite(started) && started > 0 && Date.now() - started < MAX_AGE_MS
  } catch {
    return false
  }
}
