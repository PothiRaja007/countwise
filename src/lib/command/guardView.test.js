// P4 — tests for the guard view (guardView.js).
//
// The promises under test: a transaction gets no panel; everything else gets one that
// never claims anything was done, never offers Save, offers Edit and Cancel (or the
// clarification's own explicit choices), says plainly when something is not built yet,
// words a pension as an estimate, and stops answering five minutes after the question.
import assert from 'node:assert'
import * as GV from './guardView.js'
import { buildGuardView, resolveGuardChoice, GuardViewError, GUARD_MESSAGES } from './guardView.js'
import { interpret } from './interpreter.js'
import { EXPECTED_ROUTING } from './expectedRouting.js'
import { CONTRACTS, BUILT_THROUGH, isIntentAvailable } from './intents.js'
import { PENDING_ACTION_TTL_MS } from './pendingAction.js'

let passed = 0, failed = 0
function test(name, fn) {
  try { fn(); passed++; console.log(`  PASS  ${name}`) }
  catch (err) { failed++; console.log(`  FAIL  ${name}\n${String(err.message).split('\n').map((l) => '        ' + l).join('\n')}`) }
}
const refusedWith = (code, fn) => assert.throws(fn, (e) => e instanceof GuardViewError && e.code === code, `expected a refusal with code "${code}"`)

const NOW = new Date(2026, 8, 28).getTime()
const CTX = {
  id: 'pa-1',
  referenceDate: new Date(2026, 8, 28),
  goals: [{ id: 'g1', name: 'Laptop' }, { id: 'g2', name: 'Trip' }],
  categories: [{ id: 'c1', name: 'Food' }, { id: 'c2', name: 'Rent' }],
  learningItems: [{ id: 'l1', name: 'Power BI certification' }],
  accounts: [{ id: 'a1', name: 'SBI' }, { id: 'a2', name: 'Wallet' }],
}
const run = (text, ctx = CTX) => interpret(text, ctx, NOW)
const view = (text) => buildGuardView(run(text))

const EXTRA = [
  'Add 2000 to goal 2', 'Increase my food budget by 500', 'add 500 to my food budget', 'Mark my Excel course as done', 'How much did I spend today?',
  'How much is in my xyz account?', 'Open settings', 'delete my laptop goal', 'update my course cost to 5000', 'Create a goal', 'Create a budget',
  'create a food budget of 5000', 'Add Power BI and Excel certification to my learning', 'Create a goal called Trip for ₹1,00,000 by December',
]
const ALL = [...EXPECTED_ROUTING.map((e) => e.text), ...EXTRA]

console.log('guardView tests\n')

test('G1: all 41 answer-key sentences — a transaction gets no panel, everything else gets a complete one with Cancel last', () => {
  assert.strictEqual(EXPECTED_ROUTING.length, 41)
  let panels = 0
  for (const e of EXPECTED_ROUTING) {
    const v = view(e.text)
    if (e.kind === 'transaction') { assert.strictEqual(v, null, e.text); continue }
    panels++
    assert.ok(v && typeof v.title === 'string' && v.title.trim(), e.text)
    assert.ok(['command', 'query', 'navigate', 'clarify'].includes(v.kind) && v.kind === e.kind, e.text)
    assert.strictEqual(v.choices[v.choices.length - 1].id, 'cancel', `${e.text}: Cancel must be last`)
    assert.ok(v.choices.length >= 2, e.text)
    assert.ok(Array.isArray(v.notes), e.text)
  }
  assert.strictEqual(panels, 33)
  assert.strictEqual(buildGuardView({ kind: 'transaction' }), null)
})

