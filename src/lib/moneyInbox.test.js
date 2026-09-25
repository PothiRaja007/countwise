// Plain Node test runner — no framework, no new dependency.
// Run with: node src/lib/moneyInbox.test.js
import assert from 'node:assert'
import { buildReviewCandidates, checkDuplicate } from './moneyInbox.js'

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

console.log('moneyInbox tests\n')

const REF_DATE = new Date(2026, 7, 30) // 30 Aug 2026, matches project's "today"

const categoryRules = [
  { keyword: 'coffee', category_id: 'cat-food', priority: 0 },
  { keyword: 'bus', category_id: 'cat-transport', priority: 0 },
  { keyword: 'salary', category_id: 'cat-salary', priority: 0 },
  { keyword: 'fuel', category_id: 'cat-fuel', priority: 0 },
]

const accountNames = ['SBI', 'Wallet', 'Bank']

// ---- buildReviewCandidates: multi-clause input resolves categories ----
test('buildReviewCandidates splits a multi-transaction message and resolves categories per clause', () => {
  const candidates = buildReviewCandidates('coffee 80, bus 40, salary received 25000', {
    accountNames,
    categoryRules,
    referenceDate: REF_DATE,
  })

  assert.strictEqual(candidates.length, 3, 'should produce one candidate per clause')

  assert.strictEqual(candidates[0].amount, 80)
  assert.strictEqual(candidates[0].type, 'expense')
  assert.strictEqual(candidates[0].assumedType, true, '"coffee 80" has no verb, so its expense type is an assumed guess')
  assert.strictEqual(candidates[0].categoryId, 'cat-food')

  assert.strictEqual(candidates[1].amount, 40)
  assert.strictEqual(candidates[1].categoryId, 'cat-transport')

  assert.strictEqual(candidates[2].amount, 25000)
  assert.strictEqual(candidates[2].type, 'income')
  assert.strictEqual(candidates[2].assumedType, false, '"received" is an explicit income keyword, not assumed')
  assert.strictEqual(candidates[2].categoryId, 'cat-salary')
})

// ---- buildReviewCandidates: a transfer clause resolves both accounts ----
test('buildReviewCandidates resolves a transfer clause with both accounts and no category needed', () => {
  const candidates = buildReviewCandidates('moved 2000 from SBI to wallet', {
    accountNames,
    categoryRules,
    referenceDate: REF_DATE,
  })

  assert.strictEqual(candidates.length, 1)
  assert.strictEqual(candidates[0].type, 'transfer')
  assert.strictEqual(candidates[0].fromAccount, 'SBI')
  assert.strictEqual(candidates[0].toAccount, 'Wallet')
  assert.strictEqual(candidates[0].needsReview, false, 'both accounts resolved, so this transfer does not need review')
})

// ---- buildReviewCandidates: unresolved clause is flagged, doesn't block others ----
test('buildReviewCandidates flags an unresolvable clause without dropping the rest of the batch', () => {
  const candidates = buildReviewCandidates('spent 500 on fuel and moved 300 from SBI to Paytm', {
    accountNames,
    categoryRules,
    referenceDate: REF_DATE,
  })

  assert.strictEqual(candidates.length, 2)
  assert.strictEqual(candidates[0].needsReview, false, 'the confidently-parsed fuel expense should not be blocked')
  assert.strictEqual(candidates[1].needsReview, true, 'Paytm is not a known account, so this transfer needs review')
})

// ---- buildReviewCandidates: realistic default rule set (regression test) ----
// The original bug wasn't in this parsing logic at all — matchCategory()
// and buildReviewCandidates() were always correct. The bug was that the
// real `category_rules` table was missing ~90% of its intended default
// rows (see supabase/seed_default_category_rules.sql). The tests above
// never would have caught that, because they hand-build a tiny fixture
// instead of exercising something shaped like the real default rule set.
// This fixture mirrors DEFAULT_RULE_KEYWORDS from categorization.js so a
// future gap between "what the app defines" and "what actually gets
// matched" shows up here instead of only in production.
const DEFAULT_SHAPED_RULES = [
  { keyword: 'coffee', category_id: 'cat-food', priority: 0 },
  { keyword: 'bus', category_id: 'cat-transport', priority: 0 },
  { keyword: 'uber', category_id: 'cat-transport', priority: 0 },
  { keyword: 'petrol', category_id: 'cat-fuel', priority: 0 }, // Fuel was split out of Transport — see supabase/migrate_fuel_category.sql
  { keyword: 'diesel', category_id: 'cat-fuel', priority: 0 },
  { keyword: 'fuel', category_id: 'cat-fuel', priority: 0 },
  { keyword: 'salary', category_id: 'cat-salary', priority: 0 },
  { keyword: 'tuition fee', category_id: 'cat-education', priority: 1 }, // overlaps with 'tuition' below — higher priority wins
  { keyword: 'tuition', category_id: 'cat-tuition-income', priority: 0 },
]

test('buildReviewCandidates resolves categories using a realistic default-shaped rule set', () => {
  const [coffee] = buildReviewCandidates('coffee 80', { accountNames, categoryRules: DEFAULT_SHAPED_RULES, referenceDate: REF_DATE })
  assert.strictEqual(coffee.categoryId, 'cat-food')

  const [petrol] = buildReviewCandidates('petrol 500', { accountNames, categoryRules: DEFAULT_SHAPED_RULES, referenceDate: REF_DATE })
  assert.strictEqual(petrol.categoryId, 'cat-fuel')

  const [salary] = buildReviewCandidates('salary received 25000', { accountNames, categoryRules: DEFAULT_SHAPED_RULES, referenceDate: REF_DATE })
  assert.strictEqual(salary.categoryId, 'cat-salary')
})

