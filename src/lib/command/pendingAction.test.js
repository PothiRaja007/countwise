// P1 — tests for the pending action and the clarification (pendingAction.js).
//
// The rules under test are the ones that stop the command layer from blurring
// ACTUAL, PLANNED, CALCULATED/ESTIMATED and SUGGESTED, and from ever claiming
// something was saved. Every function takes `now` as an argument; A11 also runs
// everything with the real clock switched off to prove nothing reads it.
import assert from 'node:assert'
import * as P from './pendingAction.js'
import { CONTRACTS, INTENT_IDS, CLARIFY_REASONS, deepFreeze } from './intents.js'

let passed = 0, failed = 0
function test(name, fn) {
  try { fn(); passed++; console.log(`  PASS  ${name}`) }
  catch (err) { failed++; console.log(`  FAIL  ${name}\n${String(err.message).split('\n').map((l) => '        ' + l).join('\n')}`) }
}

const NOW = 1_800_000_000_000
const MIN = 60 * 1000
const refusedWith = (code, fn) => assert.throws(fn, (e) => e instanceof P.PendingActionError && e.code === code, `expected a refusal with code "${code}"`)

const typed = (contract, value = 'sample') => ({ value, kind: contract.becomes === 'planned' ? 'planned' : 'actual', origin: 'typed' })
function minimalFields(contract) {
  const f = {}
  for (const name of contract.required) f[name] = typed(contract, name === 'amount' ? 5000 : 'sample')
  for (const group of contract.requireOneOf) f[group[0]] = typed(contract, group[0] === 'newAmount' ? 5000 : 'sample')
  return f
}
const make = (intent, fields = minimalFields(CONTRACTS[intent]), extra = {}) =>
  P.createPendingAction({ id: `pa-${intent}`, intent, source: 'typed text', fields, ...extra }, NOW)

console.log('pendingAction tests\n')

test('A1: a pending action can be made for every one of the 15 intents; `becomes` comes from the contract; expiry is exactly 5 minutes', () => {
  assert.strictEqual(P.PENDING_ACTION_TTL_MS, 5 * MIN)
  for (const id of INTENT_IDS) {
    const a = make(id)
    assert.strictEqual(a.intent, id)
    assert.strictEqual(a.becomes, CONTRACTS[id].becomes, id)
    assert.strictEqual(a.createdAt, NOW)
    assert.strictEqual(a.expiresAt - a.createdAt, 5 * MIN)
    assert.strictEqual(a.status, 'ready', `${id}: all required fields were given`)
    assert.strictEqual(a.source, 'typed text')
  }
})

test('A2: the status list is exactly the five, and none of them means saved, executed, done, confirmed or completed', () => {
  assert.deepStrictEqual([...P.STATUSES], ['needs_input', 'ready', 'handed_off', 'cancelled', 'expired'])
  for (const s of P.STATUSES) assert.ok(!/saved|executed|done|confirmed|complete|written/i.test(s), s)
  const seen = new Set()
  const a = make('CREATE_GOAL'); seen.add(a.status)
  seen.add(make('CREATE_GOAL', {}).status)
  seen.add(P.markHandedOff(a, NOW + 1).status)
  seen.add(P.cancelPendingAction(a, NOW + 1).status)
  seen.add(P.statusAt(a, NOW + 6 * MIN))
  for (const s of seen) assert.ok(P.STATUSES.includes(s), `unexpected status ${s}`)
  assert.strictEqual(seen.size, 5, 'every status should be reachable')
})

test('A3: the caller cannot set becomes, status, missing, createdAt or expiresAt', () => {
  for (const key of ['becomes', 'status', 'missing', 'createdAt', 'expiresAt']) {
    refusedWith(`caller_set_${key}`, () => P.createPendingAction({ id: 'x', intent: 'CREATE_GOAL', source: 's', [key]: 'planned' }, NOW))
  }
  refusedWith('unknown_input_key', () => P.createPendingAction({ id: 'x', intent: 'CREATE_GOAL', source: 's', colour: 'red' }, NOW))
  refusedWith('unknown_intent', () => P.createPendingAction({ id: 'x', intent: 'DELETE_GOAL', source: 's' }, NOW))
  refusedWith('invalid_input', () => P.createPendingAction({ intent: 'CREATE_GOAL', source: 's' }, NOW)) // no id
})

