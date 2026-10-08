// P6 — tests for the handoff and the navigation lookups (handoff.js).
//
// The rules under test: only a ready, built, owner-page action can become a handoff;
// a page accepts it only once, only for the right user, page and time; navigation
// opens only the six approved pages and takes the route from the table, never from the text.
import assert from 'node:assert'
import * as H from './handoff.js'
import { interpret } from './interpreter.js'
import { createPendingAction, cancelPendingAction, markHandedOff, PENDING_ACTION_TTL_MS } from './pendingAction.js'
import { ALLOWED_PAGES, CONTRACTS, INTENT_IDS, HANDOFF_FLOWS, isIntentAvailable } from './intents.js'

let passed = 0, failed = 0
function test(name, fn) {
  try { fn(); passed++; console.log(`  PASS  ${name}`) }
  catch (err) { failed++; console.log(`  FAIL  ${name}\n${String(err.message).split('\n').map((l) => '        ' + l).join('\n')}`) }
}

const NOW = 1_800_000_000_000
const MIN = 60 * 1000
const USER = 'user-1'
const ALL = () => true // as if every phase were built
const refusedWith = (code, fn) => assert.throws(fn, (e) => e instanceof H.HandoffError && e.code === code, `expected a refusal with code "${code}"`)

const contribute = (extra = {}) => createPendingAction({
  id: 'pa-1', intent: 'MODIFY_GOAL_CONTRIBUTE', source: 'add 2000 to laptop',
  fields: {
    goal: { value: { id: 'g1', name: 'Laptop' }, kind: 'actual', origin: 'matched' },
    amount: { value: 2000, kind: 'actual', origin: 'typed' },
  },
  ...extra,
}, NOW)
const ctx = (goals = []) => ({ id: 'x', goals, categories: [], learningItems: [], accounts: [] })

console.log('handoff tests\n')

test('H1: a ready action becomes a handoff for its owner page; the pending action inside is handed_off, never "executed"', () => {
  const h = H.createHandoff(contribute(), USER, NOW, ALL)
  assert.strictEqual(h.id, 'pa-1')
  assert.strictEqual(h.userId, USER)
  assert.strictEqual(h.page, 'goals')
  assert.strictEqual(h.createdAt, NOW)
  assert.strictEqual(h.pending.status, 'handed_off')
  assert.deepStrictEqual(Object.keys(h).sort(), ['createdAt', 'id', 'page', 'pending', 'userId'])
  assert.ok(!JSON.stringify(h).match(/executed|saved|done/i), 'no word for finished work anywhere in a handoff')
  // the budgets and learning intents go to their own pages
  assert.strictEqual(H.createHandoff(createPendingAction({ id: 'b', intent: 'MODIFY_BUDGET_AMOUNT', source: 's', fields: { category: { value: { id: 'c', name: 'Food' }, kind: 'planned', origin: 'matched' }, newAmount: { value: 5000, kind: 'planned', origin: 'typed' } } }, NOW), USER, NOW, ALL).page, 'budgets')
  assert.strictEqual(H.createHandoff(createPendingAction({ id: 'l', intent: 'CREATE_LEARNING_ITEM', source: 's', fields: { name: { value: 'Power BI', kind: 'planned', origin: 'typed' } } }, NOW), USER, NOW, ALL).page, 'learning')
})

test('H2: only a ready action can be handed off; cancelled, expired, already handed-off and incomplete ones cannot', () => {
  const incomplete = createPendingAction({ id: 'p', intent: 'MODIFY_GOAL_CONTRIBUTE', source: 's', fields: { amount: { value: 5, kind: 'actual', origin: 'typed' } } }, NOW)
  assert.strictEqual(incomplete.status, 'needs_input')
  refusedWith('not_ready', () => H.createHandoff(incomplete, USER, NOW, ALL))
  assert.throws(() => H.createHandoff(cancelPendingAction(contribute(), NOW), USER, NOW, ALL))
  refusedWith('not_ready', () => H.createHandoff(contribute(), USER, NOW + 5 * MIN, ALL)) // expired exactly at five minutes
  assert.throws(() => H.createHandoff(markHandedOff(contribute(), NOW), USER, NOW, ALL))
  H.createHandoff(contribute(), USER, NOW + 5 * MIN - 1, ALL) // one millisecond earlier still works
})

test('H3: only intents handed to an owner page can become a handoff (not entries, questions or page requests)', () => {
  const nav = createPendingAction({ id: 'n', intent: 'NAVIGATE', source: 'open goals', fields: { page: { value: 'goals', kind: 'actual', origin: 'typed' } } }, NOW)
  refusedWith('not_hand_off', () => H.createHandoff(nav, USER, NOW, ALL))
  const q = createPendingAction({ id: 'q', intent: 'QUERY_BALANCE', source: 's', fields: {} }, NOW)
  refusedWith('not_hand_off', () => H.createHandoff(q, USER, NOW, ALL))
  const tx = createPendingAction({ id: 't', intent: 'RECORD_TRANSACTION', source: 's', fields: { amount: { value: 80, kind: 'actual', origin: 'typed' } } }, NOW)
  refusedWith('not_hand_off', () => H.createHandoff(tx, USER, NOW, ALL))
  refusedWith('invalid_pending', () => H.createHandoff(null, USER, NOW, ALL))
  refusedWith('user_required', () => H.createHandoff(contribute(), '', NOW, ALL))
  refusedWith('now_required', () => H.createHandoff(contribute(), USER, undefined, ALL))
  assert.ok(INTENT_IDS.filter((id) => HANDOFF_FLOWS.includes(CONTRACTS[id].flow) && CONTRACTS[id].flow !== 'router').length >= 5)
})

