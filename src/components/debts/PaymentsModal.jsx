import { useRef, useState } from 'react'
import { X, Link2 } from 'lucide-react'
import Modal from '../ui/Modal.jsx'
import Button from '../ui/Button.jsx'
import { formatCurrency } from '../../lib/format.js'
import { dateFromISO } from '../../lib/isoDate.js'
import { DISCLOSURE } from '../../lib/debtPayments.js'

const fmtDate = (iso) => dateFromISO(iso).toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' })

// The payments linked to one debt. Linking never creates or changes a transaction; Unlink only removes the link and
// the transaction stays exactly as it was. A closed debt is read-only until it is reopened.
// onUnlink(row) resolves to an error sentence, or null when done. onLinkMore() opens the picker (the page swaps modals).
export default function PaymentsModal({ debt, rows, readOnly, onUnlink, onLinkMore, onClose }) {
  const [busyId, setBusyId] = useState(null)
  const [error, setError] = useState(null)
  const inFlight = useRef(false)

  const unlink = async (row) => {
    if (inFlight.current) return
    inFlight.current = true
    setBusyId(row.linkId)
    setError(null)
    try {
      const err = await onUnlink(row)
      if (err) setError(err)
    } finally {
      inFlight.current = false
      setBusyId(null)
    }
  }

  const countedTotal = rows.filter((r) => r.counted).reduce((sum, r) => sum + Math.round(r.amount * 100), 0) / 100

  return (
    <Modal onClose={onClose} titleId="debt-payments-title" className="fixed inset-0 bg-black/40 flex items-end sm:items-center justify-center">
      <div
        className="bg-surface dark:bg-charcoalSurface rounded-t-2xl sm:rounded-2xl border border-line dark:border-lineDark w-full sm:w-[34rem] p-5 space-y-4 max-h-[90vh] overflow-y-auto"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between gap-3">
          <h2 id="debt-payments-title" className="font-display text-lg font-semibold tracking-tight truncate">Payments: {debt.name}</h2>
          <button onClick={onClose} className="shrink-0 text-muted dark:text-mutedDark hover:text-ink dark:hover:text-offwhite" aria-label="Close">
            <X size={18} />
          </button>
        </div>

        <p className="text-sm text-ink dark:text-offwhite border border-line dark:border-lineDark rounded-lg px-3 py-2" data-testid="payments-disclosure">{DISCLOSURE}</p>

        {readOnly && <p className="text-xs text-muted dark:text-mutedDark">This debt is closed, so its payments are read-only. Reopen it to link or unlink payments.</p>}

        {rows.length === 0 ? (
          <p className="text-sm text-muted dark:text-mutedDark py-2">No payments linked yet.</p>
        ) : (
          <div className="divide-y divide-line dark:divide-lineDark border-t border-b border-line dark:border-lineDark" data-testid="payments-list">
            {rows.map((r) => (
              <div key={r.linkId} className="py-3 flex items-start justify-between gap-3" data-testid="payment-row">
                <div className="min-w-0">
                  <div className="text-sm text-ink dark:text-offwhite truncate">{r.description || 'No description'}</div>
                  <div className="text-xs text-muted dark:text-mutedDark mt-0.5">
                    {r.date ? fmtDate(r.date) : 'Date unknown'}{r.accountName ? ` · ${r.accountName}` : ''}
                  </div>
                  {r.note && <div className="text-xs text-badText mt-1" data-testid="payment-note">{r.note}</div>}
                </div>
                <div className="flex flex-col items-end gap-1 shrink-0">
                  <span className={`font-mono text-sm ${r.counted ? 'text-ink dark:text-offwhite' : 'text-muted dark:text-mutedDark line-through'}`}>
                    {r.amount == null ? '-' : formatCurrency(r.amount)}
                  </span>
                  {!readOnly && (
                    <button
                      onClick={() => unlink(r)}
                      disabled={busyId != null}
                      className="text-xs text-goldText hover:underline disabled:opacity-40"
                      aria-label={`Unlink ${r.description || 'payment'}`}
                    >
                      {busyId === r.linkId ? 'Unlinking...' : 'Unlink'}
                    </button>
                  )}
                </div>
              </div>
            ))}
          </div>
        )}

        {rows.length > 0 && (
          <p className="text-xs text-muted dark:text-mutedDark">
            {rows.filter((r) => r.counted).length} of {rows.length} linked {rows.length === 1 ? 'payment is' : 'payments are'} counted, <span className="font-mono">{formatCurrency(countedTotal)}</span> in total.
            Unlink only removes the link: the transaction stays as it is.
          </p>
        )}

        {error && <p className="text-xs text-badText" role="alert">{error}</p>}

        <div className="flex justify-end gap-2">
          <Button variant="secondary" onClick={onClose} className="px-3 py-2 rounded-lg">Close</Button>
          {!readOnly && (
            <Button onClick={onLinkMore} className="px-4 py-2 rounded-lg flex items-center gap-1.5">
              <Link2 size={16} />
              Link payments
            </Button>
          )}
        </div>
      </div>
    </Modal>
  )
}
