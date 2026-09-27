// Plain Node test runner — no framework, no new dependency.
// Run with: node src/lib/explainCTC.test.js
//
// Same rationale as explainPF.test.js: buildCTCExplanationPrompt() is
// mostly a template string, but the safety-critical part is verifying
// every given figure appears in the prompt verbatim, and that the "do not
// introduce any numbers other than the ones given" safeguard sentence is
// always present.
import assert from 'node:assert'
import { buildCTCExplanationPrompt, CTC_EXPLANATION_SCHEMA } from './explainCTC.js'

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

console.log('explainCTC tests\n')

const baseParams = {
  categoryBreakdown: [
    { label: 'Basic', formattedAmount: '₹6,00,000.00' },
    { label: 'HRA', formattedAmount: '₹2,40,000.00' },
    { label: 'Special Allowance', formattedAmount: '₹1,20,000.00' },
  ],
  formattedGrossAnnual: '₹9,60,000.00',
  grossAssumption:
    'Excludes employer PF and gratuity — these are employer-side contributions, not part of what typically reaches you as gross pay. This is a stated CountWise simplifying assumption, not a statutory rule.',
  formattedMonthlyTakeHome: '₹80,000.00',
  takeHomeAssumptions: [
    'Excludes employer PF and gratuity.',
    "Does not account for income tax or your own PF contribution — those require verified statutory rules, and are not modeled here.",
    'This is a rough approximation of what reaches you before statutory deductions, not a guaranteed take-home figure.',
  ],
}

test('embeds every category label and formatted amount verbatim', () => {
  const prompt = buildCTCExplanationPrompt(baseParams)
  assert.ok(prompt.includes('Basic: ₹6,00,000.00'))
  assert.ok(prompt.includes('HRA: ₹2,40,000.00'))
  assert.ok(prompt.includes('Special Allowance: ₹1,20,000.00'))
})

test('embeds the formatted gross annual and its stated assumption verbatim', () => {
  const prompt = buildCTCExplanationPrompt(baseParams)
  assert.ok(prompt.includes('₹9,60,000.00'))
  assert.ok(prompt.includes(baseParams.grossAssumption))
})

test('embeds the formatted monthly take-home and all its assumptions verbatim', () => {
  const prompt = buildCTCExplanationPrompt(baseParams)
  assert.ok(prompt.includes('₹80,000.00'))
  for (const assumption of baseParams.takeHomeAssumptions) {
    assert.ok(prompt.includes(assumption), `expected prompt to include: ${assumption}`)
  }
})

test('always includes the anti-hallucination safeguard sentence', () => {
  const prompt = buildCTCExplanationPrompt(baseParams)
  assert.ok(prompt.includes('Do not introduce any numbers other than the ones given above'))
})

test('an empty category breakdown does not crash and produces a sensible prompt', () => {
  const prompt = buildCTCExplanationPrompt({ ...baseParams, categoryBreakdown: [] })
  assert.ok(typeof prompt === 'string' && prompt.length > 0)
  assert.ok(prompt.includes('Do not introduce any numbers other than the ones given above'))
})

test('schema requires exactly one string field, explanation, nothing else', () => {
  assert.deepStrictEqual(CTC_EXPLANATION_SCHEMA, {
    type: 'object',
    properties: { explanation: { type: 'string' } },
    required: ['explanation'],
    additionalProperties: false,
  })
})

console.log(`\n${passed} passed, ${failed} failed`)
if (failed > 0) process.exit(1)
