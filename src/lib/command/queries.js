// P5 (Money Inbox command layer) — the READ-ONLY QUERIES.
//
// Answers four questions from data the screen has already read, using the same
// engine functions the owning pages use, so a figure here can never differ from
// the figure on the page:
//
//   QUERY_SPEND          financialEngine.totalExpenses        (Overview, Reports)
//   QUERY_BUDGET_LEFT    budgetEngine.budgetSpent/Remaining   (Budgets)
//   QUERY_GOAL_PROGRESS  financialEngine.goalProgress,
//                        goalEngine.progressPercent           (Goals)
//   QUERY_BALANCE        financialEngine.totalBalance,
//                        accountBalance, allocated, available (Overview)
//
// requestFromResult(interpreterResult)        → a request, or null when the question
//                                               is not complete or not available
// queryFromChoice(choiceId, lists, referenceDate) → a request, or null
// answerQuery(request, data, now, options)    → a frozen answer
// dataProblemAnswer()                         → the "couldn't read your data" answer
//
// THE RULES IT KEEPS:
//   - Every answer is CALCULATED from recorded data (the four-state rule). A budget
//     amount is labelled planned; money for a goal is "set aside", never "spent".
//   - It never shows a bare zero that could be mistaken for an answer: nothing to
//     count gives a sentence saying so, and no number.
//   - Data that may have been cut off at the row limit, or that is missing, gives
//     "I couldn't read all your data" and no number.
//   - It never writes anything and never receives a database client: only arrays.
//
// PURE. Imports only its sibling modules and the three existing pure engines. No
// database, no screen code, no clock (`now` is passed in), no randomness.
// Results are deeply frozen.

import { totalExpenses, accountBalance, totalBalance, allocated, available, goalProgress } from '../financialEngine.js'
import { budgetSpent, budgetRemaining, budgetPercentUsed } from '../budgetEngine.js'
import { progressPercent } from '../goalEngine.js'
import { isIntentAvailable } from './intents.js'
import { currentMonthPeriod } from './periodParser.js'

export class QueryError extends Error {
  constructor(code, message) {
    super(message)
    this.name = 'QueryError'
    this.code = code
  }
}
const fail = (code, message) => { throw new QueryError(code, message) }

function freeze(value) {
  if (value && typeof value === 'object' && !Object.isFrozen(value)) {
    Object.freeze(value)
    for (const key of Object.keys(value)) freeze(value[key])
  }
  return value
}

export const QUERY_INTENTS = freeze(['QUERY_SPEND', 'QUERY_BUDGET_LEFT', 'QUERY_GOAL_PROGRESS', 'QUERY_BALANCE'])

/** The database returns at most this many rows per request, so a full page may be cut off. */
export const ROW_LIMIT = 1000
export function mayBeTruncated(rows) {
  return Array.isArray(rows) && rows.length >= ROW_LIMIT
}

// ---------- the words (pinned by tests) ----------
export const QUERY_MESSAGES = freeze({
  defaultPeriodNote: "(the current month, because you didn't say)",
  nothingChanged: 'This is only a calculation. Nothing was changed.',
  dataProblem: "I couldn't read all your data, so I'm not showing a number. Please try again.",
  choiceGone: "That isn't available any more. Nothing was saved.",
  basisSpend: 'Counted from your recorded expenses. Transfers and money set aside for goals are not counted.',
  basisBudget: 'Your planned budget compared with your recorded expenses in the same category and month.',
  basisGoal: 'Total contributed to this goal, minus withdrawals.',
  basisBalance: 'Calculated from every recorded transaction. No balance is stored.',
  basisNothing: 'Nothing was found to calculate from.',
})

const SEE_MORE = {
  QUERY_SPEND: { label: 'See your transactions', route: '/transactions' },
  QUERY_BUDGET_LEFT: { label: 'See your budgets', route: '/budgets' },
  QUERY_GOAL_PROGRESS: { label: 'See your goals', route: '/goals' },
  QUERY_BALANCE: null, // there is no accounts page
}

