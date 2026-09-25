import { useEffect, useMemo, useState } from 'react'
import { Download } from 'lucide-react'
import { supabase } from '../lib/supabaseClient.js'
import { useAuth } from '../lib/AuthContext.jsx'
import { totalIncome, totalExpenses, accountBalance, goalProgress } from '../lib/financialEngine.js'
import { budgetSpent, budgetRemaining, budgetPercentUsed, isBudgetOverAmount } from '../lib/budgetEngine.js'
import { progressPercent } from '../lib/goalEngine.js'
import { PERIODS, periodRange, formatShortDate } from '../lib/dateRange.js'
import { formatCurrency } from '../lib/format.js'
import { categoryPillClasses } from '../lib/categoryColors.js'
import { toCsv, downloadCsv } from '../lib/exportCsv.js'
import PageHeader from '../components/layout/PageHeader.jsx'
import ErrorState from '../components/layout/ErrorState.jsx'
import PeriodPicker from '../components/shared/PeriodPicker.jsx'
import Button from '../components/ui/Button.jsx'
import EmptyState from '../components/ui/EmptyState.jsx'
import { friendlyError } from '../lib/errorMessages.js'

// Reports is a document you'd export, not a dashboard you'd explore — real
// <table> markup throughout, no Recharts. That's a deliberate difference
// from Charts.jsx, per the frozen spec's non-negotiable Charts-vs-Reports
// distinction (§6.8): Charts is visual exploration, Reports is a summarized
// report + export.

function th(label) {
  return (
    <th className="text-left text-xs font-medium uppercase tracking-wide text-muted dark:text-mutedDark pb-2 pr-4">
      {label}
    </th>
  )
}

