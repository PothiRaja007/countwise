// P11 — tests for the hidden-mix guard (mixedInput.js).
//
// What it must do: catch a message that holds a request (command, question, page, pension estimate) AND an entry, or
// two different requests, that the interpreter did not catch; answer exactly as the interpreter does for mixed input
// (one choice, Edit my message, plus Cancel); leave every normal entry, multi-row entry, single-event description with
// "and" and every request alone; never throw; and change nothing it is given.
import assert from 'node:assert'
import * as M from './mixedInput.js'
import { interpret } from './interpreter.js'
import { PENDING_ACTION_TTL_MS } from './pendingAction.js'

let passed = 0, failed = 0
function test(name, fn) {
  try { fn(); passed++; console.log(`  PASS  ${name}`) }
  catch (err) { failed++; console.log(`  FAIL  ${name}\n${String(err.message).split('\n').map((l) => '        ' + l).join('\n')}`) }
}

const NOW = 1_800_000_000_000
const ctx = {
  id: 'c', referenceDate: new Date(2026, 9, 8),
  goals: [{ id: 'g1', name: 'Laptop' }], categories: [{ id: 'c1', name: 'Food' }, { id: 'c3', name: 'Rent' }],
  learningItems: [{ id: 'l1', name: 'Power BI', status: 'planned' }], accounts: [{ id: 'a1', name: 'SBI' }],
}
const mix = (t, c = ctx) => M.detectHiddenMix(t, c, NOW)

const KNOWN_FOUR = [
  'paid 8000 for a Power BI course sbi and add Power BI to learning',
  'salary received and pension estimate',
  'pension estimate and rent 4000 sbi',
  'show my pension estimate and create next month budget',
]

test('X1: the four known failures are caught', () => {
  for (const t of KNOWN_FOUR) {
    assert.equal(interpret(t, ctx, NOW).kind !== 'clarify', true, `${t}: the interpreter did not catch it`)
    assert.ok(mix(t), t)
  }
})

test('X2: the answer is the interpreter\'s own mixed-input answer — one choice "edit", then Cancel, the same note', () => {
  const ours = mix(KNOWN_FOUR[1])
  const theirs = interpret('salary 25k received and create a goal for a laptop', ctx, NOW)
  assert.equal(theirs.kind, 'clarify'); assert.equal(theirs.clarification.reason, 'mixed_input')
  assert.equal(ours.kind, theirs.kind); assert.equal(ours.clarification.reason, theirs.clarification.reason)
  assert.deepStrictEqual(ours.clarification.choices, theirs.clarification.choices)
  assert.deepStrictEqual(ours.clarification.choices.map((c) => c.id), ['edit', 'cancel'])
  assert.deepStrictEqual([...ours.notes], [...theirs.notes])
  assert.deepStrictEqual([...ours.asks], [])
  assert.equal(ours.clarification.source, KNOWN_FOUR[1])
  assert.equal(ours.clarification.createdAt, NOW); assert.equal(ours.clarification.expiresAt, NOW + PENDING_ACTION_TTL_MS)
  assert.equal(M.MIXED_INPUT_MESSAGES.note, 'Please do one thing at a time: a command, a question, or an entry.')
  assert.equal(M.MIXED_INPUT_MESSAGES.editLabel, 'Edit my message')
})

test('X3: every joiner works, in both orders', () => {
  for (const j of [' and ', ', ', ' then ', ' also ', ' plus ', ' but ', '; ', ' and then ']) {
    assert.ok(mix(`pension estimate${j}rent 4000 sbi`), `pension${j}entry`)
    assert.ok(mix(`rent 4000 sbi${j}pension estimate`), `entry${j}pension`)
    assert.ok(mix(`paid 8000 for a Power BI course sbi${j}add Power BI to learning`), `entry${j}command`)
  }
})

test('X4: entry + entry is NOT a mix (several purchases, an amount-less salary row next to a payment)', () => {
  for (const t of [
    'salary 25000 sbi, rent 4000 sbi', 'lunch 100 and dinner 200 sbi', 'coffee 80, tea 20 and snacks 50', 'Received my salary, paid rent 4000 sbi',
    'received my salary and bought a laptop', 'bought laptop 50000 and paid for course 3000', 'paid 3000 for an Excel course sbi, bus 40 sbi',
    'paid rent 4000 and electricity bill 1200 sbi', 'gave 500 to mom and then bought groceries 800', 'salary 25000 sbi and bonus 5000',
    'dinner with friends 500 bank, bus 40 wallet, salary 25000', 'sent 5000 to savings goal and paid rent 4000 sbi', 'spent 500 on food and 300 on travel',
    'paid 700 for learning app subscription and 90 for coffee', 'goal party snacks 300 sbi and cab 250', 'budget meeting snacks 200 and tea 20',
  ]) assert.equal(mix(t), null, t)
})

test('X5: a single event whose description holds "and", "plus" or a comma is NOT a mix', () => {
  for (const t of [
    'bread and milk 120 sbi', 'tea and samosa 50 sbi', 'bought bread and milk 120 sbi', 'rent and electricity 5000 sbi', 'milk and bread',
    'salt, sugar and rice 300', 'fish and chips plus a drink 450 sbi', 'salary 1,25,000 sbi and rent 4,000 sbi', 'bus to goa and back 800',
    'add milk 40 and bread 30', 'create art supplies 300 and paste 50', 'show me the money 500 sbi and tea 20',
  ]) assert.equal(mix(t), null, t)
})

