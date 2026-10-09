// P11 (Money Inbox command layer) — COMPATIBILITY AND MULTI-EVENT AUDIT (C1–C7, M1–M3).
//
// Proves that old input still works after P1–P11 and that the only difference from the P0 baseline is the one
// intended one. TESTS ONLY: no product code.
//   C1  the P0 baseline files (parser, corpora, golden inputs, snapshot) are byte-for-byte what P0 froze
//   C2  every baseline, command-shaped, bare-word, mixed, date, live-rule, corpus and red-team text: the interpreter's
//       kind is exactly what it was at the P8b lock (a frozen fingerprint), so P9 to P11 changed nothing for old input
//   C3  the P10 salary and pension hooks fire on exactly TWO of those texts, both intended differences caused by P10 and
//       recorded as such: "Received my salary" and "How much did I pay for my pension?"
//   C4  the P11 hidden-mix guard fires on NONE of them
//   C5  every text the interpreter calls a transaction reaches the unchanged review path (no hook fires on it) apart
//       from the intended P10 difference "Received my salary", and its review candidates equal the parser's own output
//   C6  the frozen mixed inputs still get the interpreter's own mixed-input answer
//   C7  the Money Inbox transaction block is still the pinned 951 characters
//   M1  multi-event messages still split into the right rows
//   M2  single events whose description holds "and", "plus" or a comma stay ONE row
//   M3  Indian-grouped amounts are not split by their commas
import assert from 'node:assert'
import { readFileSync } from 'node:fs'
import { createHash } from 'node:crypto'
import { fileURLToPath } from 'node:url'
import { join } from 'node:path'
import { interpret } from './command/interpreter.js'
import { detectSalaryReceipt } from './command/salaryReceipt.js'
import { looksLikePensionEstimateRequest, pensionQuestionFromResult } from './command/pensionEstimate.js'
import { detectHiddenMix } from './command/mixedInput.js'
import { buildReviewCandidates } from './moneyInbox.js'
import { MONEY_INBOX_CORPUS, RED_TEAM_CORPUS } from './moneyInboxCorpus.js'
import { BASELINE_INPUTS, COMMAND_SHAPED_INPUTS, BARE_WORD_INPUTS, MIXED_INPUTS, DATE_SENSITIVE_INPUTS, LIVE_RULE_INPUTS } from './moneyInboxGoldenInputs.js'

let passed = 0, failed = 0
function test(name, fn) {
  try { fn(); passed++; console.log(`  PASS  ${name}`) }
  catch (e) { failed++; console.log(`  FAIL  ${name}\n        ${String(e.message).split('\n').join('\n        ')}`) }
}

const SRC = fileURLToPath(new URL('.', import.meta.url))
const read = (p) => readFileSync(join(SRC, p), 'utf8').replace(/\r\n/g, '\n')
const sha = (s) => createHash('sha256').update(s).digest('hex').slice(0, 16)
const NOW = 1_800_000_000_000
const ctx = { id: 'c', referenceDate: new Date(2026, 9, 8), goals: [{ id: 'g1', name: 'Laptop' }], categories: [{ id: 'c1', name: 'Food' }, { id: 'c3', name: 'Rent' }], learningItems: [{ id: 'l1', name: 'Power BI' }], accounts: [{ id: 'a1', name: 'SBI' }] }
const ACCOUNTS = [{ id: 'a1', name: 'SBI', type: 'bank' }, { id: 'a2', name: 'Cash', type: 'cash' }]
const RULES = [{ keyword: 'salary', category_id: 'c4', priority: 1 }, { keyword: 'rent', category_id: 'c3', priority: 1 }, { keyword: 'food', category_id: 'c1', priority: 1 }]
const REF = new Date(2026, 9, 8)

const TEXTS = [
  ...BASELINE_INPUTS, ...COMMAND_SHAPED_INPUTS, ...BARE_WORD_INPUTS, ...MIXED_INPUTS, ...DATE_SENSITIVE_INPUTS, ...LIVE_RULE_INPUTS,
  ...MONEY_INBOX_CORPUS.map((x) => x.text), ...RED_TEAM_CORPUS.map((x) => x.text),
]
const kindOf = (t) => { const r = interpret(t, ctx, NOW); return r.kind === 'clarify' ? `clarify:${r.clarification.reason}` : r.kind === 'transaction' ? 'transaction' : `${r.kind}:${r.pending ? r.pending.intent : ''}` }

