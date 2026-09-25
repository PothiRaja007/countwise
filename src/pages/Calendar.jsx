import { useEffect, useMemo, useState } from 'react'
import { ChevronLeft, ChevronRight, Plus } from 'lucide-react'
import { supabase } from '../lib/supabaseClient.js'
import { useAuth } from '../lib/AuthContext.jsx'
import { budgetSpent } from '../lib/budgetEngine.js'
import { formatCurrency } from '../lib/format.js'
import { categoryPillClasses } from '../lib/categoryColors.js'
import PageHeader from '../components/layout/PageHeader.jsx'
import ErrorState from '../components/layout/ErrorState.jsx'
import MoneyInboxInput from '../components/money-inbox/MoneyInboxInput.jsx'
import Button from '../components/ui/Button.jsx'
import EmptyState from '../components/ui/EmptyState.jsx'
import { friendlyError } from '../lib/errorMessages.js'

const WEEKDAY_LABELS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat']

// Local Y/M/D formatting — matches transaction_date/dateParser.js's own
// convention. toISOString() is deliberately avoided since it's UTC-based
// and can shift the calendar date near midnight in the user's timezone.
function toISODate(date) {
  const y = date.getFullYear()
  const m = String(date.getMonth() + 1).padStart(2, '0')
  const d = String(date.getDate()).padStart(2, '0')
  return `${y}-${m}-${d}`
}

function monthLabel(date) {
  return date.toLocaleDateString('en-IN', { month: 'long', year: 'numeric' })
}

// Calendar-grid arithmetic only (which weekday a month starts on, how many
// days it has) — unrelated to dateParser.js's job of parsing natural-
// language date phrases out of free text, so this doesn't overlap with it.
function buildMonthGrid(year, month) {
  const firstOfMonth = new Date(year, month, 1)
  const daysInMonth = new Date(year, month + 1, 0).getDate()
  const startWeekday = firstOfMonth.getDay()

  const cells = []
  for (let i = 0; i < startWeekday; i++) cells.push(null)
  for (let day = 1; day <= daysInMonth; day++) cells.push(new Date(year, month, day))
  return cells
}

