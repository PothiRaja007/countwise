// P0 (Money Inbox command layer) — the correctness FLOOR.
//
// Until now nothing in the automated suite ran the evaluation corpora: the
// scorer (moneyInboxEval.js) and the corpus (moneyInboxCorpus.js) were only
// ever run by hand. The header of moneyInboxCorpus.js already tells readers to
// run this exact file name; it did not exist until now.
//
// This test is deliberately ONE-DIRECTIONAL. It fails if something that works
// today stops working. It does NOT fail if the parser gets better — an
// improvement should never need a test edit. (The exact-change detector is
// moneyInboxGolden.test.js; this file is the correctness floor.)
//
// Numbers below were recorded at P0 time (5 Oct 2026) and are the state of the
// parser at that moment, including its known failures. P0 does not fix them.
import assert from 'node:assert'
import { MONEY_INBOX_CORPUS, RED_TEAM_CORPUS } from './moneyInboxCorpus.js'
import { evaluateCorpus, summarize } from './moneyInboxEval.js'

let passed = 0, failed = 0
function test(name, fn) {
  try { fn(); passed++; console.log(`  PASS  ${name}`) }
  catch (err) { failed++; console.log(`  FAIL  ${name}\n        ${err.message}`) }
}

// Items that do not pass today. Every one is tagged (ambiguous or gap) — the
// untagged headline items all pass. These lists may only SHRINK.
const KNOWN_NOT_OK_MAIN = [174] // ambiguous: "dinner with 5 friends 500"
const KNOWN_NOT_OK_RED = [1014, 1030, 1041, 1061, 1083] // 3 gap + 2 ambiguous

// Per-field results on the main headline items at P0 time: every field was
// fully right. The totals double as a guard against the corpus being edited.
const FIELD_TOTALS_AT_P0 = {
  amount: 199, type: 199, account: 192, category: 150, context: 163,
  date: 9, from: 4, to: 4, review: 7, accountConflict: 4,
}

const mainResults = evaluateCorpus(MONEY_INBOX_CORPUS)
const redResults = evaluateCorpus(RED_TEAM_CORPUS)
const countTag = (corpus, tag) => corpus.filter((i) => (tag === null ? !i.tag : i.tag === tag)).length

console.log('moneyInboxEval tests\n')

test('E1: the corpora have not been edited by accident (176 = 171 + 5 ambiguous; 83 = 78 + 3 gap + 2 ambiguous)', () => {
  assert.strictEqual(MONEY_INBOX_CORPUS.length, 176)
  assert.strictEqual(countTag(MONEY_INBOX_CORPUS, null), 171)
  assert.strictEqual(countTag(MONEY_INBOX_CORPUS, 'ambiguous'), 5)
  assert.strictEqual(RED_TEAM_CORPUS.length, 83)
  assert.strictEqual(countTag(RED_TEAM_CORPUS, null), 78)
  assert.strictEqual(countTag(RED_TEAM_CORPUS, 'gap'), 3)
  assert.strictEqual(countTag(RED_TEAM_CORPUS, 'ambiguous'), 2)
})

test('E2: all 171 main headline items are fully right', () => {
  const wrong = mainResults.filter((r) => !r.tag && !r.ok)
  assert.deepStrictEqual(
    wrong.map((r) => `#${r.id} "${r.text}" (want ${r.want} entries, got ${r.got}; fields ${JSON.stringify(r.fails)})`),
    [],
  )
})

test('E2b: all 78 untagged red-team items are fully right', () => {
  const wrong = redResults.filter((r) => !r.tag && !r.ok)
  assert.deepStrictEqual(
    wrong.map((r) => `#${r.id} "${r.text}" (want ${r.want} entries, got ${r.got}; fields ${JSON.stringify(r.fails)})`),
    [],
  )
})

test('E3: main items that fail are only ones already known to fail (the ambiguous #174)', () => {
  const failing = mainResults.filter((r) => !r.ok).map((r) => r.id)
  const unexpected = failing.filter((id) => !KNOWN_NOT_OK_MAIN.includes(id))
  assert.deepStrictEqual(unexpected, [], `newly failing main items: ${unexpected.join(', ')}`)
})

test('E4: red-team items that fail are only ones already known to fail (3 gap + 2 ambiguous)', () => {
  const failing = redResults.filter((r) => !r.ok).map((r) => r.id)
  const unexpected = failing.filter((id) => !KNOWN_NOT_OK_RED.includes(id))
  assert.deepStrictEqual(unexpected, [], `newly failing red-team items: ${unexpected.join(', ')}`)
})

test('E5: a known failure that now passes is reported, not punished', () => {
  const nowOk = [
    ...mainResults.filter((r) => r.ok && KNOWN_NOT_OK_MAIN.includes(r.id)).map((r) => r.id),
    ...redResults.filter((r) => r.ok && KNOWN_NOT_OK_RED.includes(r.id)).map((r) => r.id),
  ]
  if (nowOk.length) console.log(`        IMPROVED: ids ${nowOk.join(', ')} now pass — shorten the KNOWN_NOT_OK lists`)
  assert.ok(true)
})

test('E6: every per-field accuracy on the main headline is still 100% (and the totals still match)', () => {
  const { fields } = summarize(mainResults)
  for (const [field, total] of Object.entries(FIELD_TOTALS_AT_P0)) {
    assert.ok(fields[field], `field "${field}" is no longer evaluated`)
    assert.strictEqual(fields[field].total, total, `${field}: evaluated ${fields[field].total}, expected ${total}`)
    assert.strictEqual(fields[field].right, fields[field].total, `${field}: ${fields[field].right}/${fields[field].total} right`)
  }
})

console.log(`\n${passed} passed, ${failed} failed`)
if (failed > 0) process.exit(1)
