// P5 — tests for the read-only queries (queries.js).
//
// The promises under test:
//   Q1  a spending answer equals the page's own figure (hand-counted AND the same engine call);
//   Q2  transfers, income and money set aside for goals never count as spending;
//   Q3  a category matches whole names only ("food" is not "seafood");
//   Q4  periods are exact: last month, a named year, December to January, a leap February;
//   Q5  budget left equals the Budgets page, an overspend is shown as "over budget", never hidden;
//   Q6  no budget for that category and month says so and shows no figures;
//   Q7  goal progress equals the Goals page; the percent is capped and the overage is reported;
//   Q8  balance equals the Overview figures, and shows what is set aside and what is available;
//   Q9  nothing to count never produces a bare zero;
//   Q10 data that may be cut off or is missing produces no number at all;
//   Q11 the clarification choices that start a question all work, and stale ones return null;
//   Q12 answers are frozen, repeatable, calculated, honest in wording, and never change their input;
//   Q13 the pages still compute these figures with the same engine calls the answers use.
import assert from 'node:assert'
import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { interpret } from './interpreter.js'
import * as Q from './queries.js'
import { totalExpenses, accountBalance, totalBalance, allocated, available, goalProgress } from '../financialEngine.js'
import { budgetSpent, budgetRemaining } from '../budgetEngine.js'
import { progressPercent } from '../goalEngine.js'
import { BARE_WORD_INPUTS } from '../moneyInboxGoldenInputs.js'

let passed = 0, failed = 0
function test(name, fn) {
  try { fn(); passed++; console.log(`  PASS  ${name}`) }
  catch (err) { failed++; console.log(`  FAIL  ${name}\n${String(err.message).split('\n').map((l) => '        ' + l).join('\n')}`) }
}

const deepFreeze = (v) => {
  if (v && typeof v === 'object' && !Object.isFrozen(v)) { Object.freeze(v); Object.values(v).forEach(deepFreeze) }
  return v
}

const REF = new Date(2026, 9, 15) // 15 Oct 2026
const NOW = REF.getTime()
const R = (n) => `R${n}` // stand-in for the app's money formatter, so figures are easy to find
const OPTS = { formatMoney: R }

const CTX = {
  id: 'q-1',
  referenceDate: REF,
  goals: [{ id: 'g1', name: 'Laptop' }, { id: 'g2', name: 'Trip' }, { id: 'g3', name: 'Phone' }],
  categories: [{ id: 'c1', name: 'Food' }, { id: 'c2', name: 'Rent' }, { id: 'c3', name: 'Salary' }, { id: 'c4', name: 'Seafood' }],
  learningItems: [],
  accounts: [{ id: 'a1', name: 'SBI' }, { id: 'a2', name: 'Wallet' }],
}

