// P0 (Money Inbox command layer) — the EXACT-CHANGE DETECTOR.
//
// Records, for ~300 inputs, every field the Money Inbox parser produces, and
// fails on ANY difference. The corpus scorer (moneyInboxEval.test.js) only
// checks fields someone wrote an expectation for and leaves out items tagged
// ambiguous/gap; this test checks all fifteen fields of every entry of every
// input, so a change the scorer cannot see still shows up here.
//
// Three configurations are frozen:
//   A  the scorer's own fixtures (default keyword constant, 28 Sep 2026)
//   B  the LIVE rule table (ml/categoryTruth.js global rules + the student-track
//      account-scoped keywords, priority = position in list, exactly as
//      categorySeed.js seeds them) — freezes the real rule table with the parser
//   D  date-sensitive inputs under three extra reference dates (month end,
//      year end, leap day) — the Calendar entry point passes a reference date
//
// DEFAULT MODE only reads and compares. It never writes.
//   node src/lib/moneyInboxGolden.test.js
//
// UPDATE MODE rewrites the snapshot. It is for the one-time P0 generation, and
// afterwards only for a deliberate, approved, reviewed parser change:
//   node src/lib/moneyInboxGolden.test.js --update
// NEVER use --update to make a failing run pass. A failure means the parser (or
// its rules/fixtures) changed: read the printed differences first.
import assert from 'node:assert'
import { readFileSync, writeFileSync, existsSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { buildReviewCandidates } from './moneyInbox.js'
import { DEFAULT_RULE_KEYWORDS } from './categorization.js'
import { MONEY_INBOX_CORPUS, RED_TEAM_CORPUS, CORPUS_ACCOUNTS, CORPUS_REFERENCE_DATE } from './moneyInboxCorpus.js'
import { parseForEval } from './moneyInboxEval.js'
import { GLOBAL_KEYWORD_RULES, ACCOUNT_SCOPED_CATEGORIES } from './ml/categoryTruth.js'
import {
  BASELINE_INPUTS, COMMAND_SHAPED_INPUTS, BARE_WORD_INPUTS, MIXED_INPUTS,
  DATE_SENSITIVE_INPUTS, LIVE_RULE_INPUTS, EXTRA_REFERENCE_DATES,
} from './moneyInboxGoldenInputs.js'

const SNAPSHOT_PATH = fileURLToPath(new URL('./moneyInboxGolden.snapshot.json', import.meta.url))
const UPDATE = process.argv.includes('--update')

// ---------- what is recorded ----------
// All fifteen fields a parsed entry carries. (`duplicate` is added later by the
// component and is covered by moneyInbox.test.js.)
const FIELDS = [
  'raw', 'date', 'amount', 'type', 'assumedType', 'account', 'accountConflict',
  'fromAccount', 'toAccount', 'needsReview', 'categoryId',
  'spendingContext', 'contextSource', 'contextMatched', 'contextConflict',
]
const normalizeEntry = (c) => Object.fromEntries(FIELDS.map((f) => [f, c[f] === undefined ? null : c[f]]))
const record = (candidates) => ({ events: candidates.length, entries: candidates.map(normalizeEntry) })

// ---------- configurations ----------
const RULES_A = Object.entries(DEFAULT_RULE_KEYWORDS).flatMap(([category, keywords]) =>
  keywords.map((keyword) => ({ keyword, category_id: category })))
const RULES_B = [
  ...GLOBAL_KEYWORD_RULES.map((r) => ({ keyword: r.keyword, category_id: r.category, priority: r.priority })),
  ...ACCOUNT_SCOPED_CATEGORIES.filter((c) => c.track === 'student')
    .flatMap((c) => c.keywords.map((keyword, i) => ({ keyword, category_id: c.name, priority: i }))),
]
const parseA = (text) => parseForEval(text) // the scorer's own fixtures, so A is identical to the corpus run
const parseB = (text) => buildReviewCandidates(text, { accounts: CORPUS_ACCOUNTS, categoryRules: RULES_B, referenceDate: CORPUS_REFERENCE_DATE })
const parseDated = (text, referenceDate) => buildReviewCandidates(text, { accounts: CORPUS_ACCOUNTS, categoryRules: RULES_A, referenceDate })

const unique = (list) => [...new Set(list)]
const INPUTS_A = unique([
  ...MONEY_INBOX_CORPUS.map((i) => i.text), ...RED_TEAM_CORPUS.map((i) => i.text),
  ...BASELINE_INPUTS, ...COMMAND_SHAPED_INPUTS, ...BARE_WORD_INPUTS, ...MIXED_INPUTS, ...DATE_SENSITIVE_INPUTS,
])
const INPUTS_B = unique(LIVE_RULE_INPUTS)
const INPUTS_D = unique(DATE_SENSITIVE_INPUTS)
const EXTRA_DATES = EXTRA_REFERENCE_DATES.map((r) => ({ label: r.label, date: new Date(r.y, r.m, r.d) }))
const ymd = (d) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`

function buildSnapshot() {
  return {
    meta: {
      format: 1,
      generatedFor: 'P0 baseline freeze (Money Inbox command layer), 5 Oct 2026',
      note: 'Do not edit by hand. Regenerate only with an approved --update and a reviewed diff.',
      fields: FIELDS,
      configA: { referenceDate: ymd(CORPUS_REFERENCE_DATE), accounts: CORPUS_ACCOUNTS, rules: 'DEFAULT_RULE_KEYWORDS via moneyInboxEval.parseForEval', ruleCount: RULES_A.length, inputs: INPUTS_A.length },
      configB: { referenceDate: ymd(CORPUS_REFERENCE_DATE), accounts: CORPUS_ACCOUNTS, rules: 'live: ml/categoryTruth.js global rules + student-track account-scoped keywords (priority = list position)', ruleCount: RULES_B.length, inputs: INPUTS_B.length },
      dates: { referenceDates: EXTRA_DATES.map((r) => r.label), inputs: INPUTS_D.length },
    },
    configA: Object.fromEntries(INPUTS_A.map((t) => [t, record(parseA(t))])),
    configB: Object.fromEntries(INPUTS_B.map((t) => [t, record(parseB(t))])),
    dates: Object.fromEntries(EXTRA_DATES.map((r) => [r.label, Object.fromEntries(INPUTS_D.map((t) => [t, record(parseDated(t, r.date))]))])),
  }
}

// One input per line, so a change shows up as a readable line-by-line diff.
function serialize(snap) {
  const flat = (name, obj) => [`  ${JSON.stringify(name)}: {`, ...Object.entries(obj).map(([k, v], i, a) => `    ${JSON.stringify(k)}: ${JSON.stringify(v)}${i < a.length - 1 ? ',' : ''}`), '  }']
  const lines = ['{', `  "meta": ${JSON.stringify(snap.meta)},`]
  lines.push(...flat('configA', snap.configA)); lines[lines.length - 1] += ','
  lines.push(...flat('configB', snap.configB)); lines[lines.length - 1] += ','
  lines.push('  "dates": {')
  const labels = Object.keys(snap.dates)
  labels.forEach((label, li) => {
    lines.push(`    ${JSON.stringify(label)}: {`)
    Object.entries(snap.dates[label]).forEach(([k, v], i, a) => lines.push(`      ${JSON.stringify(k)}: ${JSON.stringify(v)}${i < a.length - 1 ? ',' : ''}`))
    lines.push(`    }${li < labels.length - 1 ? ',' : ''}`)
  })
  lines.push('  }', '}')
  return lines.join('\n') + '\n'
}

// ---------- update mode ----------
if (UPDATE) {
  const snap = buildSnapshot()
  writeFileSync(SNAPSHOT_PATH, serialize(snap))
  console.log(`Snapshot written: ${SNAPSHOT_PATH}`)
  console.log(`  configuration A: ${INPUTS_A.length} inputs   configuration B: ${INPUTS_B.length} inputs   dates: ${INPUTS_D.length} inputs x ${EXTRA_DATES.length} reference dates`)
  console.log('  REVIEW THE DIFF BEFORE COMMITTING. Never use --update to make a failing run pass.')
  process.exit(0)
}

// ---------- test mode ----------
let passed = 0, failed = 0
function test(name, fn) {
  try { fn(); passed++; console.log(`  PASS  ${name}`) }
  catch (err) { failed++; console.log(`  FAIL  ${name}\n${String(err.message).split('\n').map((l) => '        ' + l).join('\n')}`) }
}

console.log('moneyInboxGolden tests\n')

if (!existsSync(SNAPSHOT_PATH)) {
  console.log('  FAIL  G1: the snapshot file is missing (src/lib/moneyInboxGolden.snapshot.json).')
  console.log('        It is generated once during P0 with --update; it must be committed with the code.')
  console.log('\n0 passed, 1 failed')
  process.exit(1)
}
const snapshot = JSON.parse(readFileSync(SNAPSHOT_PATH, 'utf8'))

function diffRecord(want, got) {
  const out = []
  if (want.events !== got.events) out.push(`events ${want.events} -> ${got.events}`)
  const n = Math.min(want.entries.length, got.entries.length)
  for (let i = 0; i < n; i++) {
    for (const f of FIELDS) {
      if (JSON.stringify(want.entries[i][f]) !== JSON.stringify(got.entries[i][f])) {
        out.push(`entry ${i + 1} ${f}: ${JSON.stringify(want.entries[i][f])} -> ${JSON.stringify(got.entries[i][f])}`)
      }
    }
  }
  return out
}
function compareSection(label, inputs, wantMap, parse) {
  const diffs = []
  for (const text of inputs) {
    const want = wantMap[text]
    if (!want) { diffs.push(`${label} ${JSON.stringify(text)}: no snapshot entry`); continue }
    for (const d of diffRecord(want, record(parse(text)))) diffs.push(`${label} ${JSON.stringify(text)}: ${d}`)
  }
  return diffs
}
const show = (diffs) => `${diffs.length} difference(s). First ${Math.min(20, diffs.length)}:\n${diffs.slice(0, 20).join('\n')}\nIf this change was NOT deliberate, the parser has changed by accident. Do not run --update to make it pass.`

test('G1: the snapshot loads and its recorded fixtures still match the code', () => {
  assert.strictEqual(snapshot.meta.format, 1)
  assert.deepStrictEqual(snapshot.meta.fields, FIELDS)
  assert.strictEqual(snapshot.meta.configA.referenceDate, ymd(CORPUS_REFERENCE_DATE))
  assert.deepStrictEqual(snapshot.meta.configA.accounts, CORPUS_ACCOUNTS)
  assert.strictEqual(snapshot.meta.configA.ruleCount, RULES_A.length, 'the default keyword constant changed size')
  assert.strictEqual(snapshot.meta.configB.ruleCount, RULES_B.length, 'the live rule table changed size')
  assert.deepStrictEqual(snapshot.meta.dates.referenceDates, EXTRA_DATES.map((r) => r.label))
})

test('G2: the snapshot covers exactly the input lists plus both corpora (nothing missing, nothing stale)', () => {
  const check = (name, want, have) => {
    const missing = want.filter((t) => !have.includes(t)), stale = have.filter((t) => !want.includes(t))
    assert.deepStrictEqual({ missing, stale }, { missing: [], stale: [] }, `${name}: inputs missing from / stale in the snapshot`)
  }
  check('configuration A', INPUTS_A, Object.keys(snapshot.configA))
  check('configuration B', INPUTS_B, Object.keys(snapshot.configB))
  for (const r of EXTRA_DATES) check(`dates ${r.label}`, INPUTS_D, Object.keys(snapshot.dates[r.label] || {}))
})

test('G3: configuration A — every field of every event of every input is unchanged', () => {
  const diffs = compareSection('A', INPUTS_A, snapshot.configA, parseA)
  assert.strictEqual(diffs.length, 0, show(diffs))
})

test('G4: configuration B (live rule table) — every field of the 32 category-sensitive inputs is unchanged', () => {
  assert.strictEqual(INPUTS_B.length, 32)
  const diffs = compareSection('B', INPUTS_B, snapshot.configB, parseB)
  assert.strictEqual(diffs.length, 0, show(diffs))
})

test('G5: date-sensitive inputs are unchanged under three more reference dates (month end, year end, leap day)', () => {
  const diffs = EXTRA_DATES.flatMap((r) => compareSection(`D ${r.label}`, INPUTS_D, snapshot.dates[r.label], (t) => parseDated(t, r.date)))
  assert.strictEqual(diffs.length, 0, show(diffs))
})

test('G6: no hidden clock — results do not depend on the real current time', () => {
  const RealDate = globalThis.Date
  class NoClockDate extends RealDate {
    constructor(...args) {
      if (args.length === 0) throw new Error('code read the real clock: new Date() with no argument')
      super(...args)
    }
    static now() { throw new Error('code read the real clock: Date.now()') }
    static [Symbol.hasInstance](x) { return x instanceof RealDate }
  }
  let diffs
  globalThis.Date = NoClockDate
  try { diffs = compareSection('A (no clock)', INPUTS_A, snapshot.configA, parseA) } finally { globalThis.Date = RealDate }
  assert.strictEqual(diffs.length, 0, show(diffs))
})

// Sanity rules. Each was checked against today's output (382 entries across
// configurations A and B) BEFORE being included: all eleven already held, so all
// eleven are kept. A rule that did not hold would have been reported as a
// finding instead of being added here.
const SANITY_RULES = [
  ['amount is null or a positive number', (c) => c.amount === null || (Number.isFinite(c.amount) && c.amount > 0)],
  ['type is expense, income, transfer or null', (c) => ['expense', 'income', 'transfer', null].includes(c.type)],
  ['date is an ISO date (YYYY-MM-DD)', (c) => /^\d{4}-\d{2}-\d{2}$/.test(c.date)],
  ['an assumed type is never null', (c) => !c.assumedType || c.type !== null],
  ['no type means the row needs review', (c) => c.type !== null || c.needsReview === true],
  ['no amount means the row needs review', (c) => c.amount !== null || c.needsReview === true],
  ['a transfer has both accounts, or needs review', (c) => c.type !== 'transfer' || (c.fromAccount && c.toAccount) || c.needsReview === true],
  ['a spending context only ever appears on an expense', (c) => !c.spendingContext || c.type === 'expense'],
  ['categoryId is a string or null', (c) => c.categoryId === null || typeof c.categoryId === 'string'],
  ['contextConflict is a list', (c) => Array.isArray(c.contextConflict)],
  ['accountConflict is a list', (c) => Array.isArray(c.accountConflict)],
]
test('G7: sanity rules hold for every recorded entry', () => {
  const all = [
    ...Object.entries(snapshot.configA), ...Object.entries(snapshot.configB),
    ...Object.values(snapshot.dates).flatMap((m) => Object.entries(m)),
  ].flatMap(([text, rec]) => rec.entries.map((e) => [text, e]))
  assert.ok(all.length > 380, `only ${all.length} entries recorded`)
  const broken = []
  for (const [desc, rule] of SANITY_RULES) for (const [text, e] of all) if (!rule(e)) broken.push(`"${desc}" broken by ${JSON.stringify(text)}`)
  assert.deepStrictEqual(broken.slice(0, 10), [])
})

console.log(`\n${passed} passed, ${failed} failed`)
if (failed > 0) process.exit(1)
