import { useEffect, useMemo, useState } from 'react'
import { X, Plus, Pencil, Trash2 } from 'lucide-react'
import { supabase } from '../lib/supabaseClient.js'
import { useAuth } from '../lib/AuthContext.jsx'
import { budgetSpent, budgetRemaining, budgetPercentUsed, isBudgetOverAmount } from '../lib/budgetEngine.js'
import { saveBudgetRow } from '../lib/budgetSave.js'
import { formatCurrency } from '../lib/format.js'
import { categoryPillClasses } from '../lib/categoryColors.js'
import PageHeader from '../components/layout/PageHeader.jsx'
import ErrorState from '../components/layout/ErrorState.jsx'
import BudgetRecipeFlow from '../components/budgets/BudgetRecipeFlow.jsx'
import Modal from '../components/ui/Modal.jsx'
import Button from '../components/ui/Button.jsx'
import Input from '../components/ui/Input.jsx'
import Select from '../components/ui/Select.jsx'
import EmptyState from '../components/ui/EmptyState.jsx'
import { friendlyError } from '../lib/errorMessages.js'


function monthRange(monthValue) {
  // monthValue is "YYYY-MM" from an <input type="month">
  const [year, month] = monthValue.split('-').map(Number)
  const start = new Date(year, month - 1, 1)
  const end = new Date(year, month, 0) // day 0 of next month = last day of this month
  const toISO = (d) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
  return { period_start: toISO(start), period_end: toISO(end) }
}