test('A4: the four-state field rules — every violation refused, every allowed case accepted', () => {
  const goal = CONTRACTS.CREATE_GOAL
  const field = (over) => ({ value: 5000, kind: 'planned', origin: 'typed', ...over })
  const create = (intent, name, f) => P.createPendingAction({ id: 'x', intent, source: 's', fields: { [name]: f } }, NOW)
  // Rule 1: typed is only ever actual or planned.
  refusedWith('typed_kind', () => create('RECORD_SALARY', 'amount', field({ kind: 'estimated' })))
  refusedWith('typed_kind', () => create('CREATE_GOAL', 'targetAmount', field({ kind: 'calculated' })))
  refusedWith('typed_kind', () => create('CREATE_GOAL', 'targetAmount', field({ kind: 'suggested' })))
  assert.doesNotThrow(() => create('CREATE_GOAL', 'targetAmount', field({})))
  assert.doesNotThrow(() => create('RECORD_SALARY', 'amount', field({ kind: 'actual' })))
  // Rule 2: only an engine may produce calculated, estimated or suggested values.
  refusedWith('engine_only_kind', () => create('RECORD_SALARY', 'amount', field({ kind: 'estimated', origin: 'matched' })))
  refusedWith('engine_only_kind', () => create('CREATE_BUDGET_MONTH', 'amounts', field({ kind: 'suggested', origin: 'default', note: 'x' })))
  // Rule 3: only the fields a contract names may be estimated or suggested.
  assert.doesNotThrow(() => create('RECORD_SALARY', 'amount', field({ kind: 'estimated', origin: 'engine' })))
  assert.doesNotThrow(() => create('CREATE_BUDGET_MONTH', 'amounts', field({ kind: 'suggested', origin: 'engine', value: [{ category: 'Food', amount: 3000 }] })))
  refusedWith('estimate_not_allowed', () => create('CREATE_GOAL', 'targetAmount', field({ kind: 'estimated', origin: 'engine' })))
  refusedWith('estimate_not_allowed', () => create('RECORD_SALARY', 'date', field({ kind: 'estimated', origin: 'engine' })))
  refusedWith('suggestion_not_allowed', () => create('CREATE_GOAL', 'targetAmount', field({ kind: 'suggested', origin: 'engine' })))
  refusedWith('suggestion_not_allowed', () => create('RECORD_SALARY', 'amount', field({ kind: 'suggested', origin: 'engine' })))
  // Rule 4: a default says what was assumed.
  refusedWith('default_needs_note', () => create('QUERY_SPEND', 'period', field({ kind: 'actual', origin: 'default', value: 'this month' })))
  refusedWith('default_needs_note', () => create('QUERY_SPEND', 'period', field({ kind: 'actual', origin: 'default', value: 'this month', note: '   ' })))
  const withNote = create('QUERY_SPEND', 'period', field({ kind: 'actual', origin: 'default', value: 'this month', note: 'Using the current calendar month' }))
  assert.strictEqual(withNote.fields.period.note, 'Using the current calendar month')
  // Rule 5: an uncertain value blocks "ready".
  assert.strictEqual(create('CREATE_GOAL', 'name', { value: 'Laptop', kind: 'planned', origin: 'matched', confidence: 'uncertain' }).status, 'needs_input')
  assert.strictEqual(create('CREATE_GOAL', 'name', { value: 'Laptop', kind: 'planned', origin: 'matched', confidence: 'certain' }).status, 'ready')
  // Malformed fields.
  refusedWith('bad_kind', () => create('CREATE_GOAL', 'name', field({ kind: 'maybe' })))
  refusedWith('bad_origin', () => create('CREATE_GOAL', 'name', field({ origin: 'guessed' })))
  refusedWith('bad_confidence', () => create('CREATE_GOAL', 'name', field({ confidence: 'sure' })))
  refusedWith('empty_value', () => create('CREATE_GOAL', 'name', field({ value: '' })))
  refusedWith('empty_value', () => create('CREATE_GOAL', 'name', field({ value: null })))
  refusedWith('empty_value', () => create('CREATE_GOAL', 'targetAmount', field({ value: NaN })))
  refusedWith('invalid_field', () => create('CREATE_GOAL', 'name', field({ extra: 1 })))
  assert.ok(goal)
})

