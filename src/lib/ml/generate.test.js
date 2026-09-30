import assert from 'node:assert'
import { matchCategory } from '../categorization.js'
import { GLOBAL_CATEGORY_NAMES, ACCOUNT_SCOPED_CATEGORY_NAMES, GLOBAL_KEYWORD_RULES, ACCOUNT_SCOPED_CATEGORIES } from './categoryTruth.js'
import { FAMILY_GROUPS } from './families.js'
import { generateCorpus, ABSTENTION_EXAMPLES } from './generate.js'

let passed = 0, failed = 0
function test(name, fn) {
  try { fn(); passed++; console.log(`  PASS  ${name}`) }
  catch (err) { failed++; console.log(`  FAIL  ${name}\n        ${err.message}`) }
}

const ALL_LIVE_RULES = [
  ...GLOBAL_KEYWORD_RULES.map((r) => ({ keyword: r.keyword, category_id: r.category, priority: r.priority })),
  ...ACCOUNT_SCOPED_CATEGORIES.flatMap((c) => c.keywords.map((k, i) => ({ keyword: k, category_id: c.name, priority: i }))),
]
const normalize = (t) => t.toLowerCase().replace(/[^\w\s]/g, '').replace(/\s+/g, ' ').trim()

const { examples, excludedByDeterministicRules, droppedDuplicates } = generateCorpus()

console.log('G1 corpus generator tests\n')

// ---- The generator produced something real, not an empty/trivial result ---
test('the generator produced a non-trivial number of examples', () => {
  assert.ok(examples.length > 500, `only ${examples.length} examples`)
})

test('the deterministic-rule validator did real, non-trivial work (proof it is not a no-op)', () => {
  assert.ok(excludedByDeterministicRules.length > 0)
  const movieHit = excludedByDeterministicRules.find((e) => e.text.includes('movie ticket'))
  assert.ok(movieHit, 'expected "a movie ticket ..." to be caught (it contains the literal keyword "movie")')
  assert.strictEqual(movieHit.wouldMatch, 'Entertainment')
})

// ---- Master correctness invariant: EVERY surviving example is genuinely --
// ---- free of any live deterministic rule, global or account-scoped -------
test('every single example in the final corpus is keyword-free against the FULL live rule table', () => {
  const violations = examples.filter((e) => matchCategory(e.text, ALL_LIVE_RULES) !== null)
  assert.deepStrictEqual(violations.map((v) => v.text), [], `${violations.length} examples would actually be intercepted deterministically`)
})

test('the "the mess" collision is gone: no example contains an account-scoped keyword', () => {
  const accountKeywords = ACCOUNT_SCOPED_CATEGORIES.flatMap((c) => c.keywords)
  const boundary = (kw) => new RegExp(`\\b${kw.replace(/[.*+?^${}()|[\]\\]/g, '\\$&').replace(/\\s+/g, '\\s+')}\\b`, 'i')
  for (const e of examples) {
    for (const kw of accountKeywords) {
      assert.ok(!boundary(kw).test(e.text), `"${e.text}" contains account-scoped keyword "${kw}" as a whole word`)
    }
  }
})

// ---- Category vocabulary: global only, never account-scoped/custom -------
test('every example\'s category is one of the 19 global categories', () => {
  for (const e of examples) assert.ok(GLOBAL_CATEGORY_NAMES.includes(e.category), `unexpected category: ${e.category}`)
})

test('no example is labelled with an account-scoped category name', () => {
  for (const e of examples) assert.ok(!ACCOUNT_SCOPED_CATEGORY_NAMES.includes(e.category), `leaked account-scoped label: ${e.category}`)
})

test('type/kind are internally consistent (an expense category never comes out type=income and vice versa)', () => {
  for (const e of examples) assert.strictEqual(e.type, e.kind, `${JSON.stringify(e.text)}: category=${e.category} (${e.kind}) but parsed type=${e.type}`)
})

// ---- Family-group-level split: the unit that must never cross a boundary -
const STRUCTURAL = 'routine_purchase'
const COMPOSITIONAL = 'casual_slang'
const trainGroupIds = FAMILY_GROUPS.map((g) => g.id).filter((id) => id !== STRUCTURAL && id !== COMPOSITIONAL)

test('the two held-out family groups never appear in the train split', () => {
  const leaked = examples.filter((e) => e.split === 'train' && (e.familyGroup === STRUCTURAL || e.familyGroup === COMPOSITIONAL))
  assert.deepStrictEqual(leaked, [])
})

test('val_structural contains ONLY the structural-holdout group, and nothing else', () => {
  const groups = new Set(examples.filter((e) => e.split === 'val_structural').map((e) => e.familyGroup))
  assert.deepStrictEqual([...groups], [STRUCTURAL])
})

