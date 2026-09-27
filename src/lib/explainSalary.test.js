// Plain Node test runner — no framework, no new dependency.
// Run with: node src/lib/explainSalary.test.js
//
// Same rationale as explainPF.test.js/explainCTC.test.js: the
// safety-critical part is verifying every given figure appears in the
// prompt verbatim, and that the "do not introduce any numbers other than
// the ones given" safeguard sentence is always present.
import assert from 'node:assert'
import { buildSalaryExplanationPrompt, SALARY_EXPLANATION_SCHEMA } from './explainSalary.js'

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

console.log('explainSalary tests\n')

const baseParams = {
  categoryBreakdown: [
    { label: 'Basic', formattedAmount: '₹50,000.00' },
    { label: 'Allowance', formattedAmount: '₹15,000.00' },
    { label: 'Employee Deduction', formattedAmount: '₹6,000.00' },
  ],
  formattedGrossMonthly: '₹65,000.00',
  grossAssumption: 'Basic + Allowance only — based on the values you provided, not a statutory calculation.',
  formattedTakeHomeMonthly: '₹59,000.00',
  takeHomeAssumption:
    "Does not account for income tax or verified PF rates. Your actual salary may differ; you'll be able to correct the amount when you log what you actually received.",
}

test('embeds every category label and formatted amount verbatim', () => {
  const prompt = buildSalaryExplanationPrompt(baseParams)
  assert.ok(prompt.includes('Basic: ₹50,000.00'))
  assert.ok(prompt.includes('Allowance: ₹15,000.00'))
  assert.ok(prompt.includes('Employee Deduction: ₹6,000.00'))
})

test('embeds the formatted gross monthly and its stated assumption verbatim', () => {
  const prompt = buildSalaryExplanationPrompt(baseParams)
  assert.ok(prompt.includes('₹65,000.00'))
  assert.ok(prompt.includes(baseParams.grossAssumption))
})

test('embeds the formatted take-home monthly and its stated assumption verbatim', () => {
  const prompt = buildSalaryExplanationPrompt(baseParams)
  assert.ok(prompt.includes('₹59,000.00'))
  assert.ok(prompt.includes(baseParams.takeHomeAssumption))
})

test('always includes the anti-hallucination safeguard sentence', () => {
  const prompt = buildSalaryExplanationPrompt(baseParams)
  assert.ok(prompt.includes('Do not introduce any numbers other than the ones given above'))
})

test('an empty category breakdown does not crash and produces a sensible prompt', () => {
  const prompt = buildSalaryExplanationPrompt({ ...baseParams, categoryBreakdown: [] })
  assert.ok(typeof prompt === 'string' && prompt.length > 0)
  assert.ok(prompt.includes('Do not introduce any numbers other than the ones given above'))
})

test('schema requires exactly one string field, explanation, nothing else', () => {
  assert.deepStrictEqual(SALARY_EXPLANATION_SCHEMA, {
    type: 'object',
    properties: { explanation: { type: 'string' } },
    required: ['explanation'],
    additionalProperties: false,
  })
})

console.log(`\n${passed} passed, ${failed} failed`)
if (failed > 0) process.exit(1)
