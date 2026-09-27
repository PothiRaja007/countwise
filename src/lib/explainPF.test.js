// Plain Node test runner — no framework, no new dependency.
// Run with: node src/lib/explainPF.test.js
//
// buildPFExplanationPrompt() is mostly a template string, but the one
// thing worth actually verifying is the safety-critical part: every
// given figure appears in the prompt verbatim, and the "do not introduce
// any numbers other than the ones given" safeguard sentence is always
// present. That sentence is the entire defense against Gemini inventing
// or restating a number incorrectly, so a silent regression there would
// be a real, not merely cosmetic, bug.
import assert from 'node:assert'
import { buildPFExplanationPrompt, PF_EXPLANATION_SCHEMA } from './explainPF.js'

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

console.log('explainPF tests\n')

test('embeds the label, formatted amount, and rate verbatim', () => {
  const prompt = buildPFExplanationPrompt({
    label: 'Employee PF',
    formattedAmount: '₹2,400.00',
    rateUsed: 12,
    effectiveFrom: '1 Apr 2024',
    effectiveTo: null,
    sourceLabel: 'https://www.epfindia.gov.in',
  })
  assert.ok(prompt.includes('Employee PF'))
  assert.ok(prompt.includes('₹2,400.00'))
  assert.ok(prompt.includes('12%'))
})

test('always includes the anti-hallucination safeguard sentence', () => {
  const prompt = buildPFExplanationPrompt({
    label: 'Employer EPF',
    formattedAmount: '₹1,800.00',
    rateUsed: 3.67,
    effectiveFrom: '1 Apr 2024',
    effectiveTo: null,
    sourceLabel: 'https://www.epfindia.gov.in',
  })
  assert.ok(prompt.includes('Do not introduce any numbers other than the ones given above'))
})

test('open-ended period (no effectiveTo) reads as open-ended, not a fabricated end date', () => {
  const prompt = buildPFExplanationPrompt({
    label: 'EPS',
    formattedAmount: '₹1,250.00',
    rateUsed: 8.33,
    effectiveFrom: '1 Apr 2024',
    effectiveTo: null,
    sourceLabel: 'EPS verified rule',
  })
  assert.ok(prompt.includes('effective from 1 Apr 2024, currently open-ended'))
  assert.ok(!prompt.includes('through'))
})

test('a closed period includes both dates verbatim', () => {
  const prompt = buildPFExplanationPrompt({
    label: 'Employee PF',
    formattedAmount: '₹2,400.00',
    rateUsed: 12,
    effectiveFrom: '1 Apr 2023',
    effectiveTo: '31 Mar 2024',
    sourceLabel: 'EPF verified rule',
  })
  assert.ok(prompt.includes('effective from 1 Apr 2023 through 31 Mar 2024'))
})

test('the source label is embedded verbatim', () => {
  const prompt = buildPFExplanationPrompt({
    label: 'Employee PF',
    formattedAmount: '₹2,400.00',
    rateUsed: 12,
    effectiveFrom: '1 Apr 2024',
    effectiveTo: null,
    sourceLabel: 'https://www.epfindia.gov.in/faq',
  })
  assert.ok(prompt.includes('sourced from https://www.epfindia.gov.in/faq'))
})

test('schema requires exactly one string field, explanation, nothing else', () => {
  assert.deepStrictEqual(PF_EXPLANATION_SCHEMA, {
    type: 'object',
    properties: { explanation: { type: 'string' } },
    required: ['explanation'],
    additionalProperties: false,
  })
})

console.log(`\n${passed} passed, ${failed} failed`)
if (failed > 0) process.exit(1)
