// Phase 41 - small decisions of the first-time flow, kept in one place so they
// are easy to change and easy to test.

// true  = "Use CountWise in browser" shows the Thank You page first (current choice)
// false = it goes straight into the app
export const BROWSER_SHOWS_THANK_YOU = true

// What is recorded in user_access. 'pwa' only when the install was really
// accepted (or the app is already running installed). The iPhone "Add to Home
// Screen" path cannot be verified, so it is recorded as 'browser'.
export function methodFromVia(via) {
  return via === 'pwa' || via === 'installed' ? 'pwa' : 'browser'
}

export const KNOWN_VIA = ['pwa', 'installed', 'ios', 'browser']
export function cleanVia(via) {
  return KNOWN_VIA.includes(via) ? via : 'browser'
}
