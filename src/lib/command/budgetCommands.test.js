// P9 — tests for the budget commands on the Money Inbox side (budgetCommands.js).
//
// What it must do: add "Continue in Budgets" only to a ready, built, unexpired budget command; offer
// the interpreter's own category matches (spending categories only, at most five, only when the change
// is already known, only when they can be told apart) when the category is the open question; hand over
// only a ready action; refuse anything that was not offered; leave every other kind of result exactly as
// the base view had it; calculate nothing and save nothing.
import assert from 'node:assert'
import * as B from './budgetCommands.js'
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
const CATS = [
  { id: 'c1', name: 'Food' }, { id: 'c2', name: 'Food delivery' }, { id: 'c3', name: 'Rent' },
  { id: 'c4', name: 'Salary' }, { id: 'c5', name: 'Travel' },
]
const EXPENSE = CATS.filter((c) => c.id !== 'c4')
const run = (text, cats = CATS) => interpret(text, { id: 'pa-1', referenceDate: new Date('2026-10-08T10:00:00'), goals: [{ id: 'g1', name: 'Laptop' }], categories: cats, learningItems: [{ id: 'l1', name: 'Power BI' }], accounts: [] }, NOW)
const viewOf = (result, cats = EXPENSE, now = NOW) => B.budgetCommandView(buildGuardView(result), result, cats, now)
const ids = (view) => view.choices.map((c) => c.id)

console.log('budgetCommands tests\n')

test('B1: only budget commands are touched — every other result gets its base view back, unchanged', () => {
  for (const text of ['How much did I spend on food?', 'Open my budgets', 'budget', 'Create a goal called Bike', 'Add 2000 to my laptop goal', 'Add Tableau to my learning', 'Mark my Power BI course as completed']) {
    const r = run(text)
    if (r.kind === 'transaction') continue
    const base = buildGuardView(r)
    assert.strictEqual(B.budgetCommandView(base, r, EXPENSE, NOW), base, text)
    assert.strictEqual(B.isBudgetCommand(r), false, text)
    assert.deepStrictEqual(B.resolveBudgetCommandChoice(r, 'continue_budgets', EXPENSE, NOW), { action: 'pass' }, text)
  }
  assert.strictEqual(B.budgetCommandView(null, run("Create next month's budget"), EXPENSE, NOW), null)
  assert.strictEqual(B.isBudgetCommand(null), false)
})

test('B2: a ready create-month and a ready amount change get "Continue in Budgets", then Edit and Cancel, and the new footer', () => {
  for (const text of ["Create next month's budget", 'Create this month budget', 'Set my rent budget to 5000', 'Increase my rent budget by 500', 'Decrease my travel budget by 200', 'Set my rent budget to 6000 for December']) {
    const r = run(text)
    assert.strictEqual(r.pending.status, 'ready', text)
    const v = viewOf(r)
    assert.deepStrictEqual(ids(v), ['continue_budgets', 'edit', 'cancel'], text)
    assert.strictEqual(v.choices[0].label, 'Continue in Budgets')
    assert.strictEqual(v.footer, "Nothing is saved yet. You'll confirm it in Budgets.")
    assert.strictEqual(v.title, buildGuardView(r).title)
  }
})

test('B3: a create with no month and a change with no amount get no Continue and no picks', () => {
  for (const text of ['Create a budget', 'Set my rent budget', 'Increase my rent budget']) {
    const r = run(text)
    assert.strictEqual(r.kind, 'command', text)
    assert.deepStrictEqual(ids(viewOf(r)), ids(buildGuardView(r)), text)
  }
})