test('G2: every choice does the right thing — cancel, edit, continue, unavailable, expired; an unknown id is refused', () => {
  assert.deepStrictEqual(resolveGuardChoice(run('Open my goals'), 'cancel', NOW), { action: 'cancel' })
  assert.deepStrictEqual(resolveGuardChoice(run('Open my goals'), 'edit', NOW), { action: 'edit' })
  assert.deepStrictEqual(resolveGuardChoice(run('coffee 80 and open my goals'), 'edit', NOW), { action: 'edit' })
  assert.deepStrictEqual(resolveGuardChoice(run('I need 50000 for a laptop'), 'record_expense', NOW), { action: 'continue_as_transaction' })
  assert.deepStrictEqual(resolveGuardChoice(run('salary'), 'record_salary', NOW), { action: 'continue_as_transaction' })
  assert.deepStrictEqual(resolveGuardChoice(run('laptop'), 'record_expense', NOW), { action: 'continue_as_transaction' })
  // Goal commands are built (P7), so their buttons start; the other owners are not built yet (P8 and later).
  for (const [text, id] of [['I need 50000 for a laptop', 'create_goal'], ['goal', 'create_goal']]) {
    assert.deepStrictEqual(resolveGuardChoice(run(text), id, NOW), { action: 'start', intent: 'CREATE_GOAL', choiceId: id }, `${text} → ${id}`)
  }
  // Learning commands are built (P8), so their buttons start too; budgets, salary and pension wait for P9/P10.
  for (const [text, id, intent] of [['Power BI', 'learning_status_l1', 'MODIFY_LEARNING_STATUS'], ['learning', 'add_learning', 'CREATE_LEARNING_ITEM']]) {
    assert.deepStrictEqual(resolveGuardChoice(run(text), id, NOW), { action: 'start', intent, choiceId: id }, `${text} → ${id}`)
  }
  for (const id of run('budget').clarification.choices.map((c) => c.id).filter((c) => c !== 'open_budgets' && c !== 'cancel' && c !== 'edit')) {
    assert.deepStrictEqual(resolveGuardChoice(run('budget'), id, NOW).action, 'unavailable', `budget → ${id} (P9)`)
  }
  // Opening a page (P6) starts instead: the screen navigates. Nothing else about the choice changes.
  assert.deepStrictEqual(resolveGuardChoice(run('salary'), 'open_salary', NOW), { action: 'start', intent: 'NAVIGATE', choiceId: 'open_salary' })
  assert.deepStrictEqual(resolveGuardChoice(run('goal'), 'open_goals', NOW), { action: 'start', intent: 'NAVIGATE', choiceId: 'open_goals' })
  assert.deepStrictEqual(resolveGuardChoice(run('goal'), 'open_goals', NOW, () => false), { action: 'unavailable', message: GUARD_MESSAGES.unavailable })
  assert.deepStrictEqual(resolveGuardChoice(run('salary'), 'open_salary', NOW + PENDING_ACTION_TTL_MS + 1), { action: 'expired', message: GUARD_MESSAGES.expired })
  // The four built questions (P5) start instead: the screen answers them.
  assert.deepStrictEqual(resolveGuardChoice(run('laptop'), 'goal_progress_g1', NOW), { action: 'start', intent: 'QUERY_GOAL_PROGRESS', choiceId: 'goal_progress_g1' })
  assert.deepStrictEqual(resolveGuardChoice(run('food'), 'spend_c1', NOW), { action: 'start', intent: 'QUERY_SPEND', choiceId: 'spend_c1' })
  assert.deepStrictEqual(resolveGuardChoice(run('balance'), 'total_balance', NOW), { action: 'start', intent: 'QUERY_BALANCE', choiceId: 'total_balance' })
  // Five minutes: cancel and edit still work, anything else says the question timed out.
  const late = NOW + PENDING_ACTION_TTL_MS + 1
  const clar = run('I need 50000 for a laptop')
  assert.deepStrictEqual(resolveGuardChoice(clar, 'record_expense', NOW + PENDING_ACTION_TTL_MS - 1), { action: 'continue_as_transaction' })
  assert.deepStrictEqual(resolveGuardChoice(clar, 'record_expense', late), { action: 'expired', message: GUARD_MESSAGES.expired })
  assert.deepStrictEqual(resolveGuardChoice(clar, 'cancel', late), { action: 'cancel' })
  assert.deepStrictEqual(resolveGuardChoice(clar, 'create_goal', late), { action: 'expired', message: GUARD_MESSAGES.expired })
  refusedWith('unknown_choice', () => resolveGuardChoice(run('Open my goals'), 'save', NOW))
  refusedWith('unknown_choice', () => resolveGuardChoice(run('Open my goals'), 'record_expense', NOW))
  refusedWith('unknown_choice', () => resolveGuardChoice(clar, 'nope', NOW))
  refusedWith('now_required', () => resolveGuardChoice(clar, 'cancel'))
  refusedWith('invalid_result', () => resolveGuardChoice(run('coffee 80'), 'cancel', NOW))
  refusedWith('invalid_result', () => resolveGuardChoice(null, 'cancel', NOW))
})

