import { useState } from 'react'
import { X } from 'lucide-react'
import { supabase } from '../../lib/supabaseClient.js'
import { available } from '../../lib/financialEngine.js'
import { formatCurrency } from '../../lib/format.js'
import Modal from '../ui/Modal.jsx'
import Button from '../ui/Button.jsx'
import Input from '../ui/Input.jsx'
import Select from '../ui/Select.jsx'

function toISODate(date) {
  const y = date.getFullYear()
  const m = String(date.getMonth() + 1).padStart(2, '0')
  const d = String(date.getDate()).padStart(2, '0')
  return `${y}-${m}-${d}`
}

// Shared modal for both directions — mode is 'contribution' or 'withdrawal'.
// Contribution is capped by the selected account's available (unallocated)
// balance; withdrawal is capped by the goal's current progress.
export default function ContributeModal({ mode, goal, currentProgress, accounts, transactions, goalContributions, userId, onClose, onSaved, onError }) {
  const [accountId, setAccountId] = useState(accounts[0]?.id || '')
  const [amount, setAmount] = useState('')
  const [saving, setSaving] = useState(false)
  const [localError, setLocalError] = useState(null)

  const isContribution = mode === 'contribution'
  const numericAmount = Number(amount)

  const accountAvailable = accountId ? available(transactions, goalContributions, accountId) : 0

  const overLimit = isContribution
    ? numericAmount > accountAvailable
    : numericAmount > currentProgress

  const canSave = numericAmount > 0 && !!accountId && !overLimit

  const handleSave = async () => {
    if (!canSave) return
    setSaving(true)
    setLocalError(null)

    const { error: insertErr } = await supabase.from('goal_contributions').insert({
      user_id: userId,
      goal_id: goal.id,
      account_id: accountId,
      amount: numericAmount,
      type: isContribution ? 'contribution' : 'withdrawal',
      contribution_date: toISODate(new Date()),
    })

    if (insertErr) {
      // eslint-disable-next-line no-console
      console.error(insertErr)
      setSaving(false)
      const friendly = isContribution
        ? "Couldn't save this contribution. Please try again."
        : "Couldn't save this withdrawal. Please try again."
      setLocalError(friendly)
      onError(friendly)
      return
    }

    // If this contribution reaches or passes the target, mark the goal
    // completed so it moves into the completed tab and offers "reuse."
    if (isContribution) {
      const newProgress = currentProgress + numericAmount
      if (newProgress >= goal.target_amount && goal.status === 'active') {
        await supabase.from('goals').update({ status: 'completed' }).eq('id', goal.id)
      }
    }

    setSaving(false)
    onSaved()
  }

  return (
    <Modal onClose={onClose} titleId="contribute-modal-title" className="fixed inset-0 bg-black/40 flex items-end sm:items-center justify-center">
      <div
        className="bg-surface dark:bg-charcoalSurface rounded-t-2xl sm:rounded-2xl border border-line dark:border-lineDark w-full sm:w-96 p-5 space-y-4"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between">
          <h2 id="contribute-modal-title" className="font-display text-lg font-semibold tracking-tight">
            {isContribution ? 'Contribute to' : 'Withdraw from'} {goal.name}
          </h2>
          <button onClick={onClose} className="text-muted dark:text-mutedDark hover:text-ink dark:hover:text-offwhite" aria-label="Close">
            <X size={18} />
          </button>
        </div>

        <div className="space-y-3">
          <Select
            value={accountId}
            onChange={(e) => setAccountId(e.target.value)}
            className="w-full bg-paper dark:bg-charcoal rounded-lg px-3 py-2 text-sm"
          >
            <option value="">{isContribution ? 'From account...' : 'Return funds to account...'}</option>
            {accounts.map((a) => (
              <option key={a.id} value={a.id}>
                {a.name}
              </option>
            ))}
          </Select>

          {isContribution && accountId && (
            <p className="text-xs text-muted dark:text-mutedDark">
              Available in this account: <span className="font-mono">{formatCurrency(accountAvailable)}</span>
            </p>
          )}
          {!isContribution && (
            <p className="text-xs text-muted dark:text-mutedDark">
              Current progress: <span className="font-mono">{formatCurrency(currentProgress)}</span>
            </p>
          )}

          <Input
            type="number"
            value={amount}
            onChange={(e) => setAmount(e.target.value)}
            placeholder="Amount"
            className="w-full bg-paper dark:bg-charcoal rounded-lg px-3 py-2 text-sm font-mono"
          />

          {overLimit && numericAmount > 0 && (
            <p className="text-xs text-bad">
              {isContribution
                ? `That's more than this account's available balance (${formatCurrency(accountAvailable)}). Lower the amount or pick another account.`
                : `That's more than this goal's current progress (${formatCurrency(currentProgress)}).`}
            </p>
          )}

          {localError && <p className="text-xs text-bad">{localError}</p>}
        </div>

        <div className="flex justify-end gap-2">
          <Button variant="secondary" onClick={onClose} className="px-3 py-2 rounded-lg">
            Cancel
          </Button>
          <Button
            onClick={handleSave}
            disabled={!canSave || saving}
            className="px-4 py-2 rounded-lg"
          >
            {saving ? 'Saving...' : isContribution ? 'Contribute' : 'Withdraw'}
          </Button>
        </div>
      </div>
    </Modal>
  )
}
