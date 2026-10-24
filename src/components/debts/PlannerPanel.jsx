import { useMemo, useState } from 'react'
import Input from '../ui/Input.jsx'
import { formatCurrency } from '../../lib/format.js'
import { dateFromISO } from '../../lib/isoDate.js'
import { COPY, MAX_PLAN_MONTHS, selectPlannerDebts, runPlanner, sumMinimums, monthAfter } from '../../lib/debtPlanner.js'

const FIELD = 'w-full bg-paper dark:bg-charcoal rounded-lg px-3 py-2 text-sm font-mono'

function fmtDate(iso) {
  return dateFromISO(String(iso).slice(0, 10)).toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' })
}
const plural = (n, noun) => `${n} ${noun}${n === 1 ? '' : 's'}`

function Field({ id, label, hint, children }) {
  return (
    <div className="min-w-0">
      <label htmlFor={id} className="block text-xs font-medium text-muted dark:text-mutedDark mb-1">{label}</label>
      {children}
      {hint && <p className="text-xs text-muted dark:text-mutedDark mt-1">{hint}</p>}
    </div>
  )
}

function Scenario({ s, savings, monthsSooner, warnings = [] }) {
  const showSaving = s.key !== 'baseline' && savings != null
  return (
    <div className="border border-line dark:border-lineDark rounded-lg p-3 min-w-0" data-testid={`scenario-${s.key}`}>
      <h4 className="text-sm font-semibold text-ink dark:text-offwhite">{s.label}</h4>
      {s.estimate && <span className="text-xs font-medium text-muted dark:text-mutedDark" data-testid="scenario-estimate">{COPY.estimateLabel}</span>}
      <div className="mt-2 text-sm text-ink dark:text-offwhite" data-testid={`scenario-${s.key}-result`}>
        {s.paysOff
          ? <>Debt-free in {plural(s.months, 'month')} ({s.endLabel})</>
          : COPY.notWithin50}
      </div>
      <div className="text-xs text-muted dark:text-mutedDark mt-1 space-y-0.5">
        <div>Total interest: <span className="font-mono">{formatCurrency(s.totalInterest)}</span></div>
        <div>Total paid: <span className="font-mono">{formatCurrency(s.totalPaid)}</span></div>
        {!s.paysOff && <div>Principal left after 50 years: <span className="font-mono">{formatCurrency(s.remaining)}</span></div>}
      </div>
      {showSaving && (
        <div className="text-xs text-muted dark:text-mutedDark mt-2 space-y-0.5" data-testid={`scenario-${s.key}-saving`}>
          <div>Interest compared with required payments only: <span className="font-mono">{savings === 0 ? 'no difference' : `${formatCurrency(Math.abs(savings))} ${savings > 0 ? 'less' : 'more'}`}</span></div>
          {monthsSooner != null && monthsSooner !== 0 && <div>{plural(Math.abs(monthsSooner), 'month')} {monthsSooner > 0 ? 'sooner' : 'later'} than required payments only</div>}
        </div>
      )}
      {warnings.map((w) => (
        <p key={w.kind} className="text-xs font-medium text-badText mt-2" role="note" data-testid="snowball-warning" data-kind={w.kind}>{w.text}</p>
      ))}
      <ul className="text-xs text-muted dark:text-mutedDark mt-2 space-y-0.5">
        {s.perDebt.map((p) => (
          <li key={p.id} className="break-words">
            {p.name}: {p.payoffLabel ? `cleared in ${p.payoffLabel} (month ${p.payoffMonth})` : `not cleared within 50 years`}
          </li>
        ))}
      </ul>
    </div>
  )
}

