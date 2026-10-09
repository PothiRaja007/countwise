// Phase 40 — Advanced AI Insights (capstone). Read-only, no new writes,
// no new financial math. This page composes three engines that already
// existed and were already tested — computeObservations (33a),
// computeBehaviorScore (existing), goalOpportunity (37) — into one view,
// plus one optional "Summarize across everything" action validated by
// the SAME primitives already proven for each domain individually (see
// advancedInsights.js's header comment).
import { useEffect, useMemo, useState } from 'react'
import { Sparkles } from 'lucide-react'
import { supabase } from '../lib/supabaseClient.js'
import { useAuth } from '../lib/AuthContext.jsx'
import { computeObservations } from '../lib/assistEngine.js'
import { describeObservation } from '../lib/assistCopy.js'
import { computeBehaviorScore } from '../lib/behaviorScore.js'
import { goalOpportunity } from '../lib/goalOpportunityEngine.js'
import { periodRange } from '../lib/dateRange.js'
import { formatCurrency } from '../lib/format.js'
import { friendlyError } from '../lib/errorMessages.js'
import {
  ADVANCED_INSIGHTS_SCHEMA, buildAdvancedInsightsPrompt, validateAdvancedInsights, explainRejection,
} from '../lib/advancedInsights.js'
import PageHeader from '../components/layout/PageHeader.jsx'
import ErrorState from '../components/layout/ErrorState.jsx'
import AiDisclosure from '../components/ui/AiDisclosure.jsx'
import Button from '../components/ui/Button.jsx'

const WINDOW_DAYS = 30

