import { useId, useState } from 'react'
import { ArrowLeft, X, AlertTriangle } from 'lucide-react'
import { supabase } from '../../lib/supabaseClient.js'
import { useAuth } from '../../lib/AuthContext.jsx'
import { formatCurrency } from '../../lib/format.js'
import { friendlyError } from '../../lib/errorMessages.js'
import Modal from '../ui/Modal.jsx'
import Button from '../ui/Button.jsx'

// Strip amount/currency noise out of a raw clause to seed a cleaner,
// editable description than the full "coffee 80" raw text.
function deriveDescription(raw) {
  return (raw || '')
    .replace(/₹/g, '')
    .replace(/[\d,]+(\.\d+)?/g, '')
    .replace(/\b(rs\.?|rupees)\b/gi, '')
    .replace(/\s+/g, ' ')
    .trim()
}

function resolveAccountId(name, accounts) {
  if (!name) return null
  const match = accounts.find((a) => a.name.toLowerCase() === name.toLowerCase())
  return match ? match.id : null
}

// A row can be confirmed once it has everything the schema requires —
// this is recalculated live as the user edits, so fixing a "needs
// attention" row moves it into "ready" automatically.
function canConfirmRow(row) {
  if (row.amount == null || Number(row.amount) <= 0) return false
  if (!row.type) return false
  if (!row.accountId) return false
  if (row.type === 'transfer' && !row.toAccountId) return false
  return true
}

export default function ReviewDrawer({ candidates, accounts, categories, onBack, onClose }) {
  const { user } = useAuth()
  const titleId = useId()
  const [rows, setRows] = useState(() =>
    candidates.map((c, i) => ({
      key: `${i}-${c.raw}`,
      raw: c.raw,
      description: deriveDescription(c.raw),
      amount: c.amount,
      date: c.date,
      type: c.type,
      assumedType: c.assumedType,
      categoryId: c.categoryId,
      accountId: resolveAccountId(c.account || c.fromAccount, accounts),
      toAccountId: resolveAccountId(c.toAccount, accounts),
      duplicate: c.duplicate,
      included: true,
    }))
  )
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState(null)

  const updateRow = (key, patch) => {
    setRows((prev) => prev.map((r) => (r.key === key ? { ...r, ...patch } : r)))
  }

  const readyRows = rows.filter((r) => canConfirmRow(r))
  const attentionRows = rows.filter((r) => !canConfirmRow(r))

  const includedReady = readyRows.filter((r) => r.included)
  const expenseCount = includedReady.filter((r) => r.type === 'expense').length
  const incomeCount = includedReady.filter((r) => r.type === 'income').length
  const netChange = includedReady.reduce((sum, r) => {
    if (r.type === 'income') return sum + Number(r.amount)
    if (r.type === 'expense') return sum - Number(r.amount)
    return sum // transfers never affect net change
  }, 0)

  const handleConfirm = async () => {
    const toInsert = rows.filter((r) => r.included && canConfirmRow(r))
    if (toInsert.length === 0) {
      setError('Nothing to confirm yet — include or fix at least one row.')
      return
    }

    setSaving(true)
    setError(null)

    const payload = toInsert.map((r) => ({
      user_id: user.id,
      account_id: r.accountId,
      to_account_id: r.type === 'transfer' ? r.toAccountId : null,
      category_id: r.type === 'transfer' ? null : r.categoryId,
      type: r.type,
      amount: Math.abs(Number(r.amount)), // always positive, regardless of type
      description: r.description || null,
      transaction_date: r.date,
      original_input: r.raw,
    }))

    const { error: insertErr } = await supabase.from('transactions').insert(payload)

    setSaving(false)

    if (insertErr) {
      setError(friendlyError(insertErr, "Couldn't save these transactions. Please try again."))
      return
    }

    const confirmedKeys = new Set(toInsert.map((r) => r.key))
    const remaining = rows.filter((r) => !confirmedKeys.has(r.key))

    if (remaining.length === 0) {
      onClose()
    } else {
      // Rows the user chose to exclude, or that are still incomplete, stay
      // on screen so nothing gets silently discarded.
      setRows(remaining)
    }
  }

  return (
    <Modal onClose={onClose} titleId={titleId} className="fixed inset-0 bg-black/40 flex items-end sm:items-center justify-center">
      <div
        className="bg-surface dark:bg-charcoalSurface rounded-t-2xl sm:rounded-2xl border border-line dark:border-lineDark w-full sm:w-[40rem] max-h-[85vh] flex flex-col"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between px-5 py-4 border-b border-line dark:border-lineDark shrink-0">
          <div className="flex items-center gap-2">
            <button onClick={onBack} className="text-muted dark:text-mutedDark hover:text-ink dark:hover:text-offwhite" aria-label="Back to edit">
              <ArrowLeft size={18} />
            </button>
            <h2 id={titleId} className="font-display text-lg font-semibold tracking-tight">Review</h2>
          </div>
          <button onClick={onClose} className="text-muted dark:text-mutedDark hover:text-ink dark:hover:text-offwhite" aria-label="Close">
            <X size={18} />
          </button>
        </div>

        <div className="flex-1 overflow-y-auto px-5 py-4 space-y-5">
          {readyRows.length > 0 && (
            <Section title="Ready">
              {rows
                .filter((r) => canConfirmRow(r))
                .map((row) => (
                  <RowEditor key={row.key} row={row} accounts={accounts} categories={categories} onChange={(patch) => updateRow(row.key, patch)} />
                ))}
            </Section>
          )}

          {attentionRows.length > 0 && (
            <Section title="Needs attention">
              {rows
                .filter((r) => !canConfirmRow(r))
                .map((row) => (
                  <RowEditor key={row.key} row={row} accounts={accounts} categories={categories} onChange={(patch) => updateRow(row.key, patch)} />
                ))}
            </Section>
          )}
        </div>

        <div className="px-5 py-4 border-t border-line dark:border-lineDark shrink-0 space-y-3">
          <div className="text-sm font-mono flex items-center gap-2">
            <span className="text-muted dark:text-mutedDark">
              {expenseCount} expense{expenseCount === 1 ? '' : 's'} · {incomeCount} income
            </span>
            <span className="text-muted dark:text-mutedDark">·</span>
            <span className={netChange < 0 ? 'text-bad' : 'text-good'}>Net {netChange >= 0 ? '+' : ''}{formatCurrency(netChange)}</span>
          </div>

          {error && <p className="text-sm text-bad">{error}</p>}

          <div className="flex justify-end gap-2">
            <Button variant="secondary" onClick={onClose} className="px-3 py-2 rounded-lg">
              Cancel
            </Button>
            <Button
              onClick={handleConfirm}
              disabled={saving || rows.filter((r) => r.included && canConfirmRow(r)).length === 0}
              className="px-4 py-2 rounded-lg"
            >
              {saving ? 'Saving...' : 'Confirm'}
            </Button>
          </div>
        </div>
      </div>
    </Modal>
  )
}

