import { useMemo } from 'react'
import { formatCurrency } from '../../lib/format.js'
import { dateFromISO } from '../../lib/isoDate.js'
import Disclosure from './Disclosure.jsx'
import { COPY, computeIndicators } from '../../lib/debtIndicators.js'

const fmtDate = (iso) => dateFromISO(String(iso).slice(0, 10)).toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' })
const plural = (n, noun) => `${n} ${noun}${n === 1 ? '' : 's'}`

function Tile({ label, testId, children }) {
  return (
    <div className="border border-line dark:border-lineDark bg-surface dark:bg-charcoalSurface rounded-lg p-3 min-w-0" data-testid={testId}>
      <h3 className="text-xs font-medium text-muted dark:text-mutedDark uppercase tracking-wide">{label}</h3>
      {children}
    </div>
  )
}
const Big = ({ children, testId, large }) => <div className={`mt-1 ${large ? 'text-3xl' : 'text-lg'} font-mono font-semibold text-ink dark:text-offwhite break-words`} data-testid={testId}>{children}</div>
const Small = ({ children, testId }) => <p className="text-xs text-muted dark:text-mutedDark mt-1 break-words" data-testid={testId}>{children}</p>

// D6 - the debt indicators. They add up figures the Debts page already shows (calculated from opening figures and linked
// payments) and, for debts without a counted payment, the opening figures. This component reads what the page loaded and
// WRITES NOTHING: no database call, no storage, no effect.
export default function IndicatorRow({ debts, infoByDebt, incomeRows, today, paymentsReady }) {
  const ind = useMemo(
    () => computeIndicators({ debts, infoByDebt: paymentsReady ? infoByDebt : null, incomeRows, today }),
    [debts, infoByDebt, incomeRows, today, paymentsReady],
  )
  const { total, monthly, burden, interest, progress } = ind

  return (
    <section className="space-y-3" data-testid="indicators" aria-label={COPY.heading}>
      <div>
        <h2 className="font-display text-lg font-semibold tracking-tight text-ink dark:text-offwhite">{COPY.heading}</h2>
        <p className="text-xs text-muted dark:text-mutedDark mt-1" data-testid="indicators-basis">{COPY.basis} {COPY.closedNote}</p>
      </div>

      <Tile label={total.status === 'ok' ? (total.mixed ? COPY.totalLabelMixed : total.openingOnly ? COPY.totalLabelOpening : COPY.totalLabelCalculated) : COPY.totalLabel} testId="ind-total">
        {total.status === 'no-debts' && <Small testId="ind-total-text">{COPY.noActiveDebts}</Small>}
        {total.status === 'unavailable' && <p className="text-sm text-badText mt-1" data-testid="ind-total-text">{COPY.paymentsUnavailable}</p>}
        {total.status === 'none' && <Small testId="ind-total-text">{COPY.noTotal}</Small>}
        {total.status === 'ok' && (
          <>
            <Big testId="ind-total-amount" large>{formatCurrency(total.amount)}</Big>
            <Small testId="ind-total-note">{COPY.notVerified}</Small>
            {total.mixed && <p className="text-xs font-medium text-badText mt-2 border border-line dark:border-lineDark rounded-md p-2" role="note" data-testid="ind-total-mixed">{COPY.mixedWarning}</p>}
            {total.openingOnly && <p className="text-xs font-medium text-badText mt-2 border border-line dark:border-lineDark rounded-md p-2" role="note" data-testid="ind-total-opening-only">{COPY.openingOnly}</p>}
            {total.hasEstimate && <Small testId="ind-total-estimate">{COPY.estimateNote}</Small>}
            {total.noFigure.length > 0 && (
              <p className="text-xs text-badText mt-1 break-words" data-testid="ind-total-nofigure">
                {plural(total.noFigure.length, 'debt')} left out because no valid figure is available, not counted as zero: {total.noFigure.map((n) => `${n.name} (${n.reason})`).join('; ')}.
              </p>
            )}
          </>
        )}
        {(total.status === 'ok' || (ind.items.length > 0 && paymentsReady)) && (
          <Disclosure summary="How this total is worked out" testId="ind-total-details" className="mt-1">
            {total.status === 'ok' && (
              <>
                <p data-testid="ind-total-components">{COPY.totalComponents}</p>
                <p data-testid="ind-total-split">
                  {total.calculated.count > 0 && <>Calculated from linked payments: <span className="font-mono">{formatCurrency(total.calculated.amount)}</span> ({plural(total.calculated.count, 'debt')}). </>}
                  {total.opening.count > 0 && <>Opening figures: <span className="font-mono">{formatCurrency(total.opening.amount)}</span> ({plural(total.opening.count, 'debt')}).</>}
                </p>
              </>
            )}
            {ind.items.length > 0 && paymentsReady && (
              <>
                <p data-testid="ind-meanings">{COPY.calculatedMeaning} {COPY.openingMeaning}</p>
                <ul className="space-y-0.5" data-testid="ind-items">
                  {ind.items.map((i) => (
                    <li key={i.id} className="break-words" data-testid="ind-item">
                      {i.name}:{' '}
                      {i.basis === 'calculated' && <>{formatCurrency(i.owedPaise / 100)} calculated from your figures and linked payments, as of {fmtDate(today)}{i.estimate ? ' (estimate)' : ''} (principal {formatCurrency(i.principalPaise / 100)} + unpaid interest {formatCurrency(i.interestPaise / 100)}){i.overpaidPaise > 0 ? `; overpaid ${formatCurrency(i.overpaidPaise / 100)}, not subtracted` : ''}</>}
                      {i.basis === 'opening' && <>{formatCurrency(i.owedPaise / 100)} opening figure on {fmtDate(i.asOf)}, not a current balance{i.estimate ? ' (estimate)' : ''} (principal {formatCurrency(i.principalPaise / 100)} + unpaid interest {formatCurrency(i.interestPaise / 100)}; interest since that date not added){i.waiting > 0 ? `; ${plural(i.waiting, 'linked payment')} waiting` : ''}</>}
                      {i.basis === 'none' && <>no figure ({i.reason})</>}
                    </li>
                  ))}
                </ul>
              </>
            )}
          </Disclosure>
        )}
      </Tile>

      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <Tile label={COPY.monthlyLabel} testId="ind-monthly">
          {monthly.status === 'ok'
            ? <><Big testId="ind-monthly-amount">{formatCurrency(monthly.amount)}</Big><Small>{plural(monthly.count, 'debt')} included.</Small></>
            : <Small testId="ind-monthly-text">{ind.activeCount === 0 ? COPY.noActiveDebts : COPY.noMonthly}</Small>}
          {monthly.skipped.length > 0 && (
            <Small testId="ind-monthly-skipped">Not included: {monthly.skipped.map((s) => `${s.name} (${s.reason})`).join('; ')}.</Small>
          )}
        </Tile>

        <Tile label={COPY.burdenLabel} testId="ind-burden">
          {burden.status === 'ok' ? (
            <>
              <Big testId="ind-burden-percent">{burden.percent.toFixed(1)}%</Big>
              <Small testId="ind-burden-inputs">{formatCurrency(burden.monthlyRequired)} a month divided by an average income of {formatCurrency(burden.averageIncome)} ({burden.months[0].label} to {burden.months[2].label}).</Small>
            </>
          ) : (
            <Small testId="ind-burden-text">{burden.text}</Small>
          )}
          {burden.status === 'no-income' && burden.months.length === 3 && <Small>Needs income recorded in each of {burden.months.map((m) => m.label).join(', ')}.</Small>}
        </Tile>

        <Tile label={COPY.interestLabel} testId="ind-interest">
          {interest.status === 'ok' && <><Big testId="ind-interest-amount">{formatCurrency(interest.amount)}</Big><Small>From {plural(interest.debtCount, 'debt')} with linked payments{interest.withoutCount > 0 ? `; ${plural(interest.withoutCount, 'active debt')} without a counted payment not included` : ''}.{interest.hasEstimate ? ' Includes a credit-card estimate.' : ''}</Small></>}
          {interest.status === 'needs-payment' && <Small testId="ind-interest-text">{interest.text}</Small>}
          {interest.status === 'unavailable' && <Small testId="ind-interest-text">{COPY.paymentsUnavailable}</Small>}
          {interest.status === 'no-debts' && <Small testId="ind-interest-text">{COPY.noActiveDebts}</Small>}
        </Tile>

        <Tile label={COPY.progressLabel} testId="ind-progress">
          {progress.status === 'ok' && <><Big testId="ind-progress-percent">{progress.percent.toFixed(1)}%</Big><Small testId="ind-progress-detail">{formatCurrency(progress.repaid)} of {formatCurrency(progress.openingPrincipal)} principal on the opening-figures dates{progress.withoutCount > 0 ? `; ${plural(progress.withoutCount, 'active debt')} without a counted payment not included` : ''}.{progress.hasEstimate ? ' Includes a credit-card estimate.' : ''}</Small></>}
          {progress.status === 'needs-payment' && <Small testId="ind-progress-text">{progress.text}</Small>}
          {progress.status === 'no-principal' && <Small testId="ind-progress-text">{progress.text}</Small>}
          {progress.status === 'unavailable' && <Small testId="ind-progress-text">{COPY.paymentsUnavailable}</Small>}
          {progress.status === 'no-debts' && <Small testId="ind-progress-text">{COPY.noActiveDebts}</Small>}
        </Tile>
      </div>

      <Disclosure summary="What these figures mean" testId="ind-definitions">
        <p>{COPY.burdenLabel}: {COPY.burdenDefinition}</p>
        <p>{COPY.interestLabel}: {COPY.interestDefinition}</p>
        <p>{COPY.progressLabel}: {COPY.progressDefinition}</p>
      </Disclosure>
    </section>
  )
}
