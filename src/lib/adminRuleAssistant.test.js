import assert from 'node:assert'
import {
  RULE_PROPOSAL_SCHEMA, buildRuleExtractionPrompt, validateRuleProposal,
  proposalIsReadyForApproval, prepareRuleApproval,
} from './adminRuleAssistant.js'

let passed = 0, failed = 0
function test(name, fn) {
  try { fn(); passed++; console.log(`  PASS  ${name}`) }
  catch (err) { failed++; console.log(`  FAIL  ${name}\n        ${err.message}`) }
}

console.log('adminRuleAssistant tests\n')

test('schema has no verification_status field — Gemini can never set it', () => {
  assert.ok(!('verification_status' in RULE_PROPOSAL_SCHEMA.properties))
  assert.strictEqual(RULE_PROPOSAL_SCHEMA.additionalProperties, false)
})

test('the prompt embeds the raw text and instructs against advice/guessing', () => {
  const p = buildRuleExtractionPrompt('EPF rate changed to 13% from 1 June 2027')
  assert.ok(p.includes('EPF rate changed to 13% from 1 June 2027'))
  assert.ok(p.includes('never guess'))
  assert.ok(p.includes('Do not give advice'))
})

// ---- validateRuleProposal ---------------------------------------------
test('a fully valid proposal is accepted and normalized', () => {
  const r = validateRuleProposal({ scheme: 'EPF', rule_key: 'Employee Rate', value: 13, unit: 'percent', effective_from: '2027-06-01', source_url: 'https://epfindia.gov.in/x', note: 'Read clearly.' })
  assert.deepStrictEqual(r, { scheme: 'epf', rule_key: 'employee_rate', value: 13, unit: 'percent', effective_from: '2027-06-01', source_url: 'https://epfindia.gov.in/x', note: 'Read clearly.' })
})

test('a negative value is rejected', () => {
  assert.strictEqual(validateRuleProposal({ value: -5 }).value, null)
})

test('a non-ISO date is rejected, never guessed into a different format', () => {
  assert.strictEqual(validateRuleProposal({ effective_from: '1 June 2027' }).effective_from, null)
  assert.strictEqual(validateRuleProposal({ effective_from: '06/01/2027' }).effective_from, null)
})

test('a non-http(s) or missing source_url is dropped, never fabricated', () => {
  assert.strictEqual(validateRuleProposal({ source_url: 'epfindia.gov.in' }).source_url, null) // no protocol
  assert.strictEqual(validateRuleProposal({}).source_url, null)
})

test('null/undefined/non-object input is safe, never throws', () => {
  for (const bad of [null, undefined, 'text', 42, []]) {
    assert.doesNotThrow(() => validateRuleProposal(bad))
  }
})

// ---- proposalIsReadyForApproval ----------------------------------------
test('a proposal missing any required field is not ready for approval', () => {
  const full = { scheme: 'epf', rule_key: 'x', value: 12, unit: 'percent', effective_from: '2027-01-01' }
  assert.strictEqual(proposalIsReadyForApproval(full), true)
  for (const key of Object.keys(full)) {
    assert.strictEqual(proposalIsReadyForApproval({ ...full, [key]: null }), false, `missing ${key} should block approval`)
  }
})

test('a zero value IS valid (a 0% rate is a real, meaningful figure)', () => {
  assert.strictEqual(proposalIsReadyForApproval({ scheme: 'x', rule_key: 'y', value: 0, unit: 'percent', effective_from: '2027-01-01' }), true)
})

// ---- prepareRuleApproval: the real business logic ----------------------
const PROPOSAL = { scheme: 'epf', rule_key: 'employee_contribution_rate', value: 13, unit: 'percent', effective_from: '2027-06-01', source_url: 'https://x.gov.in', note: 'n' }

test('a brand-new rule (no existing active row): no update, a clean insert, status forced to verified', () => {
  const r = prepareRuleApproval(PROPOSAL, null)
  assert.strictEqual(r.updateOldRule, null)
  assert.strictEqual(r.insertNewRule.verification_status, 'verified')
  assert.strictEqual(r.insertNewRule.effective_to, null)
  assert.strictEqual(r.insertNewRule.effective_from, '2027-06-01')
})

test('replacing an existing active rule: effective_to is set to EXACTLY the new effective_from (the exclusive boundary) — not the day before', () => {
  const existing = { id: 'old-id', scheme: 'epf', rule_key: 'employee_contribution_rate', effective_from: '2026-09-01', effective_to: null }
  const r = prepareRuleApproval(PROPOSAL, existing)
  assert.deepStrictEqual(r.updateOldRule, { id: 'old-id', effective_to: '2027-06-01' })
  assert.strictEqual(r.insertNewRule.effective_from, '2027-06-01')
  // No gap, no overlap: old.effective_to === new.effective_from, proven against a real Postgres.
  assert.strictEqual(r.updateOldRule.effective_to, r.insertNewRule.effective_from)
})

test('a mismatched scheme/rule_key between the proposal and the "existing active rule" is refused, never silently closes the wrong row', () => {
  const wrongRow = { id: 'x', scheme: 'eps', rule_key: 'employee_contribution_rate', effective_from: '2026-01-01', effective_to: null }
  const r = prepareRuleApproval(PROPOSAL, wrongRow)
  assert.ok(r.error)
  assert.strictEqual(r.updateOldRule, undefined)
})

test('an "existing active rule" that is not actually open-ended (already has an effective_to) is refused, not silently overwritten', () => {
  const alreadyClosed = { id: 'x', scheme: 'epf', rule_key: 'employee_contribution_rate', effective_from: '2026-01-01', effective_to: '2026-12-01' }
  const r = prepareRuleApproval(PROPOSAL, alreadyClosed)
  assert.ok(r.error)
})

test('a new effective_from on or before the existing rule\u2019s effective_from is refused (would create a backward or same-day rule)', () => {
  const existing = { id: 'x', scheme: 'epf', rule_key: 'employee_contribution_rate', effective_from: '2027-06-01', effective_to: null }
  const r1 = prepareRuleApproval(PROPOSAL, existing) // same date
  assert.ok(r1.error)
  const earlierProposal = { ...PROPOSAL, effective_from: '2027-01-01' }
  const r2 = prepareRuleApproval(earlierProposal, { ...existing, effective_from: '2027-06-01' })
  assert.ok(r2.error)
})

test('an incomplete proposal is refused before any DB-shaped object is even built', () => {
  const r = prepareRuleApproval({ ...PROPOSAL, value: null }, null)
  assert.ok(r.error)
  assert.strictEqual(r.updateOldRule, undefined)
  assert.strictEqual(r.insertNewRule, undefined)
})

test('retrieved_at is set to the real current time, not hardcoded or omitted', () => {
  const fixedNow = new Date('2026-09-28T10:00:00Z')
  const r = prepareRuleApproval(PROPOSAL, null, fixedNow)
  assert.strictEqual(r.insertNewRule.retrieved_at, fixedNow.toISOString())
})

console.log(`\n${passed} passed, ${failed} failed`)
if (failed > 0) process.exit(1)