// D5 - the repayment planner. Calculations come from the existing engine through lib/debtPlanner.js. This panel reads
// what the Debts page already loaded and WRITES NOTHING: no database call, no storage. The three inputs live in this
// component's state and are gone on reload.
export default function PlannerPanel({ debts, infoByDebt, today, paymentsReady }) {
  const [budget, setBudget] = useState('')
  const [lumpAmount, setLumpAmount] = useState('')
  const [lumpMonth, setLumpMonth] = useState('')

  const selection = useMemo(() => selectPlannerDebts(debts, infoByDebt), [debts, infoByDebt])
  const minimums = useMemo(() => sumMinimums(selection.included), [selection])
  const result = useMemo(
    () => (paymentsReady ? runPlanner({ debts: selection.included, budgetText: budget, lumpAmount, lumpMonth, today }) : null),
    [paymentsReady, selection, budget, lumpAmount, lumpMonth, today],
  )
  const lumpMonthNumber = /^\d{1,3}$/.test(lumpMonth.trim()) ? Number(lumpMonth.trim()) : null
  const lumpMonthName = lumpMonthNumber && lumpMonthNumber >= 1 && lumpMonthNumber <= MAX_PLAN_MONTHS ? monthAfter(today, lumpMonthNumber) : null

  return (
    <section className="space-y-4" data-testid="planner" aria-label={COPY.heading}>
      <div>
        <h2 className="font-display text-lg font-semibold tracking-tight text-ink dark:text-offwhite">{COPY.heading}</h2>
        <p className="text-xs text-muted dark:text-mutedDark mt-1" data-testid="planner-basis">{COPY.basis}</p>
      </div>

      {debts.length === 0 && <p className="text-sm text-muted dark:text-mutedDark" data-testid="planner-empty">{COPY.noDebts}</p>}

      {debts.length > 0 && !paymentsReady && (
        <p className="text-sm text-badText" data-testid="planner-unavailable">{COPY.cannotLoadPayments}</p>
      )}

      {debts.length > 0 && paymentsReady && (
        <>
          {selection.included.length > 0 && (
            <div data-testid="planner-included">
              <h3 className="text-sm font-semibold text-ink dark:text-offwhite">Debts in the plan</h3>
              <ul className="mt-1 space-y-1.5">
                {selection.included.map((d) => (
                  <li key={d.id} className="text-sm text-ink dark:text-offwhite break-words" data-testid="planner-debt">
                    <span className="font-medium">{d.name}</span>{d.estimate && <span className="text-xs text-muted dark:text-mutedDark"> ({COPY.estimateLabel})</span>}
                    <div className="text-xs text-muted dark:text-mutedDark">
                      Starting principal <span className="font-mono">{formatCurrency(d.balance)}</span>{' '}
                      <span data-testid="planner-source">
                        {d.source === 'payments'
                          ? `(principal outstanding today, from your figures on ${fmtDate(d.asOf)} and ${plural(d.paymentsUsed, 'linked payment')})`
                          : `(opening principal on ${fmtDate(d.asOf)})`}
                      </span>
                      {' · '}monthly payment <span className="font-mono">{formatCurrency(d.minPayment)}</span> · {d.annualRatePct}% a year
                    </div>
                  </li>
                ))}
              </ul>
              <p className="text-xs text-muted dark:text-mutedDark mt-2" data-testid="planner-principal-only">{COPY.principalOnly}</p>
            </div>
          )}

          {selection.excluded.length > 0 && (
            <div data-testid="planner-excluded">
              <h3 className="text-sm font-semibold text-ink dark:text-offwhite">Not in the plan</h3>
              <ul className="mt-1 space-y-0.5">
                {selection.excluded.map((d, i) => (
                  <li key={`${d.id}-${i}`} className="text-xs text-muted dark:text-mutedDark break-words" data-testid="planner-excluded-item">{d.name}: {d.reason}</li>
                ))}
              </ul>
            </div>
          )}

          {selection.included.length === 0 && <p className="text-sm text-muted dark:text-mutedDark" data-testid="planner-none">{COPY.noneToPlan}</p>}

          {selection.included.length > 0 && (
            <>
              <div>
                <h3 className="text-sm font-semibold text-ink dark:text-offwhite">{COPY.inputsHeading}</h3>
                <div className="grid gap-3 sm:grid-cols-3 mt-2">
                  <Field id="planner-budget" label={COPY.budgetLabel} hint={`${COPY.budgetHint} Required payments add up to ${formatCurrency(minimums)} a month.`}>
                    <Input id="planner-budget" data-testid="planner-budget" inputMode="decimal" value={budget} onChange={(e) => setBudget(e.target.value)} placeholder={String(minimums)} className={FIELD} />
                  </Field>
                  <Field id="planner-lump-amount" label={`${COPY.lumpHeading}: ${COPY.lumpAmountLabel}`} hint={COPY.lumpHint}>
                    <Input id="planner-lump-amount" data-testid="planner-lump-amount" inputMode="decimal" value={lumpAmount} onChange={(e) => setLumpAmount(e.target.value)} className={FIELD} />
                  </Field>
                  <Field id="planner-lump-month" label={COPY.lumpMonthLabel} hint={lumpMonthName ? `Month ${lumpMonthNumber} is ${lumpMonthName}.` : COPY.monthLabelNote}>
                    <Input id="planner-lump-month" data-testid="planner-lump-month" inputMode="numeric" value={lumpMonth} onChange={(e) => setLumpMonth(e.target.value)} className={FIELD} />
                  </Field>
                </div>
              </div>

              {result && (result.status === 'invalid' || result.status === 'refused' || result.status === 'failed') && (
                <p className="text-sm text-badText" role="alert" data-testid="planner-message">{result.message}</p>
              )}

              {result && result.status === 'ok' && (
                <div className="space-y-3" data-testid="planner-results" aria-live="polite">
                  <p className="text-xs text-muted dark:text-mutedDark" data-testid="planner-summary">
                    Monthly budget <span className="font-mono">{formatCurrency(result.budget)}</span>
                    {result.extra > 0 && <> ({formatCurrency(result.extra)} more than the required payments)</>}
                    {result.lump && <>, plus a one-time <span className="font-mono">{formatCurrency(result.lump.amount)}</span> in month {result.lump.month} ({monthAfter(today, result.lump.month)})</>}.
                  </p>
                  <div className="grid gap-3 sm:grid-cols-3">
                    {result.scenarios.map((s) => (
                      <Scenario key={s.key} s={s} savings={result.savings[s.key] ?? null} monthsSooner={result.monthsSooner[s.key] ?? null} warnings={s.key === 'snowball' ? result.snowballWarnings : []} />
                    ))}
                  </div>
                  <p className="text-sm text-ink dark:text-offwhite" data-testid="planner-comparison">{result.comparison.text}</p>
                  <div className="text-xs text-muted dark:text-mutedDark space-y-1">
                    <p data-testid="planner-snowball-order">{COPY.snowballOrderNote}</p>
                    <p>{COPY.snowballNote}</p>
                    <p>{COPY.baselineNote}</p>
                    <p>{COPY.rollNote}</p>
                    {(result.extra > 0 || result.lump) && <p>{COPY.lumpIgnoredNote}</p>}
                    <p>{COPY.monthLabelNote}</p>
                    {result.estimate && <p data-testid="planner-estimate">{COPY.estimateNote}</p>}
                  </div>
                </div>
              )}
            </>
          )}
        </>
      )}
    </section>
  )
}
