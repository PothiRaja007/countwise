// P7 — tests for the goal commands on the Money Inbox side (goalCommands.js).
//
// What it must do: add "Continue in Goals" only to a ready, built, unexpired goal command;
// offer the user's own active goals (at most five) when the goal is the open question; hand
// over only a ready action; refuse anything that was not offered; leave every other kind of
// result exactly as the base view had it; and never save anything.
import assert from 'node:assert'
import * as G from './goalCommands.js'
import { interpret } from './interpreter.js'
import { buildGuardView } from './guardView.js'
import { applyReferenceMemory, REFERENCE_NOTE } from './commandContext.js'
import { rememberGoal } from './commandContext.js'
import { PENDING_ACTION_TTL_MS } from './pendingAction.js'
import { isIntentAvailable } from './intents.js'

let passed = 0, failed = 0
function test(name, fn) {
  try { fn(); passed++; console.log(`  PASS  ${name}`) }
  catch (err) { failed++; console.log(`  FAIL  ${name}\n${String(err.message).split('\n').map((l) => '        ' + l).join('\n')}`) }
}

const NOW = 1_800_000_000_000
const GOALS = [{ id: 'g1', name: 'Laptop' }, { id: 'g2', name: 'Bike' }, { id: 'g3', name: 'Trip' }]
const ACCOUNTS = [{ id: 'a1', name: 'SBI' }]
const run = (text, goals = GOALS) => interpret(text, { id: 'pa-1', referenceDate: new Date('2026-10-07T10:00:00'), goals, categories: [], learningItems: [], accounts: ACCOUNTS }, NOW)
const viewOf = (result, goals = GOALS, now = NOW) => G.goalCommandView(buildGuardView(result), result, goals, now)
const ids = (view) => view.choices.map((c) => c.id)
const plain = (v) => JSON.parse(JSON.stringify(v))

console.log('goalCommands tests\n')

test('K1: only goal commands are touched — every other result gets its base view back, unchanged', () => {
  for (const text of ['How much did I spend on food?', 'Open my goals', 'Create a budget for next month', 'goal', 'How much have I put into my laptop goal?', 'Mark Power BI as in progress']) {
    const r = run(text)
    if (r.kind === 'transaction') continue
    const base = buildGuardView(r)
    assert.strictEqual(G.goalCommandView(base, r, GOALS, NOW), base, text)
  }
  assert.strictEqual(G.goalCommandView(null, run('Create a goal called Bike'), GOALS, NOW), null, 'no base view, no view')
  assert.strictEqual(G.isGoalCommand(run('Open my goals')), false)
  assert.strictEqual(G.isGoalCommand(run('goal')), false, 'a clarification is not a goal command')
  assert.strictEqual(G.isGoalCommand(run('Create a budget for next month')), false, 'another owner\'s command is not a goal command')
  assert.deepStrictEqual(G.resolveGoalCommandChoice(run('Create a budget for next month'), 'continue_goals', GOALS, NOW), { action: 'pass' }, 'and it is never handed over from here')
  assert.strictEqual(G.isGoalCommand(null), false)
  assert.deepStrictEqual(G.resolveGoalCommandChoice(run('Open my goals'), 'open_goals', GOALS, NOW), { action: 'pass' })
  assert.deepStrictEqual(G.resolveGoalCommandChoice(run('goal'), 'create_goal', GOALS, NOW), { action: 'pass' })
})

test('K2: a ready create and a ready contribution get "Continue in Goals", then Edit and Cancel, and the new footer', () => {
  for (const text of ['Create a goal called Laptop for 50000 by December', 'Create a goal called Bike', 'Add 2000 to my laptop goal', 'Add 2000 to my laptop goal from SBI']) {
    const r = run(text)
    assert.strictEqual(r.pending.status, 'ready', text)
    const v = viewOf(r)
    assert.deepStrictEqual(ids(v), ['continue_goals', 'edit', 'cancel'], text)
    assert.strictEqual(v.choices[0].label, 'Continue in Goals')
    assert.strictEqual(v.footer, "Nothing is saved yet. You'll confirm it in Goals.")
    assert.strictEqual(v.title, buildGuardView(r).title, 'the "I understood" wording is the base view\'s')
    assert.deepStrictEqual(v.notes, buildGuardView(r).notes)
  }
})

