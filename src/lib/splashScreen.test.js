// Guard for the phone startup splash (index.html). It is plain HTML/CSS/JS in
// the page shell, so this test reads index.html and checks the promises that
// matter: phones only, a real zoom-OUT (starts bigger, ends at normal size),
// smooth properties only, short, respects reduced motion, plays once per
// session, can never get stuck on screen, and matches the brand colours.
import assert from 'node:assert'
import { existsSync, readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'

let passed = 0, failed = 0
function test(name, fn) {
  try { fn(); passed++; console.log(`  PASS  ${name}`) }
  catch (err) { failed++; console.log(`  FAIL  ${name}\n        ${err.message}`) }
}

const root = fileURLToPath(new URL('../../', import.meta.url))
const html = readFileSync(root + 'index.html', 'utf8').replace(/\r\n/g, '\n')
const css = html.match(/<style id="cw-splash-style">([\s\S]*?)<\/style>/)?.[1] ?? ''
const script = html.match(/<script>([\s\S]*?)<\/script>/)?.[1] ?? ''
const ms = (v) => Number(v)

console.log('splashScreen tests\n')

test('the splash exists, is hidden from screen readers, and comes before the app root', () => {
  const i = html.indexOf('id="cw-splash"')
  assert.ok(i > 0, 'splash element missing')
  assert.ok(/id="cw-splash"[^>]*aria-hidden="true"/.test(html), 'must be aria-hidden')
  assert.ok(i < html.indexOf('id="root"'), 'splash should come before #root')
})

test('it is hidden by default and only shown inside the phone media query (max-width: 767px)', () => {
  assert.ok(/#cw-splash\s*\{\s*display:\s*none;\s*\}/.test(css), 'no default display:none')
  const phoneBlock = css.match(/@media \(max-width: 767px\) \{([\s\S]*?)\n      \}\n/)?.[1] ?? ''
  assert.ok(/display:\s*flex/.test(phoneBlock), 'display:flex should only be inside the phone query')
})

test('the logo ZOOMS OUT: it starts bigger than normal and ends at normal size', () => {
  const k = css.match(/@keyframes cw-logo-zoom\s*\{([^]*?)\}\s*\n/)?.[1] ?? ''
  const from = Number(k.match(/from\s*\{\s*transform:\s*scale\(([\d.]+)\)/)?.[1])
  const to = Number(k.match(/to\s*\{\s*transform:\s*scale\(([\d.]+)\)/)?.[1])
  assert.ok(from > 1, `starts at scale(${from})`)
  assert.strictEqual(to, 1)
})

test('only transform and opacity are animated (smooth on cheap phones; nothing that forces layout)', () => {
  const frames = [...css.matchAll(/@keyframes [\w-]+\s*\{([^]*?)\}\s*\n/g)].map((m) => m[1]).join(' ')
  const props = [...frames.matchAll(/([a-z-]+)\s*:/g)].map((m) => m[1])
  for (const p of props) assert.ok(['transform', 'opacity', 'visibility'].includes(p), `animates "${p}"`)
})

test('the whole thing is short: zoom under 1.2s, and it has fully faded out within 1.8s', () => {
  const zoom = ms(css.match(/cw-logo-zoom (\d+)ms/)?.[1])
  const out = css.match(/animation:\s*cw-splash-out (\d+)ms [\w-]+ (\d+)ms forwards;\n\s*\}\n\s*#cw-splash img/)
  assert.ok(zoom > 0 && zoom <= 1200, `zoom ${zoom}ms`)
  assert.ok(out, 'fade-out timing not found')
  assert.ok(ms(out[1]) + ms(out[2]) <= 1800, `ends at ${ms(out[1]) + ms(out[2])}ms`)
})

test('the fade-out ends hidden (so it can never block taps), and the zoom has an easing curve', () => {
  assert.ok(/@keyframes cw-splash-out\s*\{\s*to\s*\{\s*opacity:\s*0;\s*visibility:\s*hidden;/.test(css))
  assert.ok(/cw-logo-zoom \d+ms cubic-bezier\(/.test(css), 'zoom should use a cubic-bezier easing')
})

test('reduced motion removes the zoom (only a short fade remains)', () => {
  const block = css.match(/@media \(prefers-reduced-motion: reduce\) \{([\s\S]*?)\n      \}\n/)?.[1] ?? ''
  assert.ok(block.length > 0, 'no reduced-motion block')
  assert.ok(!block.includes('cw-logo-zoom'), 'zoom must not play under reduced motion')
  assert.ok(block.includes('cw-logo-fade'))
})

test('colours match the brand: light #F7F5F0, dark #15171B (dark follows the phone setting)', () => {
  assert.ok(/background:\s*#F7F5F0;/.test(css))
  assert.ok(/prefers-color-scheme: dark\)\s*\{\s*#cw-splash\s*\{\s*background:\s*#15171B;/.test(css))
})

test('it plays once per session, removes itself when finished, and has a timer safety net', () => {
  assert.ok(script.includes("sessionStorage.getItem('cw-splash-seen')"))
  assert.ok(script.includes("sessionStorage.setItem('cw-splash-seen'"))
  assert.ok(/addEventListener\('animationend'/.test(script) && script.includes('el.remove()'))
  const t = Number(script.match(/setTimeout\([\s\S]*?,\s*(\d+)\)/)?.[1])
  assert.ok(t > 0 && t <= 4000, `safety timer ${t}ms`)
})

test('blocked storage cannot break it (the storage code is inside try/catch)', () => {
  assert.ok(/try\s*\{[\s\S]*sessionStorage[\s\S]*\}\s*catch/.test(script))
})

test('it uses the real logo file, which exists, and does not depend on the app or any web font', () => {
  assert.ok(html.includes('<img src="/logo-icon.png"'))
  assert.ok(existsSync(root + 'public/logo-icon.png'))
  assert.ok(!/font-family/.test(css), 'splash must not rely on a web font that loads later')
})

console.log(`\n${passed} passed, ${failed} failed`)
if (failed > 0) process.exit(1)
