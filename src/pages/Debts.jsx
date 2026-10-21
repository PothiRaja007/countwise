import { useEffect, useState } from 'react'
import { X, Plus, Download } from 'lucide-react'
import { supabase } from '../lib/supabaseClient.js'
import { useAuth } from '../lib/AuthContext.jsx'
import PageHeader from '../components/layout/PageHeader.jsx'
import ErrorState from '../components/layout/ErrorState.jsx'
import DebtCard from '../components/debts/DebtCard.jsx'
import DebtFormModal from '../components/debts/DebtFormModal.jsx'
import Button from '../components/ui/Button.jsx'
import EmptyState from '../components/ui/EmptyState.jsx'
import { friendlyError } from '../lib/errorMessages.js'
import { duplicateNameMessage } from '../lib/duplicateName.js'
import { ACTIVE_DEBT_LIMIT, rowToForm, todayISO } from '../lib/debtForm.js'
import { buildDebtsCsv } from '../lib/debtExport.js'

const TABS = [
  { key: 'active', label: 'Active' },
  { key: 'closed', label: 'Closed' },
]

const COLUMNS = 'id, name, kind, lender, as_of_date, as_of_outstanding, as_of_accrued_interest, annual_rate_pct, monthly_payment, remaining_months, due_day, status, created_at, updated_at'

// D3 - the Debts screen. A debt is not an account: nothing here touches transactions, balances or goals. It reads and
// writes only the `debts` table, and every write follows a button press.
export default function Debts() {
  const { user, profile } = useAuth()
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(null)
  const [actionError, setActionError] = useState(null)
  const [debts, setDebts] = useState([])
  const [activeTab, setActiveTab] = useState('active')
  const [creating, setCreating] = useState(false)
  const [editing, setEditing] = useState(null)

  const load = async () => {
    if (!user) return
    setLoading(true)
    setError(null)
    const res = await supabase.from('debts').select(COLUMNS).eq('user_id', user.id).order('updated_at', { ascending: false })
    if (res.error) {
      setError(friendlyError(res.error, "Couldn't load your debts. Please try again."))
      setLoading(false)
      return
    }
    setDebts(res.data || [])
    setLoading(false)
  }

  // eslint-disable-next-line react-hooks/exhaustive-deps
  useEffect(() => { load() }, [user])

  const activeCount = debts.filter((d) => d.status === 'active').length
  const atLimit = activeCount >= ACTIVE_DEBT_LIMIT
  const limitMessage = `You can have ${ACTIVE_DEBT_LIMIT} active debts at once. Close one to add another.`
  const visible = debts.filter((d) => d.status === activeTab)

  const createDebt = async (values) => {
    if (atLimit) return limitMessage
    const { error: insertErr } = await supabase.from('debts').insert({ user_id: user.id, ...values, status: 'active' })
    if (insertErr) {
      // eslint-disable-next-line no-console
      console.error(insertErr)
      return duplicateNameMessage(insertErr, 'debt') || "Couldn't save this debt. Please try again."
    }
    setCreating(false)
    await load()
    return null
  }

  const updateDebt = async (id, values) => {
    const { error: updateErr } = await supabase.from('debts').update({ ...values, updated_at: new Date().toISOString() }).eq('id', id).eq('user_id', user.id)
    if (updateErr) {
      // eslint-disable-next-line no-console
      console.error(updateErr)
      return duplicateNameMessage(updateErr, 'debt') || "Couldn't save your changes. Please try again."
    }
    setEditing(null)
    await load()
    return null
  }

  const setStatus = async (debt, status) => {
    setActionError(null)
    if (status === 'active' && atLimit) { setActionError(limitMessage); return }
    const { error: updateErr } = await supabase.from('debts').update({ status, updated_at: new Date().toISOString() }).eq('id', debt.id).eq('user_id', user.id)
    if (updateErr) {
      // eslint-disable-next-line no-console
      console.error(updateErr)
      setActionError(duplicateNameMessage(updateErr, 'debt') || (status === 'closed' ? "Couldn't close this debt. Please try again." : "Couldn't reopen this debt. Please try again."))
      return
    }
    await load()
  }

  const exportCsv = () => {
    const blob = new Blob([buildDebtsCsv(debts)], { type: 'text/csv;charset=utf-8' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = `countwise-debts-${todayISO()}.csv`
    document.body.appendChild(a)
    a.click()
    a.remove()
    URL.revokeObjectURL(url)
  }

  if (loading) {
    return (
      <div className="p-6 bg-paper dark:bg-charcoal min-h-screen">
        <p className="text-sm text-muted dark:text-mutedDark">Loading your debts...</p>
      </div>
    )
  }

  return (
    <div className="p-6 sm:p-8 space-y-6 bg-paper dark:bg-charcoal min-h-screen">
      <PageHeader name={profile?.username} />

      {error && <ErrorState message={error} onRetry={load} />}

      {actionError && (
        <div className="flex items-center justify-between gap-3 text-sm text-badText">
          <span>{actionError}</span>
          <button onClick={() => setActionError(null)} aria-label="Dismiss error" className="shrink-0"><X size={14} /></button>
        </div>
      )}

      <div className="flex items-center justify-between gap-3 flex-wrap">
        <div className="flex items-center gap-4">
          {TABS.map((tab) => (
            <button
              key={tab.key}
              onClick={() => setActiveTab(tab.key)}
              className={`text-sm font-medium pb-1 border-b-2 transition-colors ${
                activeTab === tab.key
                  ? 'text-ink dark:text-offwhite border-gold'
                  : 'text-muted dark:text-mutedDark border-transparent hover:text-ink dark:hover:text-offwhite'
              }`}
            >
              {tab.label}
            </button>
          ))}
        </div>
        <div className="flex items-center gap-2">
          <Button variant="secondary" onClick={exportCsv} disabled={debts.length === 0} className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg">
            <Download size={16} />
            Export CSV
          </Button>
          <Button onClick={() => { setActionError(null); if (atLimit) setActionError(limitMessage); else setCreating(true) }} className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg">
            <Plus size={16} />
            Add debt
          </Button>
        </div>
      </div>

      {atLimit && activeTab === 'active' && <p className="text-xs text-muted dark:text-mutedDark">{limitMessage}</p>}

      {debts.length === 0 && !error && <EmptyState message="No debts added yet." className="py-8" />}
      {debts.length > 0 && visible.length === 0 && <EmptyState message={`No ${activeTab} debts.`} className="py-8" />}

      {visible.length > 0 && (
        <div className="divide-y divide-line dark:divide-lineDark border-t border-b border-line dark:border-lineDark">
          {visible.map((debt) => (
            <DebtCard
              key={debt.id}
              debt={debt}
              onEdit={() => { setActionError(null); setEditing(debt) }}
              onClose={() => setStatus(debt, 'closed')}
              onReopen={() => setStatus(debt, 'active')}
            />
          ))}
        </div>
      )}

      {creating && <DebtFormModal title="Add debt" submitLabel="Save debt" onClose={() => setCreating(false)} onSubmit={createDebt} />}

      {editing && (
        <DebtFormModal
          title="Edit debt"
          submitLabel="Save changes"
          initial={rowToForm(editing)}
          existing={editing}
          onClose={() => setEditing(null)}
          onSubmit={(values) => updateDebt(editing.id, values)}
        />
      )}
    </div>
  )
}