test('K3: a goal command that is not ready, or timed out, never gets Continue', () => {
  const notReady = [
    run('Add 2000 to it'), // which goal?
    run('Add 2000 to my goal'),
    run('Add 2000 to my laptop goal', [{ id: 'g1', name: 'Laptop' }, { id: 'g9', name: 'Laptop fund' }]), // two matches
  ]
  for (const r of notReady) {
    assert.notStrictEqual(r.pending.status, 'ready')
    assert.ok(!ids(viewOf(r)).includes('continue_goals'))
    assert.strictEqual(G.isReadyGoalCommand(r, NOW), false)
    assert.notStrictEqual(G.resolveGoalCommandChoice(r, 'continue_goals', GOALS, NOW).action, 'hand_off')
  }
  const ready = run('Create a goal called Bike')
  assert.ok(ids(viewOf(ready, GOALS, NOW + PENDING_ACTION_TTL_MS - 1)).includes('continue_goals'))
  assert.ok(!ids(viewOf(ready, GOALS, NOW + PENDING_ACTION_TTL_MS)).includes('continue_goals'), 'exactly five minutes: no Continue')
  // a command with no amount asks for it and has nothing to continue with
  const noAmount = run('Add money to my laptop goal')
  assert.deepStrictEqual(noAmount.pending.missing, ['amount'])
  assert.deepStrictEqual(ids(viewOf(noAmount)), ['edit', 'cancel'], 'no amount: only Edit and Cancel, and the base view\'s own "Still missing: amount"')
  assert.ok(viewOf(noAmount).notes.includes('Still missing: amount'))
})

test('K4: when the goal is the open question, the user\'s own active goals are the buttons — at most five, never a guess', () => {
  const it = run('Add 2000 to it')
  const v = viewOf(it)
  assert.deepStrictEqual(ids(v), ['pick_goal_g1', 'pick_goal_g2', 'pick_goal_g3', 'edit', 'cancel'])
  assert.deepStrictEqual(v.choices.slice(0, 3).map((c) => c.label), ['Laptop', 'Bike', 'Trip'])
  assert.strictEqual(v.footer, "Pick the goal, then you'll confirm in Goals. Nothing is saved yet.")
  // a completed or archived goal is not offered (the caller passes only active goals)
  assert.deepStrictEqual(ids(viewOf(it, [GOALS[0], GOALS[2]])), ['pick_goal_g1', 'pick_goal_g3', 'edit', 'cancel'])
  // the interpreter's own two matches, even though the user has more active goals
  const two = [{ id: 'g1', name: 'Laptop' }, { id: 'g9', name: 'Laptop fund' }, { id: 'g3', name: 'Trip' }]
  assert.deepStrictEqual(ids(viewOf(run('Add 2000 to my laptop goal', two), two)), ['pick_goal_g1', 'pick_goal_g9', 'edit', 'cancel'])
  // exactly five is shown, six is not
  const five = Array.from({ length: 5 }, (_, i) => ({ id: `f${i}`, name: `Goal ${i}` }))
  assert.strictEqual(ids(viewOf(run('Add 2000 to it', five), five)).filter((i) => i.startsWith('pick_goal_')).length, 5)
  const six = [...five, { id: 'f5', name: 'Goal 5' }]
  assert.deepStrictEqual(ids(viewOf(run('Add 2000 to it', six), six)), ['edit', 'cancel'], 'more than five: no guessing, no long list')
  assert.strictEqual(viewOf(run('Add 2000 to it', six), six).footer, buildGuardView(run('Add 2000 to it', six)).footer)
  // creating a goal never offers goals to pick
  assert.ok(!ids(viewOf(run('Create a goal called Bike'))).some((i) => i.startsWith('pick_goal_')))
})

test('K5: picking a goal fills it through the pending action (matched, with a plain note) and the panel becomes a ready command', () => {
  const it = run('Add 2000 to it')
  const before = plain(it)
  const out = G.resolveGoalCommandChoice(it, 'pick_goal_g1', GOALS, NOW)
  assert.strictEqual(out.action, 'pick_goal')
  const r = out.result
  assert.deepStrictEqual(r.pending.fields.goal, { value: { id: 'g1', name: 'Laptop' }, kind: 'actual', origin: 'matched', note: 'You chose Laptop.' })
  assert.strictEqual(r.pending.status, 'ready')
  assert.deepStrictEqual(r.pending.ambiguities, [])
  assert.deepStrictEqual(r.asks, [])
  assert.ok(r.notes.includes('You chose Laptop.') && !r.notes.includes(REFERENCE_NOTE))
  assert.deepStrictEqual(ids(viewOf(r)), ['continue_goals', 'edit', 'cancel'])
  assert.deepStrictEqual(G.resolveGoalCommandChoice(r, 'continue_goals', GOALS, NOW).pending.fields.amount.value, 2000)
  assert.deepStrictEqual(plain(it), before, 'the input was not changed')
  assert.ok(Object.isFrozen(out) && Object.isFrozen(r.pending))
  // the same through the interpreter's own two-way question
  const two = [{ id: 'g1', name: 'Laptop' }, { id: 'g9', name: 'Laptop fund' }]
  const picked = G.resolveGoalCommandChoice(run('Add 2000 to my laptop goal', two), 'pick_goal_g9', two, NOW).result
  assert.strictEqual(picked.pending.fields.goal.value.name, 'Laptop fund')
  assert.deepStrictEqual(picked.asks, [])
  // a missing amount stays a question after the pick
  const noAmount = run('Add it to my goal') // which goal AND how much
  assert.deepStrictEqual(noAmount.pending.missing, ['amount'])
  const after = G.resolveGoalCommandChoice(noAmount, 'pick_goal_g1', GOALS, NOW)
  assert.strictEqual(after.action, 'pick_goal')
  assert.strictEqual(after.result.pending.status, 'needs_input')
  assert.deepStrictEqual(ids(viewOf(after.result)), ['edit', 'cancel'], 'the goal is chosen but there is no amount, so no Continue')
})

