// P9 — tests for what the Budgets page does with a handoff (budgetDialog.js).
//
// What it must do: turn a handed-off budget command into what to put in front of the user (never into a
// save); start the recipe only for this month or next month; compute a relative change from the page's
// own row and label it calculated; refuse results of zero or less, unchanged amounts, income categories
// and rows that are gone; offer the New budget form pre-filled when an exact amount has no row; say how
// to ask when a relative change has no row; and ignore anything that is not a handed-off budget command.
import assert from 'node:assert'
import * as D from './budgetDialog.js'
import { interpret } from './interpreter.js'
import { markHandedOff } from './pendingAction.js'

let passed = 0, failed = 0
function test(name, fn) {
  try { fn(); passed++; console.log(`  PASS  ${name}`) }
  catch (err) { failed++; console.log(`  FAIL  ${name}\n${String(err.message).split('\n').map((l) => '        ' + l).join('\n')}`) }
}

const NOW = 1_800_000_000_000
const ICATS = [{ id: 'c1', name: 'Food' }, { id: 'c2', name: 'Food delivery' }, { id: 'c3', name: 'Rent' }, { id: 'c4', name: 'Salary' }, { id: 'c5', name: 'Travel' }]
const handedOff = (text) => markHandedOff(interpret(text, { id: 'pa-1', referenceDate: new Date('2026-10-08T10:00:00'), goals: [], categories: ICATS, learningItems: [], accounts: [] }, NOW).pending, NOW)
// what the Budgets page holds: spending categories only, and its own rows
const PAGE_CATS = [{ id: 'c1', name: 'Food' }, { id: 'c2', name: 'Food delivery' }, { id: 'c3', name: 'Rent' }, { id: 'c5', name: 'Travel' }]
const ROWS = [
  { id: 'b1', category_id: 'c3', amount: '4500.00', period_start: '2026-10-01', period_end: '2026-10-31' },
  { id: 'b2', category_id: 'c5', amount: 1000, period_start: '2026-10-01', period_end: '2026-10-31' },
  { id: 'b3', category_id: 'c3', amount: 6000, period_start: '2026-12-01', period_end: '2026-12-31' },
]
const ctx = (over = {}) => ({ budgets: ROWS, categories: PAGE_CATS, currentMonth: '2026-10', ...over })

console.log('budgetDialog tests\n')

test('D1: create-month for this month or next month starts the recipe, naming the month; nothing is saved', () => {
  const next = D.budgetDialogFromHandoff(handedOff("Create next month's budget"), ctx())
  assert.strictEqual(next.ok, true)
  assert.strictEqual(next.dialog, 'recipe')
  assert.strictEqual(next.month, '2026-11')
  assert.deepStrictEqual(next.notice, ['From Money Inbox. This recipe builds the budget for November 2026. Nothing is saved until you confirm it here.'])
  const cur = D.budgetDialogFromHandoff(handedOff('Create this month budget'), ctx())
  assert.strictEqual(cur.month, '2026-10')
  // when the page's month has moved on, November is no longer this month or next month
  const later = D.budgetDialogFromHandoff(handedOff("Create next month's budget"), ctx({ currentMonth: '2026-12' }))
  assert.strictEqual(later.ok, false)
})

test('D2: the interpreter\'s month is checked against the PAGE\'s current month — past and far months are refused with one plain message', () => {
  const past = D.budgetDialogFromHandoff(handedOff('Create last month budget'), ctx())
  assert.deepStrictEqual(past, { ok: false, message: 'I can start a budget for this month or next month only.' })
  const farPage = D.budgetDialogFromHandoff(handedOff("Create next month's budget"), ctx({ currentMonth: '2026-08' }))
  assert.strictEqual(farPage.ok, false)
  assert.strictEqual(farPage.message, 'I can start a budget for this month or next month only.')
  const rolled = D.budgetDialogFromHandoff(handedOff("Create next month's budget"), ctx({ currentMonth: '2026-10' }))
  assert.strictEqual(rolled.ok, true)
  assert.strictEqual(D.monthAfter('2026-12'), '2027-01')
  assert.strictEqual(D.monthAfter('2026-03'), '2026-04')
  assert.strictEqual(D.monthAfter('nope'), null)
})

