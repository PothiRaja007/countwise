import { useEffect, useMemo, useState } from 'react'
import { Landmark, ShieldCheck, AlertTriangle } from 'lucide-react'
import { supabase } from '../lib/supabaseClient.js'
import { useAuth } from '../lib/AuthContext.jsx'
import { formatCurrency } from '../lib/format.js'
import PageHeader from '../components/layout/PageHeader.jsx'
import ErrorState from '../components/layout/ErrorState.jsx'
import { calculateRetirementBreakdown } from '../lib/pfEngine.js'
import { sumByCategory } from '../lib/salaryEngine.js'
import ValueBadge from '../components/ui/ValueBadge.jsx'
import Button from '../components/ui/Button.jsx'
import Input from '../components/ui/Input.jsx'

function todayISO() {
  const now = new Date()
  const offset = now.getTimezoneOffset() * 60000
  return new Date(now.getTime() - offset).toISOString().slice(0, 10)
}

function formatDate(value) {
  if (!value) return 'Not available'
  return new Date(`${value}T00:00:00`).toLocaleDateString('en-IN', {
    day: 'numeric',
    month: 'short',
    year: 'numeric',
  })
}

// V1.2.5: the source-rate/effective-date text that used to live in this
// page's own always-visible SourceMeta block now rides on the value as
// ValueBadge's `provenance` — same underlying information (rate, date
// range, official source link, and the EPS wage-cap limitation where it
// applies), now reached via the badge's small (i) disclosure instead of a
// separate block of text under every row. This is a deliberate visibility
// change, not just a restyle: the rate/date used to be always shown;
// they're now one click away, consistent with how CTC/Salary/Budget
// Recipe's provenance is surfaced everywhere else in this task.
function provenanceFor(result) {
  if (!result || result.status !== 'ok') return undefined

  const { source, ratePeriod, rateUsed, limitation } = result
  return {
    source: `Source rate: ${rateUsed}%`,
    sourceUrl: source?.url || undefined,
    effectiveDate: `Effective from ${formatDate(ratePeriod.effectiveFrom)}${
      ratePeriod.effectiveTo ? ` · through ${formatDate(ratePeriod.effectiveTo)}` : ' · currently open-ended'
    }`,
    assumptions: limitation || undefined,
  }
}

function BenefitRow({ label, result, description }) {
  const unavailable = result?.status === 'unavailable'

  return (
    <div className="border-t border-line dark:border-lineDark py-5 first:border-t-0">
      <div className="flex items-start justify-between gap-5">
        <div className="min-w-0">
          <p className="text-sm font-medium text-ink dark:text-offwhite">{label}</p>
          <p className="text-xs text-muted dark:text-mutedDark mt-1 max-w-xl">{description}</p>
        </div>
        <div className="shrink-0 text-right">
          {unavailable ? (
            <p className="text-sm font-medium text-muted dark:text-mutedDark">Rate unavailable</p>
          ) : (
            <ValueBadge kind="calculated" provenance={provenanceFor(result)}>
              <span className="font-mono text-base text-ink dark:text-offwhite">{formatCurrency(result.amount)}</span>
            </ValueBadge>
          )}
        </div>
      </div>

      {unavailable && <p className="mt-3 text-xs text-muted dark:text-mutedDark">{result.reason}</p>}
    </div>
  )
}