test('H4: an intent that is not built yet cannot be handed off — the goal commands are built (P7), the other owners are not', () => {
  assert.strictEqual(isIntentAvailable('MODIFY_GOAL_CONTRIBUTE'), true)
  assert.strictEqual(H.createHandoff(contribute(), USER, NOW).page, 'goals')
  refusedWith('unavailable', () => H.createHandoff(contribute(), USER, NOW, () => false))
  const budget = createPendingAction({ id: 'pb-1', intent: 'CREATE_BUDGET_MONTH', source: 'create next months budget', fields: { month: { value: { label: 'November 2026' }, kind: 'planned', origin: 'typed' } } }, NOW)
  assert.strictEqual(isIntentAvailable('CREATE_BUDGET_MONTH'), false)
  refusedWith('unavailable', () => H.createHandoff(budget, USER, NOW))
})

test('H5: a page reads a handoff once, and only the right page, user and time are accepted — each refusal has its own reason', () => {
  const h = H.createHandoff(contribute(), USER, NOW, ALL)
  const ok = H.readHandoff(h, 'goals', USER, NOW + MIN, new Set(), ALL)
  assert.strictEqual(ok.ok, true)
  assert.strictEqual(ok.pending.status, 'handed_off')
  assert.strictEqual(ok.pending.id, 'pa-1')
  const reason = (...args) => H.readHandoff(...args).reason
  assert.strictEqual(reason(null, 'goals', USER, NOW, new Set(), ALL), 'no_handoff')
  assert.strictEqual(reason(undefined, 'goals', USER, NOW, new Set(), ALL), 'no_handoff')
  assert.strictEqual(reason({}, 'goals', USER, NOW, new Set(), ALL), 'no_handoff')
  assert.strictEqual(reason(h, 'goals', 'user-2', NOW, new Set(), ALL), 'other_user')
  assert.strictEqual(reason(h, 'goals', null, NOW, new Set(), ALL), 'other_user')
  assert.strictEqual(reason(h, 'budgets', USER, NOW, new Set(), ALL), 'wrong_page')
  assert.strictEqual(reason(h, 'goals', USER, NOW, new Set(['pa-1']), ALL), 'already_used')
  assert.strictEqual(reason(h, 'goals', USER, NOW, ['pa-1'], ALL), 'already_used')
  assert.strictEqual(reason(h, 'goals', USER, NOW, new Set(), () => false), 'unavailable')
  for (const r of ['no_handoff', 'other_user', 'expired', 'already_used', 'wrong_page', 'unavailable']) assert.ok(H.HANDOFF_REASONS.includes(r))
  assert.strictEqual(H.HANDOFF_REASONS.length, 6)
})

test('H6: a handoff expires with its pending action: still good at 5 minutes minus 1 ms, gone at exactly 5 minutes', () => {
  assert.strictEqual(PENDING_ACTION_TTL_MS, 5 * MIN)
  const h = H.createHandoff(contribute(), USER, NOW, ALL)
  assert.strictEqual(H.readHandoff(h, 'goals', USER, NOW + 5 * MIN - 1, new Set(), ALL).ok, true)
  assert.deepStrictEqual(H.readHandoff(h, 'goals', USER, NOW + 5 * MIN, new Set(), ALL), { ok: false, reason: 'expired' })
  assert.strictEqual(H.readHandoff(h, 'goals', USER, NOW + 60 * MIN, new Set(), ALL).reason, 'expired')
})

test('H7: a handoff is deeply frozen, never changes its input, and reading it changes nothing', () => {
  const pending = contribute()
  const before = JSON.stringify(pending)
  const h = H.createHandoff(pending, USER, NOW, ALL)
  assert.strictEqual(JSON.stringify(pending), before)
  assert.strictEqual(pending.status, 'ready')
  assert.ok(Object.isFrozen(h) && Object.isFrozen(h.pending) && Object.isFrozen(h.pending.fields.goal.value))
  assert.throws(() => { h.page = 'budgets' }, TypeError)
  assert.throws(() => { h.pending.status = 'ready' }, TypeError)
  const used = new Set()
  const r1 = H.readHandoff(h, 'goals', USER, NOW, used, ALL)
  const r2 = H.readHandoff(h, 'goals', USER, NOW, used, ALL)
  assert.deepStrictEqual(r1, r2) // reading does not mark anything: the session store does that
  assert.strictEqual(used.size, 0)
  assert.ok(Object.isFrozen(r1))
})