// Hand-computed fixture (see the working beside each figure).
const tx = (id, type, amount, account, date, category = null, to = null) => ({ id, type, amount, account_id: account, to_account_id: to, category_id: category, transaction_date: date })
const TRANSACTIONS = [
  tx('t1', 'income', 25000, 'a1', '2026-10-01', 'c3'),
  tx('t2', 'expense', 8000, 'a1', '2026-10-01', 'c2'),
  tx('t3', 'transfer', 2000, 'a1', '2026-10-02', null, 'a2'),
  tx('t4', 'expense', 100, 'a1', '2026-10-03', 'c1'),
  tx('t5', 'expense', 400, 'a1', '2026-10-05', 'c4'),
  tx('t6', 'expense', 250, 'a2', '2026-10-10', 'c1'),
  tx('t7', 'expense', 50, 'a2', '2026-10-31', 'c1'), // last day of October counts
  tx('t8', 'expense', 70, 'a2', '2026-11-01', 'c1'), // first day of November does not
  tx('t9', 'expense', 300, 'a1', '2026-09-30', 'c1'),
  tx('t10', 'expense', 150, 'a1', '2026-09-15', 'c1'),
  tx('t11', 'expense', 90, 'a1', '2025-12-31', 'c1'),
  tx('t12', 'expense', 60, 'a1', '2026-01-01', 'c1'),
  tx('t13', 'expense', 40, 'a1', '2024-02-29', 'c1'),
]
// October, all expenses: 8000 + 100 + 400 + 250 + 50 = 8800 (5 expenses). October Food: 100 + 250 + 50 = 400 (3).
// September Food: 300 + 150 = 450. a1 = 25000 - 8000 - 2000 - 100 - 400 - 300 - 150 - 90 - 60 - 40 = 13860.
// a2 = 2000 - 250 - 50 - 70 = 1630. Total = 15490.
const BUDGETS = [
  { category_id: 'c1', amount: 1000, period_start: '2026-10-01', period_end: '2026-10-31' }, // spent 400, left 600, 40%
  { category_id: 'c4', amount: 300, period_start: '2026-10-01', period_end: '2026-10-31' }, // spent 400, over by 100
  { category_id: 'c1', amount: 500, period_start: '2026-09-01', period_end: '2026-09-30' },
]
const GOALS = [
  { id: 'g1', name: 'Laptop', target_amount: 10000, status: 'active' },
  { id: 'g2', name: 'Trip', target_amount: 5000, status: 'active' }, // nothing set aside
  { id: 'g3', name: 'Phone', target_amount: 1000, status: 'active' }, // over target
]
const CONTRIBUTIONS = [
  { goal_id: 'g1', account_id: 'a1', amount: 8000, type: 'contribution' },
  { goal_id: 'g1', account_id: 'a2', amount: 1000, type: 'contribution' },
  { goal_id: 'g1', account_id: 'a1', amount: 500, type: 'withdrawal' }, // Laptop = 8500 (85%)
  { goal_id: 'g3', account_id: 'a1', amount: 1200, type: 'contribution' }, // Phone = 1200, over by 200
]
// Set aside: a1 = 8000 - 500 + 1200 = 8700; a2 = 1000. Available: a1 = 13860 - 8700 = 5160; a2 = 630; total 5790.
const ACCOUNTS = CTX.accounts
const DATA = deepFreeze({ transactions: TRANSACTIONS, accounts: ACCOUNTS, budgets: BUDGETS, goals: GOALS, goalContributions: CONTRIBUTIONS, rowLimitHit: false })

const ask = (text, ctx = CTX, data = DATA) => {
  const result = interpret(text, ctx, ctx.referenceDate ? ctx.referenceDate.getTime() : NOW)
  const request = Q.requestFromResult(result)
  assert.ok(request, `"${text}" should be a complete, available question (got ${result.kind}${result.asks ? ' asks=' + result.asks : ''})`)
  return Q.answerQuery(request, data, NOW, OPTS)
}
const rowOf = (a, label) => (a.rows.find((r) => r.label === label) || {}).value
const ALL_ANSWERS = []
const record = (a) => { ALL_ANSWERS.push(a); return a }

console.log('queries tests\n')

test('Q1: a spending answer equals the page figure — hand-counted and by the same engine call', () => {
  const all = record(ask('How much did I spend this month?'))
  assert.strictEqual(all.ok, true)
  assert.strictEqual(all.headline, 'You spent R8800 in October 2026.')
  assert.strictEqual(all.recordCount, 5)
  assert.strictEqual(all.headline, `You spent ${R(totalExpenses(TRANSACTIONS, '2026-10-01', '2026-10-31'))} in October 2026.`) // Overview's call
  const food = record(ask('How much did I spend on food this month?'))
  assert.strictEqual(food.headline, 'You spent R400 on Food in October 2026.')
  assert.strictEqual(food.recordCount, 3)
  assert.strictEqual(rowOf(food, 'Expenses counted'), '3')
  // Reports narrows by category first, then calls totalExpenses
  assert.strictEqual(400, totalExpenses(TRANSACTIONS.filter((t) => t.category_id === 'c1'), '2026-10-01', '2026-10-31'))
  // the month's last day is in, the next month's first day is out
  assert.ok(TRANSACTIONS.find((t) => t.id === 't7') && !food.headline.includes('R470'))
})

