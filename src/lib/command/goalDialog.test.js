// P7 — tests for what the Goals page does with a handoff (goalDialog.js).
//
// What it must do: turn a handed-off goal command into the values to put in front of the
// user (never into a save), refuse politely when the goal is gone, finished, archived or the
// limit is reached, fill the account only if the user typed it, ignore anything that is not
// a handed-off goal command, and name a just-created goal only when it is certain.
import assert from 'node:assert'
import * as D from './goalDialog.js'
import { interpret } from './interpreter.js'
import { markHandedOff, createPendingAction, cancelPendingAction } from './pendingAction.js'

let passed = 0, failed = 0
function test(name, fn) {
  try { fn(); passed++; console.log(`  PASS  ${name}`) }
  catch (err) { failed++; console.log(`  FAIL  ${name}\n${String(err.message).split('\n').map((l) => '        ' + l).join('\n')}`) }
}

const NOW = 1_800_000_000_000
const INTERPRETER_GOALS = [{ id: 'g1', name: 'Laptop' }, { id: 'g2', name: 'Bike' }]
const interpreterAccounts = [{ id: 'a1', name: 'SBI' }, { id: 'a2', name: 'HDFC' }]
const handedOff = (text) => markHandedOff(interpret(text, { id: 'pa-1', referenceDate: new Date('2026-10-07T10:00:00'), goals: INTERPRETER_GOALS, categories: [], learningItems: [], accounts: interpreterAccounts }, NOW).pending, NOW)
const PAGE_GOALS = [
  { id: 'g1', name: 'Laptop', status: 'active', target_amount: 50000 },
  { id: 'g2', name: 'Bike', status: 'completed', target_amount: 80000 },
  { id: 'g3', name: 'Old phone', status: 'archived', target_amount: 20000 },
]
const PAGE_ACCOUNTS = [{ id: 'a1', name: 'SBI', type: 'bank' }, { id: 'a2', name: 'HDFC', type: 'bank' }]
const ctx = (extra = {}) => ({ goals: PAGE_GOALS, accounts: PAGE_ACCOUNTS, activeCount: 1, activeLimit: 10, ...extra })
const plain = (v) => JSON.parse(JSON.stringify(v))

console.log('goalDialog tests\n')

test('D1: a create command gives the form\'s name, target and date, with the banner and the assumption note', () => {
  const full = D.goalDialogFromHandoff(handedOff('Create a goal called Laptop for 50000 by December'), ctx())
  assert.strictEqual(full.ok, true)
  assert.strictEqual(full.dialog, 'create_goal')
  assert.deepStrictEqual(full.prefill, { name: 'Laptop', targetAmount: 50000, targetDate: '2026-12-31' })
  assert.strictEqual(full.notice[0], 'From Money Inbox. Nothing is saved until you press Create goal.')
  assert.ok(full.notice.some((n) => n.startsWith('Using the last day of December 2026')), 'the date assumption is repeated')
  const bare = D.goalDialogFromHandoff(handedOff('Create a goal called Bike'), ctx())
  assert.deepStrictEqual(bare.prefill, { name: 'Bike', targetAmount: '', targetDate: '' }, 'no target and no date are left empty, not guessed')
  assert.deepStrictEqual(bare.notice, ['From Money Inbox. Nothing is saved until you press Create goal.'])
  const worth = D.goalDialogFromHandoff(handedOff('Create a goal for a laptop worth ₹50,000'), ctx())
  assert.deepStrictEqual(worth.prefill, { name: 'laptop', targetAmount: 50000, targetDate: '' }, 'the name is used as typed')
})

test('D2: the ten-goal limit gives the page\'s own message and no form', () => {
  const out = D.goalDialogFromHandoff(handedOff('Create a goal called Bike'), ctx({ activeCount: 10 }))
  assert.deepStrictEqual(out, { ok: false, message: 'You can only have 10 active goals at once. Archive or complete a goal to add another.' })
  assert.strictEqual(D.goalDialogFromHandoff(handedOff('Create a goal called Bike'), ctx({ activeCount: 9 })).ok, true, 'nine is fine')
  assert.strictEqual(D.goalDialogFromHandoff(handedOff('Create a goal called Bike'), ctx({ activeCount: 11 })).ok, false)
})

