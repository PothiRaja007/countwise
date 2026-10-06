// P1 — tests for the answer key (expectedRouting.js).
//
// The key says how each of the 41 sentences frozen in P0 should be routed. These
// tests check it is complete, agrees with the contracts, pins the product
// decisions (mixed input asks; bare words ask; the three dangerous sentences are
// no longer treated as expenses), and that EVERYTHING else P0 froze stays a
// transaction — so P3 can never turn a real transaction into a command.
import assert from 'node:assert'
import { EXPECTED_ROUTING, expectedRoutingFor } from './expectedRouting.js'
import { CONTRACTS, CLARIFY_REASONS, ALLOWED_PAGES } from './intents.js'
import { MONEY_INBOX_CORPUS, RED_TEAM_CORPUS } from '../moneyInboxCorpus.js'
import {
  BASELINE_INPUTS, COMMAND_SHAPED_INPUTS, BARE_WORD_INPUTS, MIXED_INPUTS, DATE_SENSITIVE_INPUTS, LIVE_RULE_INPUTS,
} from '../moneyInboxGoldenInputs.js'

let passed = 0, failed = 0
function test(name, fn) {
  try { fn(); passed++; console.log(`  PASS  ${name}`) }
  catch (err) { failed++; console.log(`  FAIL  ${name}\n${String(err.message).split('\n').map((l) => '        ' + l).join('\n')}`) }
}

const KEYED = [...BASELINE_INPUTS, ...COMMAND_SHAPED_INPUTS, ...BARE_WORD_INPUTS, ...MIXED_INPUTS]
const entryFor = (text) => EXPECTED_ROUTING.find((e) => e.text === text)

console.log('expectedRouting tests\n')

test('X1: all 41 sentences from the P0 lists have an entry — no more, no fewer, no repeats', () => {
  assert.strictEqual(new Set(KEYED).size, 41, 'the P0 lists should hold 41 different sentences')
  const have = EXPECTED_ROUTING.map((e) => e.text)
  assert.strictEqual(new Set(have).size, have.length, 'a sentence appears twice')
  assert.deepStrictEqual({ missing: KEYED.filter((t) => !have.includes(t)), stale: have.filter((t) => !KEYED.includes(t)) }, { missing: [], stale: [] })
  assert.strictEqual(EXPECTED_ROUTING.length, 41)
})

test('X2: every entry agrees with the contracts (and the contracts\' examples agree with the key)', () => {
  const pageIds = ALLOWED_PAGES.map((p) => p.id)
  for (const e of EXPECTED_ROUTING) {
    if (e.kind === 'transaction') {
      assert.strictEqual(e.intent, 'RECORD_TRANSACTION', e.text)
      if (e.laterIntent) assert.ok(CONTRACTS[e.laterIntent] && CONTRACTS[e.laterIntent].class === 'RECORD', `${e.text}: laterIntent`)
    } else if (e.kind === 'command') {
      assert.ok(['CREATE', 'MODIFY'].includes(CONTRACTS[e.intent]?.class), `${e.text}: a command must be a CREATE or MODIFY intent`)
    } else if (e.kind === 'query') {
      assert.strictEqual(CONTRACTS[e.intent]?.class, 'QUERY', `${e.text}: a question must be a QUERY intent`)
    } else if (e.kind === 'navigate') {
      assert.strictEqual(e.intent, 'NAVIGATE', e.text)
      assert.ok(pageIds.includes(e.page), `${e.text}: ${e.page} is not an allowed page`)
    } else if (e.kind === 'clarify') {
      assert.ok(CLARIFY_REASONS.includes(e.reason), `${e.text}: reason ${e.reason}`)
      assert.strictEqual(e.intent, undefined, `${e.text}: a clarification has no intent`)
    } else assert.fail(`${e.text}: unknown kind ${e.kind}`)
    if (['command', 'query', 'navigate'].includes(e.kind)) {
      assert.ok(CONTRACTS[e.intent].examples.includes(e.text), `${e.text} is not listed as an example of ${e.intent}`)
    }
  }
  // And the other way round: every example in a contract is in the key under that intent.
  for (const c of Object.values(CONTRACTS)) {
    for (const ex of c.examples) {
      const e = entryFor(ex)
      assert.ok(e, `${c.id}: example "${ex}" is not in the answer key`)
      assert.ok(e.intent === c.id || e.laterIntent === c.id, `${c.id}: "${ex}" is keyed to ${e.intent}`)
    }
  }
})

