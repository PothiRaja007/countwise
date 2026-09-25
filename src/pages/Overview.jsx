import { useEffect, useMemo, useState } from 'react'
import { LineChart, Line, XAxis, YAxis, CartesianGrid, ResponsiveContainer, Tooltip } from 'recharts'
import { Star } from 'lucide-react'
import { supabase } from '../lib/supabaseClient.js'
import { useAuth } from '../lib/AuthContext.jsx'
import { totalBalance, totalIncome, totalExpenses, goalProgress, accountBalance } from '../lib/financialEngine.js'
import { computeBehaviorScore } from '../lib/behaviorScore.js'
import { formatCurrency } from '../lib/format.js'
import { categoryPillClasses } from '../lib/categoryColors.js'
import PageHeader from '../components/layout/PageHeader.jsx'
import ErrorState from '../components/layout/ErrorState.jsx'
import MoneyInboxInput from '../components/money-inbox/MoneyInboxInput.jsx'
import EmptyState from '../components/ui/EmptyState.jsx'
import { friendlyError } from '../lib/errorMessages.js'

const RHYTHM_PERIODS = [
  { key: '7D', label: '7D', days: 7 },
  { key: '30D', label: '30D', days: 30 },
  { key: '3M', label: '3M', days: 90 },
  { key: '6M', label: '6M', days: 180 },
  { key: '1Y', label: '1Y', days: 365 },
]

function toISODate(date) {
  const y = date.getFullYear()
  const m = String(date.getMonth() + 1).padStart(2, '0')
  const d = String(date.getDate()).padStart(2, '0')
  return `${y}-${m}-${d}`
}

function addDays(date, days) {
  const d = new Date(date)
  d.setDate(d.getDate() + days)
  return d
}

function currentMonthRange() {
  const now = new Date()
  const start = new Date(now.getFullYear(), now.getMonth(), 1)
  const end = new Date(now.getFullYear(), now.getMonth() + 1, 0)
  return { start: toISODate(start), end: toISODate(end) }
}

// Evenly spaced sample dates across the period, always including today as
// the final point. Sampling (rather than one point per day) keeps a 1Y
// chart readable and keeps the totalBalance() recompute cheap.
function sampleDates(days, maxPoints = 10) {
  const today = new Date()
  const start = addDays(today, -days)
  const points = Math.min(maxPoints, days + 1)
  const step = days / (points - 1)
  const dates = []
  for (let i = 0; i < points; i++) {
    dates.push(toISODate(addDays(start, Math.round(step * i))))
  }
  return dates
}

function dateLabel(isoDate, todayISO, yesterdayISO) {
  if (isoDate === todayISO) return 'Today'
  if (isoDate === yesterdayISO) return 'Yesterday'
  const d = new Date(isoDate)
  return d.toLocaleDateString('en-IN', { day: 'numeric', month: 'short' })
}

