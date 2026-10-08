// P6 — tests for the short-lived goal memory and "it" resolution (commandContext.js).
//
// Decision A6 (memory only): "it" / "that goal" are resolved ONLY from a fresh remembered
// goal that still exists. With no fresh memory the question stays; there is no
// "exactly one goal" fallback.
import assert from 'node:assert'
import * as C from './commandContext.js'
import { interpret } from './interpreter.js'
import { resolveFields } from './pendingAction.js'

let passed = 0, failed = 0
function test(name, fn) {
  try { fn(); passed++; console.log(`  PASS  ${name}`) }
  catch (err) { failed++; console.log(`  FAIL  ${name}\n${String(err.message).split('\n').map((l) => '        ' + l).join('\n')}`) }
}

const NOW = 1_800_000_000_000
const MIN = 60 * 1000
const USER = 'user-1'
const LAPTOP = { id: 'g1', name: 'Laptop' }
const BIKE = { id: 'g2', name: 'Bike' }
const ctx = (goals, extra = {}) => ({ id: 'x', goals, categories: [{ id: 'c1', name: 'Food' }], learningItems: [{ id: 'l1', name: 'Power BI' }], accounts: [{ id: 'a1', name: 'SBI' }], ...extra })
const run = (text, goals) => interpret(text, ctx(goals), NOW)
const mem = (goal = LAPTOP, at = NOW) => C.rememberGoal(null, goal, USER, at)

console.log('commandContext tests\n')

test('C1: a remembered goal is recalled for 10 minutes minus one millisecond and not at 10 minutes', () => {
  assert.strictEqual(C.MEMORY_TTL_MS, 10 * MIN)
  const m = mem()
  assert.deepStrictEqual(C.recallGoal(m, USER, NOW), LAPTOP)
  assert.deepStrictEqual(C.recallGoal(m, USER, NOW + 10 * MIN - 1), LAPTOP)
  assert.strictEqual(C.recallGoal(m, USER, NOW + 10 * MIN), null)
  assert.strictEqual(C.recallGoal(m, USER, NOW + 60 * MIN), null)
  assert.strictEqual(C.recallGoal(m, USER, NOW - 1), null, 'a clock that went backwards remembers nothing')
})

test('C2: a different user gets nothing, and so does no memory at all', () => {
  const m = mem()
  assert.strictEqual(C.recallGoal(m, 'user-2', NOW), null)
  assert.strictEqual(C.recallGoal(m, null, NOW), null)
  assert.strictEqual(C.recallGoal(m, '', NOW), null)
  assert.strictEqual(C.recallGoal(null, USER, NOW), null)
  assert.strictEqual(C.recallGoal(undefined, USER, NOW), null)
  assert.strictEqual(C.recallGoal({}, USER, NOW), null)
})

test('C3: remembering takes only a goal id and name, replaces what was there, and refuses anything else', () => {
  const m = mem(LAPTOP, NOW)
  const m2 = C.rememberGoal(m, BIKE, USER, NOW + MIN)
  assert.deepStrictEqual(C.recallGoal(m2, USER, NOW + MIN), BIKE)
  assert.deepStrictEqual(C.recallGoal(m, USER, NOW + MIN), LAPTOP, 'the old memory was not changed')
  assert.deepStrictEqual(Object.keys(m2).sort(), ['at', 'goal', 'userId'])
  assert.deepStrictEqual(Object.keys(C.rememberGoal(null, { id: 'g1', name: 'Laptop', targetAmount: 50000, secret: 'x' }, USER, NOW).goal).sort(), ['id', 'name'])
  assert.strictEqual(C.rememberGoal(null, { id: 7, name: 'Trip' }, USER, NOW).goal.id, '7')
  for (const bad of [null, {}, { id: 'g' }, { name: 'x' }, { id: '', name: 'x' }, { id: 'g', name: ' ' }]) {
    assert.throws(() => C.rememberGoal(null, bad, USER, NOW), (e) => e instanceof C.ContextError && e.code === 'invalid_goal')
  }
  assert.throws(() => C.rememberGoal(null, LAPTOP, '', NOW), (e) => e.code === 'user_required')
  assert.throws(() => C.rememberGoal(null, LAPTOP, USER), (e) => e.code === 'now_required')
  assert.ok(Object.isFrozen(m) && Object.isFrozen(m.goal))
})

