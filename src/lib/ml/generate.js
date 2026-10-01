// G1 — corpus generator (design v2). Pure: no React, no Supabase, no file
// I/O of its own (the CLI script does that). Turns families.js into a
// labelled, split, validated dataset.
//
// Every generated sentence is checked against the REAL matchCategory()
// (categorization.js) — not a re-implementation of it — using BOTH the
// global keyword table AND every account-scoped category's keywords
// combined. That single check does two jobs the design calls out
// separately (Section 6's cross-category validation and Section 5's
// Bucket B deterministic-boundary exclusion): if either the global rules
// OR a student/employed account's own seeded rules would already
// recognise the sentence, it is not a valid "escapes deterministic
// categorization" example, and it is dropped rather than mislabelled.
// This is a real gap the design document left unresolved — "the mess" as
// a Food place name in families.js would have been silently intercepted
// by a student account's own Hostel/Mess rule before ever reaching ML —
// caught here at generation time instead of after the fact.

import { matchCategory, detectType, parseAmount } from '../categorization.js'
import { detectSpendingContext } from '../spendingContext.js'
import { GLOBAL_CATEGORIES, GLOBAL_CATEGORY_NAMES, GLOBAL_KEYWORD_RULES, ACCOUNT_SCOPED_CATEGORIES } from './categoryTruth.js'
import { FAMILY_GROUPS, AMOUNTS } from './families.js'

// The combined table used ONLY to decide "would some real deterministic
// rule already handle this?" — global rules plus every account-scoped
// category's keywords, since a real student/employed account merges both
// (MoneyInboxInput.jsx queries category_rules for user_id = this user OR
// null). category_id is the category NAME here, which is what the
// generator wants as a label anyway.
const ALL_LIVE_RULES = [
  ...GLOBAL_KEYWORD_RULES.map((r) => ({ keyword: r.keyword, category_id: r.category, priority: r.priority })),
  ...ACCOUNT_SCOPED_CATEGORIES.flatMap((c) => c.keywords.map((k, i) => ({ keyword: k, category_id: c.name, priority: i }))),
]

function fill(template, slots) {
  return template.replace(/\{(\w+)\}/g, (_, key) => {
    if (!(key in slots)) throw new Error(`template ${JSON.stringify(template)} needs slot "${key}" which was not supplied`)
    return String(slots[key])
  })
}

const normalize = (text) => text.toLowerCase().replace(/[^\w\s]/g, '').replace(/\s+/g, ' ').trim()

/**
 * Build every {slots} combination for one target, drawn from the named
 * vocabulary key (e.g. 'items') plus amount, using ONLY the given
 * vocabPick ('train' | 'heldout') for every pool involved — this is what
 * keeps lexical holdout real rather than accidentally mixed.
 */
function* slotCombinations(target, vocabPick, amountPick) {
  const poolKeys = Object.keys(target).filter((k) => k !== 'category')
  const values = poolKeys.map((k) => target[k][vocabPick])
  const amounts = AMOUNTS[amountPick]
  function* cartesian(i, acc) {
    if (i === poolKeys.length) {
      for (const amount of amounts) yield { ...acc, amount }
      return
    }
    for (const v of values[i]) yield* cartesian(i + 1, { ...acc, [poolKeys[i].replace(/s$/, '')]: v })
  }
  yield* cartesian(0, {})
}

/**
 * Generate examples for one family group, using its own templates, for
 * ONE (vocabPick, amountPick, split) combination. Every example is
 * validated against ALL_LIVE_RULES; a hit means "excluded", not
 * "mislabelled" — design v2 Section 6.
 */
// Self-balancing cap: aim for roughly TARGET_PER_TARGET examples per
// (category x vocab/amount-pick combination), spread across however many
// templates that family happens to have — not a flat per-template cap,
// which silently starved a family with few templates (income_paraphrase,
// 2 templates) even after its vocabulary pool was deliberately deepened.
const TARGET_PER_TARGET = 24