test('G3: the dangerous sentences never reach the review screen unless the user explicitly picks an expense choice', () => {
  const danger = ['Create a goal for a laptop worth ₹50,000', 'Add ₹2,000 to that goal', 'I need 50000 for a laptop', 'salary 25k received and create a goal for a laptop', 'Create a goal for a laptop and spent 600 on dinner', 'coffee 80 and open my goals', 'Add 2000 to my laptop goal', 'Create a goal called Laptop for 50000 by December']
  for (const text of danger) {
    const r = run(text)
    assert.notStrictEqual(r.kind, 'transaction', text)
    const v = buildGuardView(r)
    const continuing = v.choices.filter((c) => {
      const out = c.id === 'cancel' || c.id === 'edit' ? null : resolveGuardChoice(r, c.id, NOW)
      return out && out.action === 'continue_as_transaction'
    })
    const explicit = r.clarification ? r.clarification.choices.filter((c) => c.intent === 'RECORD_TRANSACTION').map((c) => c.id) : []
    assert.deepStrictEqual(continuing.map((c) => c.id), explicit, text)
    assert.ok(continuing.every((c) => /expense|salary/i.test(c.label)), `${text}: a way back to a transaction must say so in words`)
  }
  assert.deepStrictEqual(view('I need 50000 for a laptop').choices.map((c) => c.id), ['record_expense', 'create_goal', 'cancel'])
})

test('G4: understood commands, questions and pages offer exactly Edit and Cancel — never Save or Confirm', () => {
  for (const text of ALL) {
    const r = run(text)
    if (!r.pending) continue
    const v = buildGuardView(r)
    assert.deepStrictEqual(v.choices, [{ id: 'edit', label: 'Edit my message' }, { id: 'cancel', label: 'Cancel' }], text)
  }
  for (const text of ALL) {
    const v = view(text)
    if (!v) continue
    for (const c of v.choices) assert.ok(!/\b(save|confirm|submit|yes|ok)\b/i.test(c.label), `${text}: ${c.label}`)
  }
})