test('D3: if every spending category already has a budget that month, there is no recipe — a message instead', () => {
  const all = PAGE_CATS.map((c, i) => ({ id: `n${i}`, category_id: c.id, amount: 100, period_start: '2026-11-01', period_end: '2026-11-30' }))
  const out = D.budgetDialogFromHandoff(handedOff("Create next month's budget"), ctx({ budgets: all }))
  assert.deepStrictEqual(out, { ok: false, message: 'Every spending category already has a budget for November 2026.' })
  const some = D.budgetDialogFromHandoff(handedOff("Create next month's budget"), ctx({ budgets: all.slice(1) }))
  assert.strictEqual(some.dialog, 'recipe')
  const none = D.budgetDialogFromHandoff(handedOff("Create next month's budget"), ctx({ categories: [] }))
  assert.deepStrictEqual(none, { ok: false, message: 'There are no spending categories to budget yet.' })
})

test('D4: an exact amount on a category with a row opens that row\'s Edit form with the new amount, showing current → new', () => {
  const out = D.budgetDialogFromHandoff(handedOff('Set my rent budget to 5000'), ctx())
  assert.strictEqual(out.ok, true)
  assert.strictEqual(out.dialog, 'edit_budget')
  assert.strictEqual(out.budgetId, 'b1')
  assert.deepStrictEqual(out.prefill, { amount: 5000 })
  assert.deepStrictEqual(out.notice, ['From Money Inbox. Nothing is saved until you press Save.', 'Rent budget · October 2026', 'Month: October 2026 (the current month).', 'Changing ₹4,500 to ₹5,000.'])
})

test('D5: the month is the typed month, otherwise the current calendar month, and the notice says which', () => {
  const dec = D.budgetDialogFromHandoff(handedOff('Set my rent budget to 7000 for December'), ctx())
  assert.strictEqual(dec.dialog, 'edit_budget')
  assert.strictEqual(dec.budgetId, 'b3')
  assert.ok(dec.notice.includes('Month: December 2026.'))
  assert.ok(dec.notice.includes('Changing ₹6,000 to ₹7,000.'))
  const def = D.budgetDialogFromHandoff(handedOff('Set my rent budget to 7000'), ctx())
  assert.strictEqual(def.budgetId, 'b1')
  assert.ok(def.notice.includes('Month: October 2026 (the current month).'))
  const next = D.budgetDialogFromHandoff(handedOff('Set my rent budget for next month to 6000'), ctx())
  assert.strictEqual(next.dialog, 'create_budget', 'November has no Rent row')
  assert.strictEqual(next.prefill.month, '2026-11')
})

