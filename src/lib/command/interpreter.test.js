// P3 — tests for the deterministic interpreter (interpreter.js).
//
// The promises under test:
//   I1  the P1 answer key is met, all 41 sentences;
//   I2  every OTHER sentence P0 froze (288) stays a transaction — zero false commands —
//       whatever the user's goals, categories, items and accounts are called;
//   bare words and mixed input ask; pension is always an estimate; only six pages open;
//   periods are read exactly and never silently turned into "this month";
//   names are matched strictly and never guessed ("it" and "that goal" included);
//   every field the interpreter builds carries the right state (planned / actual) and
//   never a calculated, estimated or suggested one.
import assert from 'node:assert'
import * as IP from './interpreter.js'
import { interpret, InterpreterError } from './interpreter.js'
import { EXPECTED_ROUTING } from './expectedRouting.js'
import { CONTRACTS, ALLOWED_PAGES, CLARIFY_REASONS } from './intents.js'
import { PENDING_ACTION_TTL_MS } from './pendingAction.js'
import { MONEY_INBOX_CORPUS, RED_TEAM_CORPUS } from '../moneyInboxCorpus.js'
import {
  BASELINE_INPUTS, COMMAND_SHAPED_INPUTS, BARE_WORD_INPUTS, MIXED_INPUTS, DATE_SENSITIVE_INPUTS, LIVE_RULE_INPUTS,
} from '../moneyInboxGoldenInputs.js'

let passed = 0, failed = 0
function test(name, fn) {
  try { fn(); passed++; console.log(`  PASS  ${name}`) }
  catch (err) { failed++; console.log(`  FAIL  ${name}\n${String(err.message).split('\n').map((l) => '        ' + l).join('\n')}`) }
}

const REF = new Date(2026, 8, 28) // 28 Sep 2026, local constructor like every other fixture
const NOW = REF.getTime()
const CTX = {
  id: 'pa-1',
  referenceDate: REF,
  goals: [{ id: 'g1', name: 'Laptop' }, { id: 'g2', name: 'Trip' }],
  categories: [{ id: 'c1', name: 'Food' }, { id: 'c2', name: 'Rent' }, { id: 'c3', name: 'Travel' }],
  learningItems: [{ id: 'l1', name: 'Power BI certification' }, { id: 'l2', name: 'Excel course' }],
  accounts: [{ id: 'a1', name: 'SBI' }, { id: 'a2', name: 'Wallet' }, { id: 'a3', name: 'Bank' }],
}
const run = (text, ctx = CTX) => interpret(text, ctx, NOW)
const fieldValues = (r) => Object.fromEntries(Object.entries(r.pending.fields).map(([k, v]) => [k, v.value]))
const ambFields = (r) => r.pending.ambiguities.map((a) => a.field)
const choiceIds = (r) => r.clarification.choices.map((c) => c.id)

const KEYED = [...BASELINE_INPUTS, ...COMMAND_SHAPED_INPUTS, ...BARE_WORD_INPUTS, ...MIXED_INPUTS]
const UNIVERSE = [...new Set([
  ...MONEY_INBOX_CORPUS.map((i) => i.text), ...RED_TEAM_CORPUS.map((i) => i.text),
  ...BASELINE_INPUTS, ...COMMAND_SHAPED_INPUTS, ...BARE_WORD_INPUTS, ...MIXED_INPUTS, ...DATE_SENSITIVE_INPUTS, ...LIVE_RULE_INPUTS,
])]

// Every pending action and clarification the tests build, so the state and purity checks can sweep them.
const SWEEP = [
  ...KEYED,
  'Add 2000 to goal 2', 'add 1.5L to my goal', 'Increase my food budget by 500', 'Decrease my food budget by 500', 'Increase my food budget 500',
  'add 500 to my food budget', 'set my food budget to 5000 for november', 'Mark my Excel course as done', 'Mark my course as completed',
  'How much did I spend on food last month?', 'How much did I spend today?', 'How much is in my wallet?', 'How much is in my xyz account?',
  'can you add 2000 to my laptop goal?', 'please open my goals', 'Open settings', 'delete my laptop goal', 'update my course cost to 5000',
  'Create a goal', 'Create a budget', 'Create a budget for December', 'Create a budget for next week',
]

console.log('interpreter tests\n')

