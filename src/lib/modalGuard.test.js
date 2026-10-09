// Plain Node test runner — no framework, no new dependency.
// Run with: node src/lib/modalGuard.test.js
import assert from 'node:assert'
import { markModalClosed, justClosedModal, resetModalGuard, MODAL_CLOSE_GUARD_MS } from './modalGuard.js'

let passed = 0
let failed = 0
function test(name, fn) {
  try {
    fn()
    console.log(`  PASS  ${name}`)
    passed++
  } catch (err) {
    console.log(`  FAIL  ${name}`)
    console.log(`        ${err.message}`)
    failed++
  }
}

console.log('modalGuard tests\n')

test('nothing has closed yet: a tap is allowed', () => {
  resetModalGuard()
  assert.strictEqual(justClosedModal(1000), false)
})

test('a tap right after a dialog closes is ignored', () => {
  resetModalGuard()
  markModalClosed(1000)
  assert.strictEqual(justClosedModal(1000), true)
  assert.strictEqual(justClosedModal(1000 + MODAL_CLOSE_GUARD_MS - 1), true)
})

test('a tap after the short window is allowed again', () => {
  resetModalGuard()
  markModalClosed(1000)
  assert.strictEqual(justClosedModal(1000 + MODAL_CLOSE_GUARD_MS), false)
  assert.strictEqual(justClosedModal(5000), false)
})

test('the window is short: under half a second', () => {
  assert.ok(MODAL_CLOSE_GUARD_MS <= 500)
})

console.log(`\n${passed} passed, ${failed} failed`)
if (failed > 0) process.exit(1)
