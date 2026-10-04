// Plain Node test runner - no framework, no new dependency.
// Run with: node src/lib/platforms.test.js
import assert from 'node:assert'
import { PLATFORMS, getNativeDownload, detectOS } from './platforms.js'
import { methodFromVia, cleanVia } from './accessFlow.js'

// --- No platform may offer a download unless it is REAL --------------------
for (const p of PLATFORMS) {
  const dl = getNativeDownload(p)
  if (p.native.available) {
    assert.ok(dl, `${p.id} is marked available but has no valid https url + version`)
  } else {
    assert.strictEqual(dl, null, `${p.id} is unavailable so it must not expose a download`)
    assert.strictEqual(p.native.url, undefined, `${p.id} is unavailable but has a url`)
  }
}

// Guard cases: half-filled entries must NOT produce a link
assert.strictEqual(getNativeDownload({ native: { available: true } }), null)
assert.strictEqual(getNativeDownload({ native: { available: true, url: 'http://x.test/a.exe', version: '1' } }), null)
assert.strictEqual(getNativeDownload({ native: { available: true, url: 'https://x.test/a.exe', version: '' } }), null)
assert.ok(getNativeDownload({ native: { available: true, url: 'https://x.test/a.exe', version: '1.0.0' } }))
assert.strictEqual(getNativeDownload(undefined), null)

// Ids are unique
assert.strictEqual(new Set(PLATFORMS.map((p) => p.id)).size, PLATFORMS.length)

// --- OS detection -----------------------------------------------------------
assert.strictEqual(detectOS({ userAgent: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) Chrome/120' }), 'windows')
assert.strictEqual(detectOS({ userAgent: 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) Safari/605' , maxTouchPoints: 0 }), 'macos')
assert.strictEqual(detectOS({ userAgent: 'Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) Safari' }), 'ios')
assert.strictEqual(detectOS({ userAgent: 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) Safari', maxTouchPoints: 5 }), 'ios') // iPadOS
assert.strictEqual(detectOS({ userAgent: 'Mozilla/5.0 (Linux; Android 14; Pixel 8) Chrome/120 Mobile' }), 'android') // before linux
assert.strictEqual(detectOS({ userAgent: 'Mozilla/5.0 (X11; Linux x86_64) Chrome/120' }), 'linux')
assert.strictEqual(detectOS({}), 'other')

// --- What gets recorded -----------------------------------------------------
assert.strictEqual(methodFromVia('pwa'), 'pwa')
assert.strictEqual(methodFromVia('installed'), 'pwa')
assert.strictEqual(methodFromVia('ios'), 'browser') // cannot be verified, so not claimed
assert.strictEqual(methodFromVia('browser'), 'browser')
assert.strictEqual(methodFromVia('anything-else'), 'browser')
assert.strictEqual(cleanVia('hacked'), 'browser')
assert.strictEqual(cleanVia('pwa'), 'pwa')

console.log('platforms.test.js: all assertions passed')