// ---------- from the interpreter to a request ----------
function fieldValue(pending, name) {
  const f = pending.fields[name]
  return f ? f.value : undefined
}

/**
 * The request for a complete, available question — or null when the question still
 * has something to ask (an ambiguity, a missing field) or is not available yet.
 */
export function requestFromResult(result) {
  if (!result || result.kind !== 'query' || !result.pending) return null
  const p = result.pending
  if (!QUERY_INTENTS.includes(p.intent) || !isIntentAvailable(p.intent)) return null
  if (result.asks.length || p.ambiguities.length || p.missing.length) return null

  const request = { intent: p.intent }
  const period = fieldValue(p, 'period') || fieldValue(p, 'month')
  const periodField = p.fields.period || p.fields.month
  if (period) {
    request.period = { start: period.start, end: period.end, label: period.label }
    request.periodIsDefault = periodField.origin === 'default'
    if (periodField.origin !== 'default' && periodField.note) request.periodNote = periodField.note
  }
  for (const name of ['category', 'goal', 'account']) {
    const v = fieldValue(p, name)
    if (v) request[name] = { id: v.id, name: v.name }
  }
  return freeze(request)
}

/**
 * The request for one of the clarification choices that starts a question
 * (spend_<id>, budget_left_<id>, goal_progress_<id>, total_balance). Null when the
 * id is not one of those, or the item no longer exists in the user's lists.
 */
export function queryFromChoice(choiceId, lists, referenceDate) {
  if (typeof choiceId !== 'string') return null
  const find = (list, id) => (Array.isArray(list) ? list.find((x) => String(x.id) === id) : undefined)
  const month = () => {
    const p = currentMonthPeriod(referenceDate)
    return { period: { start: p.start, end: p.end, label: p.label }, periodIsDefault: true }
  }
  if (choiceId === 'total_balance') return freeze({ intent: 'QUERY_BALANCE' })
  let m = /^spend_(.+)$/.exec(choiceId)
  if (m) {
    const c = find(lists && lists.categories, m[1])
    return c ? freeze({ intent: 'QUERY_SPEND', ...month(), category: { id: c.id, name: c.name } }) : null
  }
  m = /^budget_left_(.+)$/.exec(choiceId)
  if (m) {
    const c = find(lists && lists.categories, m[1])
    return c ? freeze({ intent: 'QUERY_BUDGET_LEFT', ...month(), category: { id: c.id, name: c.name } }) : null
  }
  m = /^goal_progress_(.+)$/.exec(choiceId)
  if (m) {
    const g = find(lists && lists.goals, m[1])
    return g ? freeze({ intent: 'QUERY_GOAL_PROGRESS', goal: { id: g.id, name: g.name } }) : null
  }
  return null
}

// ---------- answers ----------
const plainMoney = (n) => `₹${n}`

function percentText(n) {
  return `${Math.round(n)}%`
}

function periodRow(request) {
  const note = request.periodIsDefault ? QUERY_MESSAGES.defaultPeriodNote : request.periodNote
  return note ? { label: 'Period', value: request.period.label, note } : { label: 'Period', value: request.period.label }
}

function answer(request, parts) {
  return freeze({
    ok: true, intent: request.intent, answerKind: 'calculated',
    headline: parts.headline, rows: parts.rows, period: request.period ? { label: request.period.label } : null,
    basis: parts.basis, recordCount: parts.recordCount, seeMore: SEE_MORE[request.intent],
    note: QUERY_MESSAGES.nothingChanged,
  })
}

function noAnswer(request, reason, headline, basis = QUERY_MESSAGES.basisNothing) {
  return freeze({
    ok: false, intent: request.intent, reason, headline, rows: [], period: request.period ? { label: request.period.label } : null,
    basis, recordCount: 0, seeMore: SEE_MORE[request.intent], note: QUERY_MESSAGES.nothingChanged,
  })
}