export default function AdvancedInsights() {
  const { user, profile } = useAuth()
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(null)
  const [data, setData] = useState({ transactions: [], budgets: [], categories: [], goals: [], goalContributions: [] })

  const [summary, setSummary] = useState(null)
  const [summarizing, setSummarizing] = useState(false)
  const [summaryError, setSummaryError] = useState(null)

  useEffect(() => {
    if (!user) return
    let cancelled = false

    async function load() {
      setLoading(true)
      setError(null)
      const range = periodRange(WINDOW_DAYS)

      const [txRes, budgetsRes, categoriesRes, goalsRes, contributionsRes] = await Promise.all([
        supabase.from('transactions').select('category_id, type, amount, transaction_date').eq('user_id', user.id).gte('transaction_date', range.start),
        supabase.from('budgets').select('id, category_id, amount, period_start, period_end').eq('user_id', user.id),
        supabase.from('categories').select('id, name, kind').or(`user_id.eq.${user.id},user_id.is.null`),
        supabase.from('goals').select('id, status, target_amount, target_date').eq('user_id', user.id).eq('status', 'active'),
        supabase.from('goal_contributions').select('goal_id, amount, type, contribution_date').eq('user_id', user.id),
      ])
      if (cancelled) return

      const firstError = txRes.error || budgetsRes.error || categoriesRes.error || goalsRes.error || contributionsRes.error
      if (firstError) {
        setError(friendlyError(firstError, "Couldn't load your insights. Please try again."))
        setLoading(false)
        return
      }
      setData({
        transactions: txRes.data || [],
        budgets: budgetsRes.data || [],
        categories: categoriesRes.data || [],
        goals: goalsRes.data || [],
        goalContributions: contributionsRes.data || [],
      })
      setLoading(false)
    }
    load()
    return () => {
      cancelled = true
    }
  }, [user])

  // --- Section 1: Money patterns — reuses Financial Assist (33a) exactly ---
  const moneyObservations = useMemo(
    () => computeObservations({ ...data, today: new Date() }).observations,
    [data]
  )
  const moneyLines = useMemo(
    () => moneyObservations.map((o) => describeObservation(o, formatCurrency).headline),
    [moneyObservations]
  )

  // --- Section 2: Behavior Score — reused exactly, same 30-day window ---
  const range = useMemo(() => periodRange(WINDOW_DAYS), [])
  const behavior = useMemo(
    () => computeBehaviorScore({ ...data, periodStart: range.start, periodEnd: range.end }),
    [data, range]
  )

  // --- Section 3: Goals — reuses goalOpportunity (37) per active goal ---
  const goalResults = useMemo(
    () =>
      data.goals.map((g) => ({
        goal: g,
        opportunity: goalOpportunity({ goal: g, contributions: data.goalContributions, transactions: data.transactions }),
      })),
    [data]
  )
  const goalLines = useMemo(
    () =>
      goalResults
        .filter((r) => r.opportunity.recentMonthlyPace !== 0)
        .map((r) => {
          const pace = formatCurrency(r.opportunity.recentMonthlyPace)
          return r.opportunity.projectedCompletionDate
            ? `A goal's recent pace is ${pace}/month, projected around ${r.opportunity.projectedCompletionDate} if that continues.`
            : `A goal's recent pace is ${pace}/month.`
        }),
    [goalResults]
  )

  const handleSummarize = async () => {
    setSummarizing(true)
    setSummaryError(null)
    try {
      const sections = [
        { heading: 'Money patterns', lines: moneyLines },
        { heading: 'Goals', lines: goalLines },
        { heading: 'Behavior', lines: behavior.flags.map((f) => f.description) },
      ]
      const prompt = buildAdvancedInsightsPrompt(sections)
      const { data: resp, error: invokeErr } = await supabase.functions.invoke('gemini-explain', {
        body: { prompt, schema: ADVANCED_INSIGHTS_SCHEMA },
      })
      if (invokeErr) {
        let serverMessage = null
        try {
          const body = await invokeErr.context?.json?.()
          serverMessage = body?.message || body?.error || null
        } catch {
          // no readable body
        }
        throw new Error(serverMessage || invokeErr.message)
      }
      const figureSources = [
        ...moneyObservations,
        ...goalResults.map((r) => ({ figures: r.opportunity })),
        { figures: { stars: behavior.stars, ...behavior.stats } },
      ]
      const text = resp?.data?.summary
      // The sentences shown on the page are also allowed to be repeated, numbers and all.
      const check = validateAdvancedInsights(text, figureSources, sections.flatMap((s) => s.lines))
      if (!check.ok) {
        // eslint-disable-next-line no-console
        console.error('Advanced insight discarded by validation:', check.reason)
        const why = explainRejection(check.reason)
        setSummaryError(
          "Couldn't produce a reliable summary this time. The sections above are unchanged." + (why ? ` ${why}` : '')
        )
        return
      }
      setSummary(text.trim())
    } catch (err) {
      setSummaryError(friendlyError(err, "Couldn't get a summary right now. Please try again."))
    } finally {
      setSummarizing(false)
    }
  }

  if (error) {
    return (
      <div className="p-6 sm:p-8 bg-paper dark:bg-charcoal min-h-screen">
        <PageHeader name={profile?.username} />
        <ErrorState message={error} />
      </div>
    )
  }

  const hasAnything = moneyLines.length > 0 || goalLines.length > 0 || behavior.flags.length > 0

  return (
    <div className="p-6 sm:p-8 space-y-6 bg-paper dark:bg-charcoal min-h-screen">
      <PageHeader name={profile?.username} />

      <div>
        <h1 className="font-serif text-2xl font-semibold">Advanced insights</h1>
        <p className="text-sm text-muted dark:text-mutedDark mt-1 max-w-xl">
          A combined view of patterns already calculated elsewhere in CountWise — money, goals, and behavior,
          over the last {WINDOW_DAYS} days. Nothing new is calculated on this page.
        </p>
      </div>

      {loading ? (
        <p className="text-sm text-muted dark:text-mutedDark">Loading...</p>
      ) : !hasAnything ? (
        <p className="text-sm text-muted dark:text-mutedDark">
          Once there are a few weeks of recorded activity, patterns will appear here.
        </p>
      ) : (
        <>
          <Section heading="Money patterns" lines={moneyLines} empty="Nothing notable this period." />
          <Section heading="Goals" lines={goalLines} empty="No recent goal activity this period." />
          <Section heading="Behavior" lines={behavior.flags.map((f) => f.description)} empty="No flags this period." />

          <div className="border-t border-line dark:border-lineDark pt-4">
            {!summary ? (
              <>
                <Button
                  variant="text"
                  onClick={handleSummarize}
                  disabled={summarizing}
                  className="inline-flex items-center gap-1.5 text-sm"
                >
                  <Sparkles size={13} />
                  {summarizing ? 'Asking...' : 'Summarize across everything'}
                </Button>
                <AiDisclosure>Sends the sections above to Google's Gemini AI.</AiDisclosure>
              </>
            ) : (
              <div className="max-w-xl rounded-md border border-line dark:border-lineDark bg-paper dark:bg-charcoal p-3">
                <p className="flex items-center gap-1.5 text-[11px] font-medium uppercase tracking-wide text-muted dark:text-mutedDark mb-1.5">
                  <Sparkles size={11} />
                  AI summary
                </p>
                <p className="text-sm text-ink dark:text-offwhite leading-relaxed italic">{summary}</p>
                <p className="text-[11px] text-muted dark:text-mutedDark mt-2">
                  Written by AI from the sections above. The sections above are the source of truth.
                </p>
              </div>
            )}
            {summaryError && <p className="text-xs text-badText mt-1.5">{summaryError}</p>}
          </div>
        </>
      )}
    </div>
  )
}

function Section({ heading, lines, empty }) {
  return (
    <div>
      <p className="text-sm font-medium mb-2">{heading}</p>
      {lines.length === 0 ? (
        <p className="text-xs text-muted dark:text-mutedDark">{empty}</p>
      ) : (
        <ul className="space-y-1.5">
          {lines.map((l, i) => (
            <li key={i} className="text-sm text-ink dark:text-offwhite">
              {l}
            </li>
          ))}
        </ul>
      )}
    </div>
  )
}