test('A5: a field the contract does not know is refused — at creation and when resolving', () => {
  refusedWith('unknown_field', () => P.createPendingAction({ id: 'x', intent: 'CREATE_GOAL', source: 's', fields: { colour: typed(CONTRACTS.CREATE_GOAL) } }, NOW))
  refusedWith('unknown_field', () => P.createPendingAction({ id: 'x', intent: 'QUERY_PENSION_ESTIMATE', source: 's', fields: { amount: typed(CONTRACTS.QUERY_PENSION_ESTIMATE, 1) } }, NOW))
  refusedWith('unknown_field', () => P.resolveFields(make('CREATE_GOAL'), { colour: typed(CONTRACTS.CREATE_GOAL) }, NOW + 1))
})

test('A6: status is ready only when nothing is missing, nothing is ambiguous and nothing is uncertain', () => {
  const g = make('CREATE_GOAL', {})
  assert.strictEqual(g.status, 'needs_input')
  assert.deepStrictEqual([...g.missing], ['name'])
  // An ambiguity counts as unresolved, and an ambiguous field is not also "missing".
  const amb = make('MODIFY_GOAL_CONTRIBUTE', { amount: typed(CONTRACTS.MODIFY_GOAL_CONTRIBUTE, 2000) }, {
    ambiguities: [{ field: 'goal', options: [{ id: 'g1', label: 'Laptop' }, { id: 'g2', label: 'Laptop fund' }] }],
  })
  assert.strictEqual(amb.status, 'needs_input')
  assert.deepStrictEqual([...amb.missing], [])
  assert.strictEqual(amb.ambiguities.length, 1)
  // Picking an option resolves it.
  const resolved = P.resolveFields(amb, { goal: { value: 'g1', kind: 'actual', origin: 'matched' } }, NOW + 1000)
  assert.strictEqual(resolved.status, 'ready')
  assert.deepStrictEqual([...resolved.ambiguities], [])
  assert.strictEqual(resolved.expiresAt, amb.expiresAt, 'resolving does not extend the expiry')
  // A value and an ambiguity for the same field cannot coexist.
  refusedWith('ambiguous_field_has_value', () => make('MODIFY_GOAL_CONTRIBUTE', minimalFields(CONTRACTS.MODIFY_GOAL_CONTRIBUTE), {
    ambiguities: [{ field: 'goal', options: [{ id: 'a', label: 'A' }, { id: 'b', label: 'B' }] }],
  }))
  refusedWith('invalid_ambiguity', () => make('MODIFY_GOAL_CONTRIBUTE', {}, { ambiguities: [{ field: 'goal', options: [{ id: 'a', label: 'A' }] }] }))
  // "One of" groups: newAmount or relativeChange, exactly one.
  const budget = make('MODIFY_BUDGET_AMOUNT', { category: typed(CONTRACTS.MODIFY_BUDGET_AMOUNT, 'Food') })
  assert.strictEqual(budget.status, 'needs_input')
  assert.deepStrictEqual([...budget.missing], ['newAmount|relativeChange'])
  assert.strictEqual(P.resolveFields(budget, { newAmount: typed(CONTRACTS.MODIFY_BUDGET_AMOUNT, 5000) }, NOW + 1).status, 'ready')
  refusedWith('conflicting_fields', () => P.resolveFields(budget, { newAmount: typed(CONTRACTS.MODIFY_BUDGET_AMOUNT, 5000), relativeChange: typed(CONTRACTS.MODIFY_BUDGET_AMOUNT, '+500') }, NOW + 1))
})

test('A7: only a READY action for an intent that has an owner (or the router) can be handed off', () => {
  assert.strictEqual(P.markHandedOff(make('CREATE_GOAL'), NOW + 1).status, 'handed_off')
  assert.strictEqual(P.markHandedOff(make('CREATE_BUDGET_MONTH'), NOW + 1).status, 'handed_off')
  assert.strictEqual(P.markHandedOff(make('NAVIGATE'), NOW + 1).status, 'handed_off')
  refusedWith('not_hand_off', () => P.markHandedOff(make('QUERY_SPEND'), NOW + 1)) // a query is answered, not handed off
  refusedWith('not_hand_off', () => P.markHandedOff(make('RECORD_TRANSACTION'), NOW + 1)) // the review screen is in place
  refusedWith('not_hand_off', () => P.markHandedOff(make('RECORD_SALARY'), NOW + 1))
  refusedWith('not_ready', () => P.markHandedOff(make('CREATE_GOAL', {}), NOW + 1)) // still needs input
})

