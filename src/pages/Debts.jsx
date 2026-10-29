import { useEffect, useMemo, useRef, useState } from 'react'
import { X, Plus, Download } from 'lucide-react'
import { supabase } from '../lib/supabaseClient.js'
import { useAuth } from '../lib/AuthContext.jsx'
import PageHeader from '../components/layout/PageHeader.jsx'
import ErrorState from '../components/layout/ErrorState.jsx'
import DebtCard from '../components/debts/DebtCard.jsx'
import DebtFormModal from '../components/debts/DebtFormModal.jsx'
import PaymentsModal from '../components/debts/PaymentsModal.jsx'
import LinkPaymentsModal from '../components/debts/LinkPaymentsModal.jsx'
import PlannerPanel from '../components/debts/PlannerPanel.jsx'
import IndicatorRow from '../components/debts/IndicatorRow.jsx'
import Button from '../components/ui/Button.jsx'
import EmptyState from '../components/ui/EmptyState.jsx'
import { friendlyError } from '../lib/errorMessages.js'
import { duplicateNameMessage } from '../lib/duplicateName.js'
import { ACTIVE_DEBT_LIMIT, rowToForm, todayISO } from '../lib/debtForm.js'
import { buildDebtsCsv, buildDebtPaymentsCsv } from '../lib/debtExport.js'
import { incomeWindow } from '../lib/debtIndicators.js'
import {
  readAllPages, readByIds, collectUnlinked, annotateLinks, computeDebtFigures, quietMonths, paymentsExportRows, paymentErrorMessage,
  DUPLICATE_LINK_MESSAGE, MISSING_MESSAGE, NOT_EXPENSE_MESSAGE,
} from '../lib/debtPayments.js'

const TABS = [
  { key: 'active', label: 'Active' },
  { key: 'closed', label: 'Closed' },
  { key: 'planner', label: 'Planner' }, // D5: the repayment planner (reads what is already loaded; writes nothing)
]

const COLUMNS = 'id, name, kind, lender, as_of_date, as_of_outstanding, as_of_accrued_interest, annual_rate_pct, monthly_payment, remaining_months, due_day, status, created_at, updated_at'

