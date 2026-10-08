// P8 — tests for what the Learning page does with a handoff (learningDialog.js).
//
// What it must do: turn a handed-off learning command into the values to put in front of the user
// (never into a save), change the STATUS only (never progress), refuse politely when the item is gone,
// already in that status, or dropped and the target is completed/dropped, allow a dropped item to be
// revived, and ignore anything that is not a handed-off learning command.
import assert from 'node:assert'
import * as D from './learningDialog.js'
import { interpret } from './interpreter.js'
import { markHandedOff } from './pendingAction.js'
import { createHandoff, HandoffError } from './handoff.js'

let passed = 0, failed = 0
function test(name, fn) {
  try { fn(); passed++; console.log(`  PASS  ${name}`) }
  catch (err) { failed++; console.log(`  FAIL  ${name}\n${String(err.message).split('\n').map((l) => '        ' + l).join('\n')}`) }
}

const NOW = 1_800_000_000_000
const INTERPRETER_ITEMS = [{ id: 'l1', name: 'Power BI' }, { id: 'l2', name: 'SQL course' }, { id: 'l3', name: 'Old Excel' }]
const handedOff = (text) => markHandedOff(interpret(text, { id: 'pa-1', referenceDate: new Date('2026-10-07T10:00:00'), goals: [{ id: 'g1', name: 'Laptop' }], categories: [], learningItems: INTERPRETER_ITEMS, accounts: [] }, NOW).pending, NOW)
const PAGE_ITEMS = [
  { id: 'l1', name: 'Power BI', status: 'in_progress', progress_pct: 40, cost: 8000 },
  { id: 'l2', name: 'SQL course', status: 'planned', progress_pct: 0, cost: 0 },
  { id: 'l3', name: 'Old Excel', status: 'dropped', progress_pct: 10, cost: 500 },
]
const ctx = (items = PAGE_ITEMS) => ({ items })

console.log('learningDialog tests\n')

test('D1: a create command gives the form\'s name (and date if typed), with the banner; nothing is guessed', () => {
  const bare = D.learningDialogFromHandoff(handedOff('Add Power BI certification to my learning'), ctx())
  assert.strictEqual(bare.ok, true)
  assert.strictEqual(bare.dialog, 'create_item')
  assert.deepStrictEqual(bare.prefill, { name: 'Power BI certification', cost: '', targetDate: '' })
  assert.deepStrictEqual(bare.notice, ['From Money Inbox. Nothing is saved until you press Add item.'])
  const dated = D.learningDialogFromHandoff(handedOff('Add a course called Tableau by March'), ctx())
  assert.strictEqual(dated.prefill.name, 'Tableau')
  assert.strictEqual(dated.prefill.targetDate, '2027-03-31')
  assert.ok(dated.notice.some((n) => n.startsWith('Using the last day of March 2027')), 'the date assumption is repeated')
})

test('D2: a cost the interpreter read is passed on; none is invented', () => {
  const pending = handedOff('Add Tableau to my learning')
  const withCost = { ...pending, fields: { ...pending.fields, cost: { value: 5000, kind: 'planned', origin: 'typed' } } }
  assert.strictEqual(D.learningDialogFromHandoff(withCost, ctx()).prefill.cost, 5000)
  const zero = { ...pending, fields: { ...pending.fields, cost: { value: 0, kind: 'planned', origin: 'typed' } } }
  assert.strictEqual(D.learningDialogFromHandoff(zero, ctx()).prefill.cost, '', 'zero is the form\'s own default, so it is left empty')
  assert.strictEqual(D.learningDialogFromHandoff(pending, ctx()).prefill.cost, '')
})

test('D3: a status command gives the edit form for that item with ONLY the status set — progress is never touched', () => {
  const out = D.learningDialogFromHandoff(handedOff('Mark my SQL course as in progress'), ctx())
  assert.strictEqual(out.ok, true)
  assert.strictEqual(out.dialog, 'edit_status')
  assert.strictEqual(out.itemId, 'l2')
  assert.deepStrictEqual(out.prefill, { status: 'in_progress' })
  assert.strictEqual(out.notice[0], 'From Money Inbox. Nothing is saved until you press Save changes.')
  assert.deepStrictEqual(Object.keys(out.prefill), ['status'], 'no progress, cost or name key')
})

test('D4: completing an item below 100% says progress stays; at 100% it says nothing extra', () => {
  const out = D.learningDialogFromHandoff(handedOff('Mark my Power BI course as completed'), ctx())
  assert.strictEqual(out.ok, true)
  assert.deepStrictEqual(out.prefill, { status: 'completed' })
  assert.ok(out.notice.includes('Progress is still 40%. Set it to 100% if you want.'))
  const full = PAGE_ITEMS.map((i) => (i.id === 'l1' ? { ...i, progress_pct: 100 } : i))
  assert.ok(!D.learningDialogFromHandoff(handedOff('Mark my Power BI course as completed'), ctx(full)).notice.some((n) => n.startsWith('Progress is still')))
  const reopened = D.learningDialogFromHandoff(handedOff('Set my Power BI course to planned'), ctx())
  assert.ok(!reopened.notice.some((n) => n.startsWith('Progress is still')), 'only completing gets that note')
})