test('I1: the answer key — all 41 sentences are routed exactly as P1 says', () => {
  assert.strictEqual(EXPECTED_ROUTING.length, 41)
  for (const e of EXPECTED_ROUTING) {
    const r = run(e.text)
    assert.strictEqual(r.kind, e.kind, `"${e.text}" was routed as ${r.kind}`)
    if (e.kind === 'transaction') assert.deepStrictEqual(r, { kind: 'transaction' }, e.text)
    else if (e.kind === 'clarify') assert.strictEqual(r.clarification.reason, e.reason, e.text)
    else {
      assert.strictEqual(r.pending.intent, e.intent, e.text)
      if (e.kind === 'navigate') assert.strictEqual(r.pending.fields.page.value, e.page, e.text)
    }
  }
})

test('I2: zero false commands — the other 288 frozen sentences are all transactions, whatever the user\'s names are', () => {
  const keyed = new Set(EXPECTED_ROUTING.map((e) => e.text))
  const others = UNIVERSE.filter((t) => !keyed.has(t))
  assert.strictEqual(UNIVERSE.length, 329)
  assert.strictEqual(others.length, 288)
  const rich = {
    id: 'x', referenceDate: REF,
    goals: [{ id: 'g1', name: 'Laptop' }, { id: 'g2', name: 'Wallet' }, { id: 'g3', name: 'Bus trip' }],
    categories: [{ id: 'c1', name: 'Coffee' }, { id: 'c2', name: 'Rent' }, { id: 'c3', name: 'Groceries' }, { id: 'c4', name: 'Salary' }, { id: 'c5', name: 'Fuel' }],
    learningItems: [{ id: 'l1', name: 'Netflix' }, { id: 'l2', name: 'Power BI certification' }],
    accounts: [{ id: 'a1', name: 'Bank' }, { id: 'a2', name: 'Wallet' }, { id: 'a3', name: 'SBI' }],
  }
  for (const ctx of [CTX, rich, {}, undefined]) {
    for (const t of others) assert.deepStrictEqual(interpret(t, ctx, NOW), { kind: 'transaction' }, `"${t}" must stay a transaction`)
  }
})

test('I3: bare words ask — the eight key words, with 2 to 4 real choices and Cancel always last', () => {
  for (const word of ['Power BI', 'laptop', 'goal', 'budget', 'learning', 'pension', 'salary', 'food']) {
    const r = run(word)
    assert.strictEqual(r.kind, 'clarify', word)
    assert.strictEqual(r.clarification.reason, 'bare_word', word)
    const choices = r.clarification.choices
    assert.ok(choices.length >= 2 && choices.length <= 5, `${word}: ${choices.length} choices incl. Cancel`)
    assert.strictEqual(choices[choices.length - 1].id, 'cancel')
    for (const c of choices.slice(0, -1)) assert.ok(c.intent === undefined || CONTRACTS[c.intent], `${word}: ${c.id}`)
  }
  assert.deepStrictEqual(choiceIds(run('salary')), ['record_salary', 'open_salary', 'cancel'])
  assert.deepStrictEqual(choiceIds(run('laptop')), ['goal_progress_g1', 'goal_add_g1', 'record_expense', 'cancel'])
  assert.strictEqual(run('my goals').clarification.reason, 'bare_word')
  assert.strictEqual(run('Budgets').clarification.reason, 'bare_word')
  // A bare word with a number is an entry, and a word that means nothing to this user stays a transaction.
  assert.deepStrictEqual(run('coffee'), { kind: 'transaction' })
  assert.deepStrictEqual(run('laptop', { id: 'x' }), { kind: 'transaction' }, 'with no goal called laptop the word is not a goal')
  assert.deepStrictEqual(run('Received my salary'), { kind: 'transaction' })
})

test('I4: mixed input asks — only "edit" and Cancel are offered', () => {
  for (const text of MIXED_INPUTS) {
    const r = run(text)
    assert.strictEqual(r.clarification.reason, 'mixed_input', text)
    assert.deepStrictEqual(choiceIds(r), ['edit', 'cancel'], text)
  }
  for (const text of ['Add 2000 to my laptop goal and open my budgets', 'How much did I spend and paid 500 for coffee', 'create a goal for a trip, coffee 80', 'add 500 to my laptop goal and add 300 to my trip goal']) {
    assert.strictEqual(run(text).clarification.reason, 'mixed_input', text)
  }
  // Several entries, or one question with "and" inside it, are not mixed.
  assert.deepStrictEqual(run('coffee 80 and bus 40'), { kind: 'transaction' })
  assert.strictEqual(run('How much did I spend on food and travel this month?').kind, 'query')
  assert.strictEqual(run('Set my food budget to ₹5,000').kind, 'command', 'a comma inside an amount is not a boundary')
  assert.strictEqual(run('Add Power BI and Excel certification to my learning').pending.fields.name.value, 'Power BI and Excel certification')
})

