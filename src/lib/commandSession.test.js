// P6 — tests for the in-memory command session (commandSession.js).
//
// What it must do: hand a handoff over exactly once, only to the right page, user and
// time; keep a remembered goal for ten minutes and only for its user; forget everything
// on clear; and never touch the network, the browser's storage or the history state.
import assert from 'node:assert'
import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import * as S from './commandSession.js'
import { createPendingAction } from './command/pendingAction.js'

let passed = 0, failed = 0
function test(name, fn) {
  S.clearCommandSession()
  try { fn(); passed++; console.log(`  PASS  ${name}`) }
  catch (err) { failed++; console.log(`  FAIL  ${name}\n${String(err.message).split('\n').map((l) => '        ' + l).join('\n')}`) }
}

const NOW = 1_800_000_000_000
const MIN = 60 * 1000
const USER = 'user-1'
const ALL = () => true
const contribute = (id = 'pa-1') => createPendingAction({
  id, intent: 'MODIFY_GOAL_CONTRIBUTE', source: 'add 2000 to laptop',
  fields: { goal: { value: { id: 'g1', name: 'Laptop' }, kind: 'actual', origin: 'matched' }, amount: { value: 2000, kind: 'actual', origin: 'typed' } },
}, NOW)

console.log('commandSession tests\n')

test('S1: a handoff is read once, by the right page, and then it is gone', () => {
  assert.strictEqual(S.hasHandoff(), false)
  S.putHandoff(contribute(), USER, NOW, ALL)
  assert.strictEqual(S.hasHandoff(), true)
  const first = S.takeHandoff('goals', USER, NOW + MIN, ALL)
  assert.strictEqual(first.ok, true)
  assert.strictEqual(first.pending.id, 'pa-1')
  assert.strictEqual(first.pending.status, 'handed_off')
  assert.strictEqual(S.hasHandoff(), false)
  assert.deepStrictEqual(S.takeHandoff('goals', USER, NOW + MIN, ALL), { ok: false, reason: 'no_handoff' })
  // the same action put in again is refused as already used (a second read of the same package)
  S.putHandoff(contribute(), USER, NOW, ALL)
  assert.deepStrictEqual(S.takeHandoff('goals', USER, NOW + MIN, ALL), { ok: false, reason: 'already_used' })
  assert.strictEqual(S.hasHandoff(), false)
  // a different action is a different package
  S.putHandoff(contribute('pa-2'), USER, NOW, ALL)
  assert.strictEqual(S.takeHandoff('goals', USER, NOW + MIN, ALL).ok, true)
})

test('S2: a handoff for another page waits for its own page and is not spent by a wrong read', () => {
  S.putHandoff(contribute(), USER, NOW, ALL)
  assert.deepStrictEqual(S.takeHandoff('budgets', USER, NOW, ALL), { ok: false, reason: 'wrong_page' })
  assert.deepStrictEqual(S.takeHandoff('learning', USER, NOW, ALL), { ok: false, reason: 'wrong_page' })
  assert.strictEqual(S.hasHandoff(), true)
  assert.strictEqual(S.takeHandoff('goals', USER, NOW, ALL).ok, true)
})

test('S3: an expired handoff, another user and a not-built intent are dropped and read as nothing', () => {
  S.putHandoff(contribute(), USER, NOW, ALL)
  assert.strictEqual(S.takeHandoff('goals', USER, NOW + 5 * MIN - 1, ALL).ok, true)
  S.putHandoff(contribute('pa-3'), USER, NOW, ALL)
  assert.deepStrictEqual(S.takeHandoff('goals', USER, NOW + 5 * MIN, ALL), { ok: false, reason: 'expired' })
  assert.strictEqual(S.hasHandoff(), false, 'an expired handoff is dropped')
  S.putHandoff(contribute('pa-4'), USER, NOW, ALL)
  assert.deepStrictEqual(S.takeHandoff('goals', 'user-2', NOW, ALL), { ok: false, reason: 'other_user' })
  assert.strictEqual(S.hasHandoff(), false, 'a handoff for someone else is dropped, not given to the next page')
  S.putHandoff(contribute('pa-5'), USER, NOW, ALL)
  assert.deepStrictEqual(S.takeHandoff('goals', USER, NOW, () => false), { ok: false, reason: 'unavailable' })
  assert.strictEqual(S.hasHandoff(), false)
  // an intent that availability says is not built cannot even be put in (every owner command is built from P9, so availability is passed in)
  const budget = createPendingAction({ id: 'pb-1', intent: 'CREATE_BUDGET_MONTH', source: 'create next months budget', fields: { month: { value: { label: 'November 2026' }, kind: 'planned', origin: 'typed' } } }, NOW)
  assert.throws(() => S.putHandoff(budget, USER, NOW, () => false), (e) => e.code === 'unavailable')
  assert.strictEqual(S.hasHandoff(), false)
  assert.strictEqual(S.putHandoff(contribute('pa-6'), USER, NOW).page, 'goals')
  assert.strictEqual(S.hasHandoff(), true)
})

