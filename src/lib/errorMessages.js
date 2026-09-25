// Pure function — no Supabase calls, no DOM access beyond an optional
// navigator.onLine check. Translates a caught error into plain-language
// text safe to render. The raw error is always logged to console for
// debugging; friendlyError() itself never returns or exposes it.
//
// This is the one place every page's load/save error handling should call
// into, so tone stays consistent across the app and no page can regress
// back to showing raw backend text later. Recognizes a small set of common
// patterns (offline/network failure, RLS/permission denial, "not found");
// anything else falls back to the caller-supplied (or default) message.

const NETWORK_PATTERNS = [/failed to fetch/i, /network\s*error/i, /networkerror/i, /fetch failed/i]

const PERMISSION_CODES = ['42501', 'PGRST301']
const PERMISSION_PATTERNS = [/permission denied/i, /row-level security/i, /\brls\b/i, /not authorized/i, /\bjwt\b/i]

const NOT_FOUND_CODES = ['PGRST116']
const NOT_FOUND_PATTERNS = [/not found/i, /no rows? (were |was )?(found|returned)/i]

/**
 * @param {unknown} error - whatever was caught (a Supabase error object,
 *   a thrown Error, or anything else)
 * @param {string} [fallback] - shown when the error doesn't match any
 *   recognized pattern; callers pass a page-appropriate default
 * @returns {string} plain-language text, never the raw error message
 */
export function friendlyError(error, fallback = 'Something went wrong. Please try again.') {
  // eslint-disable-next-line no-console
  console.error(error)

  const message = (error && error.message) || ''
  const code = error && error.code

  if (typeof navigator !== 'undefined' && navigator.onLine === false) {
    return "You're offline. Check your connection and try again."
  }
  if (NETWORK_PATTERNS.some((p) => p.test(message))) {
    return "Couldn't connect. Check your connection and try again."
  }
  if (PERMISSION_CODES.includes(code) || PERMISSION_PATTERNS.some((p) => p.test(message))) {
    return "You don't have permission to do that."
  }
  if (NOT_FOUND_CODES.includes(code) || NOT_FOUND_PATTERNS.some((p) => p.test(message))) {
    return "That couldn't be found. It may have been removed."
  }

  return fallback
}