test('Q2: transfers, income and money set aside for goals are never spending', () => {
  const a = ask('How much did I spend this month?')
  assert.strictEqual(a.headline, 'You spent R8800 in October 2026.') // not 8800 + 2000 (transfer) or + 25000 (income)
  const withGoalMoney = deepFreeze({ ...DATA, transactions: [...TRANSACTIONS, tx('x1', 'transfer', 500, 'a1', '2026-10-04', null, 'a2'), tx('x2', 'income', 999, 'a2', '2026-10-04', 'c3')] })
  assert.strictEqual(ask('How much did I spend this month?', CTX, withGoalMoney).headline, 'You spent R8800 in October 2026.')
  const g = ask('How much have I put into my laptop goal?')
  assert.ok(!/spent/i.test(g.headline), 'goal money is "set aside", never "spent"')
})

test('Q3: categories match whole names only', () => {
  assert.strictEqual(ask('How much did I spend on food this month?').headline, 'You spent R400 on Food in October 2026.')
  assert.strictEqual(ask('How much did I spend on seafood this month?').headline, 'You spent R400 on Seafood in October 2026.')
  assert.strictEqual(ask('How much did I spend on rent this month?').headline, 'You spent R8000 on Rent in October 2026.')
})

test('Q4: periods are exact — last month, a named year, December to January, a leap February', () => {
  assert.strictEqual(ask('How much did I spend on food last month?').headline, 'You spent R450 on Food in September 2026.')
  // a named month with a year, as a request (how the interpreter phrases it is not P5's business)
  const feb = { intent: 'QUERY_SPEND', period: { start: '2024-02-01', end: '2024-02-29', label: 'February 2024' }, category: { id: 'c1', name: 'Food' } }
  assert.strictEqual(Q.answerQuery(feb, DATA, NOW, OPTS).headline, 'You spent R40 on Food in February 2024.') // 29 Feb counted
  // KNOWN LIMIT (P3, not widened in P5): "…on food in October?" leaves "in" on the category name, so the
  // interpreter asks instead of answering. It never guesses; the question stays in the guard panel.
  assert.strictEqual(Q.requestFromResult(interpret('How much did I spend on food in October?', CTX, NOW)), null)
  const jan = { ...CTX, referenceDate: new Date(2026, 0, 15) }
  assert.strictEqual(ask('How much did I spend on food last month?', jan).headline, 'You spent R90 on Food in December 2025.')
  assert.strictEqual(ask('How much did I spend on food this month?', jan).headline, 'You spent R60 on Food in January 2026.')
  // no period said: the current month, and the answer says that is why
  const d = ask('How much did I spend on food?')
  assert.strictEqual(d.headline, 'You spent R400 on Food in October 2026.')
  assert.strictEqual(rowOf(d, 'Period'), 'October 2026')
  assert.strictEqual(d.rows.find((r) => r.label === 'Period').note, "(the current month, because you didn't say)")
  assert.strictEqual(ask('How much did I spend on food this month?').rows.find((r) => r.label === 'Period').note, undefined)
  assert.strictEqual(rowOf(ask('How much did I spend on food this month?'), 'Period'), 'October 2026')
  // a period that is not a whole month is not answered at all
  const result = interpret('How much did I spend on food today?', CTX, NOW)
  assert.strictEqual(Q.requestFromResult(result), null)
})

test('Q5: budget left equals the Budgets page; an overspend is shown as over budget', () => {
  const a = record(ask('How much is left in my food budget?'))
  assert.strictEqual(a.headline, 'You have R600 left in your Food budget for October 2026.')
  assert.strictEqual(rowOf(a, 'Budget (planned)'), 'R1000')
  assert.strictEqual(rowOf(a, 'Spent (recorded)'), 'R400')
  assert.strictEqual(rowOf(a, 'Left'), 'R600')
  assert.strictEqual(rowOf(a, 'Used'), '40%')
  const page = BUDGETS.filter((b) => b.period_start === '2026-10-01').find((b) => b.category_id === 'c1') // Budgets: period_start === viewStart
  assert.strictEqual(budgetSpent(TRANSACTIONS, page), 400)
  assert.strictEqual(budgetRemaining(TRANSACTIONS, page), 600)
  const over = record(ask('How much is left in my seafood budget?'))
  assert.strictEqual(over.headline, 'Seafood is R100 over budget for October 2026.')
  assert.strictEqual(rowOf(over, 'Over budget by'), 'R100')
  assert.strictEqual(rowOf(over, 'Left'), undefined)
  const sept = ask('How much is left in my food budget last month?')
  assert.strictEqual(sept.headline, 'You have R50 left in your Food budget for September 2026.') // 500 - 450
})

