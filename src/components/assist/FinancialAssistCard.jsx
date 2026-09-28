import { useEffect, useMemo, useState } from 'react'
import { supabase } from '../../lib/supabaseClient.js'
import { useAuth } from '../../lib/AuthContext.jsx'
import { computeObservations, monthToDateWindows, toISODateLocal } from '../../lib/assistEngine.js'
import { describeObservation } from '../../lib/assistCopy.js'
import { formatCurrency } from '../../lib/format.js'
import { friendlyError } from '../../lib/errorMessages.js'
import Button from '../ui/Button.jsx'

// Financial Assist (Phase 33a). Self-contained on purpose: it fetches its
// own read-only data and owns its own loading/empty/error state, so the
// page it is mounted on needs one import and one line, nothing more.
// Reads only — no writes, and no AI. Every figure shown is computed by
// assistEngine.js from existing engine functions.
export default function FinancialAssistCard() {
  const { user } = useAuth()
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(null)
  const [data, setData] = useState({ transactions: [], budgets: [], categories: [] })
  const [refreshTick, setRefreshTick] = useState(0)

  useEffect(() => {
    if (!user) return
    let cancelled = false

    async function load() {
      setLoading(true)
      setError(null)

      const today = new Date()
      const todayISO = toISODateLocal(today)
      const { previous } = monthToDateWindows(today)

      // Budgets and categories first: how far back transactions must be
      // fetched depends on the active budgets. A budget's "spent" has to
      // cover its whole period so it matches the Budgets page exactly.
      const [budgetsRes, categoriesRes] = await Promise.all([
        supabase
          .from('budgets')
          .select('id, category_id, amount, period_start, period_end')
          .eq('user_id', user.id)
          .lte('period_start', todayISO)
          .gte('period_end', todayISO),
        supabase
          .from('categories')
          .select('id, name, kind')
          .or(`user_id.eq.${user.id},user_id.is.null`)
          .eq('kind', 'expense'),
      ])

      if (cancelled) return

      const firstError = budgetsRes.error || categoriesRes.error
      if (firstError) {
        // eslint-disable-next-line no-console
        console.error(firstError)
        setError(friendlyError(firstError, "Couldn't load your observations. Please try again."))
        setLoading(false)
        return
      }

      const budgets = budgetsRes.data || []
      const fetchFrom = budgets.reduce((earliest, b) => (b.period_start < earliest ? b.period_start : earliest), previous.start)

      const transactionsRes = await supabase
        .from('transactions')
        .select('category_id, type, amount, transaction_date')
        .eq('user_id', user.id)
        .gte('transaction_date', fetchFrom)

      if (cancelled) return

      if (transactionsRes.error) {
        // eslint-disable-next-line no-console
        console.error(transactionsRes.error)
        setError(friendlyError(transactionsRes.error, "Couldn't load your observations. Please try again."))
        setLoading(false)
        return
      }

      setData({
        transactions: transactionsRes.data || [],
        budgets,
        categories: categoriesRes.data || [],
      })
      setLoading(false)
    }

    load()
    return () => {
      cancelled = true
    }
  }, [user, refreshTick])

  const result = useMemo(() => computeObservations({ ...data, today: new Date() }), [data])

  return (
    <section className="border-t border-line dark:border-lineDark pt-6">
      <h2 className="text-sm font-medium">Financial Assist</h2>
      <p className="text-xs text-muted dark:text-mutedDark mt-1">
        What changed in your money this month — observations only.
      </p>

      <div className="mt-4">
        {loading ? (
          <div className="space-y-3 animate-pulse" aria-label="Loading observations">
            <div className="h-4 w-2/3 bg-surface dark:bg-charcoalSurface rounded" />
            <div className="h-4 w-1/2 bg-surface dark:bg-charcoalSurface rounded" />
          </div>
        ) : error ? (
          <div className="py-1">
            <p className="text-sm text-bad">{error}</p>
            <Button variant="text" onClick={() => setRefreshTick((t) => t + 1)} className="mt-1.5 text-sm">
              Retry
            </Button>
          </div>
        ) : result.observations.length > 0 ? (
          <div className="border-y border-line dark:border-lineDark">
            {result.observations.map((obs) => {
              const { headline, detail } = describeObservation(obs, formatCurrency)
              return (
                <div
                  key={obs.id}
                  className="flex items-start gap-3 py-4 border-b border-line dark:border-lineDark last:border-b-0"
                >
                  <span
                    className={`mt-1.5 h-2 w-2 rounded-full shrink-0 ${
                      obs.severity === 'notice' ? 'bg-gold' : 'bg-line dark:bg-lineDark'
                    }`}
                    aria-hidden="true"
                  />
                  <div className="min-w-0">
                    <p className="text-sm text-ink dark:text-offwhite leading-5">{headline}</p>
                    <p className="text-xs text-muted dark:text-mutedDark mt-1 leading-5">{detail}</p>
                  </div>
                </div>
              )
            })}
          </div>
        ) : (
          <p className="text-sm text-muted dark:text-mutedDark">
            {result.comparable
              ? 'Nothing has changed notably compared with this point last month.'
              : 'Once you have a couple of months of recorded expenses, comparisons will appear here.'}
          </p>
        )}
      </div>

      <p className="text-xs text-muted dark:text-mutedDark mt-4">
        Based on your logged transactions. Observations, not advice.
      </p>
    </section>
  )
}
