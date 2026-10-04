// Phase 41 - the ONLY place that says which platforms are real.
//
// RULE: never show a download for something that does not exist.
//   native.available === false  ->  the page shows plain text, no button, no link.
//   A native build becomes available ONLY when this file is given a real
//   https URL AND a version (platforms.test.js enforces that).
// Today every native build is unavailable. What IS real today is installing the
// CountWise web app (PWA) from the browser, on the device you are using.

export const PLATFORMS = [
  { id: 'windows', label: 'Windows', device: 'Windows PC', native: { available: false } },
  { id: 'macos',   label: 'macOS',   device: 'Mac',        native: { available: false } },
  { id: 'linux',   label: 'Linux',   device: 'Linux computer', native: { available: false } },
  { id: 'android', label: 'Android', device: 'Android phone or tablet', native: { available: false } },
  { id: 'ios',     label: 'iPhone and iPad', device: 'iPhone or iPad', native: { available: false } },
]

// Returns a real download link, or null. Anything else must render as plain text.
export function getNativeDownload(platform) {
  const n = platform && platform.native
  if (!n || n.available !== true) return null
  if (typeof n.url !== 'string' || !n.url.startsWith('https://')) return null
  if (typeof n.version !== 'string' || n.version.trim() === '') return null
  return { url: n.url, version: n.version }
}

// Which device is the visitor on right now? (pure function so it can be tested)
export function detectOS({ userAgent = '', maxTouchPoints = 0 } = {}) {
  const ua = userAgent
  if (/iPhone|iPad|iPod/i.test(ua)) return 'ios'
  // iPadOS 13+ pretends to be a Mac but has a touch screen
  if (/Macintosh/i.test(ua) && maxTouchPoints > 1) return 'ios'
  if (/Android/i.test(ua)) return 'android'
  if (/Windows/i.test(ua)) return 'windows'
  if (/Macintosh|Mac OS X/i.test(ua)) return 'macos'
  if (/Linux|X11|CrOS/i.test(ua)) return 'linux'
  return 'other'
}