test('A8: cancel works from needs_input and ready; handed-off, cancelled and expired actions never change again', () => {
  assert.strictEqual(P.cancelPendingAction(make('CREATE_GOAL'), NOW + 1).status, 'cancelled')
  assert.strictEqual(P.cancelPendingAction(make('CREATE_GOAL', {}), NOW + 1).status, 'cancelled')
  const cancelled = P.cancelPendingAction(make('CREATE_GOAL'), NOW + 1)
  assert.strictEqual(P.cancelPendingAction(cancelled, NOW + 2).status, 'cancelled', 'cancelling twice is harmless')
  refusedWith('terminal', () => P.resolveFields(cancelled, {}, NOW + 2))
  refusedWith('terminal', () => P.markHandedOff(cancelled, NOW + 2))
  const handed = P.markHandedOff(make('CREATE_GOAL'), NOW + 1)
  refusedWith('terminal', () => P.cancelPendingAction(handed, NOW + 2))
  refusedWith('terminal', () => P.resolveFields(handed, {}, NOW + 2))
  refusedWith('terminal', () => P.markHandedOff(handed, NOW + 2))
  const stale = make('CREATE_GOAL')
  refusedWith('expired', () => P.cancelPendingAction(stale, NOW + 6 * MIN))
  refusedWith('expired', () => P.resolveFields(stale, {}, NOW + 6 * MIN))
  refusedWith('expired', () => P.markHandedOff(stale, NOW + 6 * MIN))
  for (const s of ['handed_off', 'cancelled', 'expired']) assert.ok(P.isTerminal(s))
  assert.ok(!P.isTerminal('ready') && !P.isTerminal('needs_input'))
})

test('A9: an action expires at exactly expiresAt; handed-off and cancelled actions never expire', () => {
  const a = make('CREATE_GOAL')
  assert.strictEqual(P.statusAt(a, a.expiresAt - 1), 'ready')
  assert.strictEqual(P.statusAt(a, a.expiresAt), 'expired')
  assert.strictEqual(P.statusAt(a, a.expiresAt + 1), 'expired')
  assert.strictEqual(P.statusAt(make('CREATE_GOAL', {}), NOW + 6 * MIN), 'expired')
  assert.strictEqual(P.statusAt(P.markHandedOff(a, NOW + 1), NOW + 99 * MIN), 'handed_off')
  assert.strictEqual(P.statusAt(P.cancelPendingAction(a, NOW + 1), NOW + 99 * MIN), 'cancelled')
})

test('A10: nothing is changed in place — every function returns a new, frozen object and leaves its input untouched', () => {
  const input = deepFreeze({ id: 'x', intent: 'CREATE_GOAL', source: 's', fields: { name: { value: 'Laptop', kind: 'planned', origin: 'typed' } } })
  const a = P.createPendingAction(input, NOW)
  assert.ok(Object.isFrozen(a) && Object.isFrozen(a.fields) && Object.isFrozen(a.fields.name))
  const before = JSON.stringify(a)
  const patch = deepFreeze({ targetAmount: { value: 50000, kind: 'planned', origin: 'typed' } })
  const b = P.resolveFields(a, patch, NOW + 1)
  assert.notStrictEqual(b, a)
  assert.strictEqual(JSON.stringify(a), before, 'the original must be untouched')
  assert.strictEqual(a.fields.targetAmount, undefined)
  assert.strictEqual(b.fields.targetAmount.value, 50000)
  for (const out of [P.markHandedOff(a, NOW + 1), P.cancelPendingAction(a, NOW + 1)]) {
    assert.notStrictEqual(out, a)
    assert.strictEqual(JSON.stringify(a), before)
    assert.ok(Object.isFrozen(out))
  }
  // A caller's own object inside a value is copied, not frozen or shared.
  const proposal = [{ category: 'Food', amount: 3000 }]
  const budget = P.createPendingAction({ id: 'b', intent: 'CREATE_BUDGET_MONTH', source: 's', fields: {
    month: { value: '2026-11', kind: 'planned', origin: 'typed' },
    amounts: { value: proposal, kind: 'suggested', origin: 'engine' },
  } }, NOW)
  assert.ok(!Object.isFrozen(proposal), 'the caller\'s array must not be frozen by us')
  assert.notStrictEqual(budget.fields.amounts.value, proposal)
})

