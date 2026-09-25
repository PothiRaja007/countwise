import assert from 'node:assert'
import { calculateEmployeePF, calculateEmployerEPF, calculateEPS, calculateRetirementBreakdown } from './pfEngine.js'

let passed = 0
let failed = 0

async function test(name, fn) {
  try {
    await fn()
    console.log(`  PASS  ${name}`)
    passed++
  } catch (err) {
    console.log(`  FAIL  ${name}`)
    console.log(`        ${err.message}`)
    failed++
  }
}

const VERIFIED_RULES = {
  'epf:employee_contribution_rate': {
    scheme: 'epf', rule_key: 'employee_contribution_rate', value: 12, unit: 'percent',
    effective_from: '2026-09-01', effective_to: null, source_url: 'https://www.epfindia.gov.in/',
    retrieved_at: '2026-09-18T00:00:00Z', verification_status: 'verified',
  },
  'epf:employer_contribution_rate': {
    scheme: 'epf', rule_key: 'employer_contribution_rate', value: 3.67, unit: 'percent',
    effective_from: '2026-09-01', effective_to: null, source_url: 'https://www.epfindia.gov.in/',
    retrieved_at: '2026-09-18T00:00:00Z', verification_status: 'verified',
  },
  'eps:employer_contribution_rate': {
    scheme: 'eps', rule_key: 'employer_contribution_rate', value: 8.33, unit: 'percent',
    effective_from: '2026-09-01', effective_to: null, source_url: 'https://www.epfindia.gov.in/',
    retrieved_at: '2026-09-18T00:00:00Z', verification_status: 'verified',
  },
}

const verifiedGetter = async (scheme, ruleKey) => VERIFIED_RULES[`${scheme}:${ruleKey}`] || null
const missingGetter = async () => null

await test('employee PF uses the verified rate and preserves provenance', async () => {
  const result = await calculateEmployeePF(50000, '2026-09-18', { ruleGetter: verifiedGetter })
  assert.strictEqual(result.status, 'ok')
  assert.strictEqual(result.amount, 6000)
  assert.strictEqual(result.rateUsed, 12)
  assert.strictEqual(result.ratePeriod.effectiveFrom, '2026-09-01')
  assert.strictEqual(result.source.verificationStatus, 'verified')
})

await test('employer EPF uses its own verified rate', async () => {
  const result = await calculateEmployerEPF(50000, '2026-09-18', { ruleGetter: verifiedGetter })
  assert.ok(Math.abs(result.amount - 1835) < 1e-9)
  assert.strictEqual(result.rateUsed, 3.67)
})

await test('EPS exposes the uncapped limitation instead of presenting it as exact', async () => {
  const result = await calculateEPS(50000, '2026-09-18', { ruleGetter: verifiedGetter })
  assert.strictEqual(result.status, 'ok')
  assert.strictEqual(result.amount, 4165)
  assert.match(result.limitation, /wage ceiling/i)
  assert.match(result.limitation, /uncapped estimate/i)
})

await test('no verified rate returns unavailable, never zero', async () => {
  const result = await calculateEmployeePF(50000, '2026-09-18', { ruleGetter: missingGetter })
  assert.strictEqual(result.status, 'unavailable')
  assert.strictEqual(result.amount, null)
  assert.match(result.reason, /No verified financial rule/i)
})

await test('needs_review rules are not accepted as verified', async () => {
  const result = await calculateEmployeePF(50000, '2026-09-18', {
    ruleGetter: async () => ({ ...VERIFIED_RULES['epf:employee_contribution_rate'], verification_status: 'needs_review' }),
  })
  assert.strictEqual(result.status, 'unavailable')
  assert.strictEqual(result.amount, null)
})

await test('retirement breakdown is structurally separate from spendable balance/income shapes', async () => {
  const result = await calculateRetirementBreakdown(50000, '2026-09-18', { ruleGetter: verifiedGetter })
  assert.strictEqual(result.status, 'ok')
  assert.ok(result.retirementBenefits)
  assert.ok(result.retirementBenefits.employeePF)
  assert.ok(result.retirementBenefits.employerEPF)
  assert.ok(result.retirementBenefits.eps)
  assert.strictEqual('balance' in result, false)
  assert.strictEqual('income' in result, false)
  assert.strictEqual('totalBalance' in result, false)
  assert.strictEqual('netCashFlow' in result, false)
  assert.strictEqual('available' in result, false)
})

console.log(`\n${passed} passed, ${failed} failed`)
if (failed > 0) process.exit(1)
