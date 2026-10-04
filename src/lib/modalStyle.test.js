// Guard for the two dialog bugs found on 4 Oct 2026 (measured on the live site):
//  1. A dialog placed inside a page wrapper with `space-y-*` got a 24px/40px top
//     margin (the wrapper's rule is more specific than `.m-0`), so the overlay
//     started below the top of the screen and left an undimmed strip.
//  2. A <dialog> sets its own black text color, so in dark mode titles, labels
//     and typed input values were black on a dark panel.
// Both are fixed once, in the shared Modal. This test reads that file so the fix
// can't be quietly undone.
import assert from 'node:assert'
import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'

let passed = 0, failed = 0
function test(name, fn) {
  try { fn(); passed++; console.log(`  PASS  ${name}`) }
  catch (err) { failed++; console.log(`  FAIL  ${name}\n        ${err.message}`) }
}

const src = readFileSync(fileURLToPath(new URL('../components/ui/Modal.jsx', import.meta.url)), 'utf8')
const code = src.replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '')
const baseReset = code.match(/const BASE_RESET = '([^']*)'/)?.[1]
const darkText = code.match(/const DARK_MODE_TEXT = '([^']*)'/)?.[1]

console.log('modalStyle tests\n')

test('the margin reset is !important, so a parent space-y-* can never push the dialog down', () => {
  assert.ok(baseReset, 'BASE_RESET not found')
  assert.ok(baseReset.split(/\s+/).includes('!m-0'), `BASE_RESET is "${baseReset}"`)
})

test('dark mode gets light text and a dark color-scheme (readable titles, labels and typed input)', () => {
  assert.ok(darkText, 'DARK_MODE_TEXT not found')
  const parts = darkText.split(/\s+/)
  assert.ok(parts.includes('dark:text-offwhite'))
  assert.ok(parts.includes('dark:[color-scheme:dark]'))
})

test('both constants are actually applied to the <dialog> className', () => {
  assert.ok(/\$\{BASE_RESET\}/.test(code) && /\$\{DARK_MODE_TEXT\}/.test(code))
})

test('light mode is left alone: no light-mode text color is forced on dialogs', () => {
  assert.ok(!/(^|\s)text-ink(\s|$)/.test(darkText))
})

console.log(`\n${passed} passed, ${failed} failed`)
if (failed > 0) process.exit(1)