test('C4: a fresh remembered goal that still exists answers "it" in a command', () => {
  const goals = [LAPTOP, BIKE]
  for (const text of ['Add 2000 to it', 'Add 2000 to that goal', 'Add 2000 to the same one']) {
    const before = run(text, goals)
    assert.deepStrictEqual(before.asks, ['goal_reference_unresolved'], `${text}: the interpreter still asks`)
    const after = C.applyReferenceMemory(before, mem(), goals, USER, NOW + MIN)
    assert.strictEqual(after.kind, 'command')
    assert.strictEqual(after.pending.intent, 'MODIFY_GOAL_CONTRIBUTE')
    assert.deepStrictEqual(after.pending.fields.goal.value, LAPTOP)
    assert.strictEqual(after.pending.fields.goal.origin, 'matched')
    assert.strictEqual(after.pending.fields.goal.kind, 'actual')
    assert.strictEqual(after.pending.fields.goal.note, C.CONTEXT_MESSAGES.remembered('Laptop'))
    assert.deepStrictEqual(after.asks, [])
    assert.deepStrictEqual(after.pending.ambiguities, [], 'the "which goal?" options are gone once the goal is known')
    assert.deepStrictEqual(after.pending.missing, [])
    assert.strictEqual(after.pending.status, 'ready')
    assert.strictEqual(after.pending.fields.amount.value, 2000, 'the typed amount is untouched')
  }
  // (P3 reads no question sentence with "it" as a goal question, so only commands carry the reference today)
})

test('C5: with NO fresh memory the question stays, even with exactly one goal (A6: no single-goal fallback)', () => {
  for (const goals of [[LAPTOP], [LAPTOP, BIKE], []]) {
    const before = run('Add 2000 to it', goals)
    for (const memory of [null, undefined, mem(LAPTOP, NOW - 10 * MIN), mem(LAPTOP, NOW - 60 * MIN), C.rememberGoal(null, LAPTOP, 'user-2', NOW)]) {
      const after = C.applyReferenceMemory(before, memory, goals, USER, NOW)
      assert.strictEqual(after, before, `${goals.length} goal(s): the very same result comes back untouched`)
      assert.deepStrictEqual(after.asks, ['goal_reference_unresolved'])
      assert.strictEqual(after.pending.fields.goal, undefined)
    }
  }
  assert.ok(!/only goal|your only/i.test(JSON.stringify(C.CONTEXT_MESSAGES.remembered('x'))), 'there is no "only goal" wording')
})

test('C6: a remembered goal that no longer exists is skipped (deleted, archived, or not in the list)', () => {
  const before = run('Add 2000 to it', [BIKE])
  assert.strictEqual(C.applyReferenceMemory(before, mem(LAPTOP), [BIKE], USER, NOW), before)
  assert.strictEqual(C.applyReferenceMemory(before, mem(LAPTOP), [], USER, NOW), before)
  assert.strictEqual(C.applyReferenceMemory(before, mem(LAPTOP), null, USER, NOW), before)
  assert.strictEqual(C.applyReferenceMemory(before, mem(LAPTOP), [{ id: 'g1', name: '' }], USER, NOW), before)
  // the goals list the app passes already leaves out archived goals, so an archived goal is "not in the list"
  const renamed = C.applyReferenceMemory(run('Add 2000 to it', [{ id: 'g1', name: 'Gaming laptop' }, BIKE]), mem(LAPTOP), [{ id: 'g1', name: 'Gaming laptop' }, BIKE], USER, NOW)
  assert.strictEqual(renamed.pending.fields.goal.value.name, 'Gaming laptop', 'the current name is used, not the remembered one')
  assert.strictEqual(renamed.pending.fields.goal.note, 'Using your Gaming laptop goal, the one you used a moment ago.')
})

test('C7: a goal the user typed by name is never replaced, and a vague "my goal" is not a reference', () => {
  const goals = [LAPTOP, BIKE]
  const named = run('Add 2000 to my bike goal', goals)
  assert.deepStrictEqual(named.pending.fields.goal.value, BIKE)
  assert.strictEqual(C.applyReferenceMemory(named, mem(LAPTOP), goals, USER, NOW), named)
  const vague = run('Add 2000 to my goal', goals)
  assert.deepStrictEqual(vague.asks, ['goal_reference_unresolved'])
  assert.strictEqual(C.applyReferenceMemory(vague, mem(LAPTOP), goals, USER, NOW), vague, '"my goal" is not "it": it still asks')
  const vagueQ = run('how much have I put into my goal?', goals)
  assert.strictEqual(C.applyReferenceMemory(vagueQ, mem(LAPTOP), goals, USER, NOW), vagueQ)
  const two = run('Add 2000 to laptop', [LAPTOP, { id: 'g3', name: 'Laptop fund' }])
  assert.strictEqual(C.applyReferenceMemory(two, mem(BIKE), [LAPTOP, { id: 'g3', name: 'Laptop fund' }], USER, NOW), two, 'two goals that both match are never decided by memory')
})