test('I5: pension is always an estimate query, never a payment record', () => {
  for (const text of ['How much did I pay for my pension?', 'what is my pension?', 'How much pension have I paid?', 'how much is my PF this month?']) {
    const r = run(text)
    assert.strictEqual(r.kind, 'query', text)
    assert.strictEqual(r.pending.intent, 'QUERY_PENSION_ESTIMATE', text)
    assert.deepStrictEqual(r.pending.fields, {}, text)
    assert.strictEqual(r.pending.status, 'ready')
  }
  for (const text of SWEEP) {
    const r = run(text)
    if (/pension/i.test(text)) assert.notStrictEqual(r.pending?.intent && CONTRACTS[r.pending.intent].class, 'RECORD', text)
    if (r.pending) assert.notStrictEqual(CONTRACTS[r.pending.intent].class, 'RECORD', `"${text}": the interpreter never builds a record`)
  }
})

test('I6: only the six allowed pages open; the seven excluded pages never navigate', () => {
  const six = { transactions: 'Open my transactions', goals: 'Go to goals', budgets: 'Take me to budgets', learning: 'Show my learning', salary: 'Go to salary', pension: 'Open the pension page' }
  assert.deepStrictEqual(Object.keys(six), ALLOWED_PAGES.map((p) => p.id))
  for (const [page, text] of Object.entries(six)) {
    const r = run(text)
    assert.strictEqual(r.kind, 'navigate', text)
    assert.strictEqual(r.pending.intent, 'NAVIGATE')
    assert.strictEqual(r.pending.fields.page.value, page, text)
    assert.strictEqual(r.pending.status, 'ready')
  }
  assert.strictEqual(run('open PF / pension').pending.fields.page.value, 'pension')
  for (const text of ['Open settings', 'Go to charts', 'Show my reports', 'Take me to insights', 'Open the CTC explorer', 'Go to money options', 'Open admin']) {
    const r = run(text)
    assert.strictEqual(r.kind, 'clarify', text)
    assert.strictEqual(r.pending, undefined, text)
    assert.ok(CLARIFY_REASONS.includes(r.clarification.reason))
    for (const c of r.clarification.choices.filter((x) => x.id !== 'cancel')) assert.ok(/^open_(transactions|goals|budgets|learning)$/.test(c.id), `${text}: ${c.id}`)
  }
  assert.deepStrictEqual(run('Show my laptop 2'), { kind: 'transaction' })
})

