import { useMemo } from 'react'
import { Link } from 'react-router-dom'
import { formatCurrency } from '../../lib/format.js'
import { COPY, computeIndicators } from '../../lib/debtIndicators.js'

const plural = (n, noun) => `${n} ${noun}${n === 1 ? '' : 's'}`
export const CARD_COPY = {
  heading: 'Debts',
  differ: 'These figures may differ from the Debts page and are not reconciled with it. Linked payments are not replayed on Overview, so a debt cleared or reduced by linked payments is still counted here from its entered monthly payment.',
  note: 'Based on the monthly payments you entered for active debts. Open Debts for balances and the full indicators.',
  link: 'Open Debts',
}

// D6 - the small Debts summary on Overview. It reads the active debts (loaded by Overview, read-only) and the transactions
// Overview already holds. No balance is calculated or shown here and nothing is written. Hidden when there is no active debt.
export default function OverviewDebtCard({ debts, transactions, today }) {
  const ind = useMemo(() => computeIndicators({ debts, infoByDebt: null, incomeRows: transactions, today }), [debts, transactions, today])
  if (!Array.isArray(debts) || ind.activeCount === 0) return null
  const { monthly, burden } = ind
  return (
    <div data-testid="overview-debts">
      <h2 className="text-xs font-medium text-muted dark:text-mutedDark uppercase tracking-wide mb-3">{CARD_COPY.heading}</h2>
      <p className="text-xs font-medium text-badText border border-line dark:border-lineDark rounded-md p-2 mb-3" role="note" data-testid="overview-debts-differ">{CARD_COPY.differ}</p>
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        <div className="min-w-0">
          <div className="text-xs text-muted dark:text-mutedDark">Active debts</div>
          <div className="font-mono text-xl font-medium text-ink dark:text-offwhite" data-testid="overview-debts-count">{ind.activeCount}</div>
        </div>
        <div className="min-w-0">
          <div className="text-xs text-muted dark:text-mutedDark">{COPY.monthlyLabel}</div>
          {monthly.status === 'ok'
            ? <div className="font-mono text-xl font-medium text-ink dark:text-offwhite break-words" data-testid="overview-debts-monthly">{formatCurrency(monthly.amount)}</div>
            : <div className="text-xs text-muted dark:text-mutedDark" data-testid="overview-debts-monthly-text">{COPY.noMonthly}</div>}
          {monthly.skipped.length > 0 && <div className="text-xs text-muted dark:text-mutedDark break-words" data-testid="overview-debts-skipped">{plural(monthly.skipped.length, 'debt')} not included: {monthly.skipped.map((s) => `${s.name} (${s.reason})`).join('; ')}.</div>}
        </div>
        <div className="min-w-0">
          <div className="text-xs text-muted dark:text-mutedDark">{COPY.burdenLabel}</div>
          {burden.status === 'ok'
            ? <div className="font-mono text-xl font-medium text-ink dark:text-offwhite" data-testid="overview-debts-burden">{burden.percent.toFixed(1)}%</div>
            : <div className="text-xs text-muted dark:text-mutedDark" data-testid="overview-debts-burden-text">{burden.text}</div>}
        </div>
      </div>
      <p className="text-xs text-muted dark:text-mutedDark mt-3" data-testid="overview-debts-note">{CARD_COPY.note} {COPY.basis}</p>
      <Link to="/debts" className="inline-block mt-2 text-sm text-muted dark:text-mutedDark hover:text-goldText transition-colors" data-testid="overview-debts-link">{CARD_COPY.link}</Link>
    </div>
  )
}