function Section({ title, children }) {
  return (
    <div className="space-y-2">
      <div className="text-xs font-medium text-muted dark:text-mutedDark uppercase tracking-wide">{title}</div>
      <div className="space-y-2">{children}</div>
    </div>
  )
}

function RowEditor({ row, accounts, categories, onChange }) {
  const categoryOptions = categories.filter((c) => c.kind === (row.type === 'income' ? 'income' : 'expense'))

  return (
    <div className="border border-line dark:border-lineDark rounded-lg p-3 space-y-2.5">
      <div className="flex items-start gap-2">
        <input
          type="checkbox"
          checked={row.included}
          onChange={(e) => onChange({ included: e.target.checked })}
          className="mt-1 accent-gold"
          aria-label="Include this row"
        />
        <input
          value={row.description}
          onChange={(e) => onChange({ description: e.target.value })}
          className="flex-1 bg-transparent text-sm font-medium outline-none border-b border-transparent focus:border-gold"
          placeholder="Description"
        />
        <input
          type="number"
          value={row.amount ?? ''}
          onChange={(e) => onChange({ amount: e.target.value === '' ? null : Number(e.target.value) })}
          className="w-24 bg-transparent text-sm font-mono text-right outline-none border-b border-line dark:border-lineDark focus:border-gold"
          placeholder="Amount"
        />
      </div>

      <div className="flex flex-wrap items-center gap-2 text-xs">
        <select
          value={row.type || ''}
          onChange={(e) => onChange({ type: e.target.value || null })}
          className={`rounded-md px-2 py-1 bg-paper dark:bg-charcoal ${
            row.assumedType ? 'border border-dashed border-gold text-gold' : 'border border-line dark:border-lineDark'
          }`}
        >
          <option value="">Type...</option>
          <option value="expense">Expense</option>
          <option value="income">Income</option>
          <option value="transfer">Transfer</option>
        </select>
        {row.assumedType && <span className="text-gold">suggested</span>}

        {row.type !== 'transfer' && (
          <select
            value={row.categoryId || ''}
            onChange={(e) => onChange({ categoryId: e.target.value || null })}
            className="rounded-md px-2 py-1 bg-paper dark:bg-charcoal border border-line dark:border-lineDark"
          >
            <option value="">Category...</option>
            {categoryOptions.map((c) => (
              <option key={c.id} value={c.id}>
                {c.name}
              </option>
            ))}
          </select>
        )}

        <select
          value={row.accountId || ''}
          onChange={(e) => onChange({ accountId: e.target.value || null })}
          className="rounded-md px-2 py-1 bg-paper dark:bg-charcoal border border-line dark:border-lineDark"
        >
          <option value="">{row.type === 'transfer' ? 'From account...' : 'Account...'}</option>
          {accounts.map((a) => (
            <option key={a.id} value={a.id}>
              {a.name}
            </option>
          ))}
        </select>

        {row.type === 'transfer' && (
          <select
            value={row.toAccountId || ''}
            onChange={(e) => onChange({ toAccountId: e.target.value || null })}
            className="rounded-md px-2 py-1 bg-paper dark:bg-charcoal border border-line dark:border-lineDark"
          >
            <option value="">To account...</option>
            {accounts.map((a) => (
              <option key={a.id} value={a.id}>
                {a.name}
              </option>
            ))}
          </select>
        )}

        <input
          type="date"
          value={row.date || ''}
          onChange={(e) => onChange({ date: e.target.value })}
          className="rounded-md px-2 py-1 bg-paper dark:bg-charcoal border border-line dark:border-lineDark font-mono"
        />
      </div>

      {row.duplicate?.isDuplicate && (
        <div className="flex items-center gap-1.5 text-xs text-gold">
          <AlertTriangle size={13} />
          {row.duplicate.reason}
        </div>
      )}
    </div>
  )
}
