// P11 (Money Inbox command layer) — MIXED-INPUT MATRIX (D1–D6).
//
// Decision 5: a message that holds more than one kind of thing is never handled as both. Version 1 asks the user to do
// one thing at a time. TESTS ONLY: no product code. The test mirrors the order Money Inbox decides in:
//   interpret → (anything but a clarification) → hidden-mix guard → salary / pension panels → the review screen.
//   D1  the four known failures are now asked "one thing at a time" (they used to be a one-row review or an answer)
//   D2  the matrix: every ordered pair of six kinds of message, with four joiners; the outcome is the mixed-input
//       clarification, or the normal review for entry + entry — never an answer, a page, a handoff or a panel
//   D3  nothing in the matrix reaches a pending action, a query answer, a navigation, or a P10 panel
//   D4  the clarification offers only Edit my message and Cancel, and starts nothing
//   D5  a single request, a single entry and the P10 phrases alone still go where they went
//   D6  the order of checks: the guard runs before navigation, answering and the P10 panels
import assert from 'node:assert'
import { interpret } from './command/interpreter.js'
import { detectHiddenMix } from './command/mixedInput.js'
import { detectSalaryReceipt } from './command/salaryReceipt.js'
import { looksLikePensionEstimateRequest, pensionQuestionFromResult } from './command/pensionEstimate.js'
import { resolveGuardChoice } from './command/guardView.js'

let passed = 0, failed = 0
function test(name, fn) {
  try { fn(); passed++; console.log(`  PASS  ${name}`) }
  catch (e) { failed++; console.log(`  FAIL  ${name}\n        ${String(e.message).split('\n').join('\n        ')}`) }
}

const NOW = 1_800_000_000_000
const ctx = { id: 'c', referenceDate: new Date(2026, 9, 8), goals: [{ id: 'g1', name: 'Laptop' }], categories: [{ id: 'c1', name: 'Food' }, { id: 'c3', name: 'Rent' }], learningItems: [{ id: 'l1', name: 'Power BI' }], accounts: [{ id: 'a1', name: 'SBI' }] }

// What Money Inbox does with a typed message, in its order. 'review' = the normal review screen.
function route(text) {
  const r = interpret(text, ctx, NOW)
  if (r.kind === 'clarify') return `clarify:${r.clarification.reason}`
  if (detectHiddenMix(text, ctx, NOW)) return 'clarify:mixed_input'
  if (r.kind !== 'transaction') return pensionQuestionFromResult(r) ? 'pension-answer' : `${r.kind}`
  if (detectSalaryReceipt(text)) return 'salary-panel'
  if (looksLikePensionEstimateRequest(text)) return 'pension-panel'
  return 'review'
}

const KINDS = {
  goalCommand: 'create a goal for a laptop', budgetCommand: 'create next month budget', learningCommand: 'add Power BI to learning',
  question: 'how much did I spend on food', pensionQuestion: 'how much is my PF', page: 'open my goals',
  entry: 'rent 4000 sbi', salary: 'Received my salary', pensionPhrase: 'pension estimate',
}
const ENTRYLIKE = new Set(['entry', 'salary'])
const SAME_AS = (a, b) => [a, b].sort().join('+') === 'pensionPhrase+pensionQuestion'   // one and the same request
const JOINERS = [' and ', ', ', ' then ', ' also ']

test('D1: the four known failures now ask for one thing at a time', () => {
  for (const t of [
    'paid 8000 for a Power BI course sbi and add Power BI to learning', 'salary received and pension estimate',
    'pension estimate and rent 4000 sbi', 'show my pension estimate and create next month budget',
  ]) assert.equal(route(t), 'clarify:mixed_input', t)
})

const pairs = []
for (const [a, ta] of Object.entries(KINDS)) for (const [b, tb] of Object.entries(KINDS)) {
  if (a === b || SAME_AS(a, b)) continue
  for (const j of JOINERS) pairs.push({ a, b, j, text: ta + j + tb })
}

test('D2: every ordered pair of kinds, with four joiners: mixed-input, or the normal review for entry + entry', () => {
  assert.ok(pairs.length >= 280, `pairs: ${pairs.length}`)
  const wrong = []
  for (const p of pairs) {
    const want = ENTRYLIKE.has(p.a) && ENTRYLIKE.has(p.b) ? 'review' : 'clarify:mixed_input'
    const got = route(p.text)
    if (got !== want) wrong.push(`${got.padEnd(22)} want ${want.padEnd(22)} ${p.text}`)
  }
  assert.deepStrictEqual(wrong, [])
})

test('D3: nothing in the matrix is answered, opened, handed off or paneled', () => {
  const allowed = new Set(['review', 'clarify:mixed_input'])
  for (const p of pairs) assert.ok(allowed.has(route(p.text)), `${route(p.text)}: ${p.text}`)
})

test('D4: the clarification offers only Edit my message and Cancel, and starts nothing', () => {
  for (const p of pairs.filter((x) => route(x.text) === 'clarify:mixed_input').slice(0, 60)) {
    const hidden = detectHiddenMix(p.text, ctx, NOW)
    const result = hidden || interpret(p.text, ctx, NOW)
    assert.equal(result.kind, 'clarify')
    assert.deepStrictEqual(result.clarification.choices.map((c) => c.id), ['edit', 'cancel'], p.text)
    assert.deepStrictEqual(resolveGuardChoice(result, 'edit', NOW + 1000), { action: 'edit' }, p.text)
    assert.deepStrictEqual(resolveGuardChoice(result, 'cancel', NOW + 1000), { action: 'cancel' }, p.text)
    assert.throws(() => resolveGuardChoice(result, 'record_expense', NOW + 1000), 'there is no way to push it through as an entry')
    assert.throws(() => resolveGuardChoice(result, 'create_goal', NOW + 1000), 'and no way to start a command')
  }
})

test('D5: single requests, single entries and the P10 phrases alone still go where they went', () => {
  assert.equal(route('create a goal for a laptop'), 'command')
  assert.equal(route('how much did I spend on food'), 'query')
  assert.equal(route('open my goals'), 'navigate')
  assert.equal(route('rent 4000 sbi'), 'review')
  assert.equal(route('Received my salary'), 'salary-panel')
  assert.equal(route('pension estimate'), 'pension-panel')
  assert.equal(route('how much is my PF'), 'pension-answer')
  assert.equal(route('how much is my PF and pension estimate'), 'pension-answer', 'the same request twice, understood by the interpreter, is answered once')
  assert.equal(route('pension estimate and how much is my PF'), 'clarify:mixed_input', 'the same request twice, read as an entry, is asked (it would be an empty review row)')
  assert.equal(route('lunch 100 and dinner 200 sbi'), 'review')
  assert.equal(route('Received my salary, paid rent 4000 sbi'), 'review', 'entry + entry, including an amount-less salary row')
})

test('D6: the order of checks puts the guard before navigation, answering and the P10 panels', () => {
  // A message that is both a pension phrase at the front and an entry would, without the guard, have been a pension panel
  // (the request detector needs the whole text) or a one-row review. The guard decides first.
  assert.equal(route('open my goals and bus 40 sbi'), 'clarify:mixed_input')
  assert.equal(route('how much is my PF and rent 4000 sbi'), 'clarify:mixed_input')
  assert.equal(route('Received my salary and pension estimate'), 'clarify:mixed_input')
  assert.equal(route('Received my salary and how much is my PF?'), 'clarify:mixed_input')
})

console.log(`\n${passed} passed, ${failed} failed`)
if (failed > 0) process.exit(1)