test('X3: the product decisions are pinned — mixed input asks, bare words ask, and the three dangerous sentences are no longer expenses', () => {
  for (const t of MIXED_INPUTS) assert.deepStrictEqual([entryFor(t).kind, entryFor(t).reason], ['clarify', 'mixed_input'], t)
  for (const t of BARE_WORD_INPUTS) assert.deepStrictEqual([entryFor(t).kind, entryFor(t).reason], ['clarify', 'bare_word'], t)
  assert.strictEqual(entryFor('Power BI').kind, 'clarify')
  const create = entryFor('Create a goal for a laptop worth ₹50,000')
  assert.deepStrictEqual([create.kind, create.intent], ['command', 'CREATE_GOAL'])
  const need = entryFor('I need 50000 for a laptop')
  assert.deepStrictEqual([need.kind, need.reason], ['clarify', 'competing_meaning'])
  const add = entryFor('Add ₹2,000 to that goal')
  assert.deepStrictEqual([add.kind, add.intent], ['command', 'MODIFY_GOAL_CONTRIBUTE'])
  // Nothing command-shaped, question-shaped, bare or mixed is a transaction.
  for (const t of [...COMMAND_SHAPED_INPUTS, ...BARE_WORD_INPUTS, ...MIXED_INPUTS]) assert.notStrictEqual(entryFor(t).kind, 'transaction', t)
})

test('X4: every other sentence P0 froze (both corpora, the dates, the live rules) stays a transaction — P3 may never turn one into a command', () => {
  const others = [
    ...MONEY_INBOX_CORPUS.map((i) => i.text), ...RED_TEAM_CORPUS.map((i) => i.text),
    ...DATE_SENSITIVE_INPUTS, ...LIVE_RULE_INPUTS,
  ]
  assert.strictEqual(others.length, 176 + 83 + 8 + 32, 'the P0 lists changed size')
  const wrong = others.filter((t) => expectedRoutingFor(t).kind !== 'transaction').map((t) => `${JSON.stringify(t)} -> ${expectedRoutingFor(t).kind}`)
  assert.deepStrictEqual(wrong, [])
  const unlisted = others.filter((t) => !entryFor(t))
  assert.ok(unlisted.length > 250, 'most of them are covered by the default rather than by an entry')
  for (const t of unlisted.slice(0, 20)) assert.deepStrictEqual(expectedRoutingFor(t), { kind: 'transaction', intent: 'RECORD_TRANSACTION', explicit: false })
  assert.deepStrictEqual(expectedRoutingFor('some sentence nobody froze').kind, 'transaction')
  assert.strictEqual(expectedRoutingFor('Open my goals').explicit, true)
})

test('X5: the two sentences that stay transactions for now but gain a better intent later are marked, and those intents exist', () => {
  const later = EXPECTED_ROUTING.filter((e) => e.laterIntent)
  assert.deepStrictEqual(later.map((e) => [e.text, e.laterIntent]), [
    ['Paid ₹8,000 for a Power BI certification', 'RECORD_LEARNING_PAYMENT'],
    ['Received my salary', 'RECORD_SALARY'],
  ])
  assert.strictEqual(CONTRACTS.RECORD_LEARNING_PAYMENT.availableFrom, 'P8')
  assert.strictEqual(CONTRACTS.RECORD_SALARY.availableFrom, 'P10')
  assert.ok(Object.isFrozen(EXPECTED_ROUTING) && Object.isFrozen(EXPECTED_ROUTING[0]))
})

console.log(`\n${passed} passed, ${failed} failed`)
if (failed > 0) process.exit(1)
