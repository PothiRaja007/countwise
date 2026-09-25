import { useEffect, useMemo, useState } from 'react'
import { X, Pencil, Trash2 } from 'lucide-react'
import { supabase } from '../lib/supabaseClient.js'
import { useAuth } from '../lib/AuthContext.jsx'
import { totalIncome, totalExpenses, netCashFlow } from '../lib/financialEngine.js'
import { filterTransactions, sortTransactions, groupByDate, dateGroupLabel } from '../lib/transactionFilters.js'
import { formatCurrency } from '../lib/format.js'
import { categoryPillClasses } from '../lib/categoryColors.js'
import PageHeader from '../components/layout/PageHeader.jsx'
import ErrorState from '../components/layout/ErrorState.jsx'
import Modal from '../components/ui/Modal.jsx'
import Button from '../components/ui/Button.jsx'
import Input from '../components/ui/Input.jsx'
import Select from '../components/ui/Select.jsx'
import EmptyState from '../components/ui/EmptyState.jsx'
import { friendlyError } from '../lib/errorMessages.js'

// Wide enough to include every row already scoped by filterTransactions —
// financialEngine's period functions still need bounds, but the actual
// date narrowing already happened in filterTransactions, not here.
const ALL_TIME_START = '1900-01-01'
const ALL_TIME_END = '2999-12-31'

const EMPTY_FILTERS = { search: '', dateFrom: '', dateTo: '', categoryId: '', accountId: '', type: '' }

function toISODate(date) {
  const y = date.getFullYear()
  const m = String(date.getMonth() + 1).padStart(2, '0')
  const d = String(date.getDate()).padStart(2, '0')
  return `${y}-${m}-${d}`
}

