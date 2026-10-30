import { useMemo, useState } from 'react'
import Input from '../ui/Input.jsx'
import Disclosure from './Disclosure.jsx'
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

function Stat({ label, testId, children, sub }) {
  return (
    <div className="border border-line dark:border-lineDark bg-surface dark:bg-charcoalSurface rounded-lg p-3 min-w-0" data-testid={testId}>
      <div className="text-xs font-medium text-muted dark:text-mutedDark">{label}</div>
      <div className="mt-1 font-mono text-lg font-semibold text-ink dark:text-offwhite break-words">{children}</div>
      {sub && <div className="text-xs text-muted dark:text-mutedDark mt-0.5">{sub}</div>}
    </div>
  )
}

// One scenario. Every scenario stays in the page; only the selected one shows its figures. The snowball warning is never
// hidden: a scenario that is not selected but has a warning still shows its name and the warning.
function Scenario({ s, selected, savings, monthsSooner, warnings = [] }) {
  const showSaving = s.key !== 'baseline' && savings != null
  const visible = selected || warnings.length > 0
  return (
    <div className="min-w-0" hidden={!visible || undefined} data-testid={`scenario-${s.key}`}>
      <div hidden={!selected || undefined}>
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
        <Disclosure summary="Payoff by debt" className="mt-1">
          <ul className="space-y-0.5">
            {s.perDebt.map((p) => (
              <li key={p.id} className="break-words">
                {p.name}: {p.payoffLabel ? `cleared in ${p.payoffLabel} (month ${p.payoffMonth})` : `not cleared within 50 years`}
              </li>
            ))}
          </ul>
        </Disclosure>
      </div>
      {!selected && warnings.length > 0 && <h4 className="text-sm font-semibold text-ink dark:text-offwhite">{s.label}</h4>}
      {warnings.map((w) => (
        <p key={w.kind} className="text-xs font-medium text-badText mt-2 border border-line dark:border-lineDark rounded-md p-2" role="note" data-testid="snowball-warning" data-kind={w.kind}>{w.text}</p>
      ))}
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
  const [chosen, setChosen] = useState('baseline') // which scenario's figures are shown; display only

  const selection = useMemo(() => selectPlannerDebts(debts, infoByDebt), [debts, infoByDebt])
  const minimums = useMemo(() => sumMinimums(selection.included), [selection])
  const result = useMemo(
    () => (paymentsReady ? runPlanner({ debts: selection.included, budgetText: budget, lumpAmount, lumpMonth, today }) : null),
    [paymentsReady, selection, budget, lumpAmount, lumpMonth, today],
  )
  const lumpMonthNumber = /^\d{1,3}$/.test(lumpMonth.trim()) ? Number(lumpMonth.trim()) : null
  const lumpMonthName = lumpMonthNumber && lumpMonthNumber >= 1 && lumpMonthNumber <= MAX_PLAN_MONTHS ? monthAfter(today, lumpMonthNumber) : null

  const ok = result && result.status === 'ok'
  const sel = ok ? (result.scenarios.find((x) => x.key === chosen) || result.scenarios[0]) : null
  // The debts in the order the selected scenario clears them (display order only; nothing is recalculated here).
  const payoffOf = (id) => {
    const row = sel ? sel.perDebt.find((p) => p.id === id) : null
    return row || null
  }
  const rows = selection.included
    .map((d, idx) => ({ d, idx, p: payoffOf(d.id) }))
    .sort((x, y) => {
      if (!sel) return x.idx - y.idx
      const a = x.p && x.p.payoffMonth != null ? x.p.payoffMonth : Infinity
      const b = y.p && y.p.payoffMonth != null ? y.p.payoffMonth : Infinity
      return a === b ? x.idx - y.idx : a - b
    })
  const SHORT = { baseline: 'Required only', avalanche: 'Avalanche', snowball: 'Snowball' }

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
            <div data-testid="planner-results-wrap" className="space-y-4">
              {/* A. Overview */}
              {ok && (
                <div className="grid gap-3 grid-cols-2 lg:grid-cols-4" data-testid="planner-overview">
                  <Stat label="Monthly budget" testId="planner-stat-budget">{formatCurrency(result.budget)}</Stat>
                  <Stat label="Required payments" testId="planner-stat-required">{formatCurrency(minimums)}</Stat>
                  <Stat label="Debt-free in" testId="planner-stat-months" sub={sel.paysOff ? sel.endLabel : undefined}>{sel.paysOff ? plural(sel.months, 'month') : 'Over 50 years'}</Stat>
                  <Stat label="Total interest" testId="planner-stat-interest">{formatCurrency(sel.totalInterest)}</Stat>
                </div>
              )}
              {ok && (
                <p className="text-xs text-muted dark:text-mutedDark" data-testid="planner-summary">
                  Monthly budget <span className="font-mono">{formatCurrency(result.budget)}</span>
                  {result.extra > 0 && <> ({formatCurrency(result.extra)} more than the required payments)</>}
                  {result.lump && <>, plus a one-time <span className="font-mono">{formatCurrency(result.lump.amount)}</span> in month {result.lump.month} ({monthAfter(today, result.lump.month)})</>}.
                  {' '}Figures shown for: {sel.label}.
                </p>
              )}

              {/* Your numbers */}
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

              {/* Scenario switcher (display only: it chooses which already-calculated scenario is shown) */}
              {ok && (
                <div data-testid="planner-results" aria-live="polite" className="space-y-3">
                  <div className="inline-flex border border-line dark:border-lineDark rounded-lg overflow-hidden" role="group" aria-label="Scenario">
                    {result.scenarios.map((x) => (
                      <button
                        key={x.key}
                        type="button"
                        aria-pressed={sel.key === x.key}
                        onClick={() => setChosen(x.key)}
                        data-testid={`planner-pick-${x.key}`}
                        className={`px-3 py-2 min-h-[40px] text-sm font-medium ${sel.key === x.key ? 'bg-ink text-white dark:bg-offwhite dark:text-charcoal' : 'text-muted dark:text-mutedDark hover:text-ink dark:hover:text-offwhite'}`}
                      >
                        {SHORT[x.key] || x.label}
                      </button>
                    ))}
                  </div>
                  <div className="space-y-2">
                    {result.scenarios.map((x) => (
                      <Scenario key={x.key} s={x} selected={sel.key === x.key} savings={result.savings[x.key] ?? null} monthsSooner={result.monthsSooner[x.key] ?? null} warnings={x.key === 'snowball' ? result.snowballWarnings : []} />
                    ))}
                  </div>
                  <p className="text-sm text-ink dark:text-offwhite" data-testid="planner-comparison">{result.comparison.text}</p>
                  <p className="text-xs text-muted dark:text-mutedDark" data-testid="planner-snowball-order">{COPY.snowballOrderNote}</p>
                </div>
              )}

              {/* B. Debt cards */}
              <div data-testid="planner-included">
                <h3 className="text-sm font-semibold text-ink dark:text-offwhite">Debts in the plan</h3>
                <ul className="mt-2 space-y-2">
                  {rows.map(({ d, p }, n) => (
                    <li
                      key={d.id}
                      className={`flex flex-wrap sm:flex-nowrap items-start gap-x-3 gap-y-1 rounded-lg border bg-surface dark:bg-charcoalSurface p-3 break-words ${ok && n === 0 ? 'border-gold border-l-4' : 'border-line dark:border-lineDark'}`}
                      data-testid="planner-debt"
                    >
                      {ok && <span className={`shrink-0 w-6 h-6 rounded-full grid place-items-center text-xs font-semibold ${n === 0 ? 'bg-gold text-ink' : 'bg-line dark:bg-lineDark text-muted dark:text-mutedDark'}`} aria-hidden="true">{n + 1}</span>}
                      <div className="min-w-0 flex-1">
                        <div className="text-sm text-ink dark:text-offwhite">
                          <span className="font-medium">{d.name}</span>{d.estimate && <span className="text-xs text-muted dark:text-mutedDark"> ({COPY.estimateLabel})</span>}
                          {ok && n === 0 && <span className="ml-2 text-xs font-semibold rounded-full px-2 py-0.5 bg-gold/20 text-brown dark:text-gold">Cleared first</span>}
                        </div>
                        <div className="text-xs text-muted dark:text-mutedDark mt-0.5">
                          Starting principal <span className="font-mono">{formatCurrency(d.balance)}</span>{' '}
                          <span data-testid="planner-source">
                            {d.source === 'payments'
                              ? `(principal outstanding today, from your figures on ${fmtDate(d.asOf)} and ${plural(d.paymentsUsed, 'linked payment')})`
                              : `(opening principal on ${fmtDate(d.asOf)})`}
                          </span>
                          {' · '}monthly payment <span className="font-mono">{formatCurrency(d.minPayment)}</span> · {d.annualRatePct}% a year
                        </div>
                      </div>
                      {p && (
                        <div className={`shrink-0 w-full sm:w-auto text-left sm:text-right text-xs text-muted dark:text-mutedDark ${ok ? 'pl-9 sm:pl-0' : ''}`} data-testid="planner-payoff">
                          <span className="block font-mono text-sm text-ink dark:text-offwhite">{p.payoffLabel ? `Cleared in ${p.payoffMonth} months` : 'Not within 50 years'}</span>
                          {p.payoffLabel && <span>{p.payoffLabel}</span>}
                        </div>
                      )}
                    </li>
                  ))}
                </ul>
                <p className="text-xs text-muted dark:text-mutedDark mt-2" data-testid="planner-principal-only">{COPY.principalOnly}</p>
                {ok && result.estimate && <p className="text-xs text-muted dark:text-mutedDark mt-1" data-testid="planner-estimate">{COPY.estimateNote}</p>}
              </div>

              {/* C. Secondary explanations */}
              {ok && (
                <Disclosure summary="About these figures" testId="planner-notes">
                  <p>{COPY.snowballNote}</p>
                  <p>{COPY.baselineNote}</p>
                  <p>{COPY.rollNote}</p>
                  {(result.extra > 0 || result.lump) && <p>{COPY.lumpIgnoredNote}</p>}
                  <p>{COPY.monthLabelNote}</p>
                </Disclosure>
              )}
            </div>
          )}

          {selection.excluded.length > 0 && (
            <div data-testid="planner-excluded">
              <Disclosure summary={`Not in the plan (${selection.excluded.length})`} testId="planner-excluded-details" defaultOpen={selection.included.length === 0}>
                <ul className="space-y-0.5">
                  {selection.excluded.map((d, i) => (
                    <li key={`${d.id}-${i}`} className="break-words" data-testid="planner-excluded-item">{d.name}: {d.reason}</li>
                  ))}
                </ul>
              </Disclosure>
            </div>
          )}

          {selection.included.length === 0 && <p className="text-sm text-muted dark:text-mutedDark" data-testid="planner-none">{COPY.noneToPlan}</p>}
        </>
      )}
    </section>
  )
}
