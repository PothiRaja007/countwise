import { useEffect, useMemo, useState } from 'react'
import {
  Area,
  AreaChart,
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  Legend,
  Line,
  LineChart,
  Pie,
  PieChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts'
import { supabase } from '../lib/supabaseClient.js'
import { useAuth } from '../lib/AuthContext.jsx'
import { totalIncome, totalExpenses } from '../lib/financialEngine.js'
import { formatCurrency } from '../lib/format.js'
import PageHeader from '../components/layout/PageHeader.jsx'
import ErrorState from '../components/layout/ErrorState.jsx'
import { categoryPillClasses } from '../lib/categoryColors.js'
// Phase 19: these six were previously defined locally in this file. They
// now live in dateRange.js so Reports.jsx can reuse the exact same period
// logic instead of a second implementation. Pure functions, same behavior —
// nothing about the date math changed, only where it's defined.
import { PERIODS, toISODate, fromISODate, addDays, periodRange, previousRange, formatShortDate } from '../lib/dateRange.js'
// Phase 19: the period-selector markup below this file's Charts() component
// also now lives in a shared component for the same reason — see PeriodPicker.jsx.
import PeriodPicker from '../components/shared/PeriodPicker.jsx'
import EmptyState from '../components/ui/EmptyState.jsx'
import { friendlyError } from '../lib/errorMessages.js'

const CHART_COLORS = ['#C89D4B', '#3D8F5F', '#C24A42', '#5F789A', '#7A5C8A', '#4E8A84', '#9A7440', '#71804B']

function formatAxisDate(iso, periodDays) {
  const date = fromISODate(iso)
  if (periodDays > 180) return date.toLocaleDateString('en-IN', { month: 'short', year: '2-digit' })
  return date.toLocaleDateString('en-IN', { day: 'numeric', month: 'short' })
}

function tooltipCurrency(value) {
  return formatCurrency(Number(value || 0))
}

function ChartTooltip({ active, payload, label }) {
  if (!active || !payload?.length) return null
  return (
    <div className="bg-surface dark:bg-charcoalSurface border border-line dark:border-lineDark px-3 py-2 shadow-sm">
      <p className="text-xs text-muted dark:text-mutedDark mb-1">{label}</p>
      {payload.map((item) => (
        <div key={item.dataKey} className="flex items-center justify-between gap-5 text-xs">
          <span className="text-ink dark:text-offwhite">{item.name}</span>
          <span className="font-mono text-ink dark:text-offwhite">{tooltipCurrency(item.value)}</span>
        </div>
      ))}
    </div>
  )
}

function Section({ title, description, children }) {
  return (
    <section className="border-t border-line dark:border-lineDark pt-5">
      <div className="mb-5">
        <h2 className="font-display text-xl font-semibold text-ink dark:text-offwhite">{title}</h2>
        {description && <p className="text-sm text-muted dark:text-mutedDark mt-1">{description}</p>}
      </div>
      {children}
    </section>
  )
}

function Metric({ label, value, tone = 'neutral', detail }) {
  const valueClass = tone === 'good' ? 'text-good' : tone === 'bad' ? 'text-bad' : 'text-ink dark:text-offwhite'
  return (
    <div className="py-4 sm:px-5 first:sm:pl-0 last:sm:pr-0">
      <div className="text-xs font-medium uppercase tracking-wide text-muted dark:text-mutedDark mb-1.5">{label}</div>
      <div className={`font-mono text-xl sm:text-2xl font-semibold ${valueClass}`}>{formatCurrency(value)}</div>
      {detail && <div className="text-xs text-muted dark:text-mutedDark mt-1">{detail}</div>}
    </div>
  )
}

export default function Charts() {
  const { user, profile } = useAuth()
  const [transactions, setTransactions] = useState([])
  const [categories, setCategories] = useState([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(null)
  const [periodKey, setPeriodKey] = useState('30D')
  // Bumped by the error state's Retry action — the load itself lives inside
  // the effect (needs the same cancelled-guard every other page's load()
  // uses), so re-running it on demand goes through the same dependency-bump
  // pattern Overview.jsx already established, rather than duplicating a
  // second load path.
  const [refreshTick, setRefreshTick] = useState(0)

  useEffect(() => {
    if (!user) return
    let cancelled = false

    async function load() {
      setLoading(true)
      setError(null)

      const [transactionsRes, categoriesRes] = await Promise.all([
        supabase
          .from('transactions')
          .select('id, category_id, type, amount, description, transaction_date')
          .eq('user_id', user.id)
          .order('transaction_date', { ascending: true }),
        supabase.from('categories').select('id, name').or(`user_id.eq.${user.id},user_id.is.null`),
      ])

      if (cancelled) return

      const firstError = transactionsRes.error || categoriesRes.error
      if (firstError) {
        setError(friendlyError(firstError, "Couldn't load your charts. Please try again."))
        setLoading(false)
        return
      }

      setTransactions(transactionsRes.data || [])
      setCategories(categoriesRes.data || [])
      setLoading(false)
    }

    load()
    return () => {
      cancelled = true
    }
  }, [user, refreshTick])

  const categoryNameById = useMemo(() => {
    const map = new Map()
    categories.forEach((category) => map.set(category.id, category.name))
    return map
  }, [categories])

  const period = PERIODS.find((item) => item.key === periodKey) || PERIODS[0]
  const current = useMemo(() => periodRange(period.days), [period.days])
  const previous = useMemo(() => previousRange(period.days, current.start), [period.days, current.start])

  const currentTransactions = useMemo(
    () => transactions.filter((t) => t.transaction_date >= current.start && t.transaction_date <= current.end),
    [transactions, current]
  )

  const currentIncome = useMemo(() => totalIncome(transactions, current.start, current.end), [transactions, current])
  const currentExpenses = useMemo(() => totalExpenses(transactions, current.start, current.end), [transactions, current])
  const previousIncome = useMemo(() => totalIncome(transactions, previous.start, previous.end), [transactions, previous])
  const previousExpenses = useMemo(() => totalExpenses(transactions, previous.start, previous.end), [transactions, previous])
  const currentNet = currentIncome - currentExpenses
  const previousNet = previousIncome - previousExpenses

  const moneyFlowData = useMemo(() => {
    const dates = []
    for (let date = fromISODate(current.start); date <= fromISODate(current.end); date = addDays(date, 1)) {
      dates.push(toISODate(date))
    }

    const byDate = new Map()
    currentTransactions.forEach((t) => {
      const existing = byDate.get(t.transaction_date) || { income: 0, expenses: 0 }
      if (t.type === 'income') existing.income += Number(t.amount || 0)
      if (t.type === 'expense') existing.expenses += Number(t.amount || 0)
      byDate.set(t.transaction_date, existing)
    })

    return dates.map((date) => {
      const values = byDate.get(date) || { income: 0, expenses: 0 }
      return { date, label: formatAxisDate(date, period.days), income: values.income, expenses: values.expenses, net: values.income - values.expenses }
    })
  }, [current.start, current.end, currentTransactions, period.days])

  const spendingByCategory = useMemo(() => {
    const totals = new Map()
    currentTransactions.forEach((t) => {
      if (t.type !== 'expense') return
      const name = categoryNameById.get(t.category_id) || 'Uncategorized'
      totals.set(name, (totals.get(name) || 0) + Number(t.amount || 0))
    })
    return Array.from(totals.entries())
      .map(([name, value]) => ({ name, value }))
      .sort((a, b) => b.value - a.value)
  }, [currentTransactions, categoryNameById])

  const spendingTrend = useMemo(() => {
    const bucketCount = period.days <= 30 ? period.days : period.days <= 90 ? 12 : 12
    const bucketSize = Math.max(1, Math.ceil(period.days / bucketCount))
    const startDate = fromISODate(current.start)
    const buckets = []

    for (let i = 0; i < bucketCount; i += 1) {
      const start = addDays(startDate, i * bucketSize)
      if (start > fromISODate(current.end)) break
      const end = new Date(Math.min(addDays(start, bucketSize - 1).getTime(), fromISODate(current.end).getTime()))
      buckets.push({
        start: toISODate(start),
        end: toISODate(end),
        label: period.days <= 30 ? formatShortDate(toISODate(start)) : formatShortDate(toISODate(start)),
        expenses: 0,
      })
    }

    currentTransactions.forEach((t) => {
      if (t.type !== 'expense') return
      const date = fromISODate(t.transaction_date)
      const index = Math.floor((date - startDate) / 86400000 / bucketSize)
      if (buckets[index]) buckets[index].expenses += Number(t.amount || 0)
    })

    return buckets
  }, [current.start, current.end, currentTransactions, period.days])

  const comparisonData = useMemo(
    () => [
      { metric: 'Income', current: currentIncome, previous: previousIncome },
      { metric: 'Expenses', current: currentExpenses, previous: previousExpenses },
      { metric: 'Net cash flow', current: currentNet, previous: previousNet },
    ],
    [currentIncome, previousIncome, currentExpenses, previousExpenses, currentNet, previousNet]
  )

  const change = (currentValue, previousValue) => {
    if (previousValue === 0) return currentValue === 0 ? 0 : null
    return ((currentValue - previousValue) / Math.abs(previousValue)) * 100
  }

  const incomeChange = change(currentIncome, previousIncome)
  const expenseChange = change(currentExpenses, previousExpenses)
  const netChange = change(currentNet, previousNet)

  const hasData = transactions.length > 0
  const hasPeriodData = currentTransactions.length > 0
  const hasSpending = spendingByCategory.length > 0

  if (loading) {
    return (
      <div className="min-h-screen bg-paper dark:bg-charcoal p-6 sm:p-8">
        <PageHeader name={profile?.username} />
        <p className="mt-8 text-sm text-muted dark:text-mutedDark">Loading your charts...</p>
      </div>
    )
  }

  return (
    <div className="min-h-screen bg-paper dark:bg-charcoal p-6 sm:p-8 pb-24">
      <PageHeader name={profile?.username} />

      {error && (
        <div className="mt-5">
          <ErrorState message={error} onRetry={() => setRefreshTick((t) => t + 1)} />
        </div>
      )}

      {!hasData ? (
        <div className="mt-10 border-t border-line dark:border-lineDark pt-8">
          <EmptyState message="More data, better insights." />
        </div>
      ) : (
        <>
          <div className="mt-8">
            <PeriodPicker
              periods={PERIODS}
              periodKey={periodKey}
              onChange={setPeriodKey}
              label="Chart period"
              rangeLabel={`${formatShortDate(current.start)} — ${formatShortDate(current.end)}`}
            />
          </div>

          <div className="mt-5 grid grid-cols-1 sm:grid-cols-3 divide-y sm:divide-y-0 sm:divide-x divide-line dark:divide-lineDark border-b border-line dark:border-lineDark">
            <Metric label="Income" value={currentIncome} tone="good" detail="Selected period" />
            <Metric label="Expenses" value={currentExpenses} tone="bad" detail="Selected period" />
            <Metric label="Net cash flow" value={currentNet} tone={currentNet < 0 ? 'bad' : 'good'} detail="Income − expenses" />
          </div>

          <div className="mt-10 space-y-12">
            <Section title="Money Flow" description="See how income and expenses move through the selected period.">
              {!hasPeriodData ? (
                <EmptyState message="No transactions in this period." className="py-8" />
              ) : (
                <div className="space-y-8">
                  <div className="h-72 w-full">
                    <ResponsiveContainer width="100%" height="100%">
                      <AreaChart data={moneyFlowData} margin={{ top: 10, right: 8, left: 0, bottom: 0 }}>
                        <defs>
                          <linearGradient id="incomeFill" x1="0" y1="0" x2="0" y2="1">
                            <stop offset="0%" stopColor="#3D8F5F" stopOpacity={0.22} />
                            <stop offset="100%" stopColor="#3D8F5F" stopOpacity={0} />
                          </linearGradient>
                          <linearGradient id="expenseFill" x1="0" y1="0" x2="0" y2="1">
                            <stop offset="0%" stopColor="#C24A42" stopOpacity={0.18} />
                            <stop offset="100%" stopColor="#C24A42" stopOpacity={0} />
                          </linearGradient>
                        </defs>
                        <CartesianGrid strokeDasharray="2 4" stroke="currentColor" className="text-line dark:text-lineDark" vertical={false} />
                        <XAxis dataKey="label" tick={{ fontSize: 11 }} tickLine={false} axisLine={false} minTickGap={20} />
                        <YAxis tick={{ fontSize: 11 }} tickLine={false} axisLine={false} width={64} tickFormatter={(value) => `₹${Number(value).toLocaleString('en-IN')}`} />
                        <Tooltip content={<ChartTooltip />} />
                        <Legend wrapperStyle={{ fontSize: 12 }} />
                        <Area type="monotone" dataKey="income" name="Income" stroke="#3D8F5F" fill="url(#incomeFill)" strokeWidth={2} />
                        <Area type="monotone" dataKey="expenses" name="Expenses" stroke="#C24A42" fill="url(#expenseFill)" strokeWidth={2} />
                      </AreaChart>
                    </ResponsiveContainer>
                  </div>

                  <div className="border-t border-line dark:border-lineDark pt-6">
                    <h3 className="text-sm font-medium text-ink dark:text-offwhite mb-4">Net cash flow by day</h3>
                    <div className="h-48 w-full">
                      <ResponsiveContainer width="100%" height="100%">
                        <BarChart data={moneyFlowData} margin={{ top: 4, right: 8, left: 0, bottom: 0 }}>
                          <CartesianGrid strokeDasharray="2 4" stroke="currentColor" className="text-line dark:text-lineDark" vertical={false} />
                          <XAxis dataKey="label" tick={{ fontSize: 11 }} tickLine={false} axisLine={false} minTickGap={20} />
                          <YAxis tick={{ fontSize: 11 }} tickLine={false} axisLine={false} width={64} tickFormatter={(value) => `₹${Number(value).toLocaleString('en-IN')}`} />
                          <Tooltip content={<ChartTooltip />} />
                          <Bar dataKey="net" name="Net cash flow" fill="#C89D4B" radius={[2, 2, 0, 0]} />
                        </BarChart>
                      </ResponsiveContainer>
                    </div>
                  </div>
                </div>
              )}
            </Section>

            <Section title="Spending" description="Understand where your expenses go and how spending changes over time.">
              {!hasSpending ? (
                <EmptyState message="No expense data in this period." className="py-8" />
              ) : (
                <div className="grid grid-cols-1 lg:grid-cols-[minmax(0,0.9fr)_minmax(0,1.1fr)] gap-8 lg:gap-12">
                  <div>
                    <h3 className="text-sm font-medium text-ink dark:text-offwhite mb-3">Category breakdown</h3>
                    <div className="h-64">
                      <ResponsiveContainer width="100%" height="100%">
                        <PieChart>
                          <Pie data={spendingByCategory} dataKey="value" nameKey="name" innerRadius="55%" outerRadius="82%" paddingAngle={2}>
                            {spendingByCategory.map((entry, index) => (
                              <Cell key={entry.name} fill={CHART_COLORS[index % CHART_COLORS.length]} />
                            ))}
                          </Pie>
                          <Tooltip content={<ChartTooltip />} />
                        </PieChart>
                      </ResponsiveContainer>
                    </div>
                    <div className="space-y-2 mt-2">
                      {spendingByCategory.slice(0, 8).map((item, index) => {
                        const percentage = currentExpenses > 0 ? (item.value / currentExpenses) * 100 : 0
                        return (
                          <div key={item.name} className="flex items-center justify-between gap-3 text-sm">
                            <div className="flex items-center min-w-0">
                              <span className="h-2 w-2 rounded-full mr-2 shrink-0" style={{ backgroundColor: CHART_COLORS[index % CHART_COLORS.length] }} />
                              <span className={`px-2 py-0.5 rounded-full truncate ${categoryPillClasses(item.name)}`}>{item.name}</span>
                            </div>
                            <span className="font-mono text-xs text-muted dark:text-mutedDark whitespace-nowrap">
                              {formatCurrency(item.value)} · {percentage.toFixed(0)}%
                            </span>
                          </div>
                        )
                      })}
                    </div>
                  </div>

                  <div>
                    <h3 className="text-sm font-medium text-ink dark:text-offwhite mb-3">Spending pattern</h3>
                    <div className="h-64">
                      <ResponsiveContainer width="100%" height="100%">
                        <LineChart data={spendingTrend} margin={{ top: 10, right: 8, left: 0, bottom: 0 }}>
                          <CartesianGrid strokeDasharray="2 4" stroke="currentColor" className="text-line dark:text-lineDark" vertical={false} />
                          <XAxis dataKey="label" tick={{ fontSize: 11 }} tickLine={false} axisLine={false} minTickGap={20} />
                          <YAxis tick={{ fontSize: 11 }} tickLine={false} axisLine={false} width={64} tickFormatter={(value) => `₹${Number(value).toLocaleString('en-IN')}`} />
                          <Tooltip content={<ChartTooltip />} />
                          <Line type="monotone" dataKey="expenses" name="Expenses" stroke="#C89D4B" strokeWidth={2} dot={false} activeDot={{ r: 4 }} />
                        </LineChart>
                      </ResponsiveContainer>
                    </div>
                    <p className="text-xs text-muted dark:text-mutedDark mt-3">Transfers are excluded from spending calculations.</p>
                  </div>
                </div>
              )}
            </Section>

            <Section title="Comparisons" description="Compare this period with the immediately preceding period of the same length.">
              <div className="grid grid-cols-1 sm:grid-cols-3 divide-y sm:divide-y-0 sm:divide-x divide-line dark:divide-lineDark border-y border-line dark:border-lineDark">
                <ComparisonMetric label="Income" currentValue={currentIncome} previousValue={previousIncome} percentage={incomeChange} />
                <ComparisonMetric label="Expenses" currentValue={currentExpenses} previousValue={previousExpenses} percentage={expenseChange} expense />
                <ComparisonMetric label="Net cash flow" currentValue={currentNet} previousValue={previousNet} percentage={netChange} net />
              </div>

              <div className="mt-8 h-72 w-full">
                <ResponsiveContainer width="100%" height="100%">
                  <BarChart data={comparisonData} margin={{ top: 10, right: 8, left: 0, bottom: 0 }}>
                    <CartesianGrid strokeDasharray="2 4" stroke="currentColor" className="text-line dark:text-lineDark" vertical={false} />
                    <XAxis dataKey="metric" tick={{ fontSize: 11 }} tickLine={false} axisLine={false} />
                    <YAxis tick={{ fontSize: 11 }} tickLine={false} axisLine={false} width={70} tickFormatter={(value) => `₹${Number(value).toLocaleString('en-IN')}`} />
                    <Tooltip content={<ChartTooltip />} />
                    <Legend wrapperStyle={{ fontSize: 12 }} />
                    <Bar dataKey="current" name="Current period" fill="#C89D4B" radius={[2, 2, 0, 0]} />
                    <Bar dataKey="previous" name="Previous period" fill="#8A8478" radius={[2, 2, 0, 0]} />
                  </BarChart>
                </ResponsiveContainer>
              </div>
            </Section>
          </div>
        </>
      )}
    </div>
  )
}

function ComparisonMetric({ label, currentValue, previousValue, percentage, expense = false, net = false }) {
  let changeTone = 'text-muted dark:text-mutedDark'
  let changeLabel = 'No previous-period baseline'

  if (percentage !== null) {
    const positive = percentage > 0
    const negative = percentage < 0
    let useful = positive
    if (expense) useful = negative
    if (net) useful = positive
    if (percentage === 0) useful = null

    changeTone = useful === true ? 'text-good' : useful === false ? 'text-bad' : 'text-muted dark:text-mutedDark'
    changeLabel = `${percentage > 0 ? '+' : ''}${percentage.toFixed(1)}% vs previous`
  }

  return (
    <div className="py-5 sm:px-5 first:sm:pl-0 last:sm:pr-0">
      <div className="text-xs uppercase tracking-wide text-muted dark:text-mutedDark">{label}</div>
      <div className="font-mono text-xl font-semibold text-ink dark:text-offwhite mt-1">{formatCurrency(currentValue)}</div>
      <div className={`text-xs mt-1 ${changeTone}`}>{changeLabel}</div>
      <div className="text-xs text-muted dark:text-mutedDark mt-1">Previous: {formatCurrency(previousValue)}</div>
    </div>
  )
}