test('G5: honest wording — nothing is said to be done; pension is an estimate; plans are not records', () => {
  const banned = /\b(created|added|recorded|updated|deleted|changed|opened|paid|done)\b/i
  for (const text of ALL) {
    const v = view(text)
    if (!v) continue
    const words = [v.title, v.message, v.summary, v.footer, ...v.notes, ...v.choices.map((c) => c.label)].filter(Boolean).join(' | ')
    // A refusal such as "cannot be opened from here" is not a claim that anything was done.
    assert.ok(!banned.test(words.replace(/\b(?:cannot|can't|not)\s+be\s+\w+/gi, '')), `${text}: ${words}`)
    if (v.kind !== 'clarify') assert.ok(v.footer.includes('Nothing was saved'), text)
    else assert.strictEqual(v.footer, null)
  }
  const pension = view('How much did I pay for my pension?')
  assert.match(pension.title, /pension estimate/)
  assert.match(pension.title, /not a record of actual payments/)
  assert.ok(!/\bpaid\b|\byou paid\b/i.test(pension.title))
  // A plan is worded as a plan; a contribution is an amount put towards a goal, not an expense.
  assert.match(view('Create a goal called Laptop for 50000 by December').title, /^I understood: plan a goal/)
  assert.match(view('Add 2000 to my laptop goal').title, /put ₹2,000 towards your Laptop goal/)
  assert.match(view('Increase my food budget to 5000').title, /change your Food budget: set it to ₹5,000/)
  assert.strictEqual(GUARD_MESSAGES.footer, "This isn't available from Money Inbox yet. Nothing was saved.")
})

test('G6: summaries — amounts in Indian grouping, the period always named, unclear things shown as questions', () => {
  assert.strictEqual(view('Create a goal called Trip for ₹1,00,000 by December').summary, 'plan a goal “Trip” with a target of ₹1,00,000 by 31 December 2026')
  assert.strictEqual(view('Create a goal for a laptop worth ₹50,000').summary, 'plan a goal “laptop” with a target of ₹50,000')
  assert.strictEqual(view('How much did I spend last month?').summary, 'how much you spent in August 2026')
  assert.strictEqual(view('How much did I spend on food?').summary, 'how much you spent on Food in September 2026 (the current month, because you didn\'t say)')
  assert.strictEqual(view("Create next month's budget").summary, 'plan your budget for October 2026')
  assert.strictEqual(view('Increase my food budget by 500').summary, 'change your Food budget: increase it by ₹500')
  assert.strictEqual(view('Mark my Power BI course as completed').summary, 'mark Power BI certification as completed')
  assert.strictEqual(view('What is my total balance?').summary, 'your total balance')
  assert.strictEqual(view('How much is in my SBI account?').summary, 'the balance in SBI')
  assert.strictEqual(view('Take me to budgets').summary, 'open Budgets')
  assert.strictEqual(view('Show my learning').summary, 'open Learning ROI')
  const that = view('Add ₹2,000 to that goal')
  assert.match(that.summary, /towards a goal \(which one isn't clear yet\)/)
  assert.ok(that.notes.includes('Which goal? Laptop, Trip'))
  assert.ok(view('Create a goal').notes.includes('Still missing: name'))
  assert.ok(view('How much did I spend today?').notes.some((n) => /^Which month\?/.test(n)))
  assert.ok(view('Add 2000 to goal 2').notes.some((n) => /^Which amount\? ₹2000, ₹2$/.test(n)))
  // Every buildable intent has a summary.
  const seen = new Set()
  for (const text of ALL) { const r = run(text); if (r.pending) { seen.add(r.pending.intent); assert.ok(buildGuardView(r).summary.length > 3) } }
  assert.deepStrictEqual([...seen].sort(), Object.keys(CONTRACTS).filter((id) => !id.startsWith('RECORD_')).sort())
})

test('G7: excluded pages never appear as navigation targets; unsupported commands are explained', () => {
  for (const text of ['Open settings', 'Go to charts', 'Show my reports', 'Take me to insights', 'Open the CTC explorer', 'Go to money options', 'Open admin']) {
    const v = view(text)
    assert.strictEqual(v.kind, 'clarify', text)
    assert.strictEqual(v.title, "I can't do that from here")
    assert.ok(v.choices.every((c) => c.id === 'cancel' || /^open_(transactions|goals|budgets|learning)$/.test(c.id)), text)
    assert.ok(!/settings|charts|reports|insights|explorer|money options|admin/i.test(v.choices.map((c) => c.label).join(' ')), text)
  }
  assert.deepStrictEqual(view('delete my laptop goal').choices.map((c) => c.id), ['open_goals', 'cancel'])
  assert.ok(view('delete my laptop goal').notes.includes('That cannot be done from here yet.'))
  assert.strictEqual(view('Power BI').title, 'What would you like to do with “Power BI”?')
  const mixed = view('coffee 80 and open my goals')
  assert.deepStrictEqual([mixed.title, mixed.message, mixed.notes, mixed.choices.map((c) => c.id)], ['One thing at a time', GUARD_MESSAGES.mixedMessage, [], ['edit', 'cancel']])
})

test('G8: purity — only the four expected exports; no clock; results are frozen and the input is not changed', () => {
  assert.deepStrictEqual(Object.keys(GV).sort(), ['GUARD_MESSAGES', 'GuardViewError', 'buildGuardView', 'resolveGuardChoice'])
  const RealDate = globalThis.Date
  class NoClockDate extends RealDate {
    constructor(...args) {
      if (args.length === 0) throw new Error('code read the real clock: new Date() with no argument')
      super(...args)
    }
    static now() { throw new Error('code read the real clock: Date.now()') }
    static [Symbol.hasInstance](x) { return x instanceof RealDate }
  }
  const results = ALL.map((t) => run(t))
  const before = JSON.stringify(results)
  globalThis.Date = NoClockDate
  try {
    for (const r of results) {
      const v = buildGuardView(r)
      if (v) for (const c of v.choices) resolveGuardChoice(r, c.id, NOW)
    }
  } finally { globalThis.Date = RealDate }
  assert.strictEqual(JSON.stringify(results), before, 'the interpreter result was changed')
  const v = view('Open my goals')
  assert.ok(Object.isFrozen(v) && Object.isFrozen(v.choices) && Object.isFrozen(v.choices[0]) && Object.isFrozen(v.notes))
  assert.ok(Object.isFrozen(resolveGuardChoice(run('Open my goals'), 'edit', NOW)))
  assert.ok(Object.isFrozen(GUARD_MESSAGES))
})

test('G9: determinism — the same result gives the same panel', () => {
  for (const text of ALL) assert.deepStrictEqual(view(text), view(text), text)
})

test('G10: availability follows BUILT_THROUGH — a normal transaction, the goal and learning commands, the four built questions and opening a page; an available intent would start', () => {
  assert.strictEqual(BUILT_THROUGH, 'P8')
  assert.deepStrictEqual(Object.keys(CONTRACTS).filter((id) => isIntentAvailable(id)), ['RECORD_TRANSACTION', 'RECORD_LEARNING_PAYMENT', 'CREATE_GOAL', 'MODIFY_GOAL_CONTRIBUTE', 'CREATE_LEARNING_ITEM', 'MODIFY_LEARNING_STATUS', 'QUERY_SPEND', 'QUERY_BUDGET_LEFT', 'QUERY_GOAL_PROGRESS', 'QUERY_BALANCE', 'NAVIGATE'])
  const r = run('I need 50000 for a laptop')
  assert.deepStrictEqual(resolveGuardChoice(r, 'create_goal', NOW, () => true), { action: 'start', intent: 'CREATE_GOAL', choiceId: 'create_goal' })
  assert.deepStrictEqual(resolveGuardChoice(r, 'create_goal', NOW, () => false), { action: 'unavailable', message: GUARD_MESSAGES.unavailable })
  assert.deepStrictEqual(resolveGuardChoice(r, 'record_expense', NOW, () => false), { action: 'unavailable', message: GUARD_MESSAGES.unavailable })
})

test('G11: a built question with something still open asks for one more detail; an unbuilt one says it is not available yet', () => {
  const open = view('How much did I spend on food in October?') // "in" stays on the category (a known P3 limit), so it asks
  assert.strictEqual(open.footer, GUARD_MESSAGES.needDetail)
  assert.strictEqual(GUARD_MESSAGES.needDetail, 'I need one more detail before I can answer. Nothing was saved.')
  assert.strictEqual(view('How much is left in my budget?').footer, GUARD_MESSAGES.needDetail)
  assert.strictEqual(view('How much did I pay for my pension?').footer, GUARD_MESSAGES.footer) // pension is P10
  // A goal command is built (P7). The base view words every built request that is not a question as "one more
  // detail"; lib/command/goalCommands.js replaces that footer for a ready goal command (guardView.js stays as it was).
  assert.strictEqual(view('Create a goal for a laptop worth 50000').footer, GUARD_MESSAGES.needDetail)
  assert.strictEqual(view('Create a budget for next month').footer, GUARD_MESSAGES.footer) // budgets wait for P9
  // Opening a page is built (P6). A complete request navigates straight away and never shows this panel; only an
  // unclear page would, and then it asks for one more detail like any other built request.
  assert.strictEqual(view('Open my goals').footer, GUARD_MESSAGES.needDetail)
  for (const text of ['How much is left in my budget?', 'How much did I spend on food in October?']) {
    assert.deepStrictEqual(view(text).choices, [{ id: 'edit', label: 'Edit my message' }, { id: 'cancel', label: 'Cancel' }], text)
  }
})

console.log(`\n${passed} passed, ${failed} failed`)
if (failed > 0) process.exit(1)