test('C8: "it" for a category, an account, a learning item, or anything that is not a goal is left alone', () => {
  const goals = [LAPTOP]
  for (const text of ['Mark it as completed', 'Increase it to 5000', 'How much did I spend on it?', 'How much is in it?', 'Create a goal called Trip', 'Open my goals', 'coffee 80', 'Add 2000 to Laptop']) {
    const r = run(text, goals)
    assert.strictEqual(C.applyReferenceMemory(r, mem(), goals, USER, NOW), r, text)
  }
  // a clarification or an entry has no pending action to fill in
  for (const r of [{ kind: 'transaction' }, run('laptop', goals), run('I need 50000 for a laptop', goals), null, undefined, {}, 'text']) {
    assert.strictEqual(C.applyReferenceMemory(r, mem(), goals, USER, NOW), r)
  }
  // only when the interpreter itself asked "which goal did you mean by it?"
  const manual = { kind: 'command', pending: run('Add 2000 to it', goals).pending, asks: [], notes: [] }
  assert.strictEqual(C.applyReferenceMemory(manual, mem(), goals, USER, NOW), manual)
  const notRef = { ...run('Add 2000 to it', goals), notes: [] }
  assert.strictEqual(C.applyReferenceMemory(notRef, mem(), goals, USER, NOW), notRef)
})

test('C9: the wording is pinned, the reference note matches the interpreter, and the result stays a valid, frozen pending action', () => {
  assert.strictEqual(C.CONTEXT_MESSAGES.remembered('Laptop'), 'Using your Laptop goal, the one you used a moment ago.')
  const goals = [LAPTOP, BIKE]
  const before = run('Add 2000 to it', goals)
  assert.ok(before.notes.includes(C.REFERENCE_NOTE), 'REFERENCE_NOTE is what the interpreter really says')
  const snapshot = JSON.stringify(before)
  const memory = mem()
  const memSnapshot = JSON.stringify(memory)
  const after = C.applyReferenceMemory(before, memory, goals, USER, NOW)
  assert.strictEqual(JSON.stringify(before), snapshot, 'the input result is not changed')
  assert.strictEqual(JSON.stringify(memory), memSnapshot, 'the memory is not changed')
  assert.ok(!after.notes.includes(C.REFERENCE_NOTE))
  assert.ok(after.notes.includes('Using your Laptop goal, the one you used a moment ago.'))
  assert.ok(Object.isFrozen(after) && Object.isFrozen(after.pending) && Object.isFrozen(after.notes))
  // it is still an ordinary pending action: the P1 functions accept it, and nothing but the goal changed
  resolveFields(after.pending, {}, NOW)
  const { goal: _g, ...restAfter } = after.pending.fields
  const { goal: _b, ...restBefore } = before.pending.fields
  assert.deepStrictEqual(restAfter, restBefore)
  assert.strictEqual(after.pending.id, before.pending.id)
  assert.strictEqual(after.pending.source, before.pending.source)
  assert.strictEqual(after.pending.expiresAt, before.pending.expiresAt)
  assert.strictEqual(after.kind, before.kind)
})

test('C10: the module is deterministic, reads no clock, and an expired pending action is left as it is instead of throwing', () => {
  const goals = [LAPTOP]
  const before = run('Add 2000 to it', goals)
  const real = Date.now
  Date.now = () => { throw new Error('the clock was read') }
  try {
    const a = C.applyReferenceMemory(before, mem(), goals, USER, NOW)
    const b = C.applyReferenceMemory(before, mem(), goals, USER, NOW)
    assert.deepStrictEqual(a, b)
  } finally { Date.now = real }
  // five minutes later the pending action itself has expired; memory (10 minutes) would still be fresh
  assert.strictEqual(C.applyReferenceMemory(before, mem(), goals, USER, NOW + 6 * MIN), before)
  assert.throws(() => C.applyReferenceMemory(before, mem(), goals, USER), (e) => e.code === 'now_required')
})

console.log(`\n${passed} passed, ${failed} failed`)
if (failed) process.exit(1)