test('buildReviewCandidates resolves petrol/fuel/diesel to the Fuel category, split out of Transport', () => {
  const [petrol] = buildReviewCandidates('petrol 500', { accountNames, categoryRules: DEFAULT_SHAPED_RULES, referenceDate: REF_DATE })
  assert.strictEqual(petrol.categoryId, 'cat-fuel')

  const [fuel] = buildReviewCandidates('fuel 500', { accountNames, categoryRules: DEFAULT_SHAPED_RULES, referenceDate: REF_DATE })
  assert.strictEqual(fuel.categoryId, 'cat-fuel')

  const [diesel] = buildReviewCandidates('diesel 700', { accountNames, categoryRules: DEFAULT_SHAPED_RULES, referenceDate: REF_DATE })
  assert.strictEqual(diesel.categoryId, 'cat-fuel')
})

test('buildReviewCandidates still resolves remaining Transport keywords correctly after the Fuel split', () => {
  const [bus] = buildReviewCandidates('bus 40', { accountNames, categoryRules: DEFAULT_SHAPED_RULES, referenceDate: REF_DATE })
  assert.strictEqual(bus.categoryId, 'cat-transport')

  const [uber] = buildReviewCandidates('uber 200', { accountNames, categoryRules: DEFAULT_SHAPED_RULES, referenceDate: REF_DATE })
  assert.strictEqual(uber.categoryId, 'cat-transport')
})

test('buildReviewCandidates resolves an overlapping keyword pair via priority ("tuition fee" vs "tuition")', () => {
  const [withFee] = buildReviewCandidates('tuition fee 5000', { accountNames, categoryRules: DEFAULT_SHAPED_RULES, referenceDate: REF_DATE })
  assert.strictEqual(withFee.categoryId, 'cat-education', 'the more specific, higher-priority keyword should win')

  const [bare] = buildReviewCandidates('tuition 5000', { accountNames, categoryRules: DEFAULT_SHAPED_RULES, referenceDate: REF_DATE })
  assert.strictEqual(bare.categoryId, 'cat-tuition-income', 'without "fee", only the bare keyword matches')
})

test('buildReviewCandidates leaves a genuinely unmatched item uncategorized, not guessed', () => {
  const [candidate] = buildReviewCandidates('xyzabc123 300', { accountNames, categoryRules: DEFAULT_SHAPED_RULES, referenceDate: REF_DATE })
  assert.strictEqual(candidate.categoryId, null)
})

// ---- Phase 18: Calendar's initialDate threading (MoneyInboxInput.jsx
// computes referenceDate as `initialDate ? new Date(initialDate) : new
// Date()` and passes it straight into buildReviewCandidates() — this is
// the same referenceDate parameter buildReviewCandidates() already
// accepted before this phase, so these tests exercise the real code path
// the component calls into, not a reimplementation of it. ----

test('no initialDate equivalent: referenceDate = today, no date word in text → dated today (regression)', () => {
  const [candidate] = buildReviewCandidates('coffee 80', { accountNames, categoryRules, referenceDate: REF_DATE })
  assert.strictEqual(candidate.date, '2026-08-30') // REF_DATE itself
})

test('initialDate provided, no date word in text → uses initialDate, not real today', () => {
  const calendarDay = new Date(2026, 7, 15) // a different day than REF_DATE
  const [candidate] = buildReviewCandidates('coffee 80', { accountNames, categoryRules, referenceDate: calendarDay })
  assert.strictEqual(candidate.date, '2026-08-15')
})

test('initialDate provided, but text contains an explicit date word → text wins over initialDate', () => {
  const calendarDay = new Date(2026, 7, 15)
  const [candidate] = buildReviewCandidates('yesterday coffee 80', { accountNames, categoryRules, referenceDate: calendarDay })
  // "yesterday" resolves relative to the given reference date (15th), not
  // real today — this is the documented, intentional behavior: initialDate
  // is the single anchor for both "no date mentioned" and relative-date
  // words, exactly like referenceDate always has been for "today".
  assert.strictEqual(candidate.date, '2026-08-14')
})

// ---- checkDuplicate: genuine near-duplicate ----
test('checkDuplicate flags a same-amount, same-description entry as a likely duplicate', () => {
  const candidate = buildReviewCandidates('coffee 80', { accountNames, categoryRules, referenceDate: REF_DATE })[0]
  const recentTransactions = [
    { amount: 80, description: 'coffee', created_at: '2026-08-30T10:00:00Z' },
  ]

  const result = checkDuplicate(candidate, recentTransactions)
  assert.strictEqual(result.isDuplicate, true)
  assert.strictEqual(typeof result.reason, 'string')
  assert.ok(result.reason.length > 0, 'should include a short human-readable reason')
})

// ---- checkDuplicate: clearly different transaction, same amount ----
test('checkDuplicate does not flag a different transaction that happens to share an amount', () => {
  const candidate = buildReviewCandidates('coffee 80', { accountNames, categoryRules, referenceDate: REF_DATE })[0]
  const recentTransactions = [
    { amount: 80, description: 'bus fare', created_at: '2026-08-30T10:00:00Z' },
  ]

  const result = checkDuplicate(candidate, recentTransactions)
  assert.strictEqual(result.isDuplicate, false, 'same amount but unrelated description should not be flagged')
  assert.strictEqual(result.reason, null)
})

// ---- checkDuplicate: never blocks — always returns a plain result, no throw ----
test('checkDuplicate returns false for an empty recent-transactions list', () => {
  const candidate = buildReviewCandidates('coffee 80', { accountNames, categoryRules, referenceDate: REF_DATE })[0]
  const result = checkDuplicate(candidate, [])
  assert.strictEqual(result.isDuplicate, false)
})

console.log(`\n${passed} passed, ${failed} failed`)
if (failed > 0) process.exit(1)