test('A11: no hidden clock — every function wants `now`, and nothing reads the real clock', () => {
  const a = make('CREATE_GOAL')
  const c = P.createClarification({ reason: 'bare_word', source: 'laptop', choices: [{ id: 'goal', label: 'A goal' }] }, NOW)
  const noNow = [
    () => P.createPendingAction({ id: 'x', intent: 'CREATE_GOAL', source: 's' }),
    () => P.resolveFields(a, {}),
    () => P.markHandedOff(a),
    () => P.cancelPendingAction(a),
    () => P.statusAt(a),
    () => P.createClarification({ reason: 'bare_word', source: 's', choices: [{ id: 'g', label: 'G' }] }),
    () => P.isClarificationExpired(c),
    () => P.statusAt(a, '1800000000000'),
    () => P.statusAt(a, NaN),
  ]
  for (const call of noNow) refusedWith('now_required', call)
  // Run a full scenario with the real clock switched off.
  const RealDate = globalThis.Date
  class NoClockDate extends RealDate {
    constructor(...args) {
      if (args.length === 0) throw new Error('code read the real clock: new Date() with no argument')
      super(...args)
    }
    static now() { throw new Error('code read the real clock: Date.now()') }
    static [Symbol.hasInstance](x) { return x instanceof RealDate }
  }
  globalThis.Date = NoClockDate
  try {
    const x = make('MODIFY_GOAL_CONTRIBUTE')
    P.resolveFields(x, { account: { value: 'SBI', kind: 'actual', origin: 'matched' } }, NOW + 1)
    P.statusAt(x, NOW + 7 * MIN)
    P.markHandedOff(x, NOW + 2)
    P.cancelPendingAction(make('CREATE_GOAL'), NOW + 3)
    const k = P.createClarification({ reason: 'mixed_input', source: 'mixed', choices: [{ id: 'edit', label: 'Edit' }] }, NOW)
    P.isClarificationExpired(k, NOW + 4)
  } finally { globalThis.Date = RealDate }
})

test('A12: a clarification — a known reason, 1 to 4 choices, Cancel always present, same expiry, the typed text kept', () => {
  assert.deepStrictEqual(CLARIFY_REASONS.length, 5)
  const c = P.createClarification({
    reason: 'competing_meaning', source: 'I need 50000 for a laptop',
    choices: [{ id: 'expense', label: 'Record 50,000 as an expense', intent: 'RECORD_TRANSACTION' }, { id: 'goal', label: 'Create a goal', intent: 'CREATE_GOAL' }],
  }, NOW)
  assert.strictEqual(c.kind, 'clarify')
  assert.strictEqual(c.source, 'I need 50000 for a laptop')
  assert.strictEqual(c.expiresAt - c.createdAt, 5 * MIN)
  assert.deepStrictEqual(c.choices.map((x) => x.id), ['expense', 'goal', 'cancel'])
  assert.strictEqual(c.choices.at(-1).id, 'cancel')
  assert.ok(Object.isFrozen(c) && Object.isFrozen(c.choices[0]))
  assert.ok(!P.isClarificationExpired(c, NOW + 5 * MIN - 1) && P.isClarificationExpired(c, NOW + 5 * MIN))
  for (const reason of CLARIFY_REASONS) {
    if (reason === 'mixed_input') continue
    const k = P.createClarification({ reason, source: 's', choices: [{ id: 'a', label: 'A' }] }, NOW)
    assert.strictEqual(k.choices.at(-1).id, 'cancel', `${reason}: Cancel must always be present`)
  }
  const bad = (over) => () => P.createClarification({ reason: 'bare_word', source: 's', choices: [{ id: 'a', label: 'A' }], ...over }, NOW)
  refusedWith('invalid_clarification', bad({ reason: 'whatever' }))
  refusedWith('invalid_clarification', bad({ choices: [] }))
  refusedWith('invalid_clarification', bad({ choices: [1, 2, 3, 4, 5].map((n) => ({ id: `c${n}`, label: `C${n}` })) }))
  refusedWith('invalid_clarification', bad({ choices: [{ id: 'a', label: 'A' }, { id: 'a', label: 'B' }] }))
  refusedWith('invalid_clarification', bad({ choices: [{ id: 'a', label: '  ' }] }))
  refusedWith('invalid_clarification', bad({ choices: [{ id: 'cancel', label: 'Cancel' }] })) // reserved: it is added for you
  refusedWith('invalid_clarification', bad({ choices: [{ id: 'a', label: 'A', intent: 'NOT_AN_INTENT' }] }))
  refusedWith('invalid_clarification', bad({ source: '' }))
  // Mixed input (decision 5, approval 8): the one choice is "edit", plus Cancel.
  const mixed = P.createClarification({ reason: 'mixed_input', source: 'salary 25k received and create a goal', choices: [{ id: 'edit', label: 'Edit my message' }] }, NOW)
  assert.deepStrictEqual(mixed.choices.map((x) => x.id), ['edit', 'cancel'])
  refusedWith('invalid_clarification', () => P.createClarification({ reason: 'mixed_input', source: 's', choices: [{ id: 'a', label: 'A' }] }, NOW))
  refusedWith('invalid_clarification', () => P.createClarification({ reason: 'mixed_input', source: 's', choices: [{ id: 'edit', label: 'E' }, { id: 'b', label: 'B' }] }, NOW))
})