test('D3: a contribution gives the goal and the amount; the account is blank unless typed', () => {
  const out = D.goalDialogFromHandoff(handedOff('Add ₹2,000 to my laptop goal'), ctx())
  assert.deepStrictEqual(plain(out), { ok: true, dialog: 'contribute', goalId: 'g1', prefill: { amount: 2000, accountId: '' }, notice: ['From Money Inbox. Nothing is saved until you press Contribute.'] })
  const typed = D.goalDialogFromHandoff(handedOff('Add 2000 to my laptop goal from SBI'), ctx())
  assert.strictEqual(typed.prefill.accountId, 'a1')
  const hdfc = D.goalDialogFromHandoff(handedOff('Add 2000 to my laptop goal from HDFC'), ctx())
  assert.strictEqual(hdfc.prefill.accountId, 'a2')
})

test('D4: a typed account that no longer exists is left blank, never replaced by another', () => {
  const out = D.goalDialogFromHandoff(handedOff('Add 2000 to my laptop goal from SBI'), ctx({ accounts: [PAGE_ACCOUNTS[1]] }))
  assert.strictEqual(out.ok, true)
  assert.strictEqual(out.prefill.accountId, '')
  assert.strictEqual(D.goalDialogFromHandoff(handedOff('Add 2000 to my laptop goal from SBI'), ctx({ accounts: [] })).prefill.accountId, '')
})

test('D5: a goal that is gone, completed or archived gives a plain message and no dialog', () => {
  const gone = D.goalDialogFromHandoff(handedOff('Add 2000 to my laptop goal'), ctx({ goals: [PAGE_GOALS[1]] }))
  assert.deepStrictEqual(gone, { ok: false, message: "That goal isn't available any more." })
  const done = markHandedOff(interpret('Add 2000 to my bike goal', { id: 'pa-2', referenceDate: new Date('2026-10-07T10:00:00'), goals: INTERPRETER_GOALS, categories: [], learningItems: [], accounts: [] }, NOW).pending, NOW)
  assert.deepStrictEqual(D.goalDialogFromHandoff(done, ctx()), { ok: false, message: 'Bike is already completed. You can start a new cycle from the Completed tab.' })
  const archived = markHandedOff(createPendingAction({ id: 'pa-3', intent: 'MODIFY_GOAL_CONTRIBUTE', source: 'add 2000 to old phone goal', fields: { goal: { value: { id: 'g3', name: 'Old phone' }, kind: 'actual', origin: 'matched' }, amount: { value: 2000, kind: 'actual', origin: 'typed' } } }, NOW), NOW)
  assert.deepStrictEqual(D.goalDialogFromHandoff(archived, ctx()), { ok: false, message: 'Old phone is archived.' })
  const odd = D.goalDialogFromHandoff(handedOff('Add 2000 to my laptop goal'), ctx({ goals: [{ ...PAGE_GOALS[0], status: 'something_else' }] }))
  assert.strictEqual(odd.ok, false, 'only an active goal can take a contribution')
})

test('D6: only a handed-off goal command is read — anything else is ignored without a word', () => {
  const ready = interpret('Add 2000 to my laptop goal', { id: 'pa-4', referenceDate: new Date('2026-10-07T10:00:00'), goals: INTERPRETER_GOALS, categories: [], learningItems: [], accounts: [] }, NOW).pending
  assert.strictEqual(ready.status, 'ready')
  const IGNORED = { ok: false, message: null }
  assert.deepStrictEqual(D.goalDialogFromHandoff(ready, ctx()), IGNORED, 'not handed off yet')
  assert.deepStrictEqual(D.goalDialogFromHandoff(cancelPendingAction(ready, NOW), ctx()), IGNORED, 'cancelled')
  const budget = markHandedOff(createPendingAction({ id: 'pb', intent: 'CREATE_BUDGET_MONTH', source: 'create next months budget', fields: { month: { value: { label: 'November 2026' }, kind: 'planned', origin: 'typed' } } }, NOW), NOW)
  assert.deepStrictEqual(D.goalDialogFromHandoff(budget, ctx()), IGNORED, 'another owner\'s intent')
  for (const bad of [null, undefined, {}, 'x', 5, { status: 'handed_off' }, { status: 'handed_off', intent: 'CREATE_GOAL', fields: {} }, { status: 'handed_off', intent: 'MODIFY_GOAL_CONTRIBUTE', fields: {} }]) {
    assert.deepStrictEqual(D.goalDialogFromHandoff(bad, ctx()), IGNORED, JSON.stringify(bad))
  }
  assert.deepStrictEqual(D.goalDialogFromHandoff(handedOff('Add 2000 to my laptop goal'), null), { ok: false, message: "That goal isn't available any more." }, 'no page data means the goal cannot be found')
})