export default function Calendar() {
  const { user, profile } = useAuth()
  const [monthCursor, setMonthCursor] = useState(() => {
    const now = new Date()
    return new Date(now.getFullYear(), now.getMonth(), 1)
  })

  const [transactions, setTransactions] = useState([])
  const [categories, setCategories] = useState([])
  const [accounts, setAccounts] = useState([])
  const [goals, setGoals] = useState([])
  const [goalContributions, setGoalContributions] = useState([])
  const [budgets, setBudgets] = useState([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(null)

  const [selectedDate, setSelectedDate] = useState(() => toISODate(new Date()))
  const [inboxOpen, setInboxOpen] = useState(false)

  const load = async () => {
    setLoading(true)
    setError(null)

    const [transactionsRes, categoriesRes, accountsRes, goalsRes, contributionsRes, budgetsRes] = await Promise.all([
      supabase
        .from('transactions')
        .select('id, account_id, to_account_id, category_id, type, amount, description, transaction_date')
        .eq('user_id', user.id),
      supabase.from('categories').select('id, name').or(`user_id.eq.${user.id},user_id.is.null`),
      supabase.from('accounts').select('id, name').eq('user_id', user.id),
      supabase.from('goals').select('id, name, target_date, status').eq('user_id', user.id),
      supabase.from('goal_contributions').select('id, goal_id, amount, type, contribution_date').eq('user_id', user.id),
      // Budgets/budgetEngine.js are Phase 17's, read-only here. If that
      // phase isn't fully landed yet, degrade to an empty list rather
      // than failing the whole page.
      supabase.from('budgets').select('id, category_id, amount, period_start, period_end').eq('user_id', user.id),
    ])

    setLoading(false)

    const firstError = transactionsRes.error || categoriesRes.error || accountsRes.error || goalsRes.error || contributionsRes.error
    if (firstError) {
      setError(friendlyError(firstError, "Couldn't load your calendar. Please try again."))
      return
    }

    setTransactions(transactionsRes.data || [])
    setCategories(categoriesRes.data || [])
    setAccounts(accountsRes.data || [])
    setGoals(goalsRes.data || [])
    setGoalContributions(contributionsRes.data || [])
    setBudgets(budgetsRes.error ? [] : budgetsRes.data || [])
  }

  useEffect(() => {
    if (user) load()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user])

  const categoryNameById = useMemo(() => {
    const map = new Map()
    categories.forEach((c) => map.set(c.id, c.name))
    return map
  }, [categories])

  const accountNameById = useMemo(() => {
    const map = new Map()
    accounts.forEach((a) => map.set(a.id, a.name))
    return map
  }, [accounts])

  // date string -> activity summary, for the grid's dots
  const activityByDate = useMemo(() => {
    const map = new Map()
    const bump = (dateStr) => map.set(dateStr, (map.get(dateStr) || 0) + 1)
    transactions.forEach((t) => bump(t.transaction_date))
    goals.forEach((g) => g.target_date && bump(g.target_date))
    goalContributions.forEach((c) => bump(c.contribution_date))
    return map
  }, [transactions, goals, goalContributions])

  const year = monthCursor.getFullYear()
  const month = monthCursor.getMonth()
  const gridCells = useMemo(() => buildMonthGrid(year, month), [year, month])

  const selectedDayTransactions = useMemo(
    () => transactions.filter((t) => t.transaction_date === selectedDate),
    [transactions, selectedDate]
  )
  const selectedDayGoalTargets = useMemo(() => goals.filter((g) => g.target_date === selectedDate), [goals, selectedDate])

  // Budgets are monthly, not per-day — "period context" means: which of
  // this user's budgets cover the month currently on screen. Spent/left
  // figures come straight from budgetEngine.js, never recomputed here.
  const budgetsThisMonth = useMemo(() => {
    const monthStart = toISODate(new Date(year, month, 1))
    const monthEnd = toISODate(new Date(year, month + 1, 0))
    return budgets.filter((b) => b.period_start <= monthEnd && b.period_end >= monthStart)
  }, [budgets, year, month])

  const goToToday = () => {
    const now = new Date()
    setMonthCursor(new Date(now.getFullYear(), now.getMonth(), 1))
    setSelectedDate(toISODate(now))
  }

  if (loading) {
    return (
      <div className="min-h-screen bg-paper dark:bg-charcoal p-6 sm:p-8 text-ink dark:text-offwhite">
        <PageHeader name={profile?.username} />
        <p className="mt-10 text-sm text-muted dark:text-mutedDark">Loading...</p>
      </div>
    )
  }

  if (error) {
    return (
      <div className="min-h-screen bg-paper dark:bg-charcoal p-6 sm:p-8 text-ink dark:text-offwhite">
        <PageHeader name={profile?.username} />
        <div className="mt-10">
          <ErrorState message={error} onRetry={load} />
        </div>
      </div>
    )
  }

  return (
    <div className="min-h-screen bg-paper dark:bg-charcoal p-6 sm:p-8 text-ink dark:text-offwhite">
      <PageHeader name={profile?.username} />

      <div className="mt-10 max-w-4xl">
        <p className="text-xs uppercase tracking-[0.14em] text-muted dark:text-mutedDark">Home</p>
        <h1 className="font-display text-3xl sm:text-4xl font-semibold tracking-tight mt-2">Calendar</h1>

        {budgetsThisMonth.length > 0 && (
          <div className="mt-4 flex flex-wrap gap-x-6 gap-y-1 text-xs">
            {budgetsThisMonth.map((b) => (
              <div key={b.id} className="flex items-baseline gap-1.5">
                <span className="text-muted dark:text-mutedDark">{categoryNameById.get(b.category_id) || 'Budget'}</span>
                <span className="font-mono text-ink dark:text-offwhite">
                  {formatCurrency(budgetSpent(transactions, b))} / {formatCurrency(b.amount)}
                </span>
              </div>
            ))}
          </div>
        )}

        <div className="mt-6 grid grid-cols-1 md:grid-cols-[1fr_20rem] gap-8">
          <div>
            <div className="flex items-center justify-between mb-4">
              <div className="flex items-center gap-1">
                <button
                  onClick={() => setMonthCursor(new Date(year, month - 1, 1))}
                  aria-label="Previous month"
                  className="p-1.5 rounded hover:bg-surface dark:hover:bg-charcoalSurface text-muted dark:text-mutedDark"
                >
                  <ChevronLeft size={16} />
                </button>
                <span className="text-sm font-medium min-w-[9rem] text-center">{monthLabel(monthCursor)}</span>
                <button
                  onClick={() => setMonthCursor(new Date(year, month + 1, 1))}
                  aria-label="Next month"
                  className="p-1.5 rounded hover:bg-surface dark:hover:bg-charcoalSurface text-muted dark:text-mutedDark"
                >
                  <ChevronRight size={16} />
                </button>
              </div>
              <Button variant="text" onClick={goToToday} className="text-xs">
                Today
              </Button>
            </div>

            <div className="grid grid-cols-7 text-center text-xs text-muted dark:text-mutedDark mb-1">
              {WEEKDAY_LABELS.map((d) => (
                <div key={d} className="py-1">
                  {d}
                </div>
              ))}
            </div>

            <div className="grid grid-cols-7 border-t border-l border-line dark:border-lineDark">
              {gridCells.map((date, i) => {
                if (!date) {
                  return <div key={`blank-${i}`} className="border-r border-b border-line dark:border-lineDark aspect-square" />
                }
                const dateStr = toISODate(date)
                const hasActivity = activityByDate.has(dateStr)
                const isSelected = dateStr === selectedDate
                const isToday = dateStr === toISODate(new Date())

                return (
                  <button
                    key={dateStr}
                    onClick={() => setSelectedDate(dateStr)}
                    className={`relative border-r border-b border-line dark:border-lineDark aspect-square flex flex-col items-center justify-center text-sm transition-colors ${
                      isSelected
                        ? 'bg-gold/10 text-gold font-medium'
                        : isToday
                        ? 'text-ink dark:text-offwhite font-medium'
                        : 'text-ink dark:text-offwhite hover:bg-surface dark:hover:bg-charcoalSurface'
                    }`}
                  >
                    {date.getDate()}
                    {hasActivity && <span className="absolute bottom-1.5 w-1 h-1 rounded-full bg-gold" />}
                  </button>
                )
              })}
            </div>
          </div>

          <div>
            <div className="flex items-center justify-between mb-3">
              <h2 className="text-sm font-medium">
                {new Date(selectedDate).toLocaleDateString('en-IN', { weekday: 'short', day: 'numeric', month: 'short' })}
              </h2>
              <Button
                variant="text"
                onClick={() => setInboxOpen(true)}
                className="flex items-center gap-1 text-xs"
              >
                <Plus size={13} /> Add
              </Button>
            </div>

            {selectedDayGoalTargets.map((g) => (
              <p key={g.id} className="text-xs text-muted dark:text-mutedDark mb-2">
                Goal target: <span className="text-ink dark:text-offwhite">{g.name}</span>
              </p>
            ))}

            {selectedDayTransactions.length === 0 ? (
              <EmptyState message="No transactions this day." />
            ) : (
              <div className="divide-y divide-line dark:divide-lineDark">
                {selectedDayTransactions.map((t) => (
                  <CalendarTransactionRow
                    key={t.id}
                    transaction={t}
                    categoryName={categoryNameById.get(t.category_id)}
                    accountName={accountNameById.get(t.account_id)}
                    toAccountName={accountNameById.get(t.to_account_id)}
                  />
                ))}
              </div>
            )}
          </div>
        </div>
      </div>

      {inboxOpen && (
        <MoneyInboxInput
          initialDate={selectedDate}
          onClose={() => setInboxOpen(false)}
          onSaved={() => {
            setInboxOpen(false)
            load()
          }}
        />
      )}
    </div>
  )
}

// Same visual language as Transactions.jsx/Overview.jsx's transaction
// rows (category pill + description/account + signed amount) — kept as
// a small local component here rather than modifying Transactions.jsx
// just to export its private row component for one page.
function CalendarTransactionRow({ transaction, categoryName, accountName, toAccountName }) {
  const isTransfer = transaction.type === 'transfer'
  const isIncome = transaction.type === 'income'
  const amountClass = isTransfer ? 'text-ink dark:text-offwhite' : isIncome ? 'text-good' : 'text-bad'
  const sign = isTransfer ? '' : isIncome ? '+' : '-'
  const pillLabel = isTransfer ? 'Transfer' : categoryName || (isIncome ? 'Income' : 'Expense')

  return (
    <div className="flex items-center justify-between py-2.5 gap-2">
      <div className="flex items-center gap-2 min-w-0">
        <span className={`text-xs font-medium px-2 py-1 rounded-md shrink-0 ${categoryPillClasses(pillLabel)}`}>
          {pillLabel}
        </span>
        <div className="min-w-0 text-sm text-ink dark:text-offwhite truncate">
          {transaction.description || (isTransfer ? `${accountName} → ${toAccountName}` : accountName)}
        </div>
      </div>
      <div className={`font-mono text-sm shrink-0 ${amountClass}`}>
        {sign}
        {formatCurrency(transaction.amount)}
      </div>
    </div>
  )
}
