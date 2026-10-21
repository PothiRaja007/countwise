import { Pencil, Archive, RotateCcw } from 'lucide-react'
import { formatCurrency } from '../../lib/format.js'
import { dateFromISO } from '../../lib/isoDate.js'
import { debtView, kindLabel, dueDayText } from '../../lib/debtForm.js'

function fmtDate(iso) {
  return dateFromISO(iso).toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' })
}
function monthsText(n) {
  if (n >= 12 && n % 12 === 0) return `${n} months (${n / 12} ${n === 12 ? 'year' : 'years'})`
  return `${n} ${n === 1 ? 'month' : 'months'}`
}

// One debt. Every calculated figure is next to the date it is calculated from. Nothing here is a current balance.
export default function DebtCard({ debt, onEdit, onClose, onReopen }) {
  const view = debtView(debt)
  const asOf = fmtDate(debt.as_of_date)
  const closed = debt.status === 'closed'

  return (
    <div className="py-4" data-testid="debt-card">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <div className="flex items-center gap-2 flex-wrap">
            <h3 className="font-display text-base font-semibold tracking-tight text-ink dark:text-offwhite truncate">{debt.name}</h3>
            <span className="text-xs font-medium text-muted dark:text-mutedDark">{kindLabel(debt.kind)}</span>
            {view.state === 'cleared' && <span className="text-xs font-medium text-goodText">Cleared</span>}
            {view.state === 'estimate' && <span className="text-xs font-medium text-muted dark:text-mutedDark">Estimate</span>}
            {closed && <span className="text-xs font-medium text-muted dark:text-mutedDark">Closed</span>}
          </div>
          {debt.lender && <div className="text-xs text-muted dark:text-mutedDark mt-0.5">{debt.lender}</div>}

          {view.state === 'cleared' ? (
            <div className="text-sm text-muted dark:text-mutedDark mt-1">Nothing owed on {asOf}.</div>
          ) : (
            <div className="font-mono text-sm text-muted dark:text-mutedDark mt-1">
              On {asOf}: principal {formatCurrency(debt.as_of_outstanding)}
              {Number(debt.as_of_accrued_interest) > 0 && <>, unpaid interest {formatCurrency(debt.as_of_accrued_interest)}</>}
            </div>
          )}

          <div className="text-xs text-muted dark:text-mutedDark mt-1 space-y-0.5">
            <div>Interest rate: {Number(debt.annual_rate_pct)}% a year</div>
            {debt.monthly_payment != null && <div>Monthly payment: <span className="font-mono">{formatCurrency(debt.monthly_payment)}</span></div>}
            {debt.remaining_months != null && <div>{monthsText(debt.remaining_months)} left on {asOf}</div>}
            {debt.due_day != null && <div>Due on {dueDayText(debt.due_day)}</div>}
          </div>

          {view.state === 'estimate' && (
            <p className="text-xs text-muted dark:text-mutedDark mt-2">
              Estimate: a credit card changes with every statement, so these are the figures you entered for {asOf}, not a current balance.
            </p>
          )}

          {view.state === 'projection' && (view.emi != null || view.schedule) && (
            <div className="text-xs text-muted dark:text-mutedDark mt-2 space-y-0.5" data-testid="debt-projection">
              {view.emi != null && (
                <div>A payment of <span className="font-mono">{formatCurrency(view.emi)}</span> a month would clear the principal in {monthsText(debt.remaining_months)}.</div>
              )}
              {view.schedule && view.schedule.paysOff && (
                <div>
                  At <span className="font-mono">{formatCurrency(debt.monthly_payment)}</span> a month the principal is paid off in {monthsText(view.schedule.months)}, with about{' '}
                  <span className="font-mono">{formatCurrency(view.schedule.totalInterest)}</span> interest.
                </div>
              )}
              {view.schedule && !view.schedule.paysOff && view.schedule.reason === 'payment-not-above-interest' && (
                <div>This monthly payment does not cover a month of interest, so the principal would not go down.</div>
              )}
              {view.schedule && !view.schedule.paysOff && view.schedule.reason === 'exceeds-max-months' && (
                <div>At this monthly payment the principal would take more than 50 years to clear.</div>
              )}
              <div>Calculated from the principal on {asOf}. Unpaid interest is not included.</div>
            </div>
          )}
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