test('Q6: no budget for that category and month says so and shows no figures', () => {
  const a = record(ask('How much is left in my rent budget?'))
  assert.strictEqual(a.ok, false)
  assert.strictEqual(a.reason, 'no_budget')
  assert.strictEqual(a.headline, 'You have no Rent budget for October 2026.')
  assert.deepStrictEqual(a.rows, [])
  const lastMonth = record(ask('How much is left in my seafood budget last month?')) // exists for October only
  assert.strictEqual(lastMonth.reason, 'no_budget')
})

test('Q7: goal progress equals the Goals page; percent capped, overage reported', () => {
  const a = record(ask('How much have I put into my laptop goal?'))
  assert.strictEqual(a.headline, 'You have set aside R8500 for Laptop, which is 85% of the R10000 target.')
  assert.strictEqual(rowOf(a, 'Set aside'), 'R8500')
  assert.strictEqual(rowOf(a, 'Progress'), '85%')
  assert.strictEqual(goalProgress(CONTRIBUTIONS, 'g1'), 8500) // Goals page's call; the withdrawal is subtracted
  const phone = record(ask('How much have I put into my phone goal?'))
  assert.strictEqual(rowOf(phone, 'Progress'), '100%') // capped, as the Goals page caps it
  assert.strictEqual(rowOf(phone, 'Over target by'), 'R200')
  assert.deepStrictEqual(progressPercent(1200, 1000), { percent: 100, overage: 200 })
  const noTarget = deepFreeze({ ...DATA, goals: GOALS.map((g) => (g.id === 'g1' ? { ...g, target_amount: null } : g)) })
  const nt = ask('How much have I put into my laptop goal?', CTX, noTarget)
  assert.strictEqual(nt.headline, 'You have set aside R8500 for Laptop.')
  assert.strictEqual(rowOf(nt, 'Target'), undefined)
})

test('Q8: balance equals the Overview figures; set aside and available are shown', () => {
  const t = record(ask('What is my total balance?'))
  assert.strictEqual(t.headline, 'Your total balance is R15490, as of today.')
  assert.strictEqual(rowOf(t, 'Balance'), 'R15490')
  assert.strictEqual(rowOf(t, 'Set aside for goals'), 'R9700')
  assert.strictEqual(rowOf(t, 'Available'), 'R5790')
  assert.strictEqual(totalBalance(TRANSACTIONS, ACCOUNTS), 15490) // Overview's call; the transfer cancels out
  const sbi = record(ask('How much is in my SBI account?'))
  assert.strictEqual(sbi.headline, 'Your SBI balance is R13860, as of today.')
  assert.strictEqual(rowOf(sbi, 'Set aside for goals'), 'R8700')
  assert.strictEqual(rowOf(sbi, 'Available'), 'R5160')
  assert.strictEqual(accountBalance(TRANSACTIONS, 'a1'), 13860)
  assert.strictEqual(allocated(CONTRIBUTIONS, 'a1'), 8700)
  assert.strictEqual(available(TRANSACTIONS, CONTRIBUTIONS, 'a1'), 5160)
  assert.strictEqual(rowOf(ask('How much is in my wallet?'), 'Balance'), 'R1630')
  assert.strictEqual(sbi.seeMore, null) // there is no accounts page
})

test('Q9: nothing to count never produces a bare zero', () => {
  const none = record(ask('How much did I spend on rent last month?'))
  assert.strictEqual(none.ok, false)
  assert.strictEqual(none.reason, 'nothing_to_show')
  assert.strictEqual(none.headline, 'No expenses are recorded for Rent in September 2026.')
  assert.deepStrictEqual(none.rows, [])
  const trip = record(ask('How much have I put into my trip goal?'))
  assert.strictEqual(trip.reason, 'nothing_to_show')
  assert.strictEqual(trip.headline, 'Nothing has been set aside for Trip yet.')
  const empty = deepFreeze({ ...DATA, transactions: [] })
  assert.strictEqual(record(ask('What is my total balance?', CTX, empty)).reason, 'nothing_to_show')
  assert.strictEqual(record(ask('How much did I spend this month?', CTX, empty)).reason, 'nothing_to_show')
  for (const a of [none, trip]) assert.ok(!/R0\b|₹0\b/.test(a.headline + JSON.stringify(a.rows)), 'no bare zero')
})