/** The answer for a read that failed or may have been cut off. It has no number. */
export function dataProblemAnswer() {
  return freeze({
    ok: false, intent: null, reason: 'data_incomplete', headline: QUERY_MESSAGES.dataProblem, rows: [], period: null,
    basis: QUERY_MESSAGES.basisNothing, recordCount: 0, seeMore: null, note: QUERY_MESSAGES.nothingChanged,
  })
}

const inRange = (t, start, end) => t.transaction_date >= start && t.transaction_date <= end
const asList = (v) => (Array.isArray(v) ? v : null)

function spendAnswer(request, data, money) {
  if (!request.period) fail('invalid_request', 'A spending question needs a period')
  const transactions = asList(data.transactions)
  if (!transactions) return dataProblemAnswer()
  const narrowed = request.category ? transactions.filter((t) => t.category_id === request.category.id) : transactions
  const counted = narrowed.filter((t) => t.type === 'expense' && inRange(t, request.period.start, request.period.end))
  const where = request.category ? ` on ${request.category.name}` : ''
  if (counted.length === 0) {
    return noAnswer(request, 'nothing_to_show', `No expenses are recorded${request.category ? ` for ${request.category.name}` : ''} in ${request.period.label}.`, QUERY_MESSAGES.basisSpend)
  }
  const total = totalExpenses(narrowed, request.period.start, request.period.end)
  return answer(request, {
    headline: `You spent ${money(total)}${where} in ${request.period.label}.`,
    rows: [periodRow(request), { label: 'Expenses counted', value: String(counted.length) }],
    basis: QUERY_MESSAGES.basisSpend, recordCount: counted.length,
  })
}

function budgetAnswer(request, data, money) {
  if (!request.period || !request.category) fail('invalid_request', 'A budget question needs a category and a month')
  const transactions = asList(data.transactions)
  const budgets = asList(data.budgets)
  if (!transactions || !budgets) return dataProblemAnswer()
  // Matched the way the Budgets page does it: the budget whose period starts on the month's first day.
  const budget = budgets.find((b) => b.category_id === request.category.id && b.period_start === request.period.start)
  if (!budget) return noAnswer(request, 'no_budget', `You have no ${request.category.name} budget for ${request.period.label}.`, QUERY_MESSAGES.basisBudget)
  const spent = budgetSpent(transactions, budget)
  const left = budgetRemaining(transactions, budget)
  const counted = transactions.filter((t) => t.category_id === budget.category_id && t.type === 'expense' && inRange(t, budget.period_start, budget.period_end)).length
  const name = request.category.name
  const headline = left >= 0
    ? `You have ${money(left)} left in your ${name} budget for ${request.period.label}.`
    : `${name} is ${money(-left)} over budget for ${request.period.label}.`
  return answer(request, {
    headline,
    rows: [
      periodRow(request),
      { label: 'Budget (planned)', value: money(budget.amount) },
      { label: 'Spent (recorded)', value: money(spent) },
      left >= 0 ? { label: 'Left', value: money(left) } : { label: 'Over budget by', value: money(-left) },
      { label: 'Used', value: percentText(budgetPercentUsed(transactions, budget)) },
    ],
    basis: QUERY_MESSAGES.basisBudget, recordCount: counted,
  })
}

