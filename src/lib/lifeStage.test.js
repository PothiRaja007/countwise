// Plain Node test runner — no framework, no new dependency.
// Run with: node src/lib/lifeStage.test.js
import assert from 'node:assert'
import { shouldShowWorkSection, needsEmployeeSubtypePrompt, isValidEmployeeSubtype } from './lifeStage.js'

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

console.log('lifeStage tests\n')

// ---- shouldShowWorkSection ----
test('shouldShowWorkSection: student -> false', () => {
  assert.strictEqual(shouldShowWorkSection('student'), false)
})

test('shouldShowWorkSection: employed -> true', () => {
  assert.strictEqual(shouldShowWorkSection('employed'), true)
})

test('shouldShowWorkSection: mixed -> true', () => {
  assert.strictEqual(shouldShowWorkSection('mixed'), true)
})

test('shouldShowWorkSection: null -> false, not a throw', () => {
  assert.strictEqual(shouldShowWorkSection(null), false)
})

test('shouldShowWorkSection: undefined -> false, not a throw', () => {
  assert.strictEqual(shouldShowWorkSection(undefined), false)
})

test('shouldShowWorkSection: an unexpected value like "freelancer" -> false (never guess-allow unknown values)', () => {
  assert.strictEqual(shouldShowWorkSection('freelancer'), false)
})

// ---- needsEmployeeSubtypePrompt ----
test('needsEmployeeSubtypePrompt: (employed, null) -> true', () => {
  assert.strictEqual(needsEmployeeSubtypePrompt('employed', null), true)
})

test('needsEmployeeSubtypePrompt: (employed, undefined) -> true', () => {
  assert.strictEqual(needsEmployeeSubtypePrompt('employed', undefined), true)
})

test('needsEmployeeSubtypePrompt: (employed, "fresher") -> false', () => {
  assert.strictEqual(needsEmployeeSubtypePrompt('employed', 'fresher'), false)
})

test('needsEmployeeSubtypePrompt: (employed, "already_working") -> false', () => {
  assert.strictEqual(needsEmployeeSubtypePrompt('employed', 'already_working'), false)
})

test('needsEmployeeSubtypePrompt: (mixed, null) -> false — the LOCKED rule, do not "fix" this later', () => {
  assert.strictEqual(needsEmployeeSubtypePrompt('mixed', null), false)
})

test('needsEmployeeSubtypePrompt: (student, null) -> false', () => {
  assert.strictEqual(needsEmployeeSubtypePrompt('student', null), false)
})

// ---- isValidEmployeeSubtype ----
test('isValidEmployeeSubtype: "fresher" -> true', () => {
  assert.strictEqual(isValidEmployeeSubtype('fresher'), true)
})

test('isValidEmployeeSubtype: "already_working" -> true', () => {
  assert.strictEqual(isValidEmployeeSubtype('already_working'), true)
})

test('isValidEmployeeSubtype: "freelancer" -> false', () => {
  assert.strictEqual(isValidEmployeeSubtype('freelancer'), false)
})

test('isValidEmployeeSubtype: null -> false', () => {
  assert.strictEqual(isValidEmployeeSubtype(null), false)
})

test('isValidEmployeeSubtype: "" -> false', () => {
  assert.strictEqual(isValidEmployeeSubtype(''), false)
})

console.log(`\n${passed} passed, ${failed} failed`)
if (failed > 0) process.exit(1)