test('C1: the P0 baseline files are byte-for-byte what P0 froze', () => {
  assert.equal(sha(read('moneyInbox.js')), 'd4b7ec5baba67a7d', 'the parser')
  assert.equal(sha(read('moneyInboxGoldenInputs.js')), '80033b0bfaa41892', 'the golden inputs')
  assert.equal(sha(read('moneyInboxGolden.snapshot.json')), '74fbe8bbfa06e8ad', 'the golden snapshot')
  assert.equal(sha(read('moneyInboxCorpus.js')), '8e1d908dc1c371fd', 'the corpora')
  assert.equal(sha(read('moneyInboxGolden.test.js')), '9193de66cc9ef9a1', 'the golden test')
  assert.equal(BASELINE_INPUTS.length, 16); assert.equal(MIXED_INPUTS.length, 3)
})

test('C2: the interpreter\'s answer for every old text is exactly what it was at the P8b lock', () => {
  assert.ok(TEXTS.length > 330, `texts: ${TEXTS.length}`)
  const kinds = TEXTS.map(kindOf)
  assert.equal(TEXTS.length, 340)
  assert.equal(sha(kinds.join('|')), '1625312a7ff446a4', 'fingerprint of the kind for each text')
  const count = (k) => kinds.filter((x) => x === k).length
  assert.equal(count('transaction') + kinds.filter((x) => x.startsWith('clarify')).length + kinds.filter((x) => /^(command|query|navigate)/.test(x)).length, TEXTS.length)
})

test('C3: the P10 hooks touch exactly two of the 16 baseline sentences — "Received my salary" and "How much did I pay for my pension?" — the two P10 features themselves; nothing else old', () => {
  const hooked = (t) => detectSalaryReceipt(t) || looksLikePensionEstimateRequest(t) || pensionQuestionFromResult(interpret(t, ctx, NOW))
  assert.deepStrictEqual(BASELINE_INPUTS.filter(hooked), ['Received my salary', 'How much did I pay for my pension?'], 'the 16 baseline sentences')
  assert.deepStrictEqual([...new Set(TEXTS.filter(hooked))], ['Received my salary', 'How much did I pay for my pension?'], 'all 340 old texts')
  assert.equal(interpret('How much did I pay for my pension?', ctx, NOW).kind, 'query')
  assert.ok(BASELINE_INPUTS.includes('Received my salary'), 'it is one of the 16 baseline sentences')
  assert.equal(interpret('Received my salary', ctx, NOW).kind, 'transaction', 'the interpreter itself still calls it a transaction')
})

test('C4: the hidden-mix guard fires on none of the old texts', () => {
  const fired = TEXTS.filter((t) => interpret(t, ctx, NOW).kind !== 'clarify' && detectHiddenMix(t, ctx, NOW))
  assert.deepStrictEqual(fired, [])
})

test('C5: every old transaction text reaches the unchanged review path, and the parser still gives its candidates', () => {
  const txs = TEXTS.filter((t) => interpret(t, ctx, NOW).kind === 'transaction' && t !== 'Received my salary')
  assert.ok(txs.length > 200, `transactions: ${txs.length}`)
  for (const t of txs) {
    assert.equal(detectHiddenMix(t, ctx, NOW), null, t)
    assert.ok(!detectSalaryReceipt(t) && !looksLikePensionEstimateRequest(t), t)
    const cands = buildReviewCandidates(t, { accounts: ACCOUNTS, categoryRules: RULES, referenceDate: REF })
    assert.ok(Array.isArray(cands), t)
  }
})

test('C6: the frozen mixed inputs still get the interpreter\'s mixed-input answer', () => {
  for (const t of MIXED_INPUTS) {
    const r = interpret(t, ctx, NOW)
    assert.equal(r.kind, 'clarify', t); assert.equal(r.clarification.reason, 'mixed_input', t)
    assert.deepStrictEqual(r.clarification.choices.map((c) => c.id), ['edit', 'cancel'], t)
  }
})

