import { useMemo, useRef, useState } from 'react'
import { X } from 'lucide-react'
import Modal from '../ui/Modal.jsx'
import Button from '../ui/Button.jsx'
import { formatCurrency } from '../../lib/format.js'
import { dateFromISO } from '../../lib/isoDate.js'
import { PICKER_LIMIT, splitSuggestions } from '../../lib/debtPayments.js'

const fmtDate = (iso) => dateFromISO(iso).toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' })

function Row({ tx, checked, onToggle, accountName }) {
  const id = `link-${tx.id}`
  return (
    <label htmlFor={id} className="flex items-start gap-2 py-2.5 cursor-pointer" data-testid="link-row">
      <input id={id} type="checkbox" checked={checked} onChange={onToggle} className="mt-1 accent-gold" />
      <span className="min-w-0 flex-1">
        <span className="block text-sm text-ink dark:text-offwhite truncate">{tx.description || 'No description'}</span>
        <span className="block text-xs text-muted dark:text-mutedDark mt-0.5">{fmtDate(tx.transaction_date)}{accountName ? ` · ${accountName}` : ''}</span>
      </span>
      <span className="font-mono text-sm text-ink dark:text-offwhite shrink-0">{formatCurrency(tx.amount)}</span>
    </label>
  )
}

// Manual picking only. Nothing here chooses a payment for the user: EMI / Loan expenses are listed first as a
// suggestion, every other eligible expense is one click away. onLink(ids) resolves to an error sentence or null.
// The selection is kept when a save fails, so the user can simply try again.
export default function LinkPaymentsModal({ debt, candidates, more, categoryNames, accountNames, onLink, onClose }) {
  const { suggested, others } = useMemo(() => splitSuggestions(candidates, categoryNames), [candidates, categoryNames])
  const [selected, setSelected] = useState(() => new Set())
  const [showOthers, setShowOthers] = useState(suggested.length === 0)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState(null)
  const inFlight = useRef(false)

  const offered = new Set(candidates.map((c) => c.id))
  const chosen = candidates.filter((c) => selected.has(c.id) && offered.has(c.id))
  const total = chosen.reduce((sum, c) => sum + Math.round(Number(c.amount) * 100), 0) / 100

  const toggle = (id) => setSelected((prev) => { const next = new Set(prev); if (next.has(id)) next.delete(id); else next.add(id); return next })

  const submit = async () => {
    if (inFlight.current || chosen.length === 0) return
    inFlight.current = true
    setSaving(true)
    setError(null)
    try {
      const err = await onLink(chosen.map((c) => c.id))
      if (err) setError(err)
    } finally {
      inFlight.current = false
      setSaving(false)
    }
  }

  return (
    <Modal onClose={onClose} titleId="debt-link-title" className="fixed inset-0 bg-black/40 flex items-end sm:items-center justify-center">
      <div
        className="bg-surface dark:bg-charcoalSurface rounded-t-2xl sm:rounded-2xl border border-line dark:border-lineDark w-full sm:w-[34rem] p-5 space-y-4 max-h-[90vh] overflow-y-auto"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between gap-3">
          <h2 id="debt-link-title" className="font-display text-lg font-semibold tracking-tight truncate">Link payments: {debt.name}</h2>
          <button onClick={onClose} className="shrink-0 text-muted dark:text-mutedDark hover:text-ink dark:hover:text-offwhite" aria-label="Close">
            <X size={18} />
          </button>
        </div>

        <p className="text-xs text-muted dark:text-mutedDark">
          Your expenses dated after {fmtDate(debt.as_of_date)} and up to today, that are not linked to a debt yet. Pick the ones that were payments on this debt. Linking changes no transaction and no balance.
        </p>

        {candidates.length === 0 && <p className="text-sm text-muted dark:text-mutedDark py-2" data-testid="link-empty">No unlinked expenses to link in this period.</p>}

        {suggested.length > 0 && (
          <div>
            <h3 className="text-xs font-medium text-muted dark:text-mutedDark mb-1">Suggested: EMI / Loan expenses</h3>
            <div className="divide-y divide-line dark:divide-lineDark border-t border-b border-line dark:border-lineDark" data-testid="link-suggested">
              {suggested.map((tx) => <Row key={tx.id} tx={tx} checked={selected.has(tx.id)} onToggle={() => toggle(tx.id)} accountName={accountNames.get(tx.account_id)} />)}
            </div>
          </div>
        )}

        {others.length > 0 && (
          <div>
            {suggested.length > 0 && (
              <button onClick={() => setShowOthers((v) => !v)} className="text-xs text-goldText hover:underline mb-1" aria-expanded={showOthers}>
                {showOthers ? 'Hide other expenses' : `Show other expenses (${others.length})`}
              </button>
            )}
            {showOthers && (
              <>
                {suggested.length > 0 && <h3 className="text-xs font-medium text-muted dark:text-mutedDark mb-1">Other expenses</h3>}
                <div className="divide-y divide-line dark:divide-lineDark border-t border-b border-line dark:border-lineDark" data-testid="link-others">
                  {others.map((tx) => <Row key={tx.id} tx={tx} checked={selected.has(tx.id)} onToggle={() => toggle(tx.id)} accountName={accountNames.get(tx.account_id)} />)}
                </div>
              </>
            )}
          </div>
        )}

        {more && (
          <p className="text-xs text-muted dark:text-mutedDark" data-testid="link-more">
            Showing the {PICKER_LIMIT} newest eligible expenses. Older ones may exist and are not listed here.
          </p>
        )}

        {error && <p className="text-xs text-badText" role="alert">{error}</p>}

        <div className="flex items-center justify-between gap-2">
          <span className="text-xs text-muted dark:text-mutedDark">
            {chosen.length === 0 ? 'Nothing selected' : <>{chosen.length} selected, <span className="font-mono">{formatCurrency(total)}</span></>}
          </span>
          <div className="flex gap-2">
            <Button variant="secondary" onClick={onClose} className="px-3 py-2 rounded-lg">Back</Button>
            <Button onClick={submit} disabled={saving || chosen.length === 0} className="px-4 py-2 rounded-lg">
              {saving ? 'Linking...' : chosen.length > 1 ? `Link ${chosen.length} payments` : 'Link payment'}
            </Button>
          </div>
        </div>
      </div>
    </Modal>
  )
}
