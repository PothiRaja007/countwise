import { useEffect, useState } from 'react'
import { Plus, Pencil, Check, X, Star, Power } from 'lucide-react'
import { supabase } from '../../lib/supabaseClient.js'
import { useAuth } from '../../lib/AuthContext.jsx'
import { accountBalance } from '../../lib/financialEngine.js'
import { formatCurrency } from '../../lib/format.js'
import Button from '../ui/Button.jsx'
import Input from '../ui/Input.jsx'
import Select from '../ui/Select.jsx'
import EmptyState from '../ui/EmptyState.jsx'

export default function AccountsSection() {
  const { user, profile, refreshProfile } = useAuth()
  const [accounts, setAccounts] = useState([])
  const [transactions, setTransactions] = useState([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(null)

  const [newName, setNewName] = useState('')
  const [newType, setNewType] = useState('wallet')
  const [adding, setAdding] = useState(false)

  const [editingId, setEditingId] = useState(null)
  const [editingName, setEditingName] = useState('')
  const [rowError, setRowError] = useState({}) // { [accountId]: message }
  const [busyId, setBusyId] = useState(null) // account currently mid set-default/deactivate call

  const load = async () => {
    setLoading(true)
    setError(null)

    // All accounts (active + inactive) — this is the management view, so
    // deactivated accounts must still show up here, unlike the is_active-only
    // pickers used in Money Inbox/Goals/Overview.
    const [accountsRes, transactionsRes] = await Promise.all([
      supabase.from('accounts').select('*').eq('user_id', user.id).order('created_at', { ascending: true }),
      // accountBalance() needs the full transaction list per account — it
      // filters internally, so nothing here is a hand-rolled balance calc.
      supabase.from('transactions').select('account_id, to_account_id, type, amount').eq('user_id', user.id),
    ])

    setLoading(false)

    if (accountsRes.error || transactionsRes.error) {
      // eslint-disable-next-line no-console
      console.error(accountsRes.error || transactionsRes.error)
      setError('Something went wrong loading your accounts. Please try again.')
      return
    }

    setAccounts(accountsRes.data || [])
    setTransactions(transactionsRes.data || [])
  }

  useEffect(() => {
    if (user) load()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user])

  const setRowErr = (id, msg) => setRowError((prev) => ({ ...prev, [id]: msg }))
  const clearRowErr = (id) =>
    setRowError((prev) => {
      const next = { ...prev }
      delete next[id]
      return next
    })

  const handleAddAccount = async () => {
    const name = newName.trim()
    if (!name || !user) return
    setAdding(true)
    setError(null)

    const { error: insertErr } = await supabase.from('accounts').insert({
      user_id: user.id,
      name,
      type: newType,
      is_active: true,
      is_default: false,
    })

    setAdding(false)

    if (insertErr) {
      // eslint-disable-next-line no-console
      console.error(insertErr)
      setError("Couldn't add that account. Please try again.")
      return
    }

    setNewName('')
    await load()
  }

  const startEdit = (account) => {
    setEditingId(account.id)
    setEditingName(account.name)
    clearRowErr(account.id)
  }

  const handleRenameSave = async (account) => {
    const name = editingName.trim()
    if (!name) return
    clearRowErr(account.id)

    const { error: updateErr } = await supabase.from('accounts').update({ name }).eq('id', account.id)

    if (updateErr) {
      // eslint-disable-next-line no-console
      console.error(updateErr)
      setRowErr(account.id, "Couldn't rename this account. Please try again.")
      return
    }

    setEditingId(null)
    await load()
  }

  // The single source of truth for "which account is default" is
  // profiles.default_account_id — accounts.is_default is written once at
  // onboarding seed time and nothing else in the app reads it since, so it
  // isn't kept in sync here. Because default_account_id is one foreign-key
  // column (not a boolean per row), overwriting it already guarantees only
  // one account can be default at a time — the old value is inherently
  // replaced, no separate "unset" step is needed.
  const handleSetDefault = async (account) => {
    if (!user || account.id === profile?.default_account_id) return
    clearRowErr(account.id)
    setBusyId(account.id)

    const { error: updateErr } = await supabase
      .from('profiles')
      .update({ default_account_id: account.id })
      .eq('id', user.id)

    setBusyId(null)

    if (updateErr) {
      // eslint-disable-next-line no-console
      console.error(updateErr)
      setRowErr(account.id, "Couldn't set this as your default account. Please try again.")
      return
    }

    await refreshProfile()
  }

  // Deactivating is reversible (toggles is_active back and forth) — the
  // spec only describes the false direction, but stranding a user who
  // deactivates by mistake with no way back seemed worse than reusing the
  // same field both ways. Flagged in the handoff for the spine to confirm.
  const handleToggleActive = async (account) => {
    clearRowErr(account.id)

    if (account.is_active) {
      const stillActiveElsewhere = accounts.some((a) => a.id !== account.id && a.is_active)
      if (!stillActiveElsewhere) {
        setRowErr(account.id, 'You need at least one active account — Money Inbox needs somewhere to attach entries to.')
        return
      }
    }

    setBusyId(account.id)
    const { error: updateErr } = await supabase
      .from('accounts')
      .update({ is_active: !account.is_active })
      .eq('id', account.id)
    setBusyId(null)

    if (updateErr) {
      // eslint-disable-next-line no-console
      console.error(updateErr)
      setRowErr(account.id, "Couldn't update this account. Please try again.")
      return
    }

    await load()
  }

  if (loading) {
    return <p className="text-sm text-muted dark:text-mutedDark">Loading...</p>
  }

  if (error) {
    return (
      <div>
        <p className="text-sm text-bad">{error}</p>
        <Button variant="text" onClick={load} className="mt-1.5 text-sm">
          Retry
        </Button>
      </div>
    )
  }

  return (
    <div className="space-y-6 max-w-2xl">
      <div className="flex flex-wrap items-end gap-2">
        <div className="flex-1 min-w-[160px]">
          <label htmlFor="new-account-name" className="block text-xs font-medium text-muted dark:text-mutedDark mb-1">
            New account
          </label>
          <Input
            id="new-account-name"
            type="text"
            value={newName}
            onChange={(e) => setNewName(e.target.value)}
            placeholder="e.g. SBI Savings"
            maxLength={40}
            className="w-full text-sm py-2 px-3 rounded-md bg-surface dark:bg-charcoalSurface"
          />
        </div>
        <Select
          value={newType}
          onChange={(e) => setNewType(e.target.value)}
          className="text-sm py-2 px-3 rounded-md bg-surface dark:bg-charcoalSurface"
        >
          <option value="wallet">Wallet</option>
          <option value="bank">Bank</option>
        </Select>
        <Button
          onClick={handleAddAccount}
          disabled={!newName.trim() || adding}
          className="flex items-center gap-1.5 px-3 py-2 rounded-md"
        >
          <Plus size={15} />
          {adding ? 'Adding...' : 'Add'}
        </Button>
      </div>

      <div className="space-y-2">
        {accounts.map((account) => {
          const isEditing = editingId === account.id
          const isDefault = account.id === profile?.default_account_id
          const isBusy = busyId === account.id
          const balance = accountBalance(transactions, account.id)

          return (
            <div key={account.id} className="border border-line dark:border-lineDark rounded-md px-3 py-2.5">
              <div className="flex items-center justify-between gap-2 flex-wrap">
                <div className="flex items-center gap-2 min-w-0">
                  {isEditing ? (
                    <input
                      autoFocus
                      value={editingName}
                      onChange={(e) => setEditingName(e.target.value)}
                      maxLength={40}
                      className="text-sm py-1 px-2 rounded bg-surface dark:bg-charcoalSurface border border-gold outline-none focus:ring-2 focus:ring-gold/50"
                    />
                  ) : (
                    <span className={`text-sm font-medium truncate ${account.is_active ? '' : 'text-muted dark:text-mutedDark'}`}>
                      {account.name}
                    </span>
                  )}
                  <span className="text-xs text-muted dark:text-mutedDark shrink-0">{account.type}</span>
                  {isDefault && (
                    <span className="flex items-center gap-1 text-xs px-1.5 py-0.5 rounded border border-gold/40 text-gold shrink-0">
                      <Star size={11} className="fill-gold" />
                      Default
                    </span>
                  )}
                  {!account.is_active && (
                    <span className="text-xs px-1.5 py-0.5 rounded border border-line dark:border-lineDark text-muted dark:text-mutedDark shrink-0">
                      Deactivated
                    </span>
                  )}
                </div>

                <div className="flex items-center gap-1 shrink-0">
                  {isEditing ? (
                    <>
                      <button
                        onClick={() => handleRenameSave(account)}
                        aria-label="Save name"
                        className="p-1.5 text-good hover:bg-paper dark:hover:bg-charcoal rounded"
                      >
                        <Check size={15} />
                      </button>
                      <button
                        onClick={() => setEditingId(null)}
                        aria-label="Cancel"
                        className="p-1.5 text-muted dark:text-mutedDark hover:bg-paper dark:hover:bg-charcoal rounded"
                      >
                        <X size={15} />
                      </button>
                    </>
                  ) : (
                    <>
                      {!isDefault && (
                        <button
                          onClick={() => handleSetDefault(account)}
                          disabled={isBusy}
                          title="Set as default"
                          className="p-1.5 rounded text-muted dark:text-mutedDark hover:bg-paper dark:hover:bg-charcoal disabled:opacity-40"
                        >
                          <Star size={15} />
                        </button>
                      )}
                      <button
                        onClick={() => startEdit(account)}
                        aria-label={`Rename ${account.name}`}
                        title="Rename"
                        className="p-1.5 rounded text-muted dark:text-mutedDark hover:bg-paper dark:hover:bg-charcoal"
                      >
                        <Pencil size={15} />
                      </button>
                      <button
                        onClick={() => handleToggleActive(account)}
                        disabled={isBusy}
                        aria-label={account.is_active ? `Deactivate ${account.name}` : `Reactivate ${account.name}`}
                        title={account.is_active ? 'Deactivate' : 'Reactivate'}
                        className={`p-1.5 rounded hover:bg-paper dark:hover:bg-charcoal disabled:opacity-40 ${
                          account.is_active ? 'text-muted dark:text-mutedDark' : 'text-gold'
                        }`}
                      >
                        <Power size={15} />
                      </button>
                    </>
                  )}
                </div>
              </div>

              <div className="mt-1.5 font-mono text-sm text-ink dark:text-offwhite">{formatCurrency(balance)}</div>

              {rowError[account.id] && <p className="text-xs text-bad mt-1.5">{rowError[account.id]}</p>}
            </div>
          )
        })}
        {accounts.length === 0 && <EmptyState message="No accounts yet." className="py-2" />}
      </div>
    </div>
  )
}