test('D6: a relative change is calculated from the page\'s own row, labelled calculated, with the arithmetic shown', () => {
  const up = D.budgetDialogFromHandoff(handedOff('Increase my rent budget by 500'), ctx())
  assert.strictEqual(up.dialog, 'edit_budget')
  assert.deepStrictEqual(up.prefill, { amount: 5000 })
  assert.ok(up.notice.includes('Calculated from your current ₹4,500 budget: ₹4,500 + ₹500 = ₹5,000. You can still change the amount.'))
  const down = D.budgetDialogFromHandoff(handedOff('Decrease my travel budget by 200'), ctx())
  assert.deepStrictEqual(down.prefill, { amount: 800 })
  assert.ok(down.notice.includes('Calculated from your current ₹1,000 budget: ₹1,000 - ₹200 = ₹800. You can still change the amount.'))
  const add = D.budgetDialogFromHandoff(handedOff('Add 500 to my rent budget'), ctx())
  assert.deepStrictEqual(add.prefill, { amount: 5000 })
  const cents = D.budgetDialogFromHandoff(handedOff('Increase my rent budget by 500'), ctx({ budgets: [{ id: 'b1', category_id: 'c3', amount: '4500.25', period_start: '2026-10-01' }] }))
  assert.deepStrictEqual(cents.prefill, { amount: 5000.25 })
  assert.ok(cents.notice.some((n) => n.includes('₹4,500.25 + ₹500 = ₹5,000.25')))
  // floating-point noise never reaches the form: 0.1 + 0.2 is 0.3, not 0.30000000000000004
  const p = handedOff('Increase my rent budget by 500')
  const tiny = { ...p, fields: { ...p.fields, relativeChange: { ...p.fields.relativeChange, value: { direction: 'increase', amount: 0.2 } } } }
  const noise = D.budgetDialogFromHandoff(tiny, ctx({ budgets: [{ id: 'b1', category_id: 'c3', amount: 0.1, period_start: '2026-10-01' }] }))
  assert.deepStrictEqual(noise.prefill, { amount: 0.3 })
})

test('D7: a result of zero or less is refused, and so is an amount equal to the current one', () => {
  const zero = D.budgetDialogFromHandoff(handedOff('Decrease my travel budget by 1000'), ctx())
  assert.deepStrictEqual(zero, { ok: false, message: 'That would take your Travel budget for October 2026 to ₹0 or below. Nothing was changed.' })
  const below = D.budgetDialogFromHandoff(handedOff('Decrease my travel budget by 5000'), ctx())
  assert.strictEqual(below.ok, false)
  assert.match(below.message, /₹0 or below/)
  const same = D.budgetDialogFromHandoff(handedOff('Set my rent budget to 4500'), ctx())
  assert.deepStrictEqual(same, { ok: false, message: 'Your Rent budget for October 2026 is already ₹4,500.' })
})

test('D8: an exact amount with no row opens the New budget form pre-filled; a relative change with no row says how to ask', () => {
  const out = D.budgetDialogFromHandoff(handedOff('Set my travel budget to 5000'), ctx({ budgets: [] }))
  assert.strictEqual(out.dialog, 'create_budget')
  assert.deepStrictEqual(out.prefill, { categoryId: 'c5', amount: 5000, month: '2026-10' })
  assert.deepStrictEqual(out.notice, ['From Money Inbox. Nothing is saved until you press Create budget.', "You don't have a Travel budget for October 2026 yet. This will create one.", 'Month: October 2026 (the current month).'])
  const rel = D.budgetDialogFromHandoff(handedOff('Increase my travel budget by 500'), ctx({ budgets: [] }))
  assert.deepStrictEqual(rel, { ok: false, message: "You don't have a Travel budget for October 2026. Try: Set my travel budget to ₹5,000." })
  const nov = D.budgetDialogFromHandoff(handedOff('Increase my rent budget by 500'), ctx({ budgets: [], currentMonth: '2026-11' }))
  assert.strictEqual(nov.message, "You don't have a Rent budget for November 2026. Try: Set my rent budget to ₹5,000.")
})

test('D9: an income category (or one the page does not have) is refused as not a spending category', () => {
  const salary = D.budgetDialogFromHandoff(handedOff('Set my salary budget to 5000'), ctx())
  assert.deepStrictEqual(salary, { ok: false, message: 'Budgets are for spending categories.' })
  const gone = D.budgetDialogFromHandoff(handedOff('Set my rent budget to 5000'), ctx({ categories: [{ id: 'c1', name: 'Food' }] }))
  assert.strictEqual(gone.message, 'Budgets are for spending categories.')
})