export default function Transactions() {
  const { user, profile } = useAuth()
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(null)
  const [transactions, setTransactions] = useState([])
  const [accounts, setAccounts] = useState([])
  const [categories, setCategories] = useState([])

  const [filters, setFilters] = useState(EMPTY_FILTERS)
  const [sortBy, setSortBy] = useState('date')
  const [sortDir, setSortDir] = useState('desc')

  const [editingTransaction, setEditingTransaction] = useState(null)
  const [deletingTransaction, setDeletingTransaction] = useState(null)

  const load = async () => {
    if (!user) return
    setLoading(true)
    setError(null)

    const [accountsRes, categoriesRes, transactionsRes] = await Promise.all([
      supabase.from('accounts').select('id, name, type').eq('user_id', user.id),
      supabase.from('categories').select('id, name, kind').or(`user_id.eq.${user.id},user_id.is.null`),
      supabase
        .from('transactions')
        .select('id, account_id, to_account_id, category_id, type, amount, description, transaction_date, original_input, created_at')
        .eq('user_id', user.id),
    ])

    const firstError = accountsRes.error || categoriesRes.error || transactionsRes.error
    if (firstError) {
      setError(friendlyError(firstError, "Couldn't load your transactions. Please try again."))
      setLoading(false)
      return
    }

    setAccounts(accountsRes.data || [])
    setCategories(categoriesRes.data || [])
    setTransactions(transactionsRes.data || [])
    setLoading(false)
  }

  useEffect(() => {
    load()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user])

  const categoryNameById = useMemo(() => {
    const map = new Map()
    categories.forEach((c) => map.set(c.id, c.name))
    return map
  }, [categories])

  const accountNameById = useMemo(() => {
    const map = new Map()
    accounts.forEach((a) => map.set(a.id, a.name))
    return map
  }, [accounts])

  const filtered = useMemo(() => filterTransactions(transactions, filters), [transactions, filters])
  const sorted = useMemo(() => sortTransactions(filtered, sortBy, sortDir), [filtered, sortBy, sortDir])
  const groups = useMemo(() => (sortBy === 'date' ? groupByDate(sorted) : null), [sorted, sortBy])

  const summary = useMemo(
    () => ({
      income: totalIncome(filtered, ALL_TIME_START, ALL_TIME_END),
      expenses: totalExpenses(filtered, ALL_TIME_START, ALL_TIME_END),
      net: netCashFlow(filtered, ALL_TIME_START, ALL_TIME_END),
    }),
    [filtered]
  )

  const hasAnyTransactions = transactions.length > 0
  const hasFilteredResults = filtered.length > 0
  const filtersActive = Object.values(filters).some((v) => v)

  const todayISO = toISODate(new Date())
  const yesterdayISO = toISODate(new Date(Date.now() - 24 * 60 * 60 * 1000))

  const updateFilter = (patch) => setFilters((prev) => ({ ...prev, ...patch }))

  const handleDelete = async () => {
    if (!deletingTransaction) return
    const { error: deleteErr } = await supabase.from('transactions').delete().eq('id', deletingTransaction.id)
    if (deleteErr) {
      setError(friendlyError(deleteErr, "Couldn't delete this transaction. Please try again."))
      setDeletingTransaction(null)
      return
    }
    setDeletingTransaction(null)
    await load()
  }

  if (loading) {
    return (
      <div className="p-6 bg-paper dark:bg-charcoal min-h-screen">
        <p className="text-sm text-muted dark:text-mutedDark">Loading your transactions...</p>
      </div>
    )
  }

  return (
    <div className="p-6 sm:p-8 space-y-6 bg-paper dark:bg-charcoal min-h-screen">
      <PageHeader name={profile?.username} />

      {error && <ErrorState message={error} onRetry={load} />}

      {/* Filtered-view summary — reuses financialEngine's own math, no hand-rolled totals */}
      <div className="flex flex-col sm:flex-row divide-y sm:divide-y-0 sm:divide-x divide-line dark:divide-lineDark border-t border-b border-line dark:border-lineDark">
        <SummaryItem label="Income" value={summary.income} tone="good" />
        <SummaryItem label="Expenses" value={summary.expenses} tone="bad" />
        <SummaryItem label="Net" value={summary.net} tone={summary.net < 0 ? 'bad' : 'good'} />
      </div>

      <FilterBar filters={filters} onChange={updateFilter} categories={categories} accounts={accounts} sortBy={sortBy} sortDir={sortDir} onSortByChange={setSortBy} onSortDirChange={setSortDir} />

      {!hasAnyTransactions && <EmptyState message="Your money story starts here." className="py-8" />}

      {hasAnyTransactions && !hasFilteredResults && (
        <p className="text-sm text-muted dark:text-mutedDark py-8">
          No transactions match these filters.
          {filtersActive && (
            <Button variant="text" onClick={() => setFilters(EMPTY_FILTERS)} className="ml-2">
              Clear filters
            </Button>
          )}
        </p>
      )}

      {hasFilteredResults && groups && (
        <div className="space-y-6">
          {groups.map((group) => (
            <div key={group.date}>
              <div className="text-xs font-medium text-muted dark:text-mutedDark uppercase tracking-wide mb-2">
                {dateGroupLabel(group.date, todayISO, yesterdayISO)}
              </div>
              <div className="divide-y divide-line dark:divide-lineDark">
                {group.transactions.map((t) => (
                  <TransactionRow
                    key={t.id}
                    transaction={t}
                    categoryName={categoryNameById.get(t.category_id)}
                    accountName={accountNameById.get(t.account_id)}
                    toAccountName={t.to_account_id ? accountNameById.get(t.to_account_id) : null}
                    onEdit={() => setEditingTransaction(t)}
                    onDelete={() => setDeletingTransaction(t)}
                  />
                ))}
              </div>
            </div>
          ))}
        </div>
      )}

      {hasFilteredResults && !groups && (
        <div className="divide-y divide-line dark:divide-lineDark">
          {sorted.map((t) => (
            <TransactionRow
              key={t.id}
              transaction={t}
              categoryName={categoryNameById.get(t.category_id)}
              accountName={accountNameById.get(t.account_id)}
              toAccountName={t.to_account_id ? accountNameById.get(t.to_account_id) : null}
              dateLabel={dateGroupLabel(t.transaction_date, todayISO, yesterdayISO)}
              onEdit={() => setEditingTransaction(t)}
              onDelete={() => setDeletingTransaction(t)}
            />
          ))}
        </div>
      )}

      {editingTransaction && (
        <EditModal
          transaction={editingTransaction}
          accounts={accounts}
          categories={categories}
          onClose={() => setEditingTransaction(null)}
          onSaved={async () => {
            setEditingTransaction(null)
            await load()
          }}
          onError={setError}
        />
      )}

      {deletingTransaction && (
        <ConfirmDeleteModal
          transaction={deletingTransaction}
          categoryName={categoryNameById.get(deletingTransaction.category_id)}
          onCancel={() => setDeletingTransaction(null)}
          onConfirm={handleDelete}
        />
      )}
    </div>
  )
}