test('C7: the Money Inbox transaction block is still the pinned 951 characters', () => {
  const input = read('../components/money-inbox/MoneyInboxInput.jsx')
  const a = input.indexOf('const candidates = buildReviewCandidates(text, {')
  const b = input.indexOf('setReviewState({ candidates, accounts, categories })')
  assert.ok(a > 0 && b > a)
  const block = input.slice(a, b + 'setReviewState({ candidates, accounts, categories })'.length)
  assert.equal(block.length, 951); assert.equal(sha(block), '2af2a73c071add86')
})

const rowsOf = (t) => buildReviewCandidates(t, { accounts: ACCOUNTS, categoryRules: RULES, referenceDate: REF }).map((c) => `${c.type}:${c.amount}`)

test('M1: multi-event messages split into the right rows', () => {
  const cases = [
    ['salary 25000 sbi, rent 4000 sbi', ['income:25000', 'expense:4000']],
    ['lunch 100 and dinner 200 sbi', ['expense:100', 'expense:200']],
    ['coffee 80, tea 20 and snacks 50 sbi', ['expense:80', 'expense:20', 'expense:50']],
    ['bus 40 sbi, auto 60 sbi, metro 30 sbi', ['expense:40', 'expense:60', 'expense:30']],
    ['paid 500 for food and 300 for travel sbi', ['expense:500', 'expense:300']],
    ['rent 4000 sbi and then salary 25000 sbi', ['expense:4000', 'income:25000']],
    ['tea 20 sbi & coffee 30 sbi', ['expense:20', 'expense:30']],
    ['dinner with friends 500 sbi, bus 40 cash, salary 25000 sbi', ['expense:500', 'expense:40', 'income:25000']],
    ['groceries 800 sbi; petrol 500 sbi', ['expense:800', 'expense:500']],
    ['milk 40 sbi\nbread 30 sbi', ['expense:40', 'expense:30']],
  ]
  for (const [t, want] of cases) { assert.deepStrictEqual(rowsOf(t), want, t); assert.equal(detectHiddenMix(t, ctx, NOW), null, t) }
})

test('M2: single events with "and", "plus" or a comma in the description stay ONE row', () => {
  const cases = [
    ['bread and milk 120 sbi', 120], ['tea and samosa 50 sbi', 50], ['bought bread and milk 120 sbi', 120], ['rent and electricity 5000 sbi', 5000],
    ['salt, sugar and rice 300 sbi', 300], ['fish and chips plus a drink 450 sbi', 450], ['bus to goa and back 800 sbi', 800],
    ['pen and paper 60 sbi', 60], ['mom and dad gift 2000 sbi', 2000], ['paid 700 for tea and snacks sbi', 700],
  ]
  for (const [t, amount] of cases) {
    const rows = buildReviewCandidates(t, { accounts: ACCOUNTS, categoryRules: RULES, referenceDate: REF })
    assert.equal(rows.length, 1, t); assert.equal(rows[0].amount, amount, t)
    assert.equal(detectHiddenMix(t, ctx, NOW), null, t)
  }
})

test('M3: Indian-grouped amounts are not split by their commas', () => {
  for (const [t, amount] of [['salary 1,25,000 sbi', 125000], ['paid 12,500 for rent sbi', 12500], ['bought laptop 1,00,000 sbi', 100000]]) {
    const rows = buildReviewCandidates(t, { accounts: ACCOUNTS, categoryRules: RULES, referenceDate: REF })
    assert.equal(rows.length, 1, t); assert.equal(rows[0].amount, amount, t); assert.equal(detectHiddenMix(t, ctx, NOW), null, t)
  }
  assert.deepStrictEqual(rowsOf('salary 1,25,000 sbi and rent 4,000 sbi'), ['income:125000', 'expense:4000'])
})

test('M4: KNOWN LIMIT of the parser (locked, so only pinned here): "then", "also", "plus", "but" and "+" do not start a second row', () => {
  for (const j of [' then ', ' also ', ' plus ', ' but ', ' + ']) {
    const t = `rent 4000 sbi${j}tea 20 sbi`
    assert.deepStrictEqual(rowsOf(t).length, 1, `${t}: one row today`)
    assert.equal(detectHiddenMix(t, ctx, NOW), null, 'entry + entry is not a mix; the review screen shows what was read')
  }
  // the exact example recorded for a future parser decision
  assert.deepStrictEqual(rowsOf('rent 4000 sbi then dinner 500 sbi').length, 1, 'known limit: one row, not two')
})

console.log(`\n${passed} passed, ${failed} failed`)
if (failed > 0) process.exit(1)
