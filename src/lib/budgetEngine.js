// Pure calculation functions — no Supabase calls, no side effects.
// Per the frozen v1.1 spec's non-negotiable rule: this file must call into
// financialEngine.js's existing primitives rather than re-filtering
// transactions independently. The approach used throughout: narrow the
// transaction list down to the budget's own category first, then hand that
// subset to financialEngine.js's totalExpenses() — which already only sums
// type === 'expense', so income/transfers/goal contributions are excluded
// automatically, without this file re-implementing that filter itself.
//
// Expected shapes:
//   transaction: { category_id, type, amount, transaction_date }
//   budget:      { category_id, amount, period_start, period_end }

import { totalExpenses } from './financialEngine.js'

function transactionsForBudgetCategory(transactions, budget) {
  return transactions.filter((t) => t.category_id === budget.category_id)
}

/**
 * Amount spent against a budget so far, for its own category and period.
 * Only expense transactions ever count — income, transfers, and goal
 * contributions fall out of the result on their own because
 * totalExpenses() already filters to type === 'expense'.
 */
export function budgetSpent(transactions, budget) {
  const categoryTransactions = transactionsForBudgetCategory(transactions, budget)
  return totalExpenses(categoryTransactions, budget.period_start, budget.period_end)
}

/**
 * What's left of the budget. Never clamped — a negative result means the
 * category is over budget, which the UI shows rather than hides.
 */
export function budgetRemaining(transactions, budget) {
  return budget.amount - budgetSpent(transactions, budget)
}

/**
 * Percent of the budget used so far. Not capped at 100 (unlike Goals'
 * progress, which the frozen spec explicitly caps) — going over is a real,
 * useful signal for a budget, not something to hide once it hits 100%.
 * Guards against amount === 0 even though the `amount > 0` check
 * constraint should make that impossible in practice.
 */
export function budgetPercentUsed(transactions, budget) {
  if (!budget.amount || budget.amount <= 0) return 0
  return (budgetSpent(transactions, budget) / budget.amount) * 100
}

/** Simple boolean for whether a budget's category has been overspent. */
export function isBudgetOverAmount(transactions, budget) {
  return budgetRemaining(transactions, budget) < 0
}
