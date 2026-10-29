import { Pencil, Archive, RotateCcw, ReceiptText } from 'lucide-react'
import { formatCurrency } from '../../lib/format.js'
import { dateFromISO } from '../../lib/isoDate.js'
import { debtView, kindLabel, dueDayText, hasValidOpeningFigures, savedFieldProblems } from '../../lib/debtForm.js'

function fmtDate(iso) {
  return dateFromISO(iso).toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' })
}
function fmtCount(n, noun) { return `${n} ${noun}${n === 1 ? '' : 's'}` }
function monthsText(n) {
  if (n >= 12 && n % 12 === 0) return `${n} months (${n / 12} ${n === 12 ? 'year' : 'years'})`
  return `${n} ${n === 1 ? 'month' : 'months'}`
}

// One debt. Every calculated figure is next to the date it is calculated from. Nothing here is a lender statement.
// `payments` (D4b) is null while the linked payments are not available (loading failed); otherwise
// { count, linkedCount, figures, quiet } from lib/debtPayments.js. With no counted payment the card shows exactly
// what D3 showed: the opening figures, never an invented balance.
export default function DebtCard({ debt, payments = null, today, onEdit, onClose, onReopen, onPayments }) {
  // KL-2: saved opening figures that are not valid are never shown as money and never calculated from (nothing is treated as zero).
  const invalid = !hasValidOpeningFigures(debt)
  const view = invalid ? { state: 'invalid' } : debtView(debt)
  // KL-13: saved rate / monthly payment / months left / due day that are not valid are shown as such, and nothing that
  // depends on them is calculated or shown. Each field and each calculation is judged on its own inputs.
  const bad = savedFieldProblems(debt)
  const emiOk = !bad.rate && !bad.months
  const scheduleOk = !bad.rate && !bad.payment
  const FIELD_BAD = 'not valid. Edit this debt to correct it.'
  const asOf = invalid ? null : fmtDate(debt.as_of_date)
  const closed = debt.status === 'closed'
  const figures = !invalid && !bad.rate && payments && payments.figures && payments.figures.kind === 'figures' ? payments.figures : null
  const failed = !invalid && payments && payments.figures && (payments.figures.kind === 'failed' || (bad.rate && payments.figures.kind === 'figures'))
  const cleared = view.state === 'cleared' || (figures && figures.cleared)
  const linkedCount = payments ? payments.linkedCount : 0

  return (
    <div className="py-4" data-testid="debt-card">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <div className="flex items-center gap-2 flex-wrap">
            <h3 className="font-display text-base font-semibold tracking-tight text-ink dark:text-offwhite truncate">{debt.name}</h3>
            <span className="text-xs font-medium text-muted dark:text-mutedDark">{kindLabel(debt.kind)}</span>
            {cleared && <span className="text-xs font-medium text-goodText">Cleared</span>}
            {view.state === 'estimate' && !cleared && <span className="text-xs font-medium text-muted dark:text-mutedDark">Estimate</span>}
            {closed && <span className="text-xs font-medium text-muted dark:text-mutedDark">Closed</span>}
          </div>
          {debt.lender && <div className="text-xs text-muted dark:text-mutedDark mt-0.5">{debt.lender}</div>}

          {invalid && (
            <p className="text-sm text-muted dark:text-mutedDark mt-1" data-testid="debt-invalid">
              The saved figures for this debt are not valid. Edit this debt to correct them.
            </p>
          )}
          {!invalid && (<>

          {view.state === 'cleared' ? (
            <div className="text-sm text-muted dark:text-mutedDark mt-1">Nothing owed on {asOf}.</div>
          ) : (
            <div className="font-mono text-sm text-muted dark:text-mutedDark mt-1">
              On {asOf}: principal {formatCurrency(debt.as_of_outstanding)}
              {Number(debt.as_of_accrued_interest) > 0 && <>, unpaid interest {formatCurrency(debt.as_of_accrued_interest)}</>}
            </div>
          )}

          <div className="text-xs text-muted dark:text-mutedDark mt-1 space-y-0.5">
            {bad.rate ? <div data-testid="debt-rate-invalid">Interest rate: {FIELD_BAD}</div> : <div>Interest rate: {Number(debt.annual_rate_pct)}% a year</div>}
            {debt.monthly_payment != null && (bad.payment ? <div data-testid="debt-payment-invalid">Monthly payment: {FIELD_BAD}</div> : <div>Monthly payment: <span className="font-mono">{formatCurrency(debt.monthly_payment)}</span></div>)}
            {debt.remaining_months != null && (bad.months ? <div data-testid="debt-months-invalid">Months left: {FIELD_BAD}</div> : <div>{monthsText(debt.remaining_months)} left on {asOf}</div>)}
            {debt.due_day != null && (bad.dueDay ? <div data-testid="debt-dueday-invalid">Due day: {FIELD_BAD}</div> : <div>Due on {dueDayText(debt.due_day)}</div>)}
          </div>

          {figures && (
            <div className="mt-2" data-testid="debt-figures">
              <div className="text-sm text-ink dark:text-offwhite">
                {figures.estimate ? 'Owed today (estimate)' : 'Owed today (calculated)'}: <span className="font-mono font-semibold">{formatCurrency(figures.owedToday)}</span>
              </div>
              <div className="text-xs text-muted dark:text-mutedDark mt-1 space-y-0.5">
                <div>Principal outstanding: <span className="font-mono">{formatCurrency(figures.principal)}</span></div>
                <div>Unpaid interest: <span className="font-mono">{formatCurrency(figures.interest)}</span></div>
                <div>Principal repaid: <span className="font-mono">{formatCurrency(figures.principalRepaid)}</span></div>
                <div>Interest paid: <span className="font-mono">{formatCurrency(figures.interestPaid)}</span></div>
                {figures.overpaid > 0 && <div>Overpaid: <span className="font-mono">{formatCurrency(figures.overpaid)}</span> more than was owed</div>}
              </div>
              <p className="text-xs text-muted dark:text-mutedDark mt-1">
                From your figures on {asOf} and {fmtCount(figures.paymentsUsed, 'linked payment')}, as of {fmtDate(today)}. Not a lender statement.
              </p>
              {figures.estimate && (
                <p className="text-xs text-muted dark:text-mutedDark mt-1">
                  Estimate: a credit card changes with every statement, and new spending on the card is not included.
                </p>
              )}
            </div>
          )}

          {failed && (
            <p className="text-xs text-muted dark:text-mutedDark mt-2" data-testid="debt-figures-failed">
              Couldn't calculate today's figures from the linked payments. The opening figures above are unchanged.
            </p>
          )}

          {!figures && view.state === 'estimate' && (
            <p className="text-xs text-muted dark:text-mutedDark mt-2">
              Estimate: a credit card changes with every statement, so these are the figures you entered for {asOf}, not a current balance.
            </p>
          )}

          {payments && payments.figures && payments.figures.kind === 'same-month' && !cleared && (
            <p className="text-xs text-muted dark:text-mutedDark mt-2" data-testid="debt-same-month">
              {fmtCount(payments.figures.paymentsWaiting, 'linked payment')} will be applied from {payments.figures.from}. Figures are calculated month by month, and today is still in the month of your figures.
            </p>
          )}

          {payments && payments.figures && payments.figures.kind !== 'same-month' && !figures && !failed && !cleared && !closed && (
            <p className="text-xs text-muted dark:text-mutedDark mt-2" data-testid="debt-no-payments">
              {linkedCount === 0
                ? 'No payments linked yet. Link your payments to see what you owe today.'
                : 'None of the linked payments is counted yet. Open Payments to see why.'}
            </p>
          )}

          {payments && payments.quiet != null && !cleared && !closed && (
            <p className="text-xs text-muted dark:text-mutedDark mt-1" data-testid="debt-quiet">No payment linked in {payments.quiet} months</p>
          )}

          {figures && figures.schedule && scheduleOk && (
            <div className="text-xs text-muted dark:text-mutedDark mt-2 space-y-0.5" data-testid="debt-projection">
              {figures.schedule.paysOff && (
                <div>
                  At <span className="font-mono">{formatCurrency(debt.monthly_payment)}</span> a month the principal outstanding today is paid off in {monthsText(figures.schedule.months)}, with about{' '}
                  <span className="font-mono">{formatCurrency(figures.schedule.totalInterest)}</span> interest.
                </div>
              )}
              {!figures.schedule.paysOff && figures.schedule.reason === 'payment-not-above-interest' && (
                <div>This monthly payment does not cover a month of interest, so the principal would not go down.</div>
              )}
              {!figures.schedule.paysOff && figures.schedule.reason === 'exceeds-max-months' && (
                <div>At this monthly payment the principal would take more than 50 years to clear.</div>
              )}
              <div>Calculated from the principal outstanding today. Unpaid interest is not included.</div>
            </div>
          )}

          {!figures && view.state === 'projection' && ((view.emi != null && emiOk) || (view.schedule && scheduleOk)) && (
            <div className="text-xs text-muted dark:text-mutedDark mt-2 space-y-0.5" data-testid="debt-projection">
              {view.emi != null && emiOk && (
                <div>A payment of <span className="font-mono">{formatCurrency(view.emi)}</span> a month would clear the principal in {monthsText(debt.remaining_months)}.</div>
              )}
              {view.schedule && scheduleOk && view.schedule.paysOff && (
                <div>
                  At <span className="font-mono">{formatCurrency(debt.monthly_payment)}</span> a month the principal is paid off in {monthsText(view.schedule.months)}, with about{' '}
                  <span className="font-mono">{formatCurrency(view.schedule.totalInterest)}</span> interest.
                </div>
              )}
              {view.schedule && scheduleOk && !view.schedule.paysOff && view.schedule.reason === 'payment-not-above-interest' && (
                <div>This monthly payment does not cover a month of interest, so the principal would not go down.</div>
              )}
              {view.schedule && scheduleOk && !view.schedule.paysOff && view.schedule.reason === 'exceeds-max-months' && (
                <div>At this monthly payment the principal would take more than 50 years to clear.</div>
              )}
              <div>Calculated from the principal on {asOf}. Unpaid interest is not included.</div>
            </div>
          )}

          </>)}

          <div className="mt-3">
            <button
              onClick={onPayments}
              disabled={!payments}
              className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg border border-line dark:border-lineDark text-xs font-medium text-ink dark:text-offwhite hover:text-goldText disabled:opacity-40"
              aria-label={`Payments for ${debt.name}`}
              title="Linked payments"
            >
              <ReceiptText size={14} />
              Payments{payments ? ` (${linkedCount})` : ''}
            </button>
          </div>
        </div>

        <div className="flex items-center gap-1 shrink-0">
          <button onClick={onEdit} className="p-1.5 text-muted dark:text-mutedDark hover:text-goldText" aria-label="Edit debt" title="Edit">
            <Pencil size={16} />
          </button>
          {closed ? (
            <button onClick={onReopen} className="p-1.5 text-muted dark:text-mutedDark hover:text-goldText" aria-label="Reopen debt" title="Reopen">
              <RotateCcw size={16} />
            </button>
          ) : (
            <button onClick={onClose} className="p-1.5 text-muted dark:text-mutedDark hover:text-badText" aria-label="Close debt" title="Close">
              <Archive size={16} />
            </button>
          )}
        </div>
      </div>
    </div>
  )
}
