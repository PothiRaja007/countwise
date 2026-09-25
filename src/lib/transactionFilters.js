// Pure functions for the Transactions page: filtering, sorting, and
// date-grouping a transaction list. No Supabase calls, no side effects —
// same pattern as financialEngine.js, so this is unit-testable the same way.

/**
 * @param {Array} transactions
 * @param {{search?: string, dateFrom?: string, dateTo?: string, categoryId?: string, accountId?: string, type?: string}} filters
 */
export function filterTransactions(transactions, filters = {}) {
  const { search, dateFrom, dateTo, categoryId, accountId, type } = filters
  const searchLower = search?.trim().toLowerCase()

  return transactions.filter((t) => {
    if (searchLower) {
      const haystack = `${t.description || ''} ${t.original_input || ''}`.toLowerCase()
      if (!haystack.includes(searchLower)) return false
    }
    if (dateFrom && t.transaction_date < dateFrom) return false
    if (dateTo && t.transaction_date > dateTo) return false
    if (categoryId && t.category_id !== categoryId) return false
    // Account filter matches either side of a transfer, so filtering by an
    // account shows money moving in or out of it, not just out.
    if (accountId && t.account_id !== accountId && t.to_account_id !== accountId) return false
    if (type && t.type !== type) return false
    return true
  })
}

/**
 * @param {Array} transactions
 * @param {'date'|'amount'} sortBy
 * @param {'asc'|'desc'} direction
 */
export function sortTransactions(transactions, sortBy = 'date', direction = 'desc') {
  const sorted = [...transactions].sort((a, b) => {
    let cmp
    if (sortBy === 'amount') {
      cmp = a.amount - b.amount
    } else {
      // Secondary key keeps same-day entries in a stable, sensible order.
      cmp = a.transaction_date < b.transaction_date ? -1 : a.transaction_date > b.transaction_date ? 1 : 0
      if (cmp === 0 && a.created_at && b.created_at) {
        cmp = a.created_at < b.created_at ? -1 : a.created_at > b.created_at ? 1 : 0
      }
    }
    return direction === 'asc' ? cmp : -cmp
  })
  return sorted
}

/**
 * Groups a transaction list into consecutive same-date sections. Expects
 * the list to already be date-sorted (ascending or descending) — grouping
 * an amount-sorted list would scatter each date across many single-row
 * "groups", so callers should only group when sortBy === 'date'.
 *
 * @returns {Array<{date: string, transactions: Array}>}
 */
export function groupByDate(transactions) {
  const groups = []
  for (const t of transactions) {
    const last = groups[groups.length - 1]
    if (last && last.date === t.transaction_date) {
      last.transactions.push(t)
    } else {
      groups.push({ date: t.transaction_date, transactions: [t] })
    }
  }
  return groups
}

/** 'Today' / 'Yesterday' / 'D Mon' — same convention used on Overview. */
export function dateGroupLabel(isoDate, todayISO, yesterdayISO) {
  if (isoDate === todayISO) return 'Today'
  if (isoDate === yesterdayISO) return 'Yesterday'
  const d = new Date(isoDate)
  return d.toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' })
}