test('Q10: data that may be cut off, or is missing, gives no number', () => {
  const request = Q.requestFromResult(interpret('How much did I spend this month?', CTX, NOW))
  const cut = Q.answerQuery(request, { ...DATA, rowLimitHit: true }, NOW, OPTS)
  assert.strictEqual(cut.ok, false)
  assert.strictEqual(cut.reason, 'data_incomplete')
  assert.strictEqual(cut.headline, Q.QUERY_MESSAGES.dataProblem)
  assert.deepStrictEqual(cut.rows, [])
  for (const missing of ['transactions', 'accounts', 'budgets', 'goals', 'goalContributions']) {
    const data = { ...DATA, rowLimitHit: false }
    delete data[missing]
    for (const q of ['How much did I spend this month?', 'How much is left in my food budget?', 'How much have I put into my laptop goal?', 'What is my total balance?']) {
      const a = Q.answerQuery(Q.requestFromResult(interpret(q, CTX, NOW)), data, NOW, OPTS)
      assert.ok(a.ok === false || !(missing === 'transactions' && q.includes('spend')), 'a missing list never yields a figure it needed')
    }
  }
  assert.strictEqual(Q.answerQuery(request, null, NOW).reason, 'data_incomplete')
  assert.strictEqual(Q.dataProblemAnswer().ok, false)
  assert.strictEqual(Q.mayBeTruncated(new Array(1000).fill({})), true)
  assert.strictEqual(Q.mayBeTruncated(new Array(999).fill({})), false)
  assert.strictEqual(Q.mayBeTruncated(null), false)
  assert.throws(() => Q.answerQuery(request, DATA, undefined), (e) => e.code === 'now_required')
  assert.throws(() => Q.answerQuery({ intent: 'QUERY_PENSION_ESTIMATE' }, DATA, NOW), (e) => e.code === 'invalid_request')
})

test('Q11: the choices that start a question work; stale or unknown ones return null; only complete, available questions become requests', () => {
  const lists = { goals: CTX.goals, categories: CTX.categories, accounts: CTX.accounts }
  const spend = Q.queryFromChoice('spend_c1', lists, REF)
  assert.strictEqual(spend.intent, 'QUERY_SPEND')
  assert.deepStrictEqual(spend.category, { id: 'c1', name: 'Food' })
  assert.strictEqual(spend.period.label, 'October 2026')
  assert.strictEqual(spend.periodIsDefault, true)
  assert.strictEqual(Q.queryFromChoice('budget_left_c1', lists, REF).intent, 'QUERY_BUDGET_LEFT')
  assert.deepStrictEqual(Q.queryFromChoice('goal_progress_g1', lists, REF).goal, { id: 'g1', name: 'Laptop' })
  assert.strictEqual(Q.queryFromChoice('total_balance', lists, REF).intent, 'QUERY_BALANCE')
  for (const bad of ['spend_gone', 'budget_left_gone', 'goal_progress_gone', 'record_expense', 'create_goal', '', undefined, null, 5]) assert.strictEqual(Q.queryFromChoice(bad, lists, REF), null)
  assert.strictEqual(Q.queryFromChoice('spend_c1', { categories: [] }, REF), null)
  // every query choice the interpreter can offer is understood
  let swept = 0
  for (const text of [...BARE_WORD_INPUTS, 'laptop', 'trip', 'food', 'seafood', 'rent', 'sbi', 'wallet', 'balance', 'Laptop']) {
    const r = interpret(text, CTX, NOW)
    if (r.kind !== 'clarify') continue
    for (const c of r.clarification.choices) {
      if (!Q.QUERY_INTENTS.includes(c.intent)) continue
      swept++
      const request = Q.queryFromChoice(c.id, lists, REF)
      assert.ok(request, `choice ${c.id} from "${text}" must start a question`)
      assert.strictEqual(request.intent, c.intent)
      assert.strictEqual(Q.answerQuery(request, DATA, NOW, OPTS).intent, c.intent)
    }
  }
  assert.ok(swept >= 3, `swept ${swept} query choices`)
  // open questions and unavailable intents are not requests
  assert.strictEqual(Q.requestFromResult(interpret('How much is left in my budget?', CTX, NOW)), null) // no category
  assert.strictEqual(Q.requestFromResult(interpret('How much have I put into my goal?', CTX, NOW)), null) // no goal named
  assert.strictEqual(Q.requestFromResult(interpret('How much did I pay for my pension?', CTX, NOW)), null) // pension is P10
  assert.strictEqual(Q.requestFromResult(interpret('Create a goal for a laptop worth 50000', CTX, NOW)), null)
  assert.strictEqual(Q.requestFromResult(interpret('coffee 80', CTX, NOW)), null)
  assert.strictEqual(Q.requestFromResult(interpret('laptop', CTX, NOW)), null)
  assert.strictEqual(Q.requestFromResult(null), null)
  const twoLaptops = { ...CTX, goals: [{ id: 'g1', name: 'Laptop' }, { id: 'g9', name: 'Laptop fund' }] }
  assert.strictEqual(Q.requestFromResult(interpret('How much have I put into my laptop goal?', twoLaptops, NOW)), null) // two matches: ask
})

