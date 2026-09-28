import { useEffect, useMemo, useState } from 'react'
import { Sparkles } from 'lucide-react'
import { supabase } from '../../lib/supabaseClient.js'
import { useAuth } from '../../lib/AuthContext.jsx'
import { computeObservations, monthToDateWindows, toISODateLocal } from '../../lib/assistEngine.js'
import { describeObservation } from '../../lib/assistCopy.js'
import { NARRATION_SCHEMA, buildNarrationPrompt, validateNarration } from '../../lib/assistNarration.js'
import { formatCurrency } from '../../lib/format.js'
import { friendlyError } from '../../lib/errorMessages.js'
import Button from '../ui/Button.jsx'
import AiDisclosure from '../ui/AiDisclosure.jsx'

function NarrationAction({ observations }) {
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState(null)
  const [summary, setSummary] = useState(null)

  const handleSummarise = async () => {
    setLoading(true)
    setError(null)

    try {
      const prompt = buildNarrationPrompt(observations.map((o) => describeObservation(o, formatCurrency)))

      const { data, error: invokeErr } = await supabase.functions.invoke('gemini-explain', {
        body: { prompt, schema: NARRATION_SCHEMA },
      })

      if (invokeErr) {
        // supabase-js wraps a non-2xx Edge Function response in a generic
        // error; the function's own { error, message } body is only
        // reachable through this Response. Same pattern as the Phase 34
        // "Explain this" actions.
        let serverMessage = null
        try {
          const body = await invokeErr.context?.json?.()
          serverMessage = body?.message || body?.error || null
        } catch {
          // no readable body — fall through to the generic message
        }
        throw new Error(serverMessage || invokeErr.message)
      }

      // Untrusted until verified: the AI's text is shown only if every
      // number in it traces back to an observation and it contains no
      // advice, judgment, praise, prediction or guessed cause.
      const text = data?.data?.summary
      const check = validateNarration(text, observations)
      if (!check.ok) {
        // eslint-disable-next-line no-console
        console.error('AI summary discarded by validation:', check.reason)
        setError("Couldn't produce a reliable summary this time. The observations above are unchanged.")
        return
      }
      setSummary(text.trim())
    } catch (err) {
      setError(friendlyError(err, "Couldn't get a summary right now. Please try again."))
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="mt-3">
      {!summary && (
        <>
          <Button
            variant="text"
            onClick={handleSummarise}
            disabled={loading}
            className="inline-flex items-center gap-1.5 text-xs"
          >
            <Sparkles size={12} />
            {loading ? 'Asking...' : 'Summarise in plain words'}
          </Button>
          <AiDisclosure>Sends the observations above to Google's Gemini AI.</AiDisclosure>
        </>
      )}

      {error && <p className="text-xs text-bad mt-1.5">{error}</p>}

      {/* Same treatment as the Phase 34 explanations: a separate, clearly
          labeled box, never styled as data, never inline with the figures. */}
      {summary && (
        <div className="mt-1 max-w-xl rounded-md border border-line dark:border-lineDark bg-paper dark:bg-charcoal p-3">
          <p className="flex items-center gap-1.5 text-[11px] font-medium uppercase tracking-wide text-muted dark:text-mutedDark mb-1.5">
            <Sparkles size={11} />
            AI summary
          </p>
          <p className="text-xs text-ink dark:text-offwhite leading-relaxed italic">{summary}</p>
          <p className="text-[11px] text-muted dark:text-mutedDark mt-2">
            Written by AI from the observations above. The figures above are the source of truth.
          </p>
        </div>
      )}
    </div>
  )
}

// Financial Assist (Phase 33a). Self-contained on purpose: it fetches its
// own read-only data and owns its own loading/empty/error state, so the
// page it is mounted on needs one import and one line, nothing more.
// Reads only — no writes. Every figure shown is computed by
// assistEngine.js from existing engine functions. The optional AI summary
// (33b) is layered on top and never replaces them: the observations are
// always shown, and AI text is shown only after validateNarration()
// confirms it adds no numbers and no advice, judgment or speculation.
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
          <>
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
            <NarrationAction key={result.observations.map((o) => o.id).join('|')} observations={result.observations} />
          </>
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
