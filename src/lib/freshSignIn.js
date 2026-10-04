// Phase 41 - "just signed in" note.
//
// Login.jsx sets this when a sign-in succeeds (or when Google sign-in starts,
// since that leaves the page and comes back). App.jsx uses it to show the
// CountWise Home page ONCE right after a sign-in. It lives in sessionStorage,
// so a later reopen of the app (new tab, installed app, new browser session)
// has no note and goes straight into the app.
//
// Deliberately NOT derived from AuthContext events: those also fire on token
// refresh and tab focus, and AuthContext is left untouched on purpose.
import { useSyncExternalStore } from 'react'

const KEY = 'cw:fresh-signin'
const listeners = new Set()

function read() {
  try {
    return sessionStorage.getItem(KEY) === '1'
  } catch {
    return false // storage unavailable: behave as "not a fresh sign-in"
  }
}

function emit() {
  listeners.forEach((l) => l())
}

function subscribe(listener) {
  listeners.add(listener)
  return () => listeners.delete(listener)
}

export function markFreshSignIn() {
  try { sessionStorage.setItem(KEY, '1') } catch { /* storage unavailable */ }
  emit()
}

export function clearFreshSignIn() {
  try { sessionStorage.removeItem(KEY) } catch { /* storage unavailable */ }
  emit()
}

export function useFreshSignIn() {
  return useSyncExternalStore(subscribe, read, () => false)
}