// D3 + D4b - the Debts screen. A debt is not an account: nothing here creates, edits or deletes a transaction, and no
// balance or goal is touched. It writes only `debts` (D3) and `debt_payments` (D4b: link / unlink a payment), and
// every write follows a button press. Transactions are only READ, to get the amount and date of a linked payment.
export default function Debts() {
  const { user, profile } = useAuth()
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(null)
  const [actionError, setActionError] = useState(null)
  const [debts, setDebts] = useState([])
  const [activeTab, setActiveTab] = useState('active')
  const [creating, setCreating] = useState(false)
  const [editing, setEditing] = useState(null)
  // D4b: the links, the transactions they point at, and the open dialogs.
  const [links, setLinks] = useState(null) // null until the links have been read
  const [txById, setTxById] = useState(() => new Map())
  const [accountNames, setAccountNames] = useState(() => new Map())
  const [paymentsError, setPaymentsError] = useState(null)
  const [incomeRows, setIncomeRows] = useState(null) // D6: income transactions of the last 3 complete months (read-only); null = not read or failed
  const [today, setToday] = useState(() => todayISO())
  const [paymentsDebtId, setPaymentsDebtId] = useState(null)
  const [linkData, setLinkData] = useState(null) // the picker: { debtId, candidates, more, categoryNames }
  const writing = useRef(false) // one link / unlink write at a time (a double click or a second tab cannot double up)

  const failPayments = (err) => {
    // eslint-disable-next-line no-console
    console.error(err)
    setPaymentsError("Couldn't load your linked payments. The opening figures are shown without them.")
    return null
  }

  // Read the links, then the transactions they point at (at most 100 ids per request), then the account names.
  const loadPayments = async () => {
    const t = todayISO()
    const linkRes = await readAllPages((from, to) =>
      supabase.from('debt_payments').select('id, debt_id, transaction_id, created_at').eq('user_id', user.id).order('created_at', { ascending: true }).order('id', { ascending: true }).range(from, to))
    if (linkRes.error) return failPayments(linkRes.error)
    const txRes = await readByIds((ids) =>
      supabase.from('transactions').select('id, type, amount, transaction_date, description, account_id').eq('user_id', user.id).in('id', ids), linkRes.data.map((l) => l.transaction_id))
    if (txRes.error) return failPayments(txRes.error)
    const accRes = await readAllPages((from, to) => supabase.from('accounts').select('id, name').eq('user_id', user.id).order('id', { ascending: true }).range(from, to))
    if (accRes.error) return failPayments(accRes.error)
    setTxById(new Map(txRes.data.map((r) => [r.id, r])))
    setAccountNames(new Map(accRes.data.map((a) => [a.id, a.name])))
    setLinks(linkRes.data)
    setToday(t)
    setPaymentsError(null)
    return linkRes.data // the freshly read links (callers must not rely on state, which updates later)
  }

  // D6: income of the last 3 complete calendar months, for the payment burden only. READ-ONLY. If it cannot be read the
  // indicator says so; nothing else on the page is affected.
  const loadIncome = async () => {
    const win = incomeWindow(todayISO())
    if (!win) { setIncomeRows(null); return }
    const res = await readAllPages((from, to) =>
      supabase.from('transactions').select('id, type, amount, transaction_date').eq('user_id', user.id).eq('type', 'income').gte('transaction_date', win.start).lte('transaction_date', win.end).order('transaction_date', { ascending: true }).order('id', { ascending: true }).range(from, to))
    if (res.error) {
      // eslint-disable-next-line no-console
      console.error(res.error)
      setIncomeRows(null)
      return
    }
    setIncomeRows(res.data)
  }

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
    await loadPayments()
    await loadIncome()
    setLoading(false)
  }

  // Reload only when the signed-in USER changes. Supabase hands out a new `user` object whenever the browser tab regains
  // focus or the session refreshes; depending on the object itself would reload the page and close an open Payments or
  // picker dialog, losing the selection.
  // eslint-disable-next-line react-hooks/exhaustive-deps
  useEffect(() => { load() }, [user?.id])

  const activeCount = debts.filter((d) => d.status === 'active').length
  const atLimit = activeCount >= ACTIVE_DEBT_LIMIT
  const limitMessage = `You can have ${ACTIVE_DEBT_LIMIT} active debts at once. Close one to add another.`
  const onPlanner = activeTab === 'planner'
  const visible = onPlanner ? [] : debts.filter((d) => d.status === activeTab)

  const paymentsReady = links !== null && !paymentsError
  const rowsByDebt = useMemo(() => {
    const map = new Map()
    if (!paymentsReady) return map
    for (const d of debts) map.set(d.id, annotateLinks({ debt: d, links: links.filter((l) => l.debt_id === d.id), txById, accountNames, today }))
    return map
  }, [debts, links, txById, accountNames, today, paymentsReady])
  const infoByDebt = useMemo(() => {
    const map = new Map()
    for (const d of debts) {
      const rows = rowsByDebt.get(d.id)
      if (!rows) continue
      map.set(d.id, { linkedCount: rows.length, figures: computeDebtFigures(d, rows, today), quiet: quietMonths(d, rows, today) })
    }
    return map
  }, [debts, rowsByDebt, today])
  const anyLinks = paymentsReady && links.length > 0
  const paymentsDebt = paymentsDebtId ? debts.find((d) => d.id === paymentsDebtId) || null : null

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

  // The picker: the newest unlinked expenses in the window (strictly after the as-of date, through today).
  const readCandidates = async (debt, linkList = links) => {
    const t = todayISO()
    const linkedIds = new Set((linkList || []).map((l) => l.transaction_id))
    const res = await collectUnlinked({
      debt, today: t, linkedIds,
      readPage: (from, to) =>
        supabase.from('transactions').select('id, type, amount, transaction_date, description, account_id, category_id').eq('user_id', user.id).eq('type', 'expense')
          .gt('transaction_date', String(debt.as_of_date).slice(0, 10)).lte('transaction_date', t)
          .order('transaction_date', { ascending: false }).order('id', { ascending: false }).range(from, to),
    })
    if (res.error) return { error: res.error }
    return { candidates: res.rows, more: res.more }
  }

  const openLinker = async (debt) => {
    if (writing.current) return
    writing.current = true
    setActionError(null)
    try {
      const cand = await readCandidates(debt)
      const catRes = await readAllPages((from, to) => supabase.from('categories').select('id, name').order('id', { ascending: true }).range(from, to))
      if (cand.error || catRes.error) { setActionError("Couldn't load your expenses. Please try again."); return }
      setLinkData({ debtId: debt.id, candidates: cand.candidates, more: cand.more, categoryNames: new Map(catRes.data.map((c) => [c.id, c.name])) })
    } finally {
      writing.current = false
    }
  }

  // Insert ONLY links (user_id, debt_id, transaction_id). No transaction, account or goal is written. One statement for
  // all the chosen payments: they are all linked or none is. Resolves to an error sentence, or null when saved.
  const linkPayments = async (debt, transactionIds) => {
    if (writing.current) return null
    if (debt.status === 'closed') return 'This debt is closed. Reopen it to link payments.'
    writing.current = true
    try {
      const { error: insertErr } = await supabase.from('debt_payments').insert(transactionIds.map((id) => ({ user_id: user.id, debt_id: debt.id, transaction_id: id })))
      if (insertErr) {
        // eslint-disable-next-line no-console
        console.error(insertErr)
        const message = paymentErrorMessage(insertErr, "Couldn't link these payments. Please try again.")
        if (message === DUPLICATE_LINK_MESSAGE || message === MISSING_MESSAGE || message === NOT_EXPENSE_MESSAGE) {
          // The list the user picked from is out of date: read it again, and keep their selection where it still applies.
          const fresh = await loadPayments()
          const cand = fresh ? await readCandidates(debt, fresh) : { error: true }
          if (!cand.error) setLinkData((prev) => (prev ? { ...prev, candidates: cand.candidates, more: cand.more } : prev))
        }
        return message
      }
      await loadPayments()
      setLinkData(null)
      return null
    } finally {
      writing.current = false
    }
  }

  // Delete ONLY the link row. The transaction is not touched.
  const unlinkPayment = async (debt, row) => {
    if (writing.current) return null
    if (debt.status === 'closed') return 'This debt is closed. Reopen it to unlink payments.'
    writing.current = true
    try {
      const { error: deleteErr } = await supabase.from('debt_payments').delete().eq('id', row.linkId).eq('user_id', user.id)
      if (deleteErr) {
        // eslint-disable-next-line no-console
        console.error(deleteErr)
        return "Couldn't unlink this payment. Please try again."
      }
      await loadPayments()
      return null
    } finally {
      writing.current = false
    }
  }

  const exportPaymentsCsv = () => {
    const blob = new Blob([buildDebtPaymentsCsv(paymentsExportRows(debts, rowsByDebt))], { type: 'text/csv;charset=utf-8' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = `countwise-debt-payments-${todayISO()}.csv`
    document.body.appendChild(a)
    a.click()
    a.remove()
    URL.revokeObjectURL(url)
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
      {!error && paymentsError && (
        <div className="py-3" data-testid="payments-error">
          <p className="text-sm text-badText">{paymentsError}</p>
          <Button variant="text" onClick={loadPayments} className="mt-1.5 text-sm">Retry payments</Button>
        </div>
      )}

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
        {!onPlanner && <div className="flex items-center gap-2">
          <Button variant="secondary" onClick={exportCsv} disabled={debts.length === 0} className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg">
            <Download size={16} />
            Export CSV
          </Button>
          <Button variant="secondary" onClick={exportPaymentsCsv} disabled={!anyLinks} className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg">
            <Download size={16} />
            Export payments
          </Button>
          <Button onClick={() => { setActionError(null); if (atLimit) setActionError(limitMessage); else setCreating(true) }} className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg">
            <Plus size={16} />
            Add debt
          </Button>
        </div>}
      </div>

      {activeTab === 'active' && debts.length > 0 && !error && <IndicatorRow debts={debts} infoByDebt={infoByDebt} incomeRows={incomeRows} today={today} paymentsReady={paymentsReady} />}

      {onPlanner && <PlannerPanel debts={debts} infoByDebt={infoByDebt} today={today} paymentsReady={paymentsReady} />}

      {atLimit && activeTab === 'active' && <p className="text-xs text-muted dark:text-mutedDark">{limitMessage}</p>}

      {!onPlanner && debts.length === 0 && !error && <EmptyState message="No debts added yet." className="py-8" />}
      {!onPlanner && debts.length > 0 && visible.length === 0 && <EmptyState message={`No ${activeTab} debts.`} className="py-8" />}

      {visible.length > 0 && (
        <div className="divide-y divide-line dark:divide-lineDark border-t border-b border-line dark:border-lineDark">
          {visible.map((debt) => (
            <DebtCard
              key={debt.id}
              debt={debt}
              today={today}
              payments={paymentsReady ? infoByDebt.get(debt.id) || null : null}
              onPayments={() => { setActionError(null); setPaymentsDebtId(debt.id) }}
              onEdit={() => { setActionError(null); setEditing(debt) }}
              onClose={() => setStatus(debt, 'closed')}
              onReopen={() => setStatus(debt, 'active')}
            />
          ))}
        </div>
      )}

      {paymentsDebt && !linkData && (
        <PaymentsModal
          debt={paymentsDebt}
          rows={rowsByDebt.get(paymentsDebt.id) || []}
          readOnly={paymentsDebt.status === 'closed'}
          onUnlink={(row) => unlinkPayment(paymentsDebt, row)}
          onLinkMore={() => openLinker(paymentsDebt)}
          onClose={() => setPaymentsDebtId(null)}
        />
      )}

      {paymentsDebt && linkData && linkData.debtId === paymentsDebt.id && (
        <LinkPaymentsModal
          debt={paymentsDebt}
          candidates={linkData.candidates}
          more={linkData.more}
          categoryNames={linkData.categoryNames}
          accountNames={accountNames}
          onLink={(ids) => linkPayments(paymentsDebt, ids)}
          onClose={() => setLinkData(null)}
        />
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