test('D7: the amount is only what was typed — nothing is computed, capped or rounded', () => {
  assert.strictEqual(D.goalDialogFromHandoff(handedOff('Add 2k to my laptop goal'), ctx()).prefill.amount, 2000)
  assert.strictEqual(D.goalDialogFromHandoff(handedOff('Add 99999999 to my laptop goal'), ctx()).prefill.amount, 99999999, 'the dialog\'s own balance rule refuses it later, not this module')
  const zero = { ...handedOff('Add 2000 to my laptop goal'), fields: { ...handedOff('Add 2000 to my laptop goal').fields, amount: { value: 0, kind: 'actual', origin: 'typed' } } }
  assert.strictEqual(D.goalDialogFromHandoff(zero, ctx()).ok, false)
})

test('D8: pickCreatedGoal names the new goal only when exactly one new goal matches what was saved', () => {
  const saved = { name: 'Laptop', targetAmount: 50000 }
  const row = (id, extra = {}) => ({ id, name: 'Laptop', target_amount: 50000, status: 'active', ...extra })
  assert.deepStrictEqual(plain(D.pickCreatedGoal([row('n1')], [], saved)), { id: 'n1', name: 'Laptop' })
  assert.deepStrictEqual(plain(D.pickCreatedGoal([row('old'), row('n1')], ['old'], saved)), { id: 'n1', name: 'Laptop' }, 'an older goal with the same name is not the new one')
  assert.deepStrictEqual(plain(D.pickCreatedGoal([row(7)], [], saved)), { id: '7', name: 'Laptop' }, 'ids are text')
  assert.deepStrictEqual(plain(D.pickCreatedGoal([row('n1', { target_amount: '50000.00' })], [], saved)), { id: 'n1', name: 'Laptop' }, 'the database may return the amount as text')
  // cannot tell for sure → nothing
  assert.strictEqual(D.pickCreatedGoal([row('n1'), row('n2')], [], saved), null, 'two new matches (another tab, a repeat): cannot tell')
  assert.strictEqual(D.pickCreatedGoal([], [], saved), null, 'not found')
  assert.strictEqual(D.pickCreatedGoal([row('old')], ['old'], saved), null, 'only the old one')
  assert.strictEqual(D.pickCreatedGoal([row('n1', { name: 'laptop' })], [], saved), null, 'a different name')
  assert.strictEqual(D.pickCreatedGoal([row('n1', { target_amount: 40000 })], [], saved), null, 'a different target')
  assert.strictEqual(D.pickCreatedGoal([row('n1', { status: 'archived' })], [], saved), null, 'not active')
  assert.strictEqual(D.pickCreatedGoal([row('n1')], [], { name: 'Laptop' }), null)
  assert.strictEqual(D.pickCreatedGoal([row('n1')], [], { name: '', targetAmount: 50000 }), null)
  for (const rows of [null, undefined, 'x', {}, [null], [undefined, 5]]) assert.strictEqual(D.pickCreatedGoal(rows, [], saved), null)
  assert.strictEqual(D.pickCreatedGoal([row('n1')], null, saved), null, 'the ids known before must be given')
  assert.strictEqual(D.pickCreatedGoal([row('n1')], [], null), null)
})

test('D9: pure — results are frozen, inputs are never changed, and the module imports only intents.js', async () => {
  const pending = handedOff('Add 2000 to my laptop goal from SBI')
  const c = ctx()
  const snapshot = plain({ pending, c })
  const out = D.goalDialogFromHandoff(pending, c)
  assert.deepStrictEqual(plain({ pending, c }), snapshot)
  assert.ok(Object.isFrozen(out) && Object.isFrozen(out.prefill) && Object.isFrozen(out.notice))
  assert.ok(Object.isFrozen(D.goalDialogFromHandoff(null, c)))
  assert.ok(Object.isFrozen(D.pickCreatedGoal([{ id: 'n', name: 'Laptop', target_amount: 5, status: 'active' }], [], { name: 'Laptop', targetAmount: 5 })))
  assert.deepStrictEqual(Object.keys(D).sort(), ['GOAL_DIALOG_MESSAGES', 'goalDialogFromHandoff', 'pickCreatedGoal'])
  assert.strictEqual(D.GOAL_DIALOG_MESSAGES.dialogOpen, 'A goal form is already open. Finish or close it first, then send your message again.')
})

console.log(`\n${passed} passed, ${failed} failed`)
if (failed > 0) process.exit(1)
