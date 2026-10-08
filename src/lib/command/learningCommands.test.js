// P8 — tests for the learning commands on the Money Inbox side (learningCommands.js).
//
// What it must do: add "Continue in Learning" only to a ready, built, unexpired learning command;
// offer the user's own items (at most five, only ones the new status can apply to, only when they can
// be told apart) when the item is the open question; hand over only a ready action; refuse anything
// that was not offered; leave every other kind of result exactly as the base view had it; save nothing.
import assert from 'node:assert'
import * as L from './learningCommands.js'
import { interpret } from './interpreter.js'
import { buildGuardView } from './guardView.js'
import { PENDING_ACTION_TTL_MS } from './pendingAction.js'
import { isIntentAvailable } from './intents.js'

let passed = 0, failed = 0
function test(name, fn) {
  try { fn(); passed++; console.log(`  PASS  ${name}`) }
  catch (err) { failed++; console.log(`  FAIL  ${name}\n${String(err.message).split('\n').map((l) => '        ' + l).join('\n')}`) }
}

const NOW = 1_800_000_000_000
const ITEMS = [
  { id: 'l1', name: 'Power BI', status: 'in_progress' },
  { id: 'l2', name: 'SQL course', status: 'planned' },
  { id: 'l3', name: 'Power BI advanced', status: 'dropped' },
]
const interp = (items) => items.map(({ id, name }) => ({ id, name }))
const run = (text, items = ITEMS) => interpret(text, { id: 'pa-1', referenceDate: new Date('2026-10-07T10:00:00'), goals: [{ id: 'g1', name: 'Laptop' }], categories: [], learningItems: interp(items), accounts: [] }, NOW)
const viewOf = (result, items = ITEMS, now = NOW) => L.learningCommandView(buildGuardView(result), result, items, now)
const ids = (view) => view.choices.map((c) => c.id)

console.log('learningCommands tests\n')

test('K1: only learning commands are touched — every other result gets its base view back, unchanged', () => {
  for (const text of ['How much did I spend on food?', 'Open my learning', 'Create a budget for next month', 'learning', 'Create a goal called Bike', 'Add 2000 to my laptop goal', 'Power BI']) {
    const r = run(text)
    if (r.kind === 'transaction') continue
    const base = buildGuardView(r)
    assert.strictEqual(L.learningCommandView(base, r, ITEMS, NOW), base, text)
    assert.strictEqual(L.isLearningCommand(r), false, text)
    assert.deepStrictEqual(L.resolveLearningCommandChoice(r, 'continue_learning', ITEMS, NOW), { action: 'pass' }, text)
  }
  assert.strictEqual(L.learningCommandView(null, run('Add Tableau to my learning'), ITEMS, NOW), null)
  assert.strictEqual(L.isLearningCommand(null), false)
})

test('K2: a ready create and a ready status change get "Continue in Learning", then Edit and Cancel, and the new footer', () => {
  for (const text of ['Add Tableau to my learning', 'Add Power BI certification to my learning', 'Mark my SQL course as completed', 'Set my SQL course to in progress']) {
    const r = run(text)
    assert.strictEqual(r.pending.status, 'ready', text)
    const v = viewOf(r)
    assert.deepStrictEqual(ids(v), ['continue_learning', 'edit', 'cancel'], text)
    assert.strictEqual(v.choices[0].label, 'Continue in Learning')
    assert.strictEqual(v.footer, "Nothing is saved yet. You'll confirm it in Learning.")
    assert.strictEqual(v.title, buildGuardView(r).title)
  }
})

test('K3: a create with no name, and a status change with no new status, get no Continue', () => {
  for (const text of ['Add a course', 'Mark my SQL course']) {
    const r = run(text)
    if (r.kind !== 'command') continue
    const v = viewOf(r)
    assert.ok(!ids(v).includes('continue_learning'), text)
  }
  const noItemNoStatus = run('Mark my course')
  if (noItemNoStatus.kind === 'command') assert.deepStrictEqual(ids(viewOf(noItemNoStatus)), ids(buildGuardView(noItemNoStatus)), 'no status → no picks')
  const noStatus = run('Mark my SQL course')
  assert.strictEqual(noStatus.kind, 'command')
  assert.deepStrictEqual(ids(viewOf(noStatus)), ids(buildGuardView(noStatus)), 'no status → nothing extra, not even picks')
})

test('K4: an unclear item offers the user\'s own items as buttons, labelled with their status, and drops the ones the new status cannot apply to', () => {
  const r = run('Mark my Power BI course as completed')
  assert.strictEqual(r.pending.ambiguities[0].field, 'item')
  const v = viewOf(r)
  // Power BI (in progress) can be completed; Power BI advanced is dropped, so it cannot go straight to completed.
  assert.deepStrictEqual(ids(v), ['pick_learning_l1', 'edit', 'cancel'])
  assert.strictEqual(v.choices[0].label, 'Power BI · In progress')
  assert.strictEqual(v.footer, "Pick the item, then you'll confirm in Learning. Nothing is saved yet.")
  // Reviving the dropped one is allowed.
  const revive = run('Set my Power BI course to in progress')
  assert.ok(ids(viewOf(revive)).includes('pick_learning_l3'), 'a dropped item can be revived to in progress')
  assert.ok(!ids(viewOf(revive)).includes('pick_learning_l1'), 'an item already in that status is not offered')
})