function SummaryItem({ label, value, tone }) {
  const toneClass = tone === 'good' ? 'text-good' : tone === 'bad' ? 'text-bad' : 'text-ink dark:text-offwhite'
  return (
    <div className="flex-1 py-4 sm:px-6 first:sm:pl-0">
      <div className="text-xs font-medium text-muted dark:text-mutedDark uppercase tracking-wide mb-1.5">{label}</div>
      <div className={`font-mono text-2xl font-semibold ${toneClass}`}>{formatCurrency(value)}</div>
    </div>
  )
}

function FilterBar({ filters, onChange, categories, accounts, sortBy, sortDir, onSortByChange, onSortDirChange }) {
  // Only the sort-direction toggle keeps the full standalone string — it's
  // a button styled to visually match its sibling fields, not a text
  // input/select, so it doesn't go through Input/Select.
  const inputClass =
    'rounded-md px-2.5 py-1.5 bg-surface dark:bg-charcoalSurface border border-line dark:border-lineDark text-sm outline-none focus:border-gold'
  const fieldClass = 'rounded-md px-2.5 py-1.5 bg-surface dark:bg-charcoalSurface text-sm'

  return (
    <div className="flex flex-wrap items-center gap-2">
      <Input
        value={filters.search}
        onChange={(e) => onChange({ search: e.target.value })}
        placeholder="Search description..."
        className={`${fieldClass} flex-1 min-w-[10rem]`}
      />

      <Select value={filters.type} onChange={(e) => onChange({ type: e.target.value })} className={fieldClass}>
        <option value="">All types</option>
        <option value="expense">Expense</option>
        <option value="income">Income</option>
        <option value="transfer">Transfer</option>
      </Select>

      <Select value={filters.categoryId} onChange={(e) => onChange({ categoryId: e.target.value })} className={fieldClass}>
        <option value="">All categories</option>
        {categories.map((c) => (
          <option key={c.id} value={c.id}>
            {c.name}
          </option>
        ))}
      </Select>

      <Select value={filters.accountId} onChange={(e) => onChange({ accountId: e.target.value })} className={fieldClass}>
        <option value="">All accounts</option>
        {accounts.map((a) => (
          <option key={a.id} value={a.id}>
            {a.name}
          </option>
        ))}
      </Select>

      <Input type="date" value={filters.dateFrom} onChange={(e) => onChange({ dateFrom: e.target.value })} className={`${fieldClass} font-mono`} />
      <span className="text-muted dark:text-mutedDark text-sm">to</span>
      <Input type="date" value={filters.dateTo} onChange={(e) => onChange({ dateTo: e.target.value })} className={`${fieldClass} font-mono`} />

      <Select value={sortBy} onChange={(e) => onSortByChange(e.target.value)} className={fieldClass}>
        <option value="date">Sort: Date</option>
        <option value="amount">Sort: Amount</option>
      </Select>
      <button
        onClick={() => onSortDirChange(sortDir === 'asc' ? 'desc' : 'asc')}
        className={inputClass}
        aria-label="Toggle sort direction"
        title={sortDir === 'asc' ? 'Ascending' : 'Descending'}
      >
        {sortDir === 'asc' ? '↑' : '↓'}
      </button>
    </div>
  )
}