test('I7: periods are read exactly; nothing is silently "this month"', () => {
  const month = (r, f) => r.pending.fields[f].value.month
  assert.strictEqual(month(run('How much did I spend last month?'), 'period'), '2026-08')
  assert.strictEqual(month(run('How much did I spend this month?'), 'period'), '2026-09')
  assert.strictEqual(month(run('How much did I spend next month?'), 'period'), '2026-10', '"next month" is October, not September')
  const none = run('How much did I spend on food?')
  assert.strictEqual(none.pending.fields.period.origin, 'default')
  assert.strictEqual(none.pending.fields.period.value.month, '2026-09')
  assert.match(none.pending.fields.period.note, /current calendar month/)
  assert.strictEqual(run('How much is left in my food budget?').pending.fields.month.origin, 'default')
  // A month name with no year: the most recent one, and it says so.
  const oct = run('How much did I spend in October?')
  assert.strictEqual(month(oct, 'period'), '2025-10')
  assert.match(oct.pending.fields.period.note, /most recent October/)
  // Day / week / year words are unsupported: ask, never use the current month.
  const today = run('How much did I spend today?')
  assert.strictEqual(today.pending.fields.period, undefined)
  assert.strictEqual(today.pending.status, 'needs_input')
  assert.deepStrictEqual(today.pending.ambiguities[0].options.map((o) => o.id), ['2026-09', '2026-08'])
  assert.ok(today.asks.includes('period_unclear'))
  assert.ok(today.notes.some((n) => /today/.test(n)))
  const two = run('How much did I spend in October and November?')
  assert.deepStrictEqual(two.pending.ambiguities[0].options.map((o) => o.id), ['2025-10', '2025-11'])
  // Creating a budget: the month is needed, and a named month looks forward.
  assert.strictEqual(month(run("Create next month's budget"), 'month'), '2026-10')
  const dec = run('Create a budget for December')
  assert.strictEqual(month(dec, 'month'), '2026-12')
  assert.match(dec.pending.fields.month.note, /upcoming December/)
  const noMonth = run('Create a budget')
  assert.deepStrictEqual(noMonth.pending.missing, ['month'])
  assert.deepStrictEqual(noMonth.asks, ['month_unclear'])
  assert.deepStrictEqual(run('Create a budget for next week').pending.ambiguities[0].options.map((o) => o.id), ['2026-09', '2026-10'])
  // A goal's target date is the last day of the month said; an unreadable one is reported, not invented.
  const goal = run('Create a goal called Laptop for 50000 by December')
  assert.strictEqual(goal.pending.fields.targetDate.value, '2026-12-31')
  assert.match(goal.pending.fields.targetDate.note, /last day of December 2026/)
  const week = run('Create a goal called Laptop for 50000 by next week')
  assert.strictEqual(week.pending.fields.targetDate, undefined)
  assert.ok(week.notes.some((n) => /week/.test(n) && /whole months/.test(n)))
  assert.strictEqual(run('set my food budget to 5000 for november').pending.fields.month.value.month, '2026-11')
  // With no referenceDate in the context, `now` supplies it (as a number, never the clock).
  const { referenceDate, ...noRef } = CTX
  assert.strictEqual(interpret('How much did I spend this month?', noRef, Date.UTC(2026, 8, 28, 6, 0, 0)).pending.fields.period.value.month, '2026-09')
})

test('I8: names are matched strictly — two matches are two, none is not a guess, "it" is never resolved', () => {
  assert.deepStrictEqual(fieldValues(run('Add 2000 to my laptop goal')).goal, { id: 'g1', name: 'Laptop' })
  const twin = { ...CTX, goals: [{ id: 'a', name: 'Laptop Fund' }, { id: 'b', name: 'Laptop Bag' }] }
  const multi = run('add 500 to my laptop goal', twin)
  assert.strictEqual(multi.pending.fields.goal, undefined)
  assert.deepStrictEqual(multi.pending.ambiguities[0].options.map((o) => o.id), ['a', 'b'])
  assert.deepStrictEqual(multi.asks, ['goal_ambiguous'])
  assert.strictEqual(multi.pending.status, 'needs_input')
  // Nothing matches: the user's own goals are offered, with a note.
  const none = run('add 500 to my vacation goal')
  assert.strictEqual(none.pending.fields.goal, undefined)
  assert.deepStrictEqual(none.pending.ambiguities[0].options.map((o) => o.id), ['g1', 'g2'])
  assert.ok(none.notes.some((n) => /No goal matched/.test(n)))
  const lone = { ...CTX, goals: [{ id: 'g1', name: 'Laptop' }] }
  const loneNone = run('add 500 to my vacation goal', lone)
  assert.deepStrictEqual(loneNone.pending.missing, ['goal'])
  // "it", "that goal", "my goal": asked, never resolved — even with one goal.
  for (const text of ['Add ₹2,000 to it', 'Add ₹2,000 to that goal', 'add 500 to my goal', 'How much is in that goal?']) {
    const many = run(text)
    assert.strictEqual(many.pending.fields.goal, undefined, text)
    assert.strictEqual(many.pending.ambiguities[0].options.length, 2, text)
    assert.ok(many.asks.includes('goal_reference_unresolved'), text)
    const one = run(text, lone)
    assert.strictEqual(one.pending.fields.goal, undefined, `${text}: even a single goal is not assumed`)
    assert.deepStrictEqual(one.pending.missing, ['goal'], text)
    assert.ok(one.asks.includes('goal_reference_unresolved'), text)
  }
  // Categories and items.
  assert.deepStrictEqual(fieldValues(run('Increase my food budget to 5000')).category, { id: 'c1', name: 'Food' })
  const gym = run('Increase my gym budget to 5000')
  assert.deepStrictEqual(gym.pending.ambiguities[0].options.map((o) => o.id), ['c1', 'c2', 'c3'])
  assert.ok(gym.asks.includes('category_unknown'))
  const spendGym = run('How much did I spend on gym?')
  assert.strictEqual(spendGym.pending.fields.category, undefined)
  assert.deepStrictEqual(ambFields(spendGym), ['category'], 'an unknown category is asked about, never turned into total spending')
  const items = run('Mark my course as completed')
  assert.strictEqual(items.pending.fields.item, undefined)
  assert.deepStrictEqual(items.pending.ambiguities[0].options.map((o) => o.id), ['l1', 'l2'])
  assert.deepStrictEqual(fieldValues(run('Mark my Excel course as done')), { item: { id: 'l2', name: 'Excel course' }, newStatus: 'completed' })
  assert.strictEqual(run('mark my power bi course as in progress').pending.fields.newStatus.value, 'in_progress')
  // Accounts.
  assert.deepStrictEqual(fieldValues(run('How much is in my wallet?')).account, { id: 'a2', name: 'Wallet' })
  assert.strictEqual(run('What is my total balance?').pending.fields.account, undefined)
  const xyz = run('How much is in my xyz account?')
  assert.deepStrictEqual(ambFields(xyz), ['account'])
  assert.deepStrictEqual(xyz.pending.ambiguities[0].options.map((o) => o.id), ['a1', 'a2', 'a3'])
})

