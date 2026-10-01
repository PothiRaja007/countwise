// Phase 37 — scans the actual GoalCard.jsx source text for the Phase 37
// section's copy, checking it against the same forbidden-advice-language
// list already enforced for Financial Assist (assistCopy.js). Written
// copy is only as safe as the words actually shipped, not the intent
// behind writing it — this test checks the words.
import assert from 'node:assert'
import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { FORBIDDEN_PHRASES } from './assistCopy.js'

let passed = 0, failed = 0
function test(name, fn) {
  try { fn(); passed++; console.log(`  PASS  ${name}`) }
  catch (err) { failed++; console.log(`  FAIL  ${name}\n        ${err.message}`) }
}

const path = fileURLToPath(new URL('../components/goals/GoalCard.jsx', import.meta.url))
const source = readFileSync(path, 'utf8')
const start = source.indexOf('Phase 37')
const section = source.slice(start, start + 2500)

console.log('goalCardCopy tests\n')

test('the Phase 37 section exists and is non-trivial', () => {
  assert.ok(start >= 0, 'Phase 37 section not found in GoalCard.jsx')
  assert.ok(section.includes('Observed') && section.includes('Scenario'))
})

test('no forbidden advice/judgment phrase appears in the Phase 37 section', () => {
  const lower = section.toLowerCase()
  for (const phrase of FORBIDDEN_PHRASES) {
    assert.ok(!lower.includes(phrase.toLowerCase()), `forbidden phrase found: "${phrase}"`)
  }
})

test('the scenario line is explicitly conditional ("if this pace continues"), never stated as certain', () => {
  assert.ok(section.includes('If this pace continues'))
  assert.ok(section.includes('not a guarantee') || section.includes('estimate'))
})

console.log(`\n${passed} passed, ${failed} failed`)
if (failed > 0) process.exit(1)