test('D10: the page\'s own list decides names — the interpreter\'s name is only a pointer, and a missing amount is ignored', () => {
  const p = handedOff('Set my rent budget to 5000')
  const renamed = D.budgetDialogFromHandoff(p, ctx({ categories: [{ id: 'c3', name: 'Housing' }] }))
  assert.ok(renamed.notice.includes('Housing budget · October 2026'))
  const noAmount = { ...p, fields: { category: p.fields.category } }
  assert.deepStrictEqual(D.budgetDialogFromHandoff(noAmount, ctx()), { ok: false, message: null })
  const badAmount = { ...p, fields: { ...p.fields, newAmount: { ...p.fields.newAmount, value: -5 } } }
  assert.deepStrictEqual(D.budgetDialogFromHandoff(badAmount, ctx()), { ok: false, message: null })
  const badRel = { ...p, fields: { category: p.fields.category, relativeChange: { value: { direction: 'sideways', amount: 5 }, kind: 'planned', origin: 'typed' } } }
  assert.deepStrictEqual(D.budgetDialogFromHandoff(badRel, ctx()), { ok: false, message: null })
})

test('D11: anything that is not a handed-off budget command is ignored', () => {
  const ready = interpret('Set my rent budget to 5000', { id: 'x', referenceDate: new Date('2026-10-08T10:00:00'), goals: [], categories: ICATS, learningItems: [], accounts: [] }, NOW).pending
  assert.deepStrictEqual(D.budgetDialogFromHandoff(ready, ctx()), { ok: false, message: null }, 'not handed off')
  for (const text of ['Create a goal called Bike for 5000', 'Add Tableau to my learning']) {
    assert.deepStrictEqual(D.budgetDialogFromHandoff(markHandedOff(interpret(text, { id: 'y', referenceDate: new Date('2026-10-08T10:00:00'), goals: [], categories: ICATS, learningItems: [], accounts: [] }, NOW).pending, NOW), ctx()), { ok: false, message: null }, text)
  }
  for (const bad of [null, undefined, 5, 'x', {}, { status: 'handed_off' }]) assert.deepStrictEqual(D.budgetDialogFromHandoff(bad, ctx()), { ok: false, message: null })
  const p = handedOff('Set my rent budget to 5000')
  assert.deepStrictEqual(D.budgetDialogFromHandoff(p, { budgets: ROWS, categories: PAGE_CATS }), { ok: false, message: null }, 'no current month → ignored')
  assert.deepStrictEqual(D.budgetDialogFromHandoff(p, { budgets: ROWS, categories: PAGE_CATS, currentMonth: '2026-13' }), { ok: false, message: null })
  assert.strictEqual(D.budgetDialogFromHandoff(p, null).ok, false)
})

test('D12: pure — deeply frozen, inputs never changed, same answer twice, ₹ formatting in Indian grouping', () => {
  const p = handedOff('Increase my rent budget by 500')
  const rows = JSON.stringify(ROWS), cats = JSON.stringify(PAGE_CATS), pj = JSON.stringify(p)
  const out = D.budgetDialogFromHandoff(p, ctx())
  assert.ok(Object.isFrozen(out) && Object.isFrozen(out.prefill) && Object.isFrozen(out.notice))
  assert.deepStrictEqual(D.budgetDialogFromHandoff(p, ctx()), out)
  assert.strictEqual(JSON.stringify(ROWS), rows); assert.strictEqual(JSON.stringify(PAGE_CATS), cats); assert.strictEqual(JSON.stringify(p), pj)
  assert.strictEqual(D.inr(4500), '₹4,500'); assert.strictEqual(D.inr(125000), '₹1,25,000'); assert.strictEqual(D.inr(100), '₹100'); assert.strictEqual(D.inr(12345678), '₹1,23,45,678'); assert.strictEqual(D.inr(1000.5), '₹1,000.50')
  assert.strictEqual(D.monthName('2026-11'), 'November 2026')
  assert.ok(Object.isFrozen(D.BUDGET_DIALOG_MESSAGES))
})

console.log(`\n${passed} passed, ${failed} failed`)
if (failed) process.exit(1)