export default function Reports() {
  const { user, profile } = useAuth()
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(null)
  const [periodKey, setPeriodKey] = useState('30D')

  const [transactions, setTransactions] = useState([])
  const [categories, setCategories] = useState([])
  const [accounts, setAccounts] = useState([])
  const [goals, setGoals] = useState([])
  const [goalContributions, setGoalContributions] = useState([])
  const [budgets, setBudgets] = useState([])

  const load = async () => {
    if (!user) return
    setLoading(true)
    setError(null)

    const [txRes, catRes, accRes, goalRes, gcRes, budgetRes] = await Promise.all([
      supabase
        .from('transactions')
        .select('id, account_id, to_account_id, category_id, type, amount, description, transaction_date')
        .eq('user_id', user.id),
      supabase.from('categories').select('id, name, kind').or(`user_id.eq.${user.id},user_id.is.null`),
      // All accounts, including inactive — this is a historical report, same
      // reasoning Transactions.jsx already uses for its own account lookup.
      supabase.from('accounts').select('id, name, type, is_active').eq('user_id', user.id),
      supabase.from('goals').select('id, name, target_amount, status').eq('user_id', user.id),
      supabase.from('goal_contributions').select('id, goal_id, account_id, amount, type').eq('user_id', user.id),
      supabase.from('budgets').select('*').eq('user_id', user.id),
    ])

    const firstError = txRes.error || catRes.error || accRes.error || goalRes.error || gcRes.error || budgetRes.error
    if (firstError) {
      setError(friendlyError(firstError, "Couldn't load your report. Please try again."))
      setLoading(false)
      return
    }

    setTransactions(txRes.data || [])
    setCategories(catRes.data || [])
    setAccounts(accRes.data || [])
    setGoals(goalRes.data || [])
    setGoalContributions(gcRes.data || [])
    setBudgets(budgetRes.data || [])
    setLoading(false)
  }

  useEffect(() => {
    load()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user])

  const period = PERIODS.find((p) => p.key === periodKey) || PERIODS[0]
  const range = useMemo(() => periodRange(period.days), [period.days])

  const periodTransactions = useMemo(
    () => transactions.filter((t) => t.transaction_date >= range.start && t.transaction_date <= range.end),
    [transactions, range]
  )

  const income = useMemo(() => totalIncome(transactions, range.start, range.end), [transactions, range])
  const expenses = useMemo(() => totalExpenses(transactions, range.start, range.end), [transactions, range])
  const net = income - expenses

  const categoryNameById = useMemo(() => {
    const map = new Map()
    categories.forEach((c) => map.set(c.id, c.name))
    return map
  }, [categories])

  // Same pre-filter-then-call-the-engine-function pattern budgetEngine.js
  // established (filter to one category, then hand the subset to
  // financialEngine.js's totalExpenses()) — applied here directly against
  // financialEngine.js since this section isn't tied to any one budget.
  const categoryBreakdown = useMemo(() => {
    const expenseCategories = categories.filter((c) => c.kind === 'expense')
    return expenseCategories
      .map((c) => {
        const categoryTransactions = transactions.filter((t) => t.category_id === c.id)
        const spent = totalExpenses(categoryTransactions, range.start, range.end)
        return { id: c.id, name: c.name, spent }
      })
      .filter((row) => row.spent > 0)
      .sort((a, b) => b.spent - a.spent)
  }, [categories, transactions, range])

  const accountActivity = useMemo(
    () =>
      accounts.map((a) => {
        const count = periodTransactions.filter((t) => t.account_id === a.id || t.to_account_id === a.id).length
        return { ...a, balance: accountBalance(transactions, a.id), count }
      }),
    [accounts, transactions, periodTransactions]
  )

  // Was previously re-deriving this percent inline (progress/target*100,
  // clamped) instead of calling goalEngine.js's own progressPercent() —
  // the exact "hand-rolled sum instead of the engine function" mistake the
  // frozen spec calls out from Charts.jsx during v1. Fixed in Phase 22
  // audit: this now calls the real engine function, same as GoalCard.jsx.
  const goalRows = useMemo(
    () =>
      goals.map((g) => {
        const progress = goalProgress(goalContributions, g.id)
        const { percent } = progressPercent(progress, g.target_amount)
        return { ...g, progress, percent }
      }),
    [goals, goalContributions]
  )

  // Budgets are monthly-only and each carries its own period_start/period_end
  // — deliberately not re-sliced by the Reports page's own period picker, so
  // a budget's figures always match what Settings/Budgets shows for it,
  // regardless of which report range is currently selected.
  const budgetRows = useMemo(
    () =>
      budgets.map((b) => ({
        ...b,
        categoryName: categoryNameById.get(b.category_id) || 'Unknown category',
        spent: budgetSpent(transactions, b),
        remaining: budgetRemaining(transactions, b),
        percent: budgetPercentUsed(transactions, b),
        over: isBudgetOverAmount(transactions, b),
      })),
    [budgets, transactions, categoryNameById]
  )

  const handleExportTransactions = () => {
    const columns = [
      { key: 'transaction_date', label: 'Date' },
      { key: 'type', label: 'Type' },
      { key: 'description', label: 'Description' },
      { key: 'amount', label: 'Amount' },
      { key: 'account', label: 'Account' },
      { key: 'category', label: 'Category' },
    ]
    const accountNameById = new Map(accounts.map((a) => [a.id, a.name]))
    const rows = periodTransactions.map((t) => ({
      ...t,
      account: accountNameById.get(t.account_id) || '',
      category: categoryNameById.get(t.category_id) || '',
    }))
    downloadCsv(`countwise-transactions-${range.start}-to-${range.end}.csv`, toCsv(rows, columns))
  }

  if (loading) {
    return (
      <div className="min-h-screen bg-paper dark:bg-charcoal p-6 sm:p-8">
        <PageHeader name={profile?.username} />
        <p className="mt-8 text-sm text-muted dark:text-mutedDark">Loading your report...</p>
      </div>
    )
  }

  return (
    <div className="min-h-screen bg-paper dark:bg-charcoal p-6 sm:p-8 pb-24 max-w-4xl">
      <PageHeader name={profile?.username} />

      {error && <ErrorState message={error} onRetry={load} />}

      <div className="mt-8">
        <PeriodPicker
          periods={PERIODS}
          periodKey={periodKey}
          onChange={setPeriodKey}
          label="Report period"
          rangeLabel={`${formatShortDate(range.start)} — ${formatShortDate(range.end)}`}
        />
      </div>

      <div className="mt-8 flex items-center justify-between">
        <h2 className="font-display text-lg font-semibold text-ink dark:text-offwhite">Summary</h2>
        <Button
          variant="text"
          onClick={handleExportTransactions}
          className="flex items-center gap-1.5 text-xs font-medium"
        >
          <Download size={13} />
          Export this period's transactions (CSV)
        </Button>
      </div>
      <div className="mt-3 overflow-x-auto">
        <table className="w-full min-w-[20rem] text-sm">
          <tbody className="divide-y divide-line dark:divide-lineDark">
            <tr>
              <td className="py-2 text-muted dark:text-mutedDark">Income</td>
              <td className="py-2 text-right font-mono text-good">{formatCurrency(income)}</td>
            </tr>
            <tr>
              <td className="py-2 text-muted dark:text-mutedDark">Expenses</td>
              <td className="py-2 text-right font-mono text-bad">{formatCurrency(expenses)}</td>
            </tr>
            <tr>
              <td className="py-2 text-ink dark:text-offwhite font-medium">Net cash flow</td>
              <td className={`py-2 text-right font-mono font-medium ${net < 0 ? 'text-bad' : 'text-good'}`}>{formatCurrency(net)}</td>
            </tr>
          </tbody>
        </table>
      </div>

      <section className="mt-10">
        <h2 className="font-display text-lg font-semibold text-ink dark:text-offwhite">Category spending</h2>
        {categoryBreakdown.length === 0 ? (
          <EmptyState message="No expense data in this period." className="py-6" />
        ) : (
          <div className="mt-3 overflow-x-auto">
            <table className="w-full min-w-[24rem] text-sm">
              <thead>
                <tr>{th('Category')}{th('Spent')}{th('% of expenses')}</tr>
              </thead>
              <tbody className="divide-y divide-line dark:divide-lineDark">
                {categoryBreakdown.map((row) => (
                  <tr key={row.id}>
                    <td className="py-2 pr-4">
                      <span className={`text-xs font-medium px-2 py-0.5 rounded-full ${categoryPillClasses(row.name)}`}>{row.name}</span>
                    </td>
                    <td className="py-2 pr-4 font-mono">{formatCurrency(row.spent)}</td>
                    <td className="py-2 font-mono text-muted dark:text-mutedDark">
                      {expenses > 0 ? `${((row.spent / expenses) * 100).toFixed(0)}%` : '—'}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>

      <section className="mt-10">
        <h2 className="font-display text-lg font-semibold text-ink dark:text-offwhite">Account activity</h2>
        {accountActivity.length === 0 ? (
          <EmptyState message="No accounts yet." className="py-6" />
        ) : (
          <div className="mt-3 overflow-x-auto">
            <table className="w-full min-w-[26rem] text-sm">
              <thead>
                <tr>{th('Account')}{th('Balance')}{th('Transactions this period')}</tr>
              </thead>
              <tbody className="divide-y divide-line dark:divide-lineDark">
                {accountActivity.map((a) => (
                  <tr key={a.id}>
                    <td className="py-2 pr-4">
                      {a.name}
                      {!a.is_active && <span className="ml-1.5 text-xs text-muted dark:text-mutedDark">(deactivated)</span>}
                    </td>
                    <td className="py-2 pr-4 font-mono">{formatCurrency(a.balance)}</td>
                    <td className="py-2 font-mono text-muted dark:text-mutedDark">{a.count}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>

      <section className="mt-10">
        <h2 className="font-display text-lg font-semibold text-ink dark:text-offwhite">Goal allocations</h2>
        {goalRows.length === 0 ? (
          <EmptyState message="Nothing you're saving toward yet." className="py-6" />
        ) : (
          <div className="mt-3 overflow-x-auto">
            <table className="w-full min-w-[32rem] text-sm">
              <thead>
                <tr>{th('Goal')}{th('Target')}{th('Progress')}{th('% complete')}</tr>
              </thead>
              <tbody className="divide-y divide-line dark:divide-lineDark">
                {goalRows.map((g) => (
                  <tr key={g.id}>
                    <td className="py-2 pr-4">
                      {g.name}
                      {g.status !== 'active' && <span className="ml-1.5 text-xs text-muted dark:text-mutedDark">({g.status})</span>}
                    </td>
                    <td className="py-2 pr-4 font-mono">{formatCurrency(g.target_amount)}</td>
                    <td className="py-2 pr-4 font-mono">{formatCurrency(g.progress)}</td>
                    <td className="py-2 font-mono text-muted dark:text-mutedDark">{g.percent.toFixed(0)}%</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>

      <section className="mt-10">
        <h2 className="font-display text-lg font-semibold text-ink dark:text-offwhite">Budget performance</h2>
        {budgetRows.length === 0 ? (
          <EmptyState message="No budgets set yet." className="py-6" />
        ) : (
          <div className="mt-3 overflow-x-auto">
            <table className="w-full min-w-[36rem] text-sm">
              <thead>
                <tr>{th('Category')}{th('Month')}{th('Spent')}{th('Remaining')}{th('% used')}</tr>
              </thead>
              <tbody className="divide-y divide-line dark:divide-lineDark">
                {budgetRows.map((b) => (
                  <tr key={b.id}>
                    <td className="py-2 pr-4">
                      <span className={`text-xs font-medium px-2 py-0.5 rounded-full ${categoryPillClasses(b.categoryName)}`}>{b.categoryName}</span>
                    </td>
                    <td className="py-2 pr-4 text-muted dark:text-mutedDark">{b.period_start.slice(0, 7)}</td>
                    <td className="py-2 pr-4 font-mono">{formatCurrency(b.spent)}</td>
                    <td className={`py-2 pr-4 font-mono ${b.over ? 'text-bad' : ''}`}>
                      {b.over ? `${formatCurrency(Math.abs(b.remaining))} over` : formatCurrency(b.remaining)}
                    </td>
                    <td className={`py-2 font-mono ${b.over ? 'text-bad' : 'text-muted dark:text-mutedDark'}`}>{b.percent.toFixed(0)}%</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>
    </div>
  )
}