export default function Overview() {
  const { user, profile } = useAuth()
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(null)
  const [accounts, setAccounts] = useState([])
  const [transactions, setTransactions] = useState([])
  const [categories, setCategories] = useState([])
  const [goals, setGoals] = useState([])
  const [allGoals, setAllGoals] = useState([])
  const [goalContributions, setGoalContributions] = useState([])
  const [rhythmPeriod, setRhythmPeriod] = useState('30D')
  const [refreshTick, setRefreshTick] = useState(0)

  useEffect(() => {
    if (!user) return
    let cancelled = false

    async function load() {
      setLoading(true)
      setError(null)

      const [accountsRes, transactionsRes, categoriesRes, goalsRes, allGoalsRes, contributionsRes] = await Promise.all([
        supabase.from('accounts').select('id, name, type').eq('user_id', user.id).eq('is_active', true),
        supabase
          .from('transactions')
          .select('id, account_id, to_account_id, category_id, type, amount, description, transaction_date, original_input')
          .eq('user_id', user.id)
          .order('transaction_date', { ascending: false }),
        supabase.from('categories').select('id, name').or(`user_id.eq.${user.id},user_id.is.null`),
        supabase
          .from('goals')
          .select('id, name, target_amount, target_date, status')
          .eq('user_id', user.id)
          .eq('status', 'active')
          .order('updated_at', { ascending: false })
          .limit(3),
        // Separate from the capped card query above — the Behavior Score
        // needs the true count of active goals, not just the 3 shown here.
        supabase.from('goals').select('id, status').eq('user_id', user.id),
        supabase.from('goal_contributions').select('goal_id, account_id, amount, type, contribution_date').eq('user_id', user.id),
      ])

      if (cancelled) return

      const firstError =
        accountsRes.error || transactionsRes.error || categoriesRes.error || goalsRes.error || allGoalsRes.error || contributionsRes.error
      if (firstError) {
        setError(friendlyError(firstError, "Couldn't load your overview. Please try again."))
        setLoading(false)
        return
      }

      setAccounts(accountsRes.data || [])
      setTransactions(transactionsRes.data || [])
      setCategories(categoriesRes.data || [])
      setGoals(goalsRes.data || [])
      setAllGoals(allGoalsRes.data || [])
      setGoalContributions(contributionsRes.data || [])
      setLoading(false)
    }

    load()
    return () => {
      cancelled = true
    }
  }, [user, refreshTick])

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

  // Total Balance is cumulative net worth as of right now, so it's computed
  // from the full transaction history — never period-limited. Only Income
  // and Expenses are scoped to the current month, matching what the
  // Financial Snapshot is meant to show.
  const balance = useMemo(() => totalBalance(transactions, accounts), [transactions, accounts])
  const { start: monthStart, end: monthEnd } = useMemo(() => currentMonthRange(), [])
  const monthIncome = useMemo(() => totalIncome(transactions, monthStart, monthEnd), [transactions, monthStart, monthEnd])
  const monthExpenses = useMemo(() => totalExpenses(transactions, monthStart, monthEnd), [transactions, monthStart, monthEnd])

  const rhythmData = useMemo(() => {
    const period = RHYTHM_PERIODS.find((p) => p.key === rhythmPeriod)
    const dates = sampleDates(period.days)
    return dates.map((isoDate) => ({
      date: isoDate,
      label: new Date(isoDate).toLocaleDateString('en-IN', { day: 'numeric', month: 'short' }),
      balance: totalBalance(
        transactions.filter((t) => t.transaction_date <= isoDate),
        accounts
      ),
    }))
  }, [transactions, accounts, rhythmPeriod])

  const behaviorScore = useMemo(
    () =>
      computeBehaviorScore({
        transactions,
        goals: allGoals,
        goalContributions,
        periodStart: monthStart,
        periodEnd: monthEnd,
      }),
    [transactions, allGoals, goalContributions, monthStart, monthEnd]
  )

  const recentTransactions = useMemo(() => transactions.slice(0, 5), [transactions])

  const goalsWithProgress = useMemo(
    () =>
      goals.map((g) => {
        const progress = goalProgress(goalContributions, g.id)
        const pct = g.target_amount > 0 ? Math.min(100, Math.max(0, (progress / g.target_amount) * 100)) : 0
        return { ...g, progress, pct }
      }),
    [goals, goalContributions]
  )

  const todayISO = toISODate(new Date())
  const yesterdayISO = toISODate(addDays(new Date(), -1))

  return (
    <div className="p-6 sm:p-8 space-y-10 bg-paper dark:bg-charcoal min-h-screen">
      {/* 1. Greeting */}
      <PageHeader name={profile?.username} />

      {/* 2. Money Inbox — the one deliberately prominent bordered panel.
          Rendered unconditionally, above the loading/error gate below, so
          a reload of Overview's own data — including the reload Money
          Inbox itself triggers via onSaved after a save — never unmounts
          and remounts this component, which would otherwise wipe out
          whatever text/review state was still in progress. */}
      <MoneyInboxInput embedded onSaved={() => setRefreshTick((t) => t + 1)} />

      {loading ? (
        <p className="text-sm text-muted dark:text-mutedDark">Loading your overview...</p>
      ) : error ? (
        <ErrorState message={error} onRetry={() => setRefreshTick((t) => t + 1)} />
      ) : (
        <>
          {/* 3. Financial Snapshot — one unified strip, thin dividers, no cards */}
          <div>
            <div className="flex flex-col sm:flex-row divide-y sm:divide-y-0 sm:divide-x divide-line dark:divide-lineDark border-t border-b border-line dark:border-lineDark">
              <SnapshotItem label="Total Balance" value={balance} accent />
              <SnapshotItem label="Income (this month)" value={monthIncome} tone="good" />
              <SnapshotItem label="Expenses (this month)" value={monthExpenses} tone="bad" />
            </div>

            {/* Compact Wallet/Bank visibility (Phase 16, §6.3) — full management
                lives in Settings→Accounts; this is just a glance view, so it
                stays part of the same Snapshot strip rather than a new card. */}
            {accounts.length > 0 && (
              <div className="flex flex-wrap gap-x-6 gap-y-1.5 mt-3">
                {accounts.map((a) => (
                  <div key={a.id} className="flex items-baseline gap-1.5 text-xs">
                    <span className="text-muted dark:text-mutedDark">{a.name}</span>
                    <span className="font-mono text-ink dark:text-offwhite">{formatCurrency(accountBalance(transactions, a.id))}</span>
                  </div>
                ))}
              </div>
            )}
          </div>

          {/* 4. Financial Rhythm + Behavior Score, split by one thin divider */}
          <div className="grid grid-cols-1 md:grid-cols-3 divide-y md:divide-y-0 md:divide-x divide-line dark:divide-lineDark">
            <div className="md:col-span-2 md:pr-8 pb-8 md:pb-0">
              <div className="flex items-center justify-between mb-4">
                <h2 className="text-xs font-medium text-muted dark:text-mutedDark uppercase tracking-wide">
                  Financial Rhythm
                </h2>
                <div className="flex gap-1">
                  {RHYTHM_PERIODS.map((p) => (
                    <button
                      key={p.key}
                      onClick={() => setRhythmPeriod(p.key)}
                      className={`px-2 py-1 text-xs rounded-md transition-colors ${
                        rhythmPeriod === p.key
                          ? 'bg-gold/10 text-gold font-medium'
                          : 'text-muted dark:text-mutedDark hover:bg-surface dark:hover:bg-charcoalSurface'
                      }`}
                    >
                      {p.label}
                    </button>
                  ))}
                </div>
              </div>
              <ResponsiveContainer width="100%" height={220}>
                <LineChart data={rhythmData}>
                  <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="currentColor" opacity={0.1} />
                  <XAxis dataKey="label" fontSize={11} tick={{ fill: 'currentColor', opacity: 0.5 }} axisLine={false} tickLine={false} />
                  <YAxis fontSize={11} tick={{ fill: 'currentColor', opacity: 0.5 }} axisLine={false} tickLine={false} width={70} tickFormatter={(v) => formatCurrency(v)} />
                  <Tooltip formatter={(v) => formatCurrency(v)} labelFormatter={() => ''} contentStyle={{ fontSize: 12, fontFamily: 'Inter, sans-serif' }} />
                  <Line type="monotone" dataKey="balance" stroke="#C89D4B" strokeWidth={2} dot={false} />
                </LineChart>
              </ResponsiveContainer>
            </div>

            <div className="md:pl-8 pt-8 md:pt-0">
              <h2 className="text-xs font-medium text-muted dark:text-mutedDark uppercase tracking-wide mb-4">
                Behavior Score
              </h2>
              {behaviorScore.sufficientData ? (
                <>
                  <div className="flex items-center gap-2 mb-2">
                    <div className="flex items-center gap-0.5" aria-label={`${behaviorScore.stars} out of 5 stars`}>
                      {[1, 2, 3, 4, 5].map((star) => (
                        <Star
                          key={star}
                          size={16}
                          strokeWidth={1.7}
                          className={star <= Math.round(behaviorScore.stars) ? 'fill-gold text-gold' : 'text-line dark:text-lineDark'}
                        />
                      ))}
                    </div>
                    <span className="font-mono text-sm text-muted dark:text-mutedDark">{behaviorScore.stars.toFixed(1)} / 5</span>
                  </div>
                  <p className="text-sm text-muted dark:text-mutedDark">
                    {behaviorScore.flags[0]?.description || 'No notable patterns flagged this month.'}
                  </p>
                </>
              ) : (
                <EmptyState message="We're still learning your pattern." />
              )}
            </div>
          </div>

          {/* 5. Recent Transactions + Goals, two columns */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
            <div>
              <h2 className="text-xs font-medium text-muted dark:text-mutedDark uppercase tracking-wide mb-3">
                Recent Transactions
              </h2>
              {recentTransactions.length === 0 ? (
                <EmptyState message="Your money story starts here." />
              ) : (
                <div className="divide-y divide-line dark:divide-lineDark">
                  {recentTransactions.map((t) => (
                    <TransactionRow
                      key={t.id}
                      transaction={t}
                      categoryName={categoryNameById.get(t.category_id)}
                      accountName={accountNameById.get(t.account_id)}
                      toAccountName={t.to_account_id ? accountNameById.get(t.to_account_id) : null}
                      label={dateLabel(t.transaction_date, todayISO, yesterdayISO)}
                    />
                  ))}
                </div>
              )}
            </div>

            <div>
              <h2 className="text-xs font-medium text-muted dark:text-mutedDark uppercase tracking-wide mb-3">Goals</h2>
              {goalsWithProgress.length === 0 ? (
                <EmptyState message="Nothing you're saving toward yet." />
              ) : (
                <div className="space-y-4">
                  {goalsWithProgress.map((g) => (
                    <div key={g.id}>
                      <div className="flex justify-between text-sm mb-1.5">
                        <span className="text-ink dark:text-offwhite">{g.name}</span>
                        <span className="font-mono text-muted dark:text-mutedDark">
                          {formatCurrency(g.progress)} / {formatCurrency(g.target_amount)}
                        </span>
                      </div>
                      <div className="h-1.5 rounded-full bg-line dark:bg-lineDark overflow-hidden">
                        <div className="h-full bg-gold rounded-full" style={{ width: `${g.pct}%` }} />
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>
        </>
      )}
    </div>
  )
}

// Balance is the one fact this whole page exists to answer, so it's the
// only figure sized to dominate — everything else in the Snapshot strip
// (Income, Expenses) is a supporting number, not a second headline. Per
// §6.8's hierarchy (balance -> supporting income/expense -> rhythm ->
// activity -> interpretive), this is the one place on the page where three
// numbers previously shared identical size/weight (text-2xl font-semibold)
// and needed to stop doing that.
function SnapshotItem({ label, value, tone, accent }) {
  const toneClass = tone === 'good' ? 'text-good' : tone === 'bad' ? 'text-bad' : accent ? 'text-gold' : 'text-ink dark:text-offwhite'
  // The larger jump waits for md: (768px+) rather than firing at sm:
  // (640px) — verified live that a large (7-figure) balance at 36px
  // doesn't comfortably fit this row's three-column share right at 640px.
  const valueClass = accent ? 'text-3xl md:text-4xl font-bold' : 'text-xl font-medium'
  return (
    // min-w-0 overrides the flex item's default min-width:auto so these
    // items can actually shrink per flex-1's own intent instead of
    // forcing the row past its container — verified this keeps the page
    // itself from ever scrolling horizontally, at every width tested.
    // break-words on the value is a belt-and-suspenders fallback: a
    // currency string has no natural break point, and for an unusually
    // long balance in the tightest part of the tablet range (~640-900px,
    // where even the original, smaller size was already only a few
    // pixels of margin from this same edge), this lets it wrap onto a
    // second line rather than visually bleed into the next column —
    // full digits stay visible either way, nothing gets truncated.
    <div className="flex-1 min-w-0 py-4 sm:px-6 first:sm:pl-0">
      <div className="text-xs font-medium text-muted dark:text-mutedDark uppercase tracking-wide mb-1.5">{label}</div>
      <div className={`font-mono ${valueClass} ${toneClass} break-words`}>{formatCurrency(value)}</div>
    </div>
  )
}

function TransactionRow({ transaction, categoryName, accountName, toAccountName, label }) {
  const isTransfer = transaction.type === 'transfer'
  const isIncome = transaction.type === 'income'
  const amountClass = isTransfer ? 'text-ink dark:text-offwhite' : isIncome ? 'text-good' : 'text-bad'
  const sign = isTransfer ? '' : isIncome ? '+' : '-'
  const pillLabel = isTransfer ? 'Transfer' : categoryName || (isIncome ? 'Income' : 'Expense')

  return (
    <div className="flex items-center justify-between py-3">
      <div className="flex items-center gap-3 min-w-0">
        <span className={`text-xs font-medium px-2 py-1 rounded-md shrink-0 ${categoryPillClasses(pillLabel)}`}>
          {pillLabel}
        </span>
        <span className="text-sm text-muted dark:text-mutedDark truncate">
          {isTransfer ? `${accountName} → ${toAccountName}` : accountName}
        </span>
      </div>
      <div className="text-right shrink-0 pl-3">
        <div className={`font-mono text-sm ${amountClass}`}>
          {sign}
          {formatCurrency(transaction.amount)}
        </div>
        <div className="font-mono text-xs text-muted dark:text-mutedDark">{label}</div>
      </div>
    </div>
  )
}