test('K5: a pick fills in the item and nothing else; the panel then has Continue; the unrelated asks are cleared', () => {
  const r = run('Mark my course as completed')
  const out = L.resolveLearningCommandChoice(r, 'pick_learning_l2', ITEMS, NOW)
  assert.strictEqual(out.action, 'pick_item')
  assert.deepStrictEqual(out.result.pending.fields.item.value, { id: 'l2', name: 'SQL course' })
  assert.strictEqual(out.result.pending.fields.newStatus.value, 'completed')
  assert.deepStrictEqual(out.result.asks, [])
  assert.ok(out.result.notes.includes('You chose SQL course.'))
  assert.strictEqual(out.result.pending.fields.item.origin, 'matched', 'a chosen item counts as matched, not typed')
  assert.strictEqual(out.result.pending.status, 'ready')
  assert.deepStrictEqual(ids(viewOf(out.result)), ['continue_learning', 'edit', 'cancel'])
  assert.strictEqual(r.pending.fields.item, undefined, 'the input is not changed')
})

test('K6: a pick that was not offered is refused (dropped item to completed, unknown id, another command\'s id)', () => {
  const r = run('Mark my course as completed')
  for (const id of ['pick_learning_l3', 'pick_learning_l1x', 'pick_learning_', 'pick_goal_g1', 'whatever']) {
    assert.deepStrictEqual(L.resolveLearningCommandChoice(r, id, ITEMS, NOW), { action: 'unknown' }, id)
  }
  assert.deepStrictEqual(L.resolveLearningCommandChoice(r, 'continue_learning', ITEMS, NOW), { action: 'unknown' }, 'Continue on something not ready does nothing')
})

test('K7: more than five items, or two buttons that read the same, offer no picks', () => {
  const many = Array.from({ length: 6 }, (_, i) => ({ id: `m${i}`, name: `Course ${i}`, status: 'planned' }))
  const r = run('Mark my course as completed', many)
  assert.deepStrictEqual(ids(viewOf(r, many)), ids(buildGuardView(r)))
  const twins = [{ id: 't1', name: 'Excel', status: 'planned' }, { id: 't2', name: 'Excel', status: 'planned' }]
  const r2 = run('Mark my Excel course as completed', twins)
  assert.ok(r2.pending.ambiguities.length === 1)
  assert.deepStrictEqual(ids(viewOf(r2, twins)), ids(buildGuardView(r2)), 'identical labels cannot be told apart')
  const twins2 = [{ id: 't1', name: 'Excel', status: 'planned' }, { id: 't2', name: 'Excel', status: 'in_progress' }]
  assert.deepStrictEqual(ids(viewOf(run('Mark my Excel course as completed', twins2), twins2)), ['pick_learning_t1', 'pick_learning_t2', 'edit', 'cancel'], 'same name, different status: the label tells them apart')
})

test('K8: Continue hands over exactly the pending action; expired and unbuilt are refused', () => {
  const r = run('Mark my SQL course as completed')
  const out = L.resolveLearningCommandChoice(r, 'continue_learning', ITEMS, NOW)
  assert.strictEqual(out.action, 'hand_off')
  assert.strictEqual(out.pending, r.pending)
  assert.strictEqual(L.resolveLearningCommandChoice(r, 'continue_learning', ITEMS, NOW + PENDING_ACTION_TTL_MS + 1).action, 'expired')
  assert.deepStrictEqual(L.resolveLearningCommandChoice(r, 'edit', ITEMS, NOW), { action: 'pass' })
  assert.deepStrictEqual(L.resolveLearningCommandChoice(r, 'cancel', ITEMS, NOW), { action: 'pass' })
  assert.deepStrictEqual(L.resolveLearningCommandChoice(r, 'record_expense', ITEMS, NOW), { action: 'unknown' })
  const late = viewOf(r, ITEMS, NOW + PENDING_ACTION_TTL_MS + 1)
  assert.ok(!ids(late).includes('continue_learning'), 'no Continue once it has timed out')
})

test('K9: the detail-less clarification buttons only explain how to say it', () => {
  assert.strictEqual(L.learningChoiceNotice('add_learning', ITEMS), 'Tell me the details in one line, for example: Add Power BI certification to my learning.')
  assert.strictEqual(L.learningChoiceNotice('learning_status_l2', ITEMS), 'Tell me the new status, for example: Mark my SQL course as completed.')
  assert.strictEqual(L.learningChoiceNotice('learning_status_zzz', ITEMS), null)
  assert.strictEqual(L.learningChoiceNotice('create_goal', ITEMS), null)
  assert.strictEqual(L.learningChoiceNotice(undefined, ITEMS), null)
})

test('K10: purity — no clock (now is required), results frozen, inputs untouched, same input same output', () => {
  const r = run('Mark my SQL course as completed')
  assert.throws(() => L.learningCommandView(buildGuardView(r), r, ITEMS), TypeError)
  assert.throws(() => L.resolveLearningCommandChoice(r, 'continue_learning', ITEMS), TypeError)
  const v = viewOf(r)
  assert.ok(Object.isFrozen(v) && Object.isFrozen(v.choices))
  assert.deepStrictEqual(viewOf(r), viewOf(r))
  const snapshot = JSON.stringify(ITEMS)
  viewOf(run('Mark my course as completed')); assert.strictEqual(JSON.stringify(ITEMS), snapshot)
  assert.ok(isIntentAvailable('CREATE_LEARNING_ITEM') && isIntentAvailable('MODIFY_LEARNING_STATUS'))
})

console.log(`\n${passed} passed, ${failed} failed`)
if (failed) process.exit(1)