test('I9: every field carries the right state — typed plans are planned, typed records are actual', () => {
  const EXPECT = {
    CREATE_GOAL: 'planned', CREATE_BUDGET_MONTH: 'planned', MODIFY_BUDGET_AMOUNT: 'planned', CREATE_LEARNING_ITEM: 'planned',
    MODIFY_GOAL_CONTRIBUTE: 'actual', MODIFY_LEARNING_STATUS: 'actual',
    QUERY_SPEND: 'actual', QUERY_BUDGET_LEFT: 'actual', QUERY_GOAL_PROGRESS: 'actual', QUERY_BALANCE: 'actual', QUERY_PENSION_ESTIMATE: 'actual', NAVIGATE: 'actual',
  }
  let checked = 0
  const seen = new Set()
  for (const text of SWEEP) {
    const r = run(text)
    if (!r.pending) continue
    seen.add(r.pending.intent)
    for (const [name, f] of Object.entries(r.pending.fields)) {
      assert.strictEqual(f.kind, EXPECT[r.pending.intent], `"${text}": ${r.pending.intent}.${name} is ${f.kind}`)
      checked++
    }
  }
  assert.ok(checked > 40, `only ${checked} fields checked`)
  assert.deepStrictEqual([...seen].sort(), Object.keys(EXPECT).sort(), 'every buildable intent is covered by the sweep')
  assert.strictEqual(run('Create a goal for a laptop worth ₹50,000').pending.fields.targetAmount.kind, 'planned')
  assert.strictEqual(run('Add ₹2,000 to my laptop goal').pending.fields.amount.kind, 'actual')
  assert.strictEqual(run('Increase my food budget to 5000').pending.fields.newAmount.kind, 'planned')
})

test('I10: the interpreter never builds a calculated, estimated or suggested value, and only uses typed / matched / default origins', () => {
  let checked = 0
  for (const text of SWEEP) {
    const r = run(text)
    if (!r.pending) continue
    for (const [name, f] of Object.entries(r.pending.fields)) {
      assert.ok(['actual', 'planned'].includes(f.kind), `"${text}": ${name} is ${f.kind}`)
      assert.ok(['typed', 'matched', 'default'].includes(f.origin), `"${text}": ${name} origin ${f.origin}`)
      if (f.origin === 'default') assert.ok(typeof f.note === 'string' && f.note.trim(), `"${text}": a default needs a note`)
      checked++
    }
  }
  assert.ok(checked > 40)
})

