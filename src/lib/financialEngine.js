// Pure calculation functions — no Supabase calls, no side effects.
// Same input always produces the same output, which is what makes this
// testable in isolation before the Money Inbox parser ever touches it.
//
// Expected shapes:
//   transaction:      { account_id, to_account_id, type, amount, transaction_date }
//   goal_contribution: { account_id, amount, type, contribution_date }
//   account:           { id, ... }

/**
 * Balance of a single account, computed purely from transactions.
 * Never reads or writes a stored `balance` column — that column
 * does not exist by design (Correction 1).
 */
export function accountBalance(transactions, accountId) {
  return transactions.reduce((sum, t) => {
    if (t.type === 'income' && t.account_id === accountId) return sum + t.amount
    if (t.type === 'expense' && t.account_id === accountId) return sum - t.amount
    if (t.type === 'transfer' && t.to_account_id === accountId) return sum + t.amount
    if (t.type === 'transfer' && t.account_id === accountId) return sum - t.amount
    return sum
  }, 0)
}

/**
 * Total balance across all of a user's accounts.
 * Transfers cancel out automatically because each transfer both
 * subtracts from one account's balance and adds to another's.
 */
export function totalBalance(transactions, accounts) {
  return accounts.reduce((sum, acc) => sum + accountBalance(transactions, acc.id), 0)
}

/**
 * Amount currently allocated to goals, per account.
 * This is separate from the account's real balance — allocating
 * money to a goal never touches `transactions` (Correction 2).
 */
export function allocated(goalContributions, accountId) {
  return goalContributions.reduce((sum, c) => {
    if (c.account_id !== accountId) return sum
    if (c.type === 'contribution') return sum + c.amount
    if (c.type === 'withdrawal') return sum - c.amount
    return sum
  }, 0)
}

/**
 * Available (unallocated) balance of an account:
 * real balance minus whatever's earmarked for goals.
 */
export function available(transactions, goalContributions, accountId) {
  return accountBalance(transactions, accountId) - allocated(goalContributions, accountId)
}

/**
 * Progress of a single goal: sum of its contributions minus withdrawals,
 * across whichever accounts funded it.
 */
export function goalProgress(goalContributions, goalId) {
  return goalContributions.reduce((sum, c) => {
    if (c.goal_id !== goalId) return sum
    if (c.type === 'contribution') return sum + c.amount
    if (c.type === 'withdrawal') return sum - c.amount
    return sum
  }, 0)
}

/**
 * Net cash flow for a period: income minus expense only.
 * Transfers and goal contributions are deliberately excluded —
 * neither changes total wealth, just where it sits (Correction 3).
 */
export function netCashFlow(transactions, periodStart, periodEnd) {
  return transactions.reduce((sum, t) => {
    if (t.transaction_date < periodStart || t.transaction_date > periodEnd) return sum
    if (t.type === 'income') return sum + t.amount
    if (t.type === 'expense') return sum - t.amount
    return sum // transfers excluded
  }, 0)
}

/** Sum of income only, for a period — used by the Financial Snapshot. */
export function totalIncome(transactions, periodStart, periodEnd) {
  return transactions
    .filter((t) => t.type === 'income' && t.transaction_date >= periodStart && t.transaction_date <= periodEnd)
    .reduce((sum, t) => sum + t.amount, 0)
}

/** Sum of expenses only, for a period — used by the Financial Snapshot. */
export function totalExpenses(transactions, periodStart, periodEnd) {
  return transactions
    .filter((t) => t.type === 'expense' && t.transaction_date >= periodStart && t.transaction_date <= periodEnd)
    .reduce((sum, t) => sum + t.amount, 0)
}
