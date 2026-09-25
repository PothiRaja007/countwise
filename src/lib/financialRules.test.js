// Plain Node test runner — no framework, no new dependency.
// Run with: node src/lib/financialRules.test.js
//
// Testing note: this project has no live Postgres/Supabase reachable
// from this environment (no network access in this sandbox) — a real
// database-backed test as the task suggested as the "better" option
// genuinely isn't possible here, not skipped by choice. What's tested
// below is selectApplicableRule() — the pure function
// getActiveRule()/getVerifiedRule() delegate to for the actual "which
// row applies" decision, which is where a bug would matter. That part
// has zero Supabase/network dependency and is fully covered here, the
// same way every other engine in this project is tested. The thin
// Supabase-querying wrappers themselves (fetchRuleRows,
// getActiveRule, getVerifiedRule) are NOT covered by an automated test
// in this environment — there's no live database or mock harness to
// verify the actual query against. This is stated plainly, not glossed
// over.
import assert from 'node:assert'
import { selectApplicableRule } from './financialRules.js'

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

console.log('financialRules tests\n')

// Two "generations" of the same rule, closed/opened at the boundary —
// exactly the scenario described in the roadmap doc's own example.
const TWO_GENERATIONS = [
  { value: 10, effective_from: '2020-01-01', effective_to: '2026-01-01', verification_status: 'verified' },
  { value: 12, effective_from: '2026-01-01', effective_to: null, verification_status: 'verified' },
]

// ---- basic selection ----
test('selectApplicableRule: picks the row whose range covers asOfDate', () => {
  const match = selectApplicableRule(TWO_GENERATIONS, '2025-06-01')
  assert.strictEqual(match.value, 10)
})

test('selectApplicableRule: an open-ended row (effective_to null) matches any date on/after effective_from', () => {
  const match = selectApplicableRule(TWO_GENERATIONS, '2030-01-01')
  assert.strictEqual(match.value, 12)
})

// ---- boundary: effective_from inclusive, effective_to exclusive ----
test('selectApplicableRule: effective_from is inclusive — the boundary date picks the NEW row', () => {
  const match = selectApplicableRule(TWO_GENERATIONS, '2026-01-01')
  assert.strictEqual(match.value, 12, 'the boundary date belongs to the row that starts on it, not the one that ends on it')
})

test('selectApplicableRule: effective_to is exclusive — the day before the boundary still picks the OLD row', () => {
  const match = selectApplicableRule(TWO_GENERATIONS, '2025-12-31')
  assert.strictEqual(match.value, 10)
})

// ---- never falls back to "most recent" ----
test('selectApplicableRule: a date before every row returns null, never falls back to the earliest row', () => {
  const match = selectApplicableRule(TWO_GENERATIONS, '2015-01-01')
  assert.strictEqual(match, null)
})

test('selectApplicableRule: a date inside a CLOSED gap (no open-ended row exists yet) returns null, never the nearest row', () => {
  const closedOnly = [{ value: 10, effective_from: '2020-01-01', effective_to: '2021-01-01', verification_status: 'verified' }]
  const match = selectApplicableRule(closedOnly, '2022-01-01')
  assert.strictEqual(match, null, 'must not silently return the closed row just because it is the only one')
})

test('selectApplicableRule: empty rows always returns null', () => {
  assert.strictEqual(selectApplicableRule([], '2026-01-01'), null)
})

// ---- verifiedOnly ----
test('selectApplicableRule: verifiedOnly excludes a needs_review row even when its date range matches', () => {
  const rows = [{ value: 99, effective_from: '2020-01-01', effective_to: null, verification_status: 'needs_review' }]
  assert.strictEqual(selectApplicableRule(rows, '2026-06-01', { verifiedOnly: true }), null)
  // Without verifiedOnly, the same row IS returned - confirms the flag is what's doing the filtering.
  assert.strictEqual(selectApplicableRule(rows, '2026-06-01', { verifiedOnly: false }).value, 99)
})

test('selectApplicableRule: verifiedOnly still returns a verified row that matches', () => {
  const rows = [
    { value: 1, effective_from: '2020-01-01', effective_to: null, verification_status: 'needs_review' },
    { value: 2, effective_from: '2020-01-01', effective_to: null, verification_status: 'verified' },
  ]
  // (Two open rows for the same key would violate the DB's unique index in
  // practice; this fixture just isolates the verifiedOnly filter itself.)
  const match = selectApplicableRule(rows, '2026-06-01', { verifiedOnly: true })
  assert.strictEqual(match.value, 2)
})

// ---- Date object input, not just strings ----
test('selectApplicableRule: accepts a real Date object for asOfDate, not just an ISO string', () => {
  const match = selectApplicableRule(TWO_GENERATIONS, new Date(2027, 0, 1)) // Jan 1 2027
  assert.strictEqual(match.value, 12)
})

console.log(`\n${passed} passed, ${failed} failed`)
if (failed > 0) process.exit(1)