test('I11: verb-only and word-only sentences stay transactions; unsupported commands ask instead of recording', () => {
  for (const text of ['put 2000 into wallet', 'salary 25000', 'Received my salary', 'Paid ₹8,000 for a Power BI certification', 'coffee 80', 'moved 2000 from SBI to wallet', 'add 500 to wallet', 'transfer 500 to wallet', 'save 500 in wallet', 'got 5000 from tuition, spent 200 on snacks']) {
    assert.deepStrictEqual(run(text), { kind: 'transaction' }, text)
  }
  const del = run('delete my laptop goal')
  assert.deepStrictEqual([del.kind, del.clarification.reason, choiceIds(del)], ['clarify', 'missing_required', ['open_goals', 'cancel']])
  const cost = run('update my course cost to 5000')
  assert.deepStrictEqual([cost.kind, cost.clarification.reason, choiceIds(cost)], ['clarify', 'competing_meaning', ['open_learning', 'record_expense', 'cancel']])
  assert.strictEqual(run('archive my food budget').clarification.reason, 'missing_required')
  // A creating verb with an amount on a budget could mean two things.
  const twoWays = run('create a food budget of 5000')
  assert.deepStrictEqual([twoWays.clarification.reason, choiceIds(twoWays)], ['competing_meaning', ['set_budget_amount', 'create_budget', 'cancel']])
  // "I need 50000 for a laptop" is a wish, with exactly the two meanings; without an amount it is nothing special.
  const need = run('I need 50000 for a laptop')
  assert.deepStrictEqual([need.clarification.reason, choiceIds(need)], ['competing_meaning', ['record_expense', 'create_goal', 'cancel']])
  assert.deepStrictEqual(run('I need a laptop'), { kind: 'transaction' })
})

test('I12: commands read their fields correctly and ask when an amount is unclear', () => {
  assert.deepStrictEqual(fieldValues(run('Create a goal for a laptop worth ₹50,000')), { name: 'laptop', targetAmount: 50000 })
  assert.deepStrictEqual(fieldValues(run('Create a goal called Laptop for 50000 by December')), { name: 'Laptop', targetAmount: 50000, targetDate: '2026-12-31' })
  assert.deepStrictEqual(run('Create a goal').pending.missing, ['name'])
  assert.strictEqual(run('Create a goal').pending.status, 'needs_input')
  assert.deepStrictEqual(fieldValues(run('add a trip goal of 20000')).name, 'trip')
  assert.deepStrictEqual(fieldValues(run('Increase my food budget by 500')).relativeChange, { direction: 'increase', amount: 500 })
  assert.deepStrictEqual(fieldValues(run('Decrease my food budget by 500')).relativeChange, { direction: 'decrease', amount: 500 })
  assert.deepStrictEqual(fieldValues(run('add 500 to my food budget')).relativeChange, { direction: 'increase', amount: 500 })
  const unclear = run('Increase my food budget 500')
  assert.deepStrictEqual(unclear.pending.ambiguities[0].options.map((o) => o.id), ['to:500', 'increase:500'])
  assert.strictEqual(run('set my food budget 5000').pending.fields.newAmount.value, 5000)
  assert.deepStrictEqual(run('Increase my food budget').pending.missing, ['newAmount|relativeChange'])
  assert.deepStrictEqual(fieldValues(run('Add Power BI certification to my learning')), { name: 'Power BI certification' })
  // Two different amounts: asked, never "the last one" (approval A4).
  const two = run('Add 2000 to goal 2')
  assert.deepStrictEqual(ambFields(two), ['amount', 'goal'], '"goal 2" names no goal either, so both are asked')
  assert.deepStrictEqual(two.pending.ambiguities.find((a) => a.field === 'amount').options.map((o) => o.id), ['2000', '2'])
  assert.strictEqual(two.pending.fields.amount, undefined)
  // A bare "1.5L" is not lakh here; the amount is asked for.
  assert.ok(run('add 1.5L to my goal').pending.missing.includes('amount'))
  // Queries.
  const spend = run('How much did I spend on food last month?')
  assert.deepStrictEqual([spend.pending.fields.category.value.name, spend.pending.fields.period.value.month], ['Food', '2026-08'])
  assert.strictEqual(run('How much have I put into my laptop goal?').pending.fields.goal.value.id, 'g1')
  assert.strictEqual(run('can you add 2000 to my laptop goal?').pending.intent, 'MODIFY_GOAL_CONTRIBUTE')
  assert.strictEqual(run('please open my goals').pending.intent, 'NAVIGATE')
  assert.deepStrictEqual(run('How much did I spend from my SBI account?').notes, ['Spending is not split by account yet, so this covers all accounts.'])
  assert.deepStrictEqual(run('coffee 80?'), { kind: 'transaction' })
})