function TransactionRow({ transaction, categoryName, accountName, toAccountName, dateLabel, onEdit, onDelete }) {
  const isTransfer = transaction.type === 'transfer'
  const isIncome = transaction.type === 'income'
  const amountClass = isTransfer ? 'text-ink dark:text-offwhite' : isIncome ? 'text-good' : 'text-bad'
  const sign = isTransfer ? '' : isIncome ? '+' : '-'
  const pillLabel = isTransfer ? 'Transfer' : categoryName || (isIncome ? 'Income' : 'Expense')

  return (
    <div className="group flex items-center justify-between py-3">
      <div className="flex items-center gap-3 min-w-0">
        <span className={`text-xs font-medium px-2 py-1 rounded-md shrink-0 ${categoryPillClasses(pillLabel)}`}>
          {pillLabel}
        </span>
        <div className="min-w-0">
          <div className="text-sm text-ink dark:text-offwhite truncate">
            {transaction.description || (isTransfer ? `${accountName} → ${toAccountName}` : accountName)}
          </div>
          {transaction.description && (
            <div className="text-xs text-muted dark:text-mutedDark truncate">
              {isTransfer ? `${accountName} → ${toAccountName}` : accountName}
            </div>
          )}
        </div>
      </div>

      <div className="flex items-center gap-3 shrink-0 pl-3">
        <div className="text-right">
          <div className={`font-mono text-sm ${amountClass}`}>
            {sign}
            {formatCurrency(transaction.amount)}
          </div>
          {dateLabel && <div className="font-mono text-xs text-muted dark:text-mutedDark">{dateLabel}</div>}
        </div>
        <div className="flex items-center gap-1 opacity-100 md:opacity-0 md:group-hover:opacity-100 md:group-focus-within:opacity-100 transition-opacity">
          <button onClick={onEdit} className="p-1.5 text-muted dark:text-mutedDark hover:text-gold" aria-label="Edit transaction">
            <Pencil size={14} />
          </button>
          <button onClick={onDelete} className="p-1.5 text-muted dark:text-mutedDark hover:text-bad" aria-label="Delete transaction">
            <Trash2 size={14} />
          </button>
        </div>
      </div>
    </div>
  )
}