function generateForGroup(group, { vocabPick, amountPick, split, splitReason }) {
  const maxPerTargetTemplate = Math.max(4, Math.ceil(TARGET_PER_TARGET / group.templates.length))
  const rows = []
  const excluded = []
  for (const target of group.targets) {
    for (const template of group.templates) {
      let n = 0
      for (const slots of slotCombinations(target, vocabPick, amountPick)) {
        if (n >= maxPerTargetTemplate) break
        const text = fill(template, slots)
        const matched = matchCategory(text, ALL_LIVE_RULES)
        if (matched !== null) {
          excluded.push({ text, wouldMatch: matched, familyGroup: group.id, intendedCategory: target.category })
          continue
        }
        n++
        const spendingContext = detectSpendingContext(text).value
        const type = detectType(text, { hasAmount: parseAmount(text) !== null }).type
        rows.push({
          text, category: target.category, kind: GLOBAL_CATEGORIES.find((c) => c.name === target.category).kind,
          type, spendingContext, familyGroup: group.id, template, split, splitReason,
          vocab: vocabPick, amountVocab: amountPick,
        })
      }
    }
  }
  return { rows, excluded }
}

// The split plan (see the code-review notes for why these specific groups
// were chosen): four groups form the base training set; one held-out
// group tests structural generalization alone (known words, new
// structure); the trained groups' own held-out vocabulary tests lexical
// generalization alone (known structure, new words); a second held-out
// group, generated with held-out vocabulary, tests both at once — the
// hardest case (design v2 Section 11).
const STRUCTURAL_HOLDOUT_GROUP = 'routine_purchase'
const COMPOSITIONAL_HOLDOUT_GROUP = 'casual_slang'

export function generateCorpus() {
  const trainGroups = FAMILY_GROUPS.filter((g) => g.id !== STRUCTURAL_HOLDOUT_GROUP && g.id !== COMPOSITIONAL_HOLDOUT_GROUP)
  const structuralGroup = FAMILY_GROUPS.find((g) => g.id === STRUCTURAL_HOLDOUT_GROUP)
  const compositionalGroup = FAMILY_GROUPS.find((g) => g.id === COMPOSITIONAL_HOLDOUT_GROUP)

  const all = []
  const excluded = []
  const record = (result) => { all.push(...result.rows); excluded.push(...result.excluded) }

  for (const g of trainGroups) {
    record(generateForGroup(g, { vocabPick: 'train', amountPick: 'train', split: 'train', splitReason: 'base training group' }))
    record(generateForGroup(g, { vocabPick: 'heldout', amountPick: 'heldout', split: 'test_lexical', splitReason: 'known family group, held-out vocabulary' }))
  }
  record(generateForGroup(structuralGroup, { vocabPick: 'train', amountPick: 'train', split: 'val_structural', splitReason: 'entire family group held out; vocabulary was seen in training' }))
  record(generateForGroup(compositionalGroup, { vocabPick: 'heldout', amountPick: 'heldout', split: 'test_compositional', splitReason: 'entire family group held out AND held-out vocabulary — hardest case' }))

  // Duplicate control (design v2 Section 12): exact and normalized.
  const seen = new Map() // normalized text -> first row's split
  const deduped = []
  const droppedDuplicates = []
  for (const row of all) {
    const key = normalize(row.text)
    if (seen.has(key)) {
      droppedDuplicates.push({ text: row.text, split: row.split, firstSeenInSplit: seen.get(key) })
      continue
    }
    seen.set(key, row.split)
    deduped.push({ id: deduped.length + 1, ...row })
  }

  return { examples: deduped, excludedByDeterministicRules: excluded, droppedDuplicates }
}

// A small, hand-picked Bucket C (design v2 Section 5C / Section 20):
// genuinely insufficient information. Not generated from templates —
// forcing a template to produce "ambiguous" examples defeats the point,
// since a template's whole job is to have a defensible ground truth.
export const ABSTENTION_EXAMPLES = [
  { text: 'spent 500', note: 'no item, no category-bearing language at all' },
  { text: 'paid 800', note: 'same — a bare payment with nothing else' },
  { text: 'got something for 300', note: '"something" is a deliberate non-answer' },
  { text: 'small expense 150', note: 'describes size, not category' },
  { text: 'random spend 200', note: 'explicitly signals its own non-specificity' },
].map((r, i) => ({ id: i + 1, ...r, category: null, abstain: true }))
