import { useEffect, useMemo, useState } from 'react'
import { ChevronDown, ChevronUp, Info, Star } from 'lucide-react'
import { supabase } from '../lib/supabaseClient.js'
import { useAuth } from '../lib/AuthContext.jsx'
import { computeBehaviorScore } from '../lib/behaviorScore.js'
import { formatCurrency } from '../lib/format.js'
import PageHeader from '../components/layout/PageHeader.jsx'
import ErrorState from '../components/layout/ErrorState.jsx'
import { friendlyError } from '../lib/errorMessages.js'

const PERIODS = [
  { key: '30D', label: '30 days', days: 30 },
  { key: '3M', label: '3 months', days: 90 },
  { key: '6M', label: '6 months', days: 180 },
]

function toISODate(date) {
  const y = date.getFullYear()
  const m = String(date.getMonth() + 1).padStart(2, '0')
  const d = String(date.getDate()).padStart(2, '0')
  return `${y}-${m}-${d}`
}

function periodRange(days) {
  const end = new Date()
  const start = new Date()
  start.setDate(start.getDate() - days + 1)
  return { start: toISODate(start), end: toISODate(end) }
}

function Stars({ value, large = false }) {
  const filled = Math.round(value)
  return (
    <div className={`flex items-center gap-1 ${large ? 'gap-1.5' : ''}`} aria-label={`${value} out of 5 stars`}>
      {[1, 2, 3, 4, 5].map((star) => (
        <Star
          key={star}
          size={large ? 28 : 16}
          strokeWidth={1.7}
          className={star <= filled ? 'fill-gold text-gold' : 'text-line dark:text-lineDark'}
        />
      ))}
    </div>
  )
}

function FlagRow({ flag }) {
  return (
    <div className="flex items-start gap-3 py-4 border-b border-line dark:border-lineDark last:border-b-0">
      <span className="mt-1 h-2 w-2 rounded-full bg-gold shrink-0" aria-hidden="true" />
      <div className="min-w-0">
        <p className="text-sm text-ink dark:text-offwhite leading-5">{flag.description}</p>
        <p className="text-xs text-muted dark:text-mutedDark mt-1">Pattern to keep an eye on</p>
      </div>
    </div>
  )
}