function EditModal({ transaction, accounts, categories, onClose, onSaved, onError }) {
  const [description, setDescription] = useState(transaction.description || '')
  const [amount, setAmount] = useState(transaction.amount)
  const [type, setType] = useState(transaction.type)
  const [categoryId, setCategoryId] = useState(transaction.category_id || '')
  const [accountId, setAccountId] = useState(transaction.account_id || '')
  const [toAccountId, setToAccountId] = useState(transaction.to_account_id || '')
  const [date, setDate] = useState(transaction.transaction_date)
  const [saving, setSaving] = useState(false)

  const categoryOptions = categories.filter((c) => c.kind === (type === 'income' ? 'income' : 'expense'))
  const canSave = Number(amount) > 0 && !!type && !!accountId && (type !== 'transfer' || !!toAccountId)

  const handleSave = async () => {
    setSaving(true)
    const { error: updateErr } = await supabase
      .from('transactions')
      .update({
        description: description || null,
        amount: Math.abs(Number(amount)),
        type,
        category_id: type === 'transfer' ? null : categoryId || null,
        account_id: accountId,
        to_account_id: type === 'transfer' ? toAccountId : null,
        transaction_date: date,
      })
      .eq('id', transaction.id)
    setSaving(false)

    if (updateErr) {
      onError(friendlyError(updateErr, "Couldn't save this change. Please try again."))
      return
    }
    onSaved()
  }

  return (
    <Modal onClose={onClose} titleId="edit-transaction-title" className="fixed inset-0 bg-black/40 flex items-end sm:items-center justify-center">
      <div
        className="bg-surface dark:bg-charcoalSurface rounded-t-2xl sm:rounded-2xl border border-line dark:border-lineDark w-full sm:w-[28rem] p-5 space-y-4"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between">
          <h2 id="edit-transaction-title" className="font-display text-lg font-semibold tracking-tight">Edit transaction</h2>
          <button onClick={onClose} className="text-muted dark:text-mutedDark hover:text-ink dark:hover:text-offwhite" aria-label="Close">
            <X size={18} />
          </button>
        </div>

        <div className="space-y-3">
          <Input
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            placeholder="Description"
            className="w-full bg-paper dark:bg-charcoal rounded-lg px-3 py-2 text-sm"
          />

          <div className="flex gap-2">
            <Input
              type="number"
              value={amount ?? ''}
              onChange={(e) => setAmount(e.target.value === '' ? null : Number(e.target.value))}
              placeholder="Amount"
              className="flex-1 bg-paper dark:bg-charcoal rounded-lg px-3 py-2 text-sm font-mono"
            />
            <Input
              type="date"
              value={date}
              onChange={(e) => setDate(e.target.value)}
              className="flex-1 bg-paper dark:bg-charcoal rounded-lg px-3 py-2 text-sm font-mono"
            />
          </div>

          <Select
            value={type}
            onChange={(e) => setType(e.target.value)}
            className="w-full bg-paper dark:bg-charcoal rounded-lg px-3 py-2 text-sm"
          >
            <option value="expense">Expense</option>
            <option value="income">Income</option>
            <option value="transfer">Transfer</option>
          </Select>

          {type !== 'transfer' && (
            <Select
              value={categoryId}
              onChange={(e) => setCategoryId(e.target.value)}
              className="w-full bg-paper dark:bg-charcoal rounded-lg px-3 py-2 text-sm"
            >
              <option value="">Category...</option>
              {categoryOptions.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.name}
                </option>
              ))}
            </Select>
          )}

          <Select
            value={accountId}
            onChange={(e) => setAccountId(e.target.value)}
            className="w-full bg-paper dark:bg-charcoal rounded-lg px-3 py-2 text-sm"
          >
            <option value="">{type === 'transfer' ? 'From account...' : 'Account...'}</option>
            {accounts.map((a) => (
              <option key={a.id} value={a.id}>
                {a.name}
              </option>
            ))}
          </Select>

          {type === 'transfer' && (
            <Select
              value={toAccountId}
              onChange={(e) => setToAccountId(e.target.value)}
              className="w-full bg-paper dark:bg-charcoal rounded-lg px-3 py-2 text-sm"
            >
              <option value="">To account...</option>
              {accounts.map((a) => (
                <option key={a.id} value={a.id}>
                  {a.name}
                </option>
              ))}
            </Select>
          )}
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
            {saving ? 'Saving...' : 'Save'}
          </Button>
        </div>
      </div>
    </Modal>
  )
}

function ConfirmDeleteModal({ transaction, categoryName, onCancel, onConfirm }) {
  const [deleting, setDeleting] = useState(false)
  const label = transaction.description || categoryName || 'this transaction'

  const handleConfirm = async () => {
    setDeleting(true)
    await onConfirm()
  }

  return (
    <Modal onClose={onCancel} titleId="delete-transaction-title" className="fixed inset-0 bg-black/40 flex items-end sm:items-center justify-center">
      <div
        className="bg-surface dark:bg-charcoalSurface rounded-t-2xl sm:rounded-2xl border border-line dark:border-lineDark w-full sm:w-96 p-5 space-y-4"
        onClick={(e) => e.stopPropagation()}
      >
        <h2 id="delete-transaction-title" className="font-display text-lg font-semibold tracking-tight">Delete transaction?</h2>
        <p className="text-sm text-muted dark:text-mutedDark">
          Delete <span className="text-ink dark:text-offwhite">{label}</span> ({formatCurrency(transaction.amount)})? This can't be undone.
        </p>
        <div className="flex justify-end gap-2">
          <Button variant="secondary" onClick={onCancel} className="px-3 py-2 rounded-lg">
            Cancel
          </Button>
          <Button
            variant="destructive"
            onClick={handleConfirm}
            disabled={deleting}
            className="px-4 py-2 rounded-lg"
          >
            {deleting ? 'Deleting...' : 'Delete'}
          </Button>
        </div>
      </div>
    </Modal>
  )
}