test('K6: a pick that was not offered is refused — another goal, an inactive goal, a made-up id, too many goals', () => {
  const it = run('Add 2000 to it')
  for (const id of ['pick_goal_g99', 'pick_goal_', 'pick_goal_g1 ', 'goal_g1', 'continue']) {
    assert.deepStrictEqual(G.resolveGoalCommandChoice(it, id, GOALS, NOW), { action: 'unknown' }, id)
  }
  assert.deepStrictEqual(G.resolveGoalCommandChoice(it, 'pick_goal_g2', [GOALS[0], GOALS[2]], NOW), { action: 'unknown' }, 'an inactive goal (not in the active list) cannot be picked')
  const two = [{ id: 'g1', name: 'Laptop' }, { id: 'g9', name: 'Laptop fund' }]
  assert.deepStrictEqual(G.resolveGoalCommandChoice(run('Add 2000 to my laptop goal', two), 'pick_goal_g3', two, NOW), { action: 'unknown' }, 'not one of the interpreter\'s own options')
  const six = Array.from({ length: 6 }, (_, i) => ({ id: `f${i}`, name: `Goal ${i}` }))
  assert.deepStrictEqual(G.resolveGoalCommandChoice(run('Add 2000 to it', six), 'pick_goal_f0', six, NOW), { action: 'unknown' })
  // a pick on a ready command, and on a create, is also not offered
  assert.deepStrictEqual(G.resolveGoalCommandChoice(run('Add 2000 to my laptop goal'), 'pick_goal_g2', GOALS, NOW), { action: 'unknown' })
  assert.deepStrictEqual(G.resolveGoalCommandChoice(run('Create a goal called Bike'), 'pick_goal_g1', GOALS, NOW), { action: 'unknown' })
})

test('K7: hand-off only for a ready, built, unexpired goal command; "timed out" at exactly five minutes; Edit and Cancel always pass', () => {
  const ready = run('Add ₹2,000 to my laptop goal')
  const out = G.resolveGoalCommandChoice(ready, 'continue_goals', GOALS, NOW + 1000)
  assert.deepStrictEqual(Object.keys(out).sort(), ['action', 'pending'])
  assert.strictEqual(out.action, 'hand_off')
  assert.strictEqual(out.pending.id, ready.pending.id)
  assert.strictEqual(G.resolveGoalCommandChoice(ready, 'continue_goals', GOALS, NOW + PENDING_ACTION_TTL_MS - 1).action, 'hand_off')
  assert.deepStrictEqual(G.resolveGoalCommandChoice(ready, 'continue_goals', GOALS, NOW + PENDING_ACTION_TTL_MS), { action: 'expired', message: 'That timed out. Please send your message again.' })
  assert.deepStrictEqual(G.resolveGoalCommandChoice(run('Add 2000 to it'), 'continue_goals', GOALS, NOW), { action: 'unknown' }, 'not ready: nothing to continue')
  assert.deepStrictEqual(G.resolveGoalCommandChoice(ready, 'continue_goals', GOALS, NOW + PENDING_ACTION_TTL_MS + 99999).action, 'expired')
  for (const t of [NOW, NOW + 10 * PENDING_ACTION_TTL_MS]) {
    assert.deepStrictEqual(G.resolveGoalCommandChoice(ready, 'edit', GOALS, t), { action: 'pass' })
    assert.deepStrictEqual(G.resolveGoalCommandChoice(ready, 'cancel', GOALS, t), { action: 'pass' })
  }
  assert.deepStrictEqual(G.resolveGoalCommandChoice(ready, 'save', GOALS, NOW), { action: 'unknown' })
  assert.deepStrictEqual(G.resolveGoalCommandChoice(ready, 'record_expense', GOALS, NOW), { action: 'unknown' })
  assert.strictEqual(isIntentAvailable('CREATE_GOAL') && isIntentAvailable('MODIFY_GOAL_CONTRIBUTE'), true, 'both goal commands are built from P7')
  assert.throws(() => G.resolveGoalCommandChoice(ready, 'continue_goals', GOALS), TypeError)
  assert.throws(() => G.goalCommandView(buildGuardView(ready), ready, GOALS), TypeError)
})