export default function Behavior() {
  const { user, profile } = useAuth()
  const [periodKey, setPeriodKey] = useState('30D')
  const [expanded, setExpanded] = useState(true)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(null)
  const [data, setData] = useState({ transactions: [], goals: [], goalContributions: [] })
  // Bumped by the error state's Retry action, same reasoning/pattern as
  // Overview.jsx and Charts.jsx — load() lives inside the effect, so a
  // dependency bump re-runs it rather than duplicating a second load path.
  const [refreshTick, setRefreshTick] = useState(0)

  const period = PERIODS.find((item) => item.key === periodKey) || PERIODS[0]
  const range = useMemo(() => periodRange(period.days), [period.days])

  useEffect(() => {
    if (!user) return
    let cancelled = false

    async function load() {
      setLoading(true)
      setError(null)

      const [transactionsRes, goalsRes, contributionsRes] = await Promise.all([
        supabase
          .from('transactions')
          .select('type, amount, transaction_date')
          .eq('user_id', user.id)
          .order('transaction_date', { ascending: false }),
        supabase
          .from('goals')
          .select('id, status')
          .eq('user_id', user.id),
        supabase
          .from('goal_contributions')
          .select('goal_id, amount, type, contribution_date')
          .eq('user_id', user.id),
      ])

      if (cancelled) return

      const firstError = transactionsRes.error || goalsRes.error || contributionsRes.error
      if (firstError) {
        setError(friendlyError(firstError, "Couldn't load your behavior data. Please try again."))
        setLoading(false)
        return
      }

      setData({
        transactions: transactionsRes.data || [],
        goals: goalsRes.data || [],
        goalContributions: contributionsRes.data || [],
      })
      setLoading(false)
    }

    load()
    return () => {
      cancelled = true
    }
  }, [user, refreshTick])

  const score = useMemo(
    () =>
      computeBehaviorScore({
        ...data,
        periodStart: range.start,
        periodEnd: range.end,
      }),
    [data, range]
  )

  const periodLabel = useMemo(() => {
    const start = new Date(`${range.start}T00:00:00`)
    const end = new Date(`${range.end}T00:00:00`)
    const formatter = new Intl.DateTimeFormat('en-IN', { day: 'numeric', month: 'short', year: 'numeric' })
    return `${formatter.format(start)} – ${formatter.format(end)}`
  }, [range])

  if (loading) {
    return (
      <div className="min-h-screen bg-paper dark:bg-charcoal p-6 sm:p-8">
        <PageHeader name={profile?.username} />
        <div className="mt-10 space-y-4 animate-pulse">
          <div className="h-7 w-48 bg-surface dark:bg-charcoalSurface rounded" />
          <div className="h-32 bg-surface dark:bg-charcoalSurface rounded" />
          <div className="h-48 bg-surface dark:bg-charcoalSurface rounded" />
        </div>
      </div>
    )
  }

  if (error) {
    return (
      <div className="min-h-screen bg-paper dark:bg-charcoal p-6 sm:p-8">
        <PageHeader name={profile?.username} />
        <div className="mt-10">
          <ErrorState message={error} onRetry={() => setRefreshTick((t) => t + 1)} />
        </div>
      </div>
    )
  }

  return (
    <div className="min-h-screen bg-paper dark:bg-charcoal p-6 sm:p-8 text-ink dark:text-offwhite">
      <PageHeader name={profile?.username} />

      <div className="mt-10 max-w-5xl space-y-8">
        <div className="flex flex-col sm:flex-row sm:items-end sm:justify-between gap-4">
          <div>
            <p className="text-xs uppercase tracking-[0.14em] text-muted dark:text-mutedDark">Behavior Score</p>
            <h1 className="font-display text-3xl sm:text-4xl font-semibold tracking-tight mt-2">Your money pattern</h1>
            <p className="text-sm text-muted dark:text-mutedDark mt-2 max-w-xl">
              A simple snapshot of the patterns in your recorded money activity. It is descriptive, not a judgment.
            </p>
          </div>

          <div className="flex gap-1 self-start sm:self-auto border border-line dark:border-lineDark p-1 rounded-md">
            {PERIODS.map((item) => (
              <button
                key={item.key}
                type="button"
                onClick={() => setPeriodKey(item.key)}
                className={`px-3 py-1.5 text-xs rounded transition-colors ${
                  periodKey === item.key
                    ? 'bg-gold/10 text-gold font-medium'
                    : 'text-muted dark:text-mutedDark hover:bg-surface dark:hover:bg-charcoalSurface'
                }`}
              >
                {item.label}
              </button>
            ))}
          </div>
        </div>

        <section className="border-y border-line dark:border-lineDark py-7">
          <div className="flex flex-col md:flex-row md:items-center gap-7 md:gap-12">
            <div className="shrink-0">
              <p className="text-xs uppercase tracking-wide text-muted dark:text-mutedDark">Current score</p>
              <div className="flex items-end gap-3 mt-3">
                <span className="font-mono text-5xl font-semibold tracking-tight">{score.stars.toFixed(1)}</span>
                <span className="text-sm text-muted dark:text-mutedDark mb-1">/ 5</span>
              </div>
              <div className="mt-3">
                <Stars value={score.stars} large />
              </div>
            </div>

            <div className="h-px md:h-20 md:w-px bg-line dark:bg-lineDark w-full" />

            <div className="grid grid-cols-2 sm:grid-cols-4 gap-x-8 gap-y-5 flex-1">
              <Metric label="Income" value={formatCurrency(score.stats.income)} />
              <Metric label="Expenses" value={formatCurrency(score.stats.expense)} />
              <Metric label="Net cash flow" value={formatCurrency(score.stats.netCashFlow)} tone={score.stats.netCashFlow >= 0 ? 'good' : 'bad'} />
              <Metric label="Goal contributions" value={formatCurrency(score.stats.goalContributions)} />
            </div>
          </div>
        </section>

        <section>
          <div className="flex items-center justify-between gap-4">
            <div>
              <h2 className="text-sm font-medium">What shaped this score</h2>
              <p className="text-xs text-muted dark:text-mutedDark mt-1">{periodLabel}</p>
            </div>
            <button
              type="button"
              onClick={() => setExpanded((value) => !value)}
              className="inline-flex items-center gap-1.5 text-xs text-muted dark:text-mutedDark hover:text-ink dark:hover:text-offwhite"
              aria-expanded={expanded}
            >
              {expanded ? 'Collapse' : 'Show details'}
              {expanded ? <ChevronUp size={15} /> : <ChevronDown size={15} />}
            </button>
          </div>

          {expanded && (
            <div className="mt-4 border-y border-line dark:border-lineDark">
              {score.flags.length === 0 ? (
                <div className="py-7 flex items-start gap-3">
                  <Info size={17} className="text-gold mt-0.5 shrink-0" />
                  <div>
                    <p className="text-sm">No notable patterns flagged for this period.</p>
                    <p className="text-xs text-muted dark:text-mutedDark mt-1">
                      Keep recording your money activity to build a clearer picture over time.
                    </p>
                  </div>
                </div>
              ) : (
                score.flags.map((flag) => <FlagRow key={flag.flag_type} flag={flag} />)
              )}
            </div>
          )}
        </section>

        <section className="grid grid-cols-1 md:grid-cols-3 gap-6 border-t border-line dark:border-lineDark pt-6">
          <StatNote label="Transactions recorded" value={String(score.stats.transactionCount)} />
          <StatNote label="Active goals" value={String(score.stats.activeGoalCount)} />
          <StatNote label="How it works" value="Patterns → flags → score" />
        </section>

        {!score.sufficientData && (
          <div className="border border-line dark:border-lineDark p-6 bg-surface/40 dark:bg-charcoalSurface/40">
            <p className="text-sm font-medium">We're still learning your pattern.</p>
            <p className="text-xs text-muted dark:text-mutedDark mt-2 max-w-xl leading-5">
              Add a few income, expense, or goal records through Money Inbox. The score becomes more meaningful as your money story fills in.
            </p>
          </div>
        )}
      </div>
    </div>
  )
}

function Metric({ label, value, tone }) {
  const toneClass = tone === 'good' ? 'text-good' : tone === 'bad' ? 'text-bad' : 'text-ink dark:text-offwhite'
  return (
    <div>
      <p className="text-[10px] uppercase tracking-wide text-muted dark:text-mutedDark">{label}</p>
      <p className={`font-mono text-sm mt-1 ${toneClass}`}>{value}</p>
    </div>
  )
}

function StatNote({ label, value }) {
  return (
    <div>
      <p className="text-[10px] uppercase tracking-wide text-muted dark:text-mutedDark">{label}</p>
      <p className="text-sm mt-1 text-ink dark:text-offwhite">{value}</p>
    </div>
  )
}