function currentMonthValue() {
  const now = new Date()
  return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`
}

function monthLabel(monthValue) {
  const [year, month] = monthValue.split('-').map(Number)
  return new Date(year, month - 1, 1).toLocaleDateString('en-IN', { month: 'long', year: 'numeric' })
}

export default function Budgets() {
  const { user, profile } = useAuth()
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(null)

  const [budgets, setBudgets] = useState([])
  const [categories, setCategories] = useState([])
  const [categoryRules, setCategoryRules] = useState([])
  const [transactions, setTransactions] = useState([])

  const [viewMonth, setViewMonth] = useState(currentMonthValue())
  const [creating, setCreating] = useState(false)
  const [editingBudget, setEditingBudget] = useState(null)
  const [deletingBudget, setDeletingBudget] = useState(null)

  const load = async () => {
    if (!user) return
    setLoading(true)
    setError(null)

    const [budgetsRes, categoriesRes, rulesRes, transactionsRes] = await Promise.all([
      supabase.from('budgets').select('*').eq('user_id', user.id).order('period_start', { ascending: false }),
      // Expense categories only - a budget is a spending limit, so income
      // categories have no place in the picker.
      supabase.from('categories').select('id, name, kind').or(`user_id.eq.${user.id},user_id.is.null`).eq('kind', 'expense'),
      // Only needed by the Budget Recipe flow's parseRecipeInput(), same
      // query shape MoneyInboxInput.jsx already uses for the same table.
      supabase.from('category_rules').select('keyword, category_id, priority').or(`user_id.eq.${user.id},user_id.is.null`),
      // Only what budgetEngine.js needs to compute spend - never a stored total.
      supabase.from('transactions').select('category_id, type, amount, transaction_date').eq('user_id', user.id),
    ])

    const firstError = budgetsRes.error || categoriesRes.error || rulesRes.error || transactionsRes.error
    if (firstError) {
      setError(friendlyError(firstError, "Couldn't load your budgets. Please try again."))
      setLoading(false)
      return
    }

    setBudgets(budgetsRes.data || [])
    setCategories(categoriesRes.data || [])
    setCategoryRules(rulesRes.data || [])
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

  const { period_start: viewStart } = useMemo(() => monthRange(viewMonth), [viewMonth])
  const visibleBudgets = useMemo(() => budgets.filter((b) => b.period_start === viewStart), [budgets, viewStart])

  // Categories that already have a budget for the month currently being
  // viewed - excluded from the "new budget" category picker so the unique
  // constraint's failure mode is avoided by the UI, not just caught after.
  const budgetedCategoryIdsThisMonth = useMemo(
    () => new Set(visibleBudgets.map((b) => b.category_id)),
    [visibleBudgets]
  )
  const availableCategories = useMemo(
    () => categories.filter((c) => !budgetedCategoryIdsThisMonth.has(c.id)),
    [categories, budgetedCategoryIdsThisMonth]
  )

  // Separate from budgetedCategoryIdsThisMonth above, which follows
  // viewMonth (whatever month the user is currently browsing). Budget
  // Inbox always targets the real current month regardless of what's
  // being viewed, so its own exclusion set has to track that, not viewMonth.
  const currentMonthValueForInbox = useMemo(() => currentMonthValue(), [])
  const { period_start: currentMonthStart } = useMemo(() => monthRange(currentMonthValueForInbox), [currentMonthValueForInbox])
  const currentMonthBudgetedCategoryIds = useMemo(
    () => budgets.filter((b) => b.period_start === currentMonthStart).map((b) => b.category_id),
    [budgets, currentMonthStart]
  )

  const handleDelete = async () => {
    if (!deletingBudget) return
    const { error: deleteErr } = await supabase.from('budgets').delete().eq('id', deletingBudget.id)
    if (deleteErr) {
      // eslint-disable-next-line no-console
      console.error(deleteErr)
      setError("Couldn't delete this budget. Please try again.")
      setDeletingBudget(null)
      return
    }
    setDeletingBudget(null)
    await load()
  }

  if (loading) {
    return (
      <div className="p-6 bg-paper dark:bg-charcoal min-h-screen">
        <p className="text-sm text-muted dark:text-mutedDark">Loading your budgets...</p>
      </div>
    )
  }

  return (
    <div className="p-6 sm:p-8 space-y-6 bg-paper dark:bg-charcoal min-h-screen">
      <PageHeader name={profile?.username} />

      {error && <ErrorState message={error} onRetry={load} />}

      <BudgetRecipeFlow
        userId={user.id}
        incomeType={profile?.income_type}
        categories={categories}
        categoryRules={categoryRules}
        transactions={transactions}
        budgetedCategoryIdsThisMonth={currentMonthBudgetedCategoryIds}
        targetMonth={currentMonthValueForInbox}
        onSaved={async () => {
          await load()
          setViewMonth(currentMonthValueForInbox)
        }}
      />

      <div className="flex items-center justify-between flex-wrap gap-3">
        <div className="flex items-center gap-2">
          <label htmlFor="budget-month" className="text-xs font-medium text-muted dark:text-mutedDark">
            Month
          </label>
          <Input
            id="budget-month"
            type="month"
            value={viewMonth}
            onChange={(e) => setViewMonth(e.target.value)}
            className="text-sm py-1.5 px-2.5 rounded-md bg-surface dark:bg-charcoalSurface font-mono"
          />
        </div>

        <Button
          onClick={() => setCreating(true)}
          disabled={availableCategories.length === 0}
          title={availableCategories.length === 0 ? 'Every expense category already has a budget this month' : undefined}
          className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg"
        >
          <Plus size={16} />
          Create new budget
        </Button>
      </div>

      {visibleBudgets.length === 0 ? (
        <EmptyState message={`No budgets set for ${monthLabel(viewMonth)} yet.`} className="py-8" />
      ) : (
        <div className="divide-y divide-line dark:divide-lineDark border-t border-b border-line dark:border-lineDark">
          {visibleBudgets.map((budget) => (
            <BudgetRow
              key={budget.id}
              budget={budget}
              categoryName={categoryNameById.get(budget.category_id) || 'Unknown category'}
              transactions={transactions}
              onEdit={() => setEditingBudget(budget)}
              onDelete={() => setDeletingBudget(budget)}
            />
          ))}
        </div>
      )}

      {creating && (
        <BudgetFormModal
          title="New budget"
          submitLabel="Create budget"
          categories={availableCategories}
          initialMonth={viewMonth}
          onClose={() => setCreating(false)}
          onSubmit={async ({ categoryId, amount, month }) => {
            const { period_start, period_end } = monthRange(month)
            const { error: saveErr } = await saveBudgetRow({
              userId: user.id,
              categoryId,
              amount,
              periodStart: period_start,
              periodEnd: period_end,
            })
            if (saveErr === 'duplicate') {
              return 'You already have a budget for this category this month.'
            }
            if (saveErr) {
              return "Couldn't create this budget. Please try again."
            }
            setCreating(false)
            setViewMonth(month)
            await load()
            return null
          }}
        />
      )}

      {editingBudget && (
        <BudgetFormModal
          title="Edit budget"
          submitLabel="Save"
          categories={categories}
          lockCategory
          initialCategoryId={editingBudget.category_id}
          initialAmount={editingBudget.amount}
          initialMonth={editingBudget.period_start.slice(0, 7)}
          onClose={() => setEditingBudget(null)}
          onSubmit={async ({ amount, month }) => {
            const { period_start, period_end } = monthRange(month)
            const { error: saveErr } = await saveBudgetRow({
              id: editingBudget.id,
              amount,
              periodStart: period_start,
              periodEnd: period_end,
            })
            if (saveErr === 'duplicate') {
              return 'You already have a budget for this category in that month.'
            }
            if (saveErr) {
              return "Couldn't save these changes. Please try again."
            }
            setEditingBudget(null)
            setViewMonth(month)
            await load()
            return null
          }}
        />
      )}

      {deletingBudget && (
        <ConfirmDeleteModal
          categoryName={categoryNameById.get(deletingBudget.category_id) || 'this category'}
          onCancel={() => setDeletingBudget(null)}
          onConfirm={handleDelete}
        />
      )}
    </div>
  )
}

function BudgetRow({ budget, categoryName, transactions, onEdit, onDelete }) {
  const spent = budgetSpent(transactions, budget)
  const remaining = budgetRemaining(transactions, budget)
  const percent = budgetPercentUsed(transactions, budget)
  const over = isBudgetOverAmount(transactions, budget)
  const barWidth = Math.min(100, Math.max(0, percent))

  return (
    <div className="py-4">
      <div className="flex items-center justify-between gap-3 flex-wrap">
        <div className="flex items-center gap-2 min-w-0">
          <span className={`text-xs font-medium px-2 py-0.5 rounded-full truncate ${categoryPillClasses(categoryName)}`}>
            {categoryName}
          </span>
          {over && <span className="text-xs text-bad font-medium shrink-0">Over budget</span>}
        </div>

        <div className="flex items-center gap-1 shrink-0">
          <button onClick={onEdit} aria-label={`Edit ${categoryName} budget`} className="p-1.5 rounded text-muted dark:text-mutedDark hover:bg-surface dark:hover:bg-charcoalSurface">
            <Pencil size={15} />
          </button>
          <button onClick={onDelete} aria-label={`Delete ${categoryName} budget`} className="p-1.5 rounded text-muted dark:text-mutedDark hover:bg-surface dark:hover:bg-charcoalSurface">
            <Trash2 size={15} />
          </button>
        </div>
      </div>

      <div className="mt-2 h-1.5 rounded-full bg-line dark:bg-lineDark overflow-hidden">
        <div className={`h-full rounded-full ${over ? 'bg-bad' : 'bg-gold'}`} style={{ width: `${barWidth}%` }} />
      </div>

      <div className="mt-1.5 flex items-center justify-between text-sm font-mono">
        <span className="text-muted dark:text-mutedDark">
          {formatCurrency(spent)} of {formatCurrency(budget.amount)}
        </span>
        <span className={over ? 'text-bad' : 'text-muted dark:text-mutedDark'}>
          {over ? `${formatCurrency(Math.abs(remaining))} over` : `${formatCurrency(remaining)} left`}
        </span>
      </div>
    </div>
  )
}

function BudgetFormModal({
  title,
  submitLabel,
  categories,
  lockCategory = false,
  initialCategoryId = '',
  initialAmount = '',
  initialMonth,
  onClose,
  onSubmit,
}) {
  const [categoryId, setCategoryId] = useState(initialCategoryId)
  const [amount, setAmount] = useState(initialAmount)
  const [month, setMonth] = useState(initialMonth)
  const [saving, setSaving] = useState(false)
  const [formError, setFormError] = useState(null)

  const canSave = !!categoryId && Number(amount) > 0 && !!month

  const handleSave = async () => {
    if (!canSave) return
    setSaving(true)
    setFormError(null)
    const err = await onSubmit({ categoryId, amount: Number(amount), month })
    setSaving(false)
    if (err) setFormError(err)
  }

  return (
    <Modal onClose={onClose} titleId="budget-form-title" className="fixed inset-0 bg-black/40 flex items-end sm:items-center justify-center">
      <div
        className="bg-surface dark:bg-charcoalSurface rounded-t-2xl sm:rounded-2xl border border-line dark:border-lineDark w-full sm:w-96 p-5 space-y-4"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between">
          <h2 id="budget-form-title" className="font-display text-lg font-semibold tracking-tight">{title}</h2>
          <button onClick={onClose} className="text-muted dark:text-mutedDark hover:text-ink dark:hover:text-offwhite" aria-label="Close">
            <X size={18} />
          </button>
        </div>

        <div className="space-y-3">
          <div>
            <label htmlFor="budget-category" className="block text-xs font-medium text-muted dark:text-mutedDark mb-1">
              Category
            </label>
            <Select
              id="budget-category"
              value={categoryId}
              onChange={(e) => setCategoryId(e.target.value)}
              disabled={lockCategory}
              className="w-full text-sm py-2 px-3 rounded-md bg-paper dark:bg-charcoal disabled:opacity-60"
            >
              <option value="" disabled>
                Select a category...
              </option>
              {categories.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.name}
                </option>
              ))}
            </Select>
            {lockCategory && (
              <p className="text-xs text-muted dark:text-mutedDark mt-1">
                Category can't be changed here - delete and recreate the budget for a different category.
              </p>
            )}
          </div>

          <div>
            <label htmlFor="budget-amount" className="block text-xs font-medium text-muted dark:text-mutedDark mb-1">
              Monthly amount
            </label>
            <Input
              id="budget-amount"
              type="number"
              value={amount}
              onChange={(e) => setAmount(e.target.value)}
              placeholder="e.g. 5000"
              className="w-full text-sm font-mono py-2 px-3 rounded-md bg-paper dark:bg-charcoal"
            />
          </div>

          <div>
            <label htmlFor="budget-month-field" className="block text-xs font-medium text-muted dark:text-mutedDark mb-1">
              Month
            </label>
            <Input
              id="budget-month-field"
              type="month"
              value={month}
              onChange={(e) => setMonth(e.target.value)}
              className="w-full text-sm font-mono py-2 px-3 rounded-md bg-paper dark:bg-charcoal"
            />
          </div>

          {formError && <p className="text-xs text-bad">{formError}</p>}
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
            {saving ? 'Saving...' : submitLabel}
          </Button>
        </div>
      </div>
    </Modal>
  )
}

function ConfirmDeleteModal({ categoryName, onCancel, onConfirm }) {
  const [deleting, setDeleting] = useState(false)

  const handleConfirm = async () => {
    setDeleting(true)
    await onConfirm()
  }

  return (
    <Modal onClose={onCancel} titleId="delete-budget-title" className="fixed inset-0 bg-black/40 flex items-end sm:items-center justify-center">
      <div
        className="bg-surface dark:bg-charcoalSurface rounded-t-2xl sm:rounded-2xl border border-line dark:border-lineDark w-full sm:w-96 p-5 space-y-4"
        onClick={(e) => e.stopPropagation()}
      >
        <h2 id="delete-budget-title" className="font-display text-lg font-semibold tracking-tight">Delete budget?</h2>
        <p className="text-sm text-muted dark:text-mutedDark">
          Delete the <span className="text-ink dark:text-offwhite">{categoryName}</span> budget for this month? This can't be undone -
          your past transactions aren't affected, only the budget limit itself.
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