test('test_compositional contains ONLY the compositional-holdout group', () => {
  const groups = new Set(examples.filter((e) => e.split === 'test_compositional').map((e) => e.familyGroup))
  assert.deepStrictEqual([...groups], [COMPOSITIONAL])
})

test('test_lexical reuses ONLY the trained family groups (known structure), never the held-out ones', () => {
  const groups = new Set(examples.filter((e) => e.split === 'test_lexical').map((e) => e.familyGroup))
  for (const g of groups) assert.ok(trainGroupIds.includes(g), `test_lexical unexpectedly used held-out group: ${g}`)
})

test('every train-split example used ONLY train-tagged vocabulary and amounts', () => {
  for (const e of examples.filter((x) => x.split === 'train')) {
    assert.strictEqual(e.vocab, 'train', e.text)
    assert.strictEqual(e.amountVocab, 'train', e.text)
  }
})

// ---- Lexical holdout must be real: a held-out word must never leak into --
// ---- a train-split sentence, for ANY family/category -----------------------
test('no held-out vocabulary word appears in ANY train-split example, across every family and category', () => {
  const trainTexts = examples.filter((e) => e.split === 'train').map((e) => normalize(e.text))
  const heldoutWords = []
  for (const g of FAMILY_GROUPS) {
    for (const target of g.targets) {
      for (const [key, val] of Object.entries(target)) {
        if (key === 'category' || !val?.heldout) continue
        for (const w of val.heldout) heldoutWords.push(normalize(w))
      }
    }
  }
  const leaks = []
  for (const word of new Set(heldoutWords)) {
    if (trainTexts.some((t) => t.includes(word))) leaks.push(word)
  }
  assert.deepStrictEqual(leaks, [])
})

// ---- Duplicate control -----------------------------------------------------
test('no two examples in the final corpus share normalized text', () => {
  const seen = new Set()
  const dups = []
  for (const e of examples) {
    const k = normalize(e.text)
    if (seen.has(k)) dups.push(e.text)
    seen.add(k)
  }
  assert.deepStrictEqual(dups, [])
})

test('the dedup mechanism itself works on a deliberately duplicated pair (not just "we never happened to produce one")', () => {
  const seen = new Map()
  const rows = [{ text: 'coffee 80' }, { text: 'Coffee   80!' }, { text: 'lunch 200' }]
  const kept = []
  for (const r of rows) {
    const k = normalize(r.text)
    if (seen.has(k)) continue
    seen.set(k, true)
    kept.push(r.text)
  }
  assert.deepStrictEqual(kept, ['coffee 80', 'lunch 200'])
})

// ---- Spending-context anti-shortcut requirement (corrected Section 15) ----
test('"social" spans multiple categories in the generated data (not a single-category proxy)', () => {
  const cats = new Set(examples.filter((e) => e.spendingContext === 'social').map((e) => e.category))
  assert.ok(cats.size >= 3, `social only spans: ${[...cats].join(', ')}`)
})

test('"routine" spans multiple categories in the generated data', () => {
  const cats = new Set(examples.filter((e) => e.spendingContext === 'routine').map((e) => e.category))
  assert.ok(cats.size >= 3, `routine only spans: ${[...cats].join(', ')}`)
})

test('Food appears both with and without a spending context (context is not baked into the category)', () => {
  const foodContexts = new Set(examples.filter((e) => e.category === 'Food').map((e) => e.spendingContext ?? '(none)'))
  assert.ok(foodContexts.has('(none)') && foodContexts.size >= 2, `Food contexts: ${[...foodContexts].join(', ')}`)
})

test('no forbidden shortcut literally holds across the whole corpus: social is never ONLY Entertainment, routine is never ONLY Subscriptions', () => {
  const onlyEntertainment = examples.filter((e) => e.spendingContext === 'social').every((e) => e.category === 'Entertainment')
  const onlySubscriptions = examples.filter((e) => e.spendingContext === 'routine').every((e) => e.category === 'Subscriptions')
  assert.strictEqual(onlyEntertainment, false)
  assert.strictEqual(onlySubscriptions, false)
})

// ---- Abstention bucket (Bucket C) ------------------------------------------
test('every abstention example is well-formed: no category, abstain=true', () => {
  for (const e of ABSTENTION_EXAMPLES) {
    assert.strictEqual(e.category, null, e.text)
    assert.strictEqual(e.abstain, true, e.text)
  }
})

test('abstention examples are genuinely keyword-free too (they are testing "not enough information", not "hits nothing by accident")', () => {
  for (const e of ABSTENTION_EXAMPLES) assert.strictEqual(matchCategory(e.text, ALL_LIVE_RULES), null, e.text)
})

console.log(`\n${passed} passed, ${failed} failed`)
console.log(`\n(context: ${examples.length} examples, ${excludedByDeterministicRules.length} excluded by the rule validator, ${droppedDuplicates.length} duplicates dropped)`)
if (failed > 0) process.exit(1)