test('B4: an unclear category offers the interpreter\'s own matches as buttons, spending categories only', () => {
  const r = run('Set my food budget to 5000')
  assert.strictEqual(r.pending.ambiguities[0].field, 'category')
  const v = viewOf(r)
  assert.deepStrictEqual(ids(v), ['pick_budget_c1', 'pick_budget_c2', 'edit', 'cancel'])
  assert.deepStrictEqual(v.choices.slice(0, 2).map((c) => c.label), ['Food', 'Food delivery'])
  assert.strictEqual(v.footer, "Pick the category, then you'll confirm in Budgets. Nothing is saved yet.")
  // a relative change is also "known", so it also gets picks
  const rel = run('Increase my food budget by 500')
  assert.deepStrictEqual(ids(viewOf(rel)).slice(0, 2), ['pick_budget_c1', 'pick_budget_c2'])
  // categories the user does not spend on are never offered
  assert.deepStrictEqual(ids(viewOf(r, [{ id: 'c1', name: 'Food' }])), ['pick_budget_c1', 'edit', 'cancel'])
  assert.deepStrictEqual(ids(viewOf(r, [{ id: 'c9', name: 'Other' }])), ids(buildGuardView(r)))
  assert.deepStrictEqual(ids(viewOf(r, null)), ids(buildGuardView(r)))
})

test('B5: no picks when the change itself is unknown, when more than five match, when labels would read the same, or when it has expired', () => {
  const noAmount = run('Set my food budget')
  if (noAmount.kind === 'command') assert.deepStrictEqual(ids(viewOf(noAmount)), ids(buildGuardView(noAmount)), 'no change → no picks')
  const many = Array.from({ length: 6 }, (_, i) => ({ id: `m${i}`, name: `Food ${'abcdef'[i]}` }))
  const r6 = run('Set my food budget to 5000', many)
  assert.ok(r6.pending.ambiguities.length)
  assert.deepStrictEqual(ids(viewOf(r6, many)), ids(buildGuardView(r6)), 'six matches → none')
  const five = many.slice(0, 5)
  const r5 = run('Set my food budget to 5000', five)
  assert.strictEqual(ids(viewOf(r5, five)).filter((i) => i.startsWith('pick_budget_')).length, 5)
  const twins = [{ id: 't1', name: 'Food' }, { id: 't2', name: 'Food' }]
  const rt = run('Set my food budget to 5000', twins)
  assert.deepStrictEqual(ids(viewOf(rt, twins)), ids(buildGuardView(rt)), 'identical labels → none')
  const r = run('Set my food budget to 5000')
  assert.deepStrictEqual(ids(viewOf(r, EXPENSE, NOW + PENDING_ACTION_TTL_MS)), ids(buildGuardView(r)), 'expired → none')
  const ready = run('Set my rent budget to 5000')
  assert.deepStrictEqual(ids(viewOf(ready, EXPENSE, NOW + PENDING_ACTION_TTL_MS)), ids(buildGuardView(ready)), 'expired → no Continue')
})

test('B6: Continue hands over only a ready, unexpired action — and only the pending action itself', () => {
  const r = run('Set my rent budget to 5000')
  const out = B.resolveBudgetCommandChoice(r, 'continue_budgets', EXPENSE, NOW)
  assert.strictEqual(out.action, 'hand_off')
  assert.strictEqual(out.pending, r.pending)
  assert.deepStrictEqual(B.resolveBudgetCommandChoice(r, 'continue_budgets', EXPENSE, NOW + PENDING_ACTION_TTL_MS), { action: 'expired', message: 'That timed out. Please send your message again.' })
  assert.strictEqual(B.resolveBudgetCommandChoice(run("Create next month's budget"), 'continue_budgets', EXPENSE, NOW).action, 'hand_off')
  for (const text of ['Create a budget', 'Set my food budget to 5000', 'Set my rent budget']) assert.strictEqual(B.resolveBudgetCommandChoice(run(text), 'continue_budgets', EXPENSE, NOW).action, 'unknown', text)
})

test('B7: a pick fills the category as "matched", clears only the category questions, and then Continue is offered', () => {
  const r = run('Set my food budget to 5000')
  const out = B.resolveBudgetCommandChoice(r, 'pick_budget_c2', EXPENSE, NOW)
  assert.strictEqual(out.action, 'pick_category')
  const p = out.result.pending
  assert.deepStrictEqual(p.fields.category.value, { id: 'c2', name: 'Food delivery' })
  assert.strictEqual(p.fields.category.origin, 'matched')
  assert.strictEqual(p.fields.category.note, 'You chose Food delivery.')
  assert.strictEqual(p.fields.newAmount.value, 5000)
  assert.deepStrictEqual(out.result.asks, [])
  assert.ok(out.result.notes.includes('You chose Food delivery.'))
  assert.strictEqual(p.status, 'ready')
  assert.deepStrictEqual(ids(viewOf(out.result)), ['continue_budgets', 'edit', 'cancel'])
  // the original is untouched
  assert.strictEqual(r.pending.fields.category, undefined)
})