test('D5: an item already in that status gets a plain message and no form', () => {
  assert.deepStrictEqual(D.learningDialogFromHandoff(handedOff('Set my Power BI course to in progress'), ctx()), { ok: false, message: 'Power BI is already in progress.' })
  assert.deepStrictEqual(D.learningDialogFromHandoff(handedOff('Mark my SQL course as planned'), ctx()), { ok: false, message: 'SQL course is already planned.' })
})

test('D6: a dropped item can be revived, but not completed or dropped again', () => {
  const revive = D.learningDialogFromHandoff(handedOff('Set my Old Excel course to in progress'), ctx())
  assert.strictEqual(revive.ok, true)
  assert.deepStrictEqual(revive.prefill, { status: 'in_progress' })
  assert.strictEqual(D.learningDialogFromHandoff(handedOff('Set my Old Excel course to planned'), ctx()).ok, true)
  assert.deepStrictEqual(D.learningDialogFromHandoff(handedOff('Mark my Old Excel course as completed'), ctx()), { ok: false, message: 'Old Excel is dropped. Set it to Planned or In progress first.' })
  assert.deepStrictEqual(D.learningDialogFromHandoff(handedOff('Mark my Old Excel course as dropped'), ctx()), { ok: false, message: 'Old Excel is already dropped.' })
})

test('D7: an item that is gone gives a plain message; the page\'s own list decides, not the interpreter\'s', () => {
  const gone = PAGE_ITEMS.filter((i) => i.id !== 'l2')
  assert.deepStrictEqual(D.learningDialogFromHandoff(handedOff('Mark my SQL course as completed'), ctx(gone)), { ok: false, message: "That learning item isn't available any more." })
  assert.deepStrictEqual(D.learningDialogFromHandoff(handedOff('Mark my SQL course as completed'), ctx([])), { ok: false, message: "That learning item isn't available any more." })
  assert.deepStrictEqual(D.learningDialogFromHandoff(handedOff('Mark my SQL course as completed'), undefined), { ok: false, message: "That learning item isn't available any more." })
})

test('D8: anything that is not a handed-off learning command is ignored without a message', () => {
  const IGNORE = { ok: false, message: null }
  assert.deepStrictEqual(D.learningDialogFromHandoff(null, ctx()), IGNORE)
  assert.deepStrictEqual(D.learningDialogFromHandoff({}, ctx()), IGNORE)
  assert.deepStrictEqual(D.learningDialogFromHandoff('x', ctx()), IGNORE)
  const notHanded = interpret('Add Tableau to my learning', { id: 'p', referenceDate: new Date('2026-10-07T10:00:00'), learningItems: [] }, NOW).pending
  assert.deepStrictEqual(D.learningDialogFromHandoff(notHanded, ctx()), IGNORE, 'a ready (not handed-off) action is not accepted')
  const goal = markHandedOff(interpret('Create a goal called Bike', { id: 'p', referenceDate: new Date('2026-10-07T10:00:00'), goals: [] }, NOW).pending, NOW)
  assert.deepStrictEqual(D.learningDialogFromHandoff(goal, ctx()), IGNORE, 'a goal command is not ours')
  const noName = { ...handedOff('Add Tableau to my learning'), fields: {} }
  assert.deepStrictEqual(D.learningDialogFromHandoff(noName, ctx()), IGNORE)
  const badStatus = handedOff('Mark my SQL course as completed')
  assert.deepStrictEqual(D.learningDialogFromHandoff({ ...badStatus, fields: { ...badStatus.fields, newStatus: { value: 'archived' } } }, ctx()), IGNORE)
})

test('D9: canChangeStatus — same status, dropped→completed/dropped refused; everything else allowed', () => {
  const S = ['planned', 'in_progress', 'completed', 'dropped']
  for (const a of S) for (const b of S) {
    const r = D.canChangeStatus(a, b)
    if (a === b) assert.deepStrictEqual(r, { ok: false, reason: 'same' }, `${a}→${b}`)
    else if (a === 'dropped' && (b === 'completed')) assert.deepStrictEqual(r, { ok: false, reason: 'dropped' }, `${a}→${b}`)
    else assert.strictEqual(r.ok, true, `${a}→${b}`)
  }
  assert.strictEqual(D.canChangeStatus('planned', 'archived').ok, false)
})

test('D10: RECORD_LEARNING_PAYMENT stays out of P8 — the interpreter never returns it and it cannot be handed off', () => {
  for (const text of ['Paid ₹8,000 for a Power BI certification', 'I paid 8000 for Tableau course', 'paid 8000 for power bi certification from SBI']) {
    const r = interpret(text, { id: 'p', referenceDate: new Date('2026-10-07T10:00:00'), learningItems: INTERPRETER_ITEMS, accounts: [{ id: 'a1', name: 'SBI' }] }, NOW)
    assert.strictEqual(r.kind, 'transaction', text)
  }
  assert.throws(() => createHandoff({ intent: 'RECORD_LEARNING_PAYMENT' }, 'u1', NOW), HandoffError)
})

test('D11: purity — results are frozen and the input is not changed', () => {
  const pending = handedOff('Mark my SQL course as completed')
  const before = JSON.stringify(pending)
  const out = D.learningDialogFromHandoff(pending, ctx())
  assert.ok(Object.isFrozen(out) && Object.isFrozen(out.prefill) && Object.isFrozen(out.notice))
  assert.strictEqual(JSON.stringify(pending), before)
  assert.deepStrictEqual(D.learningDialogFromHandoff(pending, ctx()), out)
})

console.log(`\n${passed} passed, ${failed} failed`)
if (failed) process.exit(1)