test('X6: a lone request, or a request repeated in the same kind, is left to the interpreter', () => {
  for (const t of ['pension estimate', 'Received my salary', 'how much is my PF and pension estimate',
    'open my goals', 'how much did I spend on food and travel this month', 'show my goals and budgets', 'create a goal for a laptop worth 50000 and a phone',
    'what is my balance in sbi and cash', 'add 500 to my laptop goal and phone goal']) assert.equal(mix(t), null, t)
})

test('X6b: the same pension request said twice is asked only when the interpreter read it as an entry (it would be an empty review row)', () => {
  assert.equal(interpret('pension estimate and show my pension estimate', ctx, NOW).kind, 'transaction')
  assert.ok(mix('pension estimate and show my pension estimate'))
  assert.ok(mix('pension estimate and how much is my PF'))
  assert.equal(interpret('how much is my PF and pension estimate', ctx, NOW).kind, 'query')
  assert.equal(mix('how much is my PF and pension estimate'), null, 'the interpreter answers it once')
})

test('X7: two requests of different kinds are a mix; a request + an entry are a mix', () => {
  for (const t of [
    'create a goal for a laptop and pension estimate', 'how much did I spend on food and pension estimate', 'open my goals, pension estimate',
    'set my food budget to 5000 and rent budget to 4000', 'create next month budget then pension estimate',
    'how much did I spend on food and paid 200 for lunch sbi', 'open my goals and bus 40 sbi',
  ]) assert.ok(mix(t), t)
})

test('X8: a bare word is not a request', () => {
  assert.equal(mix('milk and pension'), null)
  assert.equal(mix('goal and 500 sbi'), null)
  assert.equal(mix('rent and 4000 sbi'), null)
})

test('X9: lists with extra fields, missing lists and odd context never break it', () => {
  assert.ok(mix(KNOWN_FOUR[0], ctx))
  assert.ok(mix(KNOWN_FOUR[0], {}))
  assert.ok(mix(KNOWN_FOUR[0], undefined))
  assert.ok(mix(KNOWN_FOUR[0], { goals: 'nope', categories: null, learningItems: [null, {}, { id: 1 }], accounts: 5, referenceDate: 'x' }))
  assert.ok(mix(KNOWN_FOUR[1], { id: 7 }))
})

test('X10: bad input throws, odd text returns null, nothing is ever thrown for text', () => {
  for (const bad of [undefined, null, 5, {}, ['x']]) assert.throws(() => M.detectHiddenMix(bad, ctx, NOW), TypeError)
  for (const bad of [undefined, null, '1', NaN, Infinity]) assert.throws(() => M.detectHiddenMix('a and b', ctx, bad), TypeError)
  for (const t of ['', '   ', 'and', ',', ' and , then ; ', '💸 and 🚀', 'a'.repeat(500), 'x and '.repeat(20) + 'pension estimate', '\u0000 and \u0001']) assert.equal(mix(t), null, JSON.stringify(t).slice(0, 40))
})

test('X11: a long message and a message with too many clauses are left alone', () => {
  assert.equal(mix('pension estimate and rent 4000 sbi' + ' '.repeat(10) + 'x'.repeat(400)), null)
  assert.equal(mix(['rent 4000', 'tea 20', 'milk 30', 'bus 40', 'fuel 50', 'food 60', 'toll 70', 'park 80', 'pension estimate'].join(', ')), null, 'nine clauses')
  assert.ok(mix(['rent 4000', 'tea 20', 'milk 30', 'pension estimate'].join(', ')), 'four clauses are fine')
})

test('X12: inputs are not changed, the answer is deeply frozen, the same input gives the same answer', () => {
  const c = JSON.parse(JSON.stringify({ ...ctx, referenceDate: undefined })); c.referenceDate = ctx.referenceDate
  const before = JSON.stringify(c)
  const a = M.detectHiddenMix(KNOWN_FOUR[2], c, NOW)
  assert.equal(JSON.stringify(c), before)
  assert.ok(Object.isFrozen(a) && Object.isFrozen(a.clarification) && Object.isFrozen(a.clarification.choices) && Object.isFrozen(a.notes))
  assert.deepStrictEqual(a, M.detectHiddenMix(KNOWN_FOUR[2], c, NOW))
  assert.ok(Object.isFrozen(M.MIXED_INPUT_MESSAGES))
})

test('X13: a clause the interpreter calls unclear (not a bare word) counts as a request; list rows with extra fields are accepted', () => {
  assert.ok(mix('my pension estimate and delete my goal'), 'unclear command + pension request')
  assert.equal(mix('milk and pension estimate'), null, 'a bare word is not a request')
  const rich = { ...ctx, categories: [{ id: 'c1', name: 'Food', status: 'x', kind: 'expense' }], goals: [{ id: 'g1', name: 'Laptop', status: 'active', target: 5 }] }
  assert.ok(mix('show my pension estimate and create next month budget', rich), 'extra fields on list rows do not switch the guard off')
  assert.ok(mix('paid 8000 for a Power BI course sbi and add Power BI to learning', { ...ctx, learningItems: [{ id: 'l1', name: 'Power BI', status: 'planned', extra: 1 }] }))
})

test('X14: a word that makes the interpreter itself throw ("constructor") never makes the guard throw', () => {
  for (const t of ['rent 4000 sbi and constructor', 'constructor, pension estimate', 'constructor and constructor', 'toString, rent 4000 sbi']) {
    assert.doesNotThrow(() => mix(t), t)
  }
  assert.ok(mix('constructor and pension estimate') === null || typeof mix('constructor and pension estimate') === 'object')
  assert.ok(mix('pension estimate and rent 4000 sbi, constructor'), 'the other clauses still count')
})

console.log(`\n${passed} passed, ${failed} failed`)
process.exit(failed ? 1 : 0)