test('S4: the remembered goal lasts ten minutes, belongs to one user, and a user change drops it', () => {
  S.remember({ id: 'g1', name: 'Laptop' }, USER, NOW)
  assert.deepStrictEqual(S.recall(USER, NOW + 10 * MIN - 1), { id: 'g1', name: 'Laptop' })
  assert.strictEqual(S.recall(USER, NOW + 10 * MIN), null)
  S.remember({ id: 'g1', name: 'Laptop' }, USER, NOW)
  assert.ok(S.memoryFor(USER))
  assert.strictEqual(S.memoryFor('user-2'), null, 'another user sees nothing')
  assert.strictEqual(S.memoryFor(USER), null, 'and the first user\'s memory was dropped by the change')
  S.remember({ id: 'g2', name: 'Bike' }, USER, NOW)
  assert.strictEqual(S.recall('user-2', NOW), null)
  assert.strictEqual(S.recall(USER, NOW), null, 'asking as another user cleared it')
  assert.throws(() => S.remember({ id: 'g', name: '' }, USER, NOW))
})

test('S5: clearCommandSession forgets the handoff, the used ids and the remembered goal', () => {
  S.putHandoff(contribute(), USER, NOW, ALL)
  S.takeHandoff('goals', USER, NOW, ALL) // marks pa-1 used
  S.putHandoff(contribute('pa-9'), USER, NOW, ALL)
  S.remember({ id: 'g1', name: 'Laptop' }, USER, NOW)
  S.clearCommandSession()
  assert.strictEqual(S.hasHandoff(), false)
  assert.strictEqual(S.memoryFor(USER), null)
  assert.strictEqual(S.recall(USER, NOW), null)
  assert.deepStrictEqual(S.takeHandoff('goals', USER, NOW, ALL), { ok: false, reason: 'no_handoff' })
  // the used ids are forgotten too: pa-1 can be handed over again
  S.putHandoff(contribute(), USER, NOW, ALL)
  assert.strictEqual(S.takeHandoff('goals', USER, NOW, ALL).ok, true)
})

test('S6: the store is in memory only — no network, no browser storage, no history state, no database, no clock', () => {
  const code = readFileSync(fileURLToPath(new URL('./commandSession.js', import.meta.url)), 'utf8')
    .replace(/\/\*[\s\S]*?\*\//g, '').replace(/(^|[^:'"`])\/\/.*$/gm, '$1')
  assert.ok(!/fetch\(|XMLHttpRequest|WebSocket|sendBeacon/.test(code), 'no network')
  assert.ok(!/localStorage|sessionStorage|indexedDB|document\.cookie/.test(code), 'no browser storage')
  assert.ok(!/history\.|pushState|replaceState|location\./.test(code), 'no history state')
  assert.ok(!/supabase|from\s*['"]react|react-router|AuthContext/.test(code), 'no database, no screen code')
  assert.ok(!/Date\.now|new Date|Math\.random|crypto\./.test(code), 'no clock or randomness')
  const imports = [...code.matchAll(/import\s[^;]*?from\s*['"]([^'"]+)['"]/g)].map((m) => m[1]).sort()
  assert.deepStrictEqual(imports, ['./command/commandContext.js', './command/handoff.js'])
})

test('S7: open pages are told when a handoff arrives, for their own page only; a failing listener and a stopped listener do no harm', () => {
  const heard = []
  const stop = S.onHandoff((page) => heard.push(page))
  S.onHandoff(() => { throw new Error('a page that fails to listen') })
  S.putHandoff(contribute('pa-7'), USER, NOW, ALL)
  assert.deepStrictEqual(heard, ['goals'], 'told which page, once, and the failing listener did not stop the handoff')
  assert.strictEqual(S.hasHandoff(), true, 'telling a page does not read the handoff for it')
  assert.strictEqual(S.takeHandoff('goals', USER, NOW, ALL).ok, true)
  stop()
  S.putHandoff(contribute('pa-8'), USER, NOW, ALL)
  assert.deepStrictEqual(heard, ['goals'], 'a stopped listener hears nothing more')
  assert.throws(() => S.onHandoff('not a function'), TypeError)
  // clearing the session keeps the listeners (they belong to mounted pages) but drops the handoff
  S.clearCommandSession()
  assert.strictEqual(S.hasHandoff(), false)
})

console.log(`\n${passed} passed, ${failed} failed`)
if (failed) process.exit(1)