test('B8: a button that was not offered is refused — an income category, an unknown id, a pick on a command that has its category', () => {
  const r = run('Set my food budget to 5000')
  assert.strictEqual(B.resolveBudgetCommandChoice(r, 'pick_budget_c4', EXPENSE, NOW).action, 'unknown', 'salary is not offered')
  assert.strictEqual(B.resolveBudgetCommandChoice(r, 'pick_budget_nope', EXPENSE, NOW).action, 'unknown')
  assert.strictEqual(B.resolveBudgetCommandChoice(r, 'pick_budget_c1', [{ id: 'c2', name: 'Food delivery' }], NOW).action, 'unknown', 'only categories passed in')
  assert.strictEqual(B.resolveBudgetCommandChoice(run('Set my rent budget to 5000'), 'pick_budget_c3', EXPENSE, NOW).action, 'unknown')
  assert.strictEqual(B.resolveBudgetCommandChoice(r, 'something_else', EXPENSE, NOW).action, 'unknown')
  assert.strictEqual(B.resolveBudgetCommandChoice(r, undefined, EXPENSE, NOW).action, 'unknown')
  assert.strictEqual(B.resolveBudgetCommandChoice(r, 'pick_budget_c1', EXPENSE, NOW + PENDING_ACTION_TTL_MS).action, 'expired')
})

test('B9: Edit and Cancel are not ours; the detail-less buttons only explain', () => {
  const r = run('Set my rent budget to 5000')
  assert.deepStrictEqual(B.resolveBudgetCommandChoice(r, 'edit', EXPENSE, NOW), { action: 'pass' })
  assert.deepStrictEqual(B.resolveBudgetCommandChoice(r, 'cancel', EXPENSE, NOW), { action: 'pass' })
  assert.strictEqual(B.budgetChoiceNotice('create_budget'), "Tell me the month, for example: Create next month's budget.")
  assert.strictEqual(B.budgetChoiceNotice('set_budget_amount'), 'Tell me how much, for example: Set my food budget to ₹5,000.')
  assert.strictEqual(B.budgetChoiceNotice('open_budgets'), null)
  assert.strictEqual(B.budgetChoiceNotice(undefined), null)
  // "Create a budget of 5000" is a real clarification that offers exactly these two buttons
  const c = run('Create a budget of 5000')
  assert.strictEqual(c.kind, 'clarify')
  assert.deepStrictEqual(c.clarification.choices.filter((x) => x.intent === 'CREATE_BUDGET_MONTH' || x.intent === 'MODIFY_BUDGET_AMOUNT').map((x) => x.id), ['set_budget_amount', 'create_budget'])
})

test('B10: pure — needs `now`, deeply frozen, never changes its input, available since P9', () => {
  const r = run('Set my food budget to 5000')
  assert.throws(() => B.budgetCommandView(buildGuardView(r), r, EXPENSE), TypeError)
  assert.throws(() => B.resolveBudgetCommandChoice(r, 'continue_budgets', EXPENSE), TypeError)
  assert.throws(() => B.isReadyBudgetCommand(r), TypeError)
  const v = viewOf(r)
  assert.ok(Object.isFrozen(v) && Object.isFrozen(v.choices))
  assert.deepStrictEqual(viewOf(r), viewOf(r))
  const snapshot = JSON.stringify(EXPENSE)
  const before = JSON.stringify(r)
  viewOf(r); B.resolveBudgetCommandChoice(r, 'pick_budget_c1', EXPENSE, NOW)
  assert.strictEqual(JSON.stringify(EXPENSE), snapshot)
  assert.strictEqual(JSON.stringify(r), before)
  assert.ok(isIntentAvailable('CREATE_BUDGET_MONTH') && isIntentAvailable('MODIFY_BUDGET_AMOUNT'))
  assert.ok(Object.isFrozen(B.BUDGET_COMMAND_MESSAGES) && Object.isFrozen(B.BUDGET_COMMAND_INTENTS))
})

console.log(`\n${passed} passed, ${failed} failed`)
if (failed) process.exit(1)