test('A13: your four examples, as pending actions', () => {
  // (a) "Received 30000 salary": the user typed the amount, so it is ACTUAL once confirmed.
  const a = P.createPendingAction({ id: 'a', intent: 'RECORD_SALARY', source: 'Received 30000 salary', fields: {
    amount: { value: 30000, kind: 'actual', origin: 'typed' },
  } }, NOW)
  assert.strictEqual(a.becomes, 'actual')
  assert.strictEqual(a.fields.amount.kind, 'actual')
  // (b) A salary amount worked out from the active structure is ESTIMATED until the user confirms it — and only salary may do that.
  const b = P.createPendingAction({ id: 'b', intent: 'RECORD_SALARY', source: 'Received my salary', fields: {
    amount: { value: 28450, kind: 'estimated', origin: 'engine', note: 'From your active salary structure' },
  } }, NOW)
  assert.strictEqual(b.becomes, 'actual', 'it becomes an actual income only after confirmation')
  assert.strictEqual(b.fields.amount.kind, 'estimated')
  assert.strictEqual(b.fields.amount.origin, 'engine')
  refusedWith('estimate_not_allowed', () => P.createPendingAction({ id: 'b2', intent: 'MODIFY_GOAL_CONTRIBUTE', source: 's', fields: {
    amount: { value: 2000, kind: 'estimated', origin: 'engine' } } }, NOW))
  // (c) "Create next month's budget": a PLANNED budget whose amounts are SUGGESTED by an engine, never history.
  const c = P.createPendingAction({ id: 'c', intent: 'CREATE_BUDGET_MONTH', source: 'Create next month\'s budget', fields: {
    month: { value: '2026-11', kind: 'planned', origin: 'typed' },
    amounts: { value: [{ category: 'Food', amount: 3000 }], kind: 'suggested', origin: 'engine', note: 'From your own recent spending, rounded to the nearest 50' },
  } }, NOW)
  assert.strictEqual(c.becomes, 'planned')
  assert.strictEqual(c.fields.amounts.kind, 'suggested')
  assert.strictEqual(c.fields.month.kind, 'planned')
  // (d) "Create a goal": a PLANNED objective; everything typed is planned.
  const d = P.createPendingAction({ id: 'd', intent: 'CREATE_GOAL', source: 'Create a goal for a laptop', fields: {
    name: { value: 'Laptop', kind: 'planned', origin: 'typed' },
  } }, NOW)
  assert.strictEqual(d.becomes, 'planned')
  assert.strictEqual(d.fields.name.kind, 'planned')
  assert.strictEqual(d.status, 'ready', 'only the name is needed to open the form; the form asks for the target')
  assert.deepStrictEqual([...d.missing], [])
})

console.log(`\n${passed} passed, ${failed} failed`)
if (failed > 0) process.exit(1)