function goalAnswer(request, data, money) {
  if (!request.goal) fail('invalid_request', 'A goal question needs a goal')
  const goals = asList(data.goals)
  const contributions = asList(data.goalContributions)
  if (!goals || !contributions) return dataProblemAnswer()
  const goal = goals.find((g) => g.id === request.goal.id)
  if (!goal) return noAnswer(request, 'goal_not_found', `I couldn't find the goal ${request.goal.name} any more.`, QUERY_MESSAGES.basisGoal)
  const records = contributions.filter((c) => c.goal_id === goal.id)
  if (records.length === 0) return noAnswer(request, 'nothing_to_show', `Nothing has been set aside for ${goal.name} yet.`, QUERY_MESSAGES.basisGoal)
  const setAside = goalProgress(contributions, goal.id)
  const rows = [{ label: 'Set aside', value: money(setAside) }]
  let headline = `You have set aside ${money(setAside)} for ${goal.name}.`
  if (goal.target_amount > 0) {
    const { percent, overage } = progressPercent(setAside, goal.target_amount)
    headline = `You have set aside ${money(setAside)} for ${goal.name}, which is ${percentText(percent)} of the ${money(goal.target_amount)} target.`
    rows.push({ label: 'Target', value: money(goal.target_amount) }, { label: 'Progress', value: percentText(percent) })
    if (overage > 0) rows.push({ label: 'Over target by', value: money(overage) })
  }
  return answer(request, { headline, rows, basis: QUERY_MESSAGES.basisGoal, recordCount: records.length })
}

function balanceAnswer(request, data, money) {
  const transactions = asList(data.transactions)
  const accounts = asList(data.accounts)
  const contributions = asList(data.goalContributions)
  if (!transactions || !accounts || !contributions) return dataProblemAnswer()
  let balance, setAside, label
  if (request.account) {
    const account = accounts.find((a) => a.id === request.account.id)
    if (!account) return noAnswer(request, 'account_not_found', `I couldn't find the account ${request.account.name} any more.`, QUERY_MESSAGES.basisBalance)
    balance = accountBalance(transactions, account.id)
    setAside = allocated(contributions, account.id)
    label = `Your ${account.name} balance`
  } else {
    if (accounts.length === 0) return noAnswer(request, 'nothing_to_show', "You don't have any accounts yet, so there is no balance to show.", QUERY_MESSAGES.basisBalance)
    balance = totalBalance(transactions, accounts)
    setAside = accounts.reduce((sum, a) => sum + allocated(contributions, a.id), 0)
    label = 'Your total balance'
  }
  if (transactions.length === 0) return noAnswer(request, 'nothing_to_show', 'No transactions are recorded yet, so there is no balance to show.', QUERY_MESSAGES.basisBalance)
  const free = request.account
    ? available(transactions, contributions, request.account.id)
    : accounts.reduce((sum, a) => sum + available(transactions, contributions, a.id), 0)
  return answer(request, {
    headline: `${label} is ${money(balance)}, as of today.`,
    rows: [
      { label: 'Balance', value: money(balance) },
      { label: 'Set aside for goals', value: money(setAside) },
      { label: 'Available', value: money(free) },
    ],
    basis: QUERY_MESSAGES.basisBalance, recordCount: transactions.length,
  })
}

/**
 * The answer to a request. `data` holds plain arrays the screen has read:
 * transactions, accounts, budgets, goals, goalContributions, and rowLimitHit
 * (true when any read may have been cut off). `now` is milliseconds.
 * `options.formatMoney` formats an amount (the app passes its own formatter).
 */
export function answerQuery(request, data, now, options = {}) {
  if (typeof now !== 'number' || !Number.isFinite(now)) fail('now_required', 'A numeric `now` (milliseconds) must be passed in; this module never reads the clock.')
  if (!request || !QUERY_INTENTS.includes(request.intent)) fail('invalid_request', 'Not a question this module answers')
  if (!data || typeof data !== 'object') return dataProblemAnswer()
  if (data.rowLimitHit === true) return dataProblemAnswer()
  const money = typeof options.formatMoney === 'function' ? options.formatMoney : plainMoney
  switch (request.intent) {
    case 'QUERY_SPEND': return spendAnswer(request, data, money)
    case 'QUERY_BUDGET_LEFT': return budgetAnswer(request, data, money)
    case 'QUERY_GOAL_PROGRESS': return goalAnswer(request, data, money)
    default: return balanceAnswer(request, data, money)
  }
}