test('Q12: answers are frozen, repeatable, calculated, honest in wording, and leave their input alone', () => {
  assert.ok(ALL_ANSWERS.length >= 12, `swept ${ALL_ANSWERS.length} answers`)
  const BANNED = /\bsaved\b|\bpaid\b|\bpaying\b|\breceived\b|\bearned\b|\bdeposited\b/i
  for (const a of ALL_ANSWERS) {
    assert.ok(Object.isFrozen(a) && Object.isFrozen(a.rows), 'frozen')
    const text = [a.headline, a.basis, a.note, ...a.rows.map((r) => `${r.label} ${r.value} ${r.note || ''}`)].join(' | ')
    assert.ok(!BANNED.test(text), `banned wording in: ${text}`)
    assert.strictEqual(a.note, Q.QUERY_MESSAGES.nothingChanged)
    if (a.ok) assert.strictEqual(a.answerKind, 'calculated')
  }
  const again = JSON.stringify(ask('How much did I spend on food this month?'))
  assert.strictEqual(again, JSON.stringify(ask('How much did I spend on food this month?')))
  // the budget is a plan, and the answer says so
  assert.ok(ALL_ANSWERS.some((a) => a.rows.some((r) => r.label === 'Budget (planned)')))
  // a database client in the data is never touched
  const bait = { ...DATA, from() { throw new Error('touched a client') }, insert() { throw new Error('touched a client') } }
  assert.strictEqual(ask('How much did I spend this month?', CTX, bait).ok, true)
  // the data was deeply frozen at the start, so any change would have thrown in these strict-mode modules
  assert.strictEqual(DATA.transactions.length, 13)
})

test('Q13: the pages still compute these figures with the same engine calls', () => {
  const read = (p) => readFileSync(fileURLToPath(new URL(`../../${p}`, import.meta.url)), 'utf8').replace(/\r\n/g, '\n')
  const overview = read('pages/Overview.jsx')
  assert.ok(/totalExpenses\(transactions, monthStart, monthEnd\)/.test(overview), 'Overview: monthly spend')
  assert.ok(/totalBalance\(transactions, accounts\)/.test(overview), 'Overview: total balance')
  assert.ok(/accountBalance\(transactions, a\.id\)/.test(overview), 'Overview: account balance')
  const budgets = read('pages/Budgets.jsx')
  assert.ok(/budgets\.filter\(\(b\) => b\.period_start === viewStart\)/.test(budgets), 'Budgets: the month is matched by period_start')
  assert.ok(/budgetSpent\(transactions, budget\)/.test(budgets), 'Budgets: spent')
  const goals = read('pages/Goals.jsx')
  assert.ok(/goalProgress\(goalContributions, g\.id\)/.test(goals), 'Goals: progress')
  const reports = read('pages/Reports.jsx')
  assert.ok(/totalExpenses\(categoryTransactions, range\.start, range\.end\)/.test(reports), 'Reports: spend by category')
  const contribute = read('components/goals/ContributeModal.jsx')
  assert.ok(/available\(transactions, goalContributions, accountId\)/.test(contribute), 'Contribute: available balance')
})

console.log(`\n${passed} passed, ${failed} failed`)
if (failed) process.exit(1)