test('K8: the "Create a goal" and "Add money to X" buttons carry no details — they get a how-to-say-it line, and the example really works', () => {
  const create = G.choiceNotice('create_goal', GOALS)
  assert.strictEqual(create, 'Tell me the details in one line, for example: Create a goal called Laptop for ₹50,000.')
  const add = G.choiceNotice('goal_add_g1', GOALS)
  assert.strictEqual(add, 'Tell me how much, for example: Add ₹2,000 to my Laptop goal.')
  // the sentence in each line is understood by the real interpreter as that very command, ready
  const example = (line) => line.slice(line.indexOf('for example: ') + 13).replace(/\.$/, '')
  const a = run(example(create))
  assert.strictEqual(a.pending.intent, 'CREATE_GOAL')
  assert.strictEqual(a.pending.status, 'ready')
  assert.strictEqual(a.pending.fields.targetAmount.value, 50000)
  const b = run(example(add))
  assert.strictEqual(b.pending.intent, 'MODIFY_GOAL_CONTRIBUTE')
  assert.strictEqual(b.pending.status, 'ready')
  assert.strictEqual(b.pending.fields.goal.value.id, 'g1')
  assert.strictEqual(b.pending.fields.amount.value, 2000)
  for (const id of ['goal_add_g99', 'goal_progress_g1', 'open_goals', 'record_expense', '', undefined, null, 5]) assert.strictEqual(G.choiceNotice(id, GOALS), null, String(id))
  assert.strictEqual(G.choiceNotice('goal_add_g1', null), null)
  // the clarification buttons the interpreter really produces are the ones this answers
  const bare = run('goal')
  assert.ok(bare.clarification.choices.some((c) => c.id === 'create_goal' && c.intent === 'CREATE_GOAL'))
  const named = run('laptop')
  assert.ok(named.clarification.choices.some((c) => c.id === 'goal_add_g1' && c.intent === 'MODIFY_GOAL_CONTRIBUTE'))
})

test('K9: "it" resolved from a fresh remembered goal (P6) is a ready command and can continue; with no memory it asks for a goal (A6)', () => {
  const memory = rememberGoal(null, { id: 'g1', name: 'Laptop' }, 'user-1', NOW - 60 * 1000)
  const resolved = applyReferenceMemory(run('Add 2000 to it'), memory, GOALS, 'user-1', NOW)
  assert.strictEqual(resolved.pending.status, 'ready')
  assert.deepStrictEqual(ids(viewOf(resolved)), ['continue_goals', 'edit', 'cancel'])
  assert.ok(viewOf(resolved).notes.includes('Using your Laptop goal, the one you used a moment ago.'))
  assert.strictEqual(G.resolveGoalCommandChoice(resolved, 'continue_goals', GOALS, NOW).action, 'hand_off')
  const none = applyReferenceMemory(run('Add 2000 to it'), null, GOALS, 'user-1', NOW)
  assert.ok(ids(viewOf(none)).every((i) => i !== 'continue_goals'), 'no memory, no guess: even with one goal')
  const one = [GOALS[0]]
  const single = applyReferenceMemory(run('Add 2000 to it', one), null, one, 'user-1', NOW)
  assert.ok(!ids(viewOf(single, one)).includes('continue_goals'), 'one goal and no memory still asks (A6)')
})

test('K10: pure — results are frozen, inputs are never changed, nothing is saved or read from the clock', () => {
  const r = run('Add 2000 to my laptop goal')
  const goals = GOALS.map((g) => ({ ...g }))
  const snapshot = plain({ r, goals })
  const v = viewOf(r, goals)
  assert.ok(Object.isFrozen(v) && Object.isFrozen(v.choices))
  G.resolveGoalCommandChoice(r, 'continue_goals', goals, NOW)
  G.resolveGoalCommandChoice(run('Add 2000 to it'), 'pick_goal_g1', goals, NOW)
  G.choiceNotice('create_goal', goals)
  assert.deepStrictEqual(plain({ r, goals }), snapshot)
  for (const bad of [{ id: 1 }, { id: 'x', name: '' }, null, 'g1']) assert.doesNotThrow(() => G.goalCommandView(buildGuardView(run('Add 2000 to it')), run('Add 2000 to it'), [bad], NOW))
  assert.deepStrictEqual(Object.keys(G).sort(), ['GOAL_COMMAND_INTENTS', 'GOAL_COMMAND_MESSAGES', 'MAX_PICK_BUTTONS', 'choiceNotice', 'goalCommandView', 'isGoalCommand', 'isReadyGoalCommand', 'resolveGoalCommandChoice'])
})

console.log(`\n${passed} passed, ${failed} failed`)
if (failed > 0) process.exit(1)