test('H8: navigation opens exactly the six approved pages; the route comes from the table; nothing else navigates', () => {
  const SIX = ['transactions', 'goals', 'budgets', 'learning', 'salary', 'pension']
  assert.deepStrictEqual(ALLOWED_PAGES.map((p) => p.id), SIX)
  for (const p of ALLOWED_PAGES) {
    assert.deepStrictEqual(H.navigationFromChoice(`open_${p.id}`), { page: p.id, route: p.route })
    const r = interpret(`open my ${p.id === 'pension' ? 'pension' : p.id}`, ctx(), NOW)
    // (the typed words are P3's business; whenever it says navigate, the route is the table's)
    if (r.kind === 'navigate') assert.deepStrictEqual(H.navigationFromResult(r, ALL), { page: p.id, route: p.route })
  }
  assert.deepStrictEqual(H.navigationFromResult(interpret('Open my goals', ctx(), NOW), ALL), { page: 'goals', route: '/goals' })
  assert.deepStrictEqual(H.navigationFromResult(interpret('take me to budgets', ctx(), NOW), ALL), { page: 'budgets', route: '/budgets' })
  assert.deepStrictEqual(H.navigationFromResult(interpret('go to salary', ctx(), NOW), ALL), { page: 'salary', route: '/salary' })
  assert.deepStrictEqual(H.navigationFromResult(interpret('show my learning', ctx(), NOW), ALL), { page: 'learning', route: '/learning' })
  assert.deepStrictEqual(H.navigationFromResult(interpret('view my transactions', ctx(), NOW), ALL), { page: 'transactions', route: '/transactions' })
  assert.deepStrictEqual(H.navigationFromResult(interpret('open pension', ctx(), NOW), ALL), { page: 'pension', route: '/pf-pension' })
  for (const bad of ['open_settings', 'open_charts', 'open_reports', 'open_insights', 'open_ctc', 'open_money_options', 'open_admin', 'open_', 'open_GOALS', 'open_goals/../x', 'goals', 'cancel', 'edit', '']) {
    assert.strictEqual(H.navigationFromChoice(bad, ALL), null, bad)
  }
  assert.strictEqual(H.navigationFromChoice(undefined), null)
  assert.strictEqual(H.navigationFromChoice({ id: 'open_goals' }), null)
})

test('H9: excluded pages never navigate; an unclear page, a command, a question and an entry are not navigations', () => {
  for (const t of ['open settings', 'open charts', 'open reports', 'open insights', 'open the ctc explorer', 'open money options', 'open admin']) {
    assert.strictEqual(H.navigationFromResult(interpret(t, ctx(), NOW), ALL), null, t)
  }
  for (const t of ['coffee 80', 'How much did I spend this month?', 'Create a goal for a laptop worth 50000', 'open', 'laptop']) {
    assert.strictEqual(H.navigationFromResult(interpret(t, ctx(), NOW), ALL), null, t)
  }
  assert.strictEqual(H.navigationFromResult(null), null)
  assert.strictEqual(H.navigationFromResult({}), null)
  // a navigate result that is not complete is not a navigation
  const open = interpret('Open my goals', ctx(), NOW)
  assert.ok(open.kind === 'navigate')
  assert.strictEqual(H.navigationFromResult({ ...open, asks: ['page_ambiguous'] }, ALL), null)
  assert.strictEqual(H.navigationFromResult({ ...open, pending: { ...open.pending, missing: ['page'] } }, ALL), null)
  assert.strictEqual(H.navigationFromResult({ ...open, pending: { ...open.pending, ambiguities: [{ field: 'page', options: [] }] } }, ALL), null)
  // a page value that is not an allowed page (even with the right intent) goes nowhere
  const forged = { ...open, pending: { ...open.pending, fields: { page: { ...open.pending.fields.page, value: '/settings' } } } }
  assert.strictEqual(H.navigationFromResult(forged, ALL), null)
  const forged2 = { ...open, pending: { ...open.pending, fields: { page: { ...open.pending.fields.page, value: 'settings' } } } }
  assert.strictEqual(H.navigationFromResult(forged2, ALL), null)
  // a question or command result is never turned into a navigation
  assert.strictEqual(H.navigationFromResult({ ...open, kind: 'query' }, ALL), null)
})

test('H10: navigation follows availability — before P6 it is off, now it is on; handoff.js is deterministic and reads no clock', () => {
  assert.strictEqual(H.navigationFromChoice('open_goals', () => false), null)
  assert.strictEqual(H.navigationFromResult(interpret('Open my goals', ctx(), NOW), () => false), null)
  assert.strictEqual(isIntentAvailable('NAVIGATE'), true)
  assert.ok(H.navigationFromChoice('open_goals'))
  const real = Date.now
  Date.now = () => { throw new Error('the clock was read') }
  try {
    const h1 = H.createHandoff(contribute(), USER, NOW, ALL)
    const h2 = H.createHandoff(contribute(), USER, NOW, ALL)
    assert.deepStrictEqual(h1, h2)
    H.readHandoff(h1, 'goals', USER, NOW, new Set(), ALL)
    H.navigationFromChoice('open_budgets')
  } finally { Date.now = real }
})

console.log(`\n${passed} passed, ${failed} failed`)
if (failed) process.exit(1)