test('I13: no hidden clock; bad inputs are refused; only the interpreter and its error are exported', () => {
  assert.deepStrictEqual(Object.keys(IP).sort(), ['InterpreterError', 'interpret'])
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
    for (const text of SWEEP) run(text)
    const { referenceDate, ...noRef } = CTX
    interpret('How much did I spend this month?', noRef, NOW)
  } finally { globalThis.Date = RealDate }
  const refused = (code, fn) => assert.throws(fn, (e) => e instanceof InterpreterError && e.code === code, code)
  refused('text_required', () => interpret(undefined, CTX, NOW))
  refused('text_required', () => interpret(42, CTX, NOW))
  refused('now_required', () => interpret('coffee 80', CTX))
  refused('now_required', () => interpret('coffee 80', CTX, '1'))
  refused('now_required', () => interpret('coffee 80', CTX, NaN))
  refused('invalid_context', () => interpret('coffee 80', { goals: 'x' }, NOW))
  refused('invalid_context', () => interpret('coffee 80', { colour: 'x' }, NOW))
  refused('invalid_context', () => interpret('coffee 80', [], NOW))
  refused('invalid_context', () => interpret('coffee 80', { referenceDate: 'today' }, NOW))
  // A pending action needs an id from the caller; a clarification or a transaction does not.
  refused('id_required', () => interpret('Open my goals', { goals: [] }, NOW))
  refused('id_required', () => interpret('Add 2000 to my laptop goal', { ...CTX, id: '' }, NOW))
  assert.strictEqual(interpret('goal', {}, NOW).kind, 'clarify')
  assert.deepStrictEqual(interpret('', CTX, NOW), { kind: 'transaction' })
  assert.deepStrictEqual(interpret('   ', CTX, NOW), { kind: 'transaction' })
})

test('I14: determinism — same input, same answer; the context is never changed; results are frozen', () => {
  const copy = JSON.parse(JSON.stringify({ ...CTX, referenceDate: undefined }))
  for (const text of SWEEP) {
    const a = run(text)
    const b = run(text)
    assert.deepStrictEqual(a, b, text)
    assert.ok(Object.isFrozen(a), text)
    if (a.pending) assert.ok(Object.isFrozen(a.pending) && Object.isFrozen(a.pending.fields) && Object.isFrozen(a.asks) && Object.isFrozen(a.notes), text)
    if (a.clarification) assert.ok(Object.isFrozen(a.clarification.choices), text)
  }
  assert.deepStrictEqual(JSON.parse(JSON.stringify({ ...CTX, referenceDate: undefined })), copy)
  assert.ok(Object.isFrozen(run('coffee 80')))
  const frozenCtx = Object.freeze({ ...CTX, goals: Object.freeze(CTX.goals.map((g) => Object.freeze({ ...g }))) })
  assert.strictEqual(interpret('Add 2000 to my laptop goal', frozenCtx, NOW).kind, 'command')
})

test('I15: pending actions use the caller\'s id and the typed text, expire in 5 minutes, and have the expected status', () => {
  const cases = [
    ['Add 2000 to my laptop goal', 'ready'], ['Add ₹2,000 to it', 'needs_input'], ['Create a goal called Laptop for 50000 by December', 'ready'],
    ['Increase my food budget to 5000', 'ready'], ['How much did I spend last month?', 'ready'], ['Open my goals', 'ready'], ['Create a goal', 'needs_input'],
  ]
  for (const [text, status] of cases) {
    for (const id of ['id-one', 'another-id']) {
      const r = interpret(`  ${text}  `, { ...CTX, id }, NOW)
      assert.strictEqual(r.pending.id, id)
      assert.strictEqual(r.pending.source, text, 'the source is the typed text, trimmed')
      assert.strictEqual(r.pending.createdAt, NOW)
      assert.strictEqual(r.pending.expiresAt, NOW + PENDING_ACTION_TTL_MS)
      assert.strictEqual(r.pending.status, status, text)
      assert.strictEqual(r.pending.becomes, CONTRACTS[r.pending.intent].becomes)
    }
  }
  const clar = interpret('goal', {}, NOW)
  assert.strictEqual(clar.clarification.createdAt, NOW)
  assert.strictEqual(clar.clarification.expiresAt, NOW + PENDING_ACTION_TTL_MS)
})

console.log(`\n${passed} passed, ${failed} failed`)
if (failed > 0) process.exit(1)