export default function PFPension() {
  const { user, profile } = useAuth()
  const [loading, setLoading] = useState(true)
  const [calculating, setCalculating] = useState(false)
  const [error, setError] = useState(null)
  const [structure, setStructure] = useState(null)
  const [components, setComponents] = useState([])
  const [calculationDate, setCalculationDate] = useState(todayISO)
  const [breakdown, setBreakdown] = useState(null)

  // Was previously a hand-rolled filter+reduce that duplicated
  // salaryEngine.js's own completeness rule (isIncomplete) instead of
  // calling it — flagged in the V1.2.5 audit as the same class of bug
  // the project has already caught twice before (Charts.jsx, then
  // category_rules). sumByCategory() already excludes incomplete
  // components (null/undefined monthly_amount, or 'needs_clarification')
  // the exact same way; 'basic' is never that category, so this is a
  // pure refactor, not a behavior change.
  const basicMonthly = useMemo(() => sumByCategory(components).totals.basic || 0, [components])

  const load = async () => {
    if (!user) return
    setLoading(true)
    setError(null)

    const { data: structures, error: structureError } = await supabase
      .from('salary_structures')
      .select('id,label,is_active,created_at')
      .eq('user_id', user.id)
      .eq('is_active', true)
      .maybeSingle()

    if (structureError) {
      console.error(structureError)
      setError("Couldn't load your active salary structure.")
      setLoading(false)
      return
    }

    if (!structures) {
      setStructure(null)
      setComponents([])
      setBreakdown(null)
      setLoading(false)
      return
    }

    const { data: salaryComponents, error: componentsError } = await supabase
      .from('salary_components')
      .select('id,name,category,monthly_amount')
      .eq('user_id', user.id)
      .eq('structure_id', structures.id)
      .order('created_at', { ascending: true })

    if (componentsError) {
      console.error(componentsError)
      setError("Couldn't load the components in your active salary structure.")
      setLoading(false)
      return
    }

    setStructure(structures)
    setComponents(salaryComponents || [])
    setLoading(false)
  }

  const calculate = async () => {
    if (!basicMonthly || basicMonthly < 0) {
      setBreakdown(null)
      setError('Your active salary structure does not contain a confirmed Basic salary amount.')
      return
    }

    setCalculating(true)
    setError(null)
    try {
      const result = await calculateRetirementBreakdown(basicMonthly, calculationDate)
      setBreakdown(result)
    } catch (err) {
      console.error(err)
      setBreakdown(null)
      setError("Couldn't calculate the retirement breakdown right now. Please try again.")
    } finally {
      setCalculating(false)
    }
  }

  useEffect(() => {
    load()
  }, [user])

  useEffect(() => {
    if (basicMonthly > 0) calculate()
    else setBreakdown(null)
  }, [basicMonthly, calculationDate])

  if (loading) {
    return (
      <div className="p-6 sm:p-8 bg-paper dark:bg-charcoal min-h-screen">
        <PageHeader name={profile?.username} />
        <p className="mt-8 text-sm text-muted dark:text-mutedDark">Loading your PF information...</p>
      </div>
    )
  }

  return (
    <div className="p-6 sm:p-8 space-y-7 bg-paper dark:bg-charcoal min-h-screen text-ink dark:text-offwhite">
      <PageHeader name={profile?.username} />

      {error && <ErrorState message={error} onRetry={load} />}

      <div>
        <p className="text-xs uppercase tracking-[0.14em] text-muted dark:text-mutedDark">Work</p>
        <h1 className="font-display text-3xl sm:text-4xl font-semibold tracking-tight mt-2">PF / Pension</h1>
        <p className="text-sm text-muted dark:text-mutedDark mt-2 max-w-2xl">
          A read-only view of estimated employee PF, employer EPF, and EPS based on your salary structure and the verified rules available for the calculation date.
        </p>
      </div>

      {!structure ? (
        <div className="max-w-2xl border-t border-line dark:border-lineDark pt-7">
          <div className="flex items-start gap-3">
            <Landmark size={18} className="text-gold mt-0.5 shrink-0" />
            <div>
              <p className="text-sm font-medium">No active salary structure</p>
              <p className="text-sm text-muted dark:text-mutedDark mt-1">
                Build and activate a salary structure in Salary first. CountWise uses its Basic salary here instead of asking you to enter the same figure again.
              </p>
            </div>
          </div>
        </div>
      ) : (
        <div className="max-w-3xl space-y-7">
          <section className="border-t border-line dark:border-lineDark pt-6">
            <div className="flex items-start justify-between gap-5 flex-wrap">
              <div>
                <p className="text-xs uppercase tracking-wide text-muted dark:text-mutedDark">Calculation basis</p>
                <h2 className="font-display text-xl font-semibold mt-1">{structure.label}</h2>
                <p className="text-xs text-muted dark:text-mutedDark mt-1">
                  Basic salary from your active salary structure: <span className="font-mono text-ink dark:text-offwhite">{formatCurrency(basicMonthly)}</span>
                </p>
                <p className="text-xs text-muted dark:text-mutedDark mt-1">Source: your saved salary structure · Calculation date: {formatDate(calculationDate)}</p>
              </div>

              <label className="text-xs text-muted dark:text-mutedDark">
                Calculation date
                <Input
                  type="date"
                  value={calculationDate}
                  onChange={(event) => setCalculationDate(event.target.value)}
                  className="block mt-1 text-sm py-2 px-3 rounded-md bg-surface dark:bg-charcoalSurface text-ink dark:text-offwhite"
                />
              </label>
            </div>
          </section>

          <section className="border-y border-line dark:border-lineDark py-5">
            <div className="flex items-start gap-3">
              <ShieldCheck size={17} className="text-gold mt-0.5 shrink-0" />
              <div>
                <p className="text-sm font-medium">Retirement benefits are separate from your everyday money</p>
                <p className="text-xs text-muted dark:text-mutedDark mt-1 max-w-2xl">
                  These figures are not added to your CountWise account balance, income, or available cash. They are shown only as retirement/benefit information.
                </p>
              </div>
            </div>
          </section>

          {breakdown && (
            <section>
              <div className="flex items-center justify-between gap-3 mb-2">
                <p className="text-xs uppercase tracking-wide text-muted dark:text-mutedDark">Monthly retirement breakdown</p>
                {calculating && <span className="text-xs text-muted dark:text-mutedDark">Refreshing...</span>}
              </div>

              <div className="border-t border-line dark:border-lineDark">
                <BenefitRow
                  label="Employee PF"
                  result={breakdown.retirementBenefits.employeePF}
                  description="Employee-side PF contribution calculated from the verified EPF rule active on the selected date."
                />
                <BenefitRow
                  label="Employer EPF"
                  result={breakdown.retirementBenefits.employerEPF}
                  description="Employer-side EPF contribution. This is not ordinary income and is not added to an account balance."
                />
                <BenefitRow
                  label="EPS"
                  result={breakdown.retirementBenefits.eps}
                  description="Employer-side pension contribution. The current CountWise rule data does not model the EPS wage ceiling."
                />
              </div>
            </section>
          )}

          {!breakdown && basicMonthly > 0 && (
            <div className="border-t border-line dark:border-lineDark pt-6 text-sm text-muted dark:text-mutedDark">
              {calculating ? 'Calculating from verified rules...' : 'No calculation available yet.'}
            </div>
          )}

          {breakdown?.status === 'partial' && (
            <div className="flex items-start gap-3 border-t border-line dark:border-lineDark pt-5">
              <AlertTriangle size={16} className="text-gold mt-0.5 shrink-0" />
              <p className="text-xs text-muted dark:text-mutedDark">
                One or more verified rules were unavailable for this calculation date. CountWise has not substituted zeroes or guessed values.
              </p>
            </div>
          )}

          <Button
            onClick={calculate}
            disabled={calculating || !basicMonthly}
            className="inline-flex items-center gap-2 px-4 py-2 rounded-lg"
          >
            {calculating ? 'Calculating...' : 'Recalculate'}
          </Button>

          <div className="border-t border-line dark:border-lineDark pt-6">
            <p className="text-xs text-muted dark:text-mutedDark">
              CountWise does not promise a particular retirement outcome or return. These are rule-based contribution estimates, and actual contributions can depend on circumstances not modeled here.
            </p>
          </div>
        </div>
      )}
    </div>
  )
}
