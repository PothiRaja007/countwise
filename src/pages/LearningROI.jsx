import { useEffect, useMemo, useState } from 'react'
import { BookOpen, CalendarDays, Pencil, Plus, Trash2, X } from 'lucide-react'
import { supabase } from '../lib/supabaseClient.js'
import { useAuth } from '../lib/AuthContext.jsx'
import { formatCurrency } from '../lib/format.js'
import PageHeader from '../components/layout/PageHeader.jsx'
import ErrorState from '../components/layout/ErrorState.jsx'
import Modal from '../components/ui/Modal.jsx'
import Button from '../components/ui/Button.jsx'
import Input from '../components/ui/Input.jsx'
import Select from '../components/ui/Select.jsx'
import EmptyState from '../components/ui/EmptyState.jsx'
import { friendlyError } from '../lib/errorMessages.js'

const TABS = [
  { key: 'all', label: 'All' },
  { key: 'planned', label: 'Planned' },
  { key: 'in_progress', label: 'In progress' },
  { key: 'completed', label: 'Completed' },
  { key: 'dropped', label: 'Dropped' },
]

const STATUS_LABELS = {
  planned: 'Planned',
  in_progress: 'In progress',
  completed: 'Completed',
  dropped: 'Dropped',
}

const STATUS_CLASSES = {
  planned: 'text-muted dark:text-mutedDark',
  in_progress: 'text-gold',
  completed: 'text-good',
  dropped: 'text-bad',
}

// Border/outline/focus:border-gold now come from Input.jsx/Select.jsx's
// own base — this is what's left after removing those.
const FIELD_CLASS = 'w-full px-3 py-2 rounded-lg bg-paper dark:bg-charcoal text-sm text-ink dark:text-offwhite placeholder:text-muted dark:placeholder:text-mutedDark focus:ring-1 focus:ring-gold/30'

const DEFAULT_FORM = {
  name: '',
  cost: '',
  relevanceTag: '',
  targetDate: '',
  progressPct: 0,
  status: 'planned',
}

function formatDate(dateStr) {
  if (!dateStr) return null
  const date = new Date(`${dateStr}T00:00:00`)
  return date.toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' })
}

function isOverdue(item) {
  if (!item.target_date || item.status === 'completed' || item.status === 'dropped') return false
  const today = new Date()
  today.setHours(0, 0, 0, 0)
  const target = new Date(`${item.target_date}T00:00:00`)
  return target < today
}

function progressBarClass(status) {
  if (status === 'completed') return 'bg-good'
  if (status === 'dropped') return 'bg-muted dark:bg-mutedDark'
  return 'bg-gold'
}

export default function Learning() {
  const { user, profile } = useAuth()
  const [items, setItems] = useState([])
  const [activeTab, setActiveTab] = useState('all')
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(null)
  const [formOpen, setFormOpen] = useState(false)
  const [editingItem, setEditingItem] = useState(null)
  const [deletingItem, setDeletingItem] = useState(null)

  const load = async () => {
    if (!user) return
    setLoading(true)
    setError(null)

    const { data, error: loadError } = await supabase
      .from('learning_items')
      .select('id, name, cost, relevance_tag, target_date, progress_pct, status')
      .eq('user_id', user.id)
      .order('target_date', { ascending: true, nullsFirst: false })
      .order('name', { ascending: true })

    if (loadError) {
      // eslint-disable-next-line no-console
      console.error(loadError)
      setError(friendlyError(loadError, "Couldn't load your learning items. Please try again."))
      setItems([])
    } else {
      setItems(data || [])
    }

    setLoading(false)
  }

  useEffect(() => {
    load()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user])

  const visibleItems = useMemo(() => {
    if (activeTab === 'all') return items
    return items.filter((item) => item.status === activeTab)
  }, [items, activeTab])

  const summary = useMemo(() => {
    const totalCost = items.reduce((sum, item) => sum + Number(item.cost || 0), 0)
    const activeItems = items.filter((item) => item.status === 'planned' || item.status === 'in_progress').length
    const completedItems = items.filter((item) => item.status === 'completed').length
    const trackedItems = items.filter((item) => item.status !== 'dropped')
    const averageProgress = trackedItems.length
      ? Math.round(trackedItems.reduce((sum, item) => sum + Number(item.progress_pct || 0), 0) / trackedItems.length)
      : 0

    return { totalCost, activeItems, completedItems, averageProgress }
  }, [items])

  const openCreate = () => {
    setEditingItem(null)
    setFormOpen(true)
    setError(null)
  }

  const openEdit = (item) => {
    setEditingItem(item)
    setFormOpen(true)
    setError(null)
  }

  const handleSave = async (form) => {
    if (!user) return
    setError(null)

    const payload = {
      name: form.name.trim(),
      cost: Number(form.cost || 0),
      relevance_tag: form.relevanceTag.trim() || null,
      target_date: form.targetDate || null,
      progress_pct: Number(form.progressPct),
      status: form.status,
    }

    if (editingItem) {
      const { error: updateError } = await supabase
        .from('learning_items')
        .update(payload)
        .eq('id', editingItem.id)
        .eq('user_id', user.id)

      if (updateError) {
        // eslint-disable-next-line no-console
        console.error(updateError)
        const friendly = "Couldn't save these changes. Please try again."
        setError(friendly)
        return friendly
      }
    } else {
      const { error: insertError } = await supabase
        .from('learning_items')
        .insert({ user_id: user.id, ...payload })

      if (insertError) {
        // eslint-disable-next-line no-console
        console.error(insertError)
        const friendly = "Couldn't create this learning item. Please try again."
        setError(friendly)
        return friendly
      }
    }

    setFormOpen(false)
    setEditingItem(null)
    await load()
    return null
  }

  const handleDelete = async () => {
    if (!deletingItem || !user) return

    const { error: deleteError } = await supabase
      .from('learning_items')
      .delete()
      .eq('id', deletingItem.id)
      .eq('user_id', user.id)

    if (deleteError) {
      // eslint-disable-next-line no-console
      console.error(deleteError)
      setError("Couldn't delete this item. Please try again.")
      setDeletingItem(null)
      return
    }

    setDeletingItem(null)
    await load()
  }

  if (loading) {
    return (
      <div className="min-h-screen bg-paper dark:bg-charcoal p-6 sm:p-8">
        <PageHeader name={profile?.username} />
        <div className="mt-8 space-y-3" aria-label="Loading learning items">
          <div className="h-4 w-32 rounded bg-line dark:bg-lineDark animate-pulse" />
          <div className="h-16 w-full rounded bg-line dark:bg-lineDark animate-pulse" />
          <div className="h-16 w-full rounded bg-line dark:bg-lineDark animate-pulse" />
        </div>
      </div>
    )
  }

  return (
    <div className="min-h-screen bg-paper dark:bg-charcoal p-6 sm:p-8">
      <PageHeader name={profile?.username} />

      <div className="mt-8 max-w-6xl">
        <div className="flex flex-col gap-5 sm:flex-row sm:items-end sm:justify-between">
          <div>
            <p className="text-xs uppercase tracking-[0.14em] text-muted dark:text-mutedDark">Learning ROI</p>
            <h2 className="font-display text-2xl font-semibold tracking-tight text-ink dark:text-offwhite mt-1">
              Invest in skills that move you forward.
            </h2>
            <p className="text-sm text-muted dark:text-mutedDark mt-1 max-w-2xl">
              Track what you are learning, what it costs, and how far you have progressed. No artificial ROI number — just your real learning record.
            </p>
          </div>

          <Button
            onClick={openCreate}
            className="inline-flex items-center justify-center gap-1.5 self-start sm:self-auto px-3.5 py-2 rounded-lg"
          >
            <Plus size={16} />
            Add learning item
          </Button>
        </div>

        {error && (
          <div className="mt-5">
            <ErrorState message={error} onRetry={load} />
          </div>
        )}

        <div className="mt-8 grid grid-cols-2 lg:grid-cols-4 border-y border-line dark:border-lineDark">
          <SummaryCell label="Learning cost" value={formatCurrency(summary.totalCost)} />
          <SummaryCell label="Active" value={summary.activeItems} />
          <SummaryCell label="Completed" value={summary.completedItems} />
          <SummaryCell label="Average progress" value={`${summary.averageProgress}%`} last />
        </div>

        <div className="mt-8 flex gap-5 overflow-x-auto border-b border-line dark:border-lineDark" role="tablist" aria-label="Learning item status">
          {TABS.map((tab) => (
            <button
              key={tab.key}
              role="tab"
              aria-selected={activeTab === tab.key}
              onClick={() => setActiveTab(tab.key)}
              className={`shrink-0 pb-2.5 text-sm font-medium border-b-2 transition-colors ${
                activeTab === tab.key
                  ? 'text-ink dark:text-offwhite border-gold'
                  : 'text-muted dark:text-mutedDark border-transparent hover:text-ink dark:hover:text-offwhite'
              }`}
            >
              {tab.label}
              <span className="font-mono text-xs ml-1.5 opacity-70">
                {tab.key === 'all' ? items.length : items.filter((item) => item.status === tab.key).length}
              </span>
            </button>
          ))}
        </div>

        {items.length === 0 ? (
          <EmptyState
            icon={BookOpen}
            message="Investing in yourself counts too."
            subtext="Start tracking a course, certification, or skill you are working toward."
            action={{ icon: Plus, label: 'Add your first learning item', onClick: openCreate }}
          />
        ) : visibleItems.length === 0 ? (
          <EmptyState message="No learning items in this status." className="py-12" />
        ) : (
          <div className="divide-y divide-line dark:divide-lineDark">
            {visibleItems.map((item) => (
              <LearningRow key={item.id} item={item} onEdit={() => openEdit(item)} onDelete={() => setDeletingItem(item)} />
            ))}
          </div>
        )}
      </div>

      {formOpen && (
        <LearningFormModal
          item={editingItem}
          onClose={() => {
            setFormOpen(false)
            setEditingItem(null)
          }}
          onSave={handleSave}
        />
      )}

      {deletingItem && (
        <DeleteModal
          item={deletingItem}
          onCancel={() => setDeletingItem(null)}
          onConfirm={handleDelete}
        />
      )}
    </div>
  )
}

function SummaryCell({ label, value, last = false }) {
  return (
    <div className={`py-4 pr-5 ${!last ? 'border-r border-line dark:border-lineDark' : ''} ${label === 'Average progress' ? 'pl-5' : ''} ${label === 'Active' || label === 'Completed' ? 'pl-5' : ''}`}>
      <p className="text-[10px] uppercase tracking-[0.12em] text-muted dark:text-mutedDark">{label}</p>
      <p className="font-mono text-base sm:text-lg text-ink dark:text-offwhite mt-1">{value}</p>
    </div>
  )
}

function LearningRow({ item, onEdit, onDelete }) {
  const overdue = isOverdue(item)
  const progress = Math.min(100, Math.max(0, Number(item.progress_pct || 0)))

  return (
    <div className="py-5 grid grid-cols-1 lg:grid-cols-[minmax(0,1fr)_240px_auto] gap-4 lg:gap-8 items-center">
      <div className="min-w-0">
        <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
          <h3 className="font-display text-base font-semibold text-ink dark:text-offwhite truncate">{item.name}</h3>
          <span className={`text-xs font-medium ${STATUS_CLASSES[item.status] || 'text-muted dark:text-mutedDark'}`}>
            {STATUS_LABELS[item.status] || item.status}
          </span>
          {item.relevance_tag && (
            <span className="px-2 py-0.5 rounded-md text-xs bg-line/70 dark:bg-lineDark text-ink dark:text-offwhite">
              {item.relevance_tag}
            </span>
          )}
        </div>

        <div className="mt-1.5 flex flex-wrap items-center gap-x-4 gap-y-1 text-xs text-muted dark:text-mutedDark">
          <span className="font-mono">{formatCurrency(item.cost)}</span>
          {item.target_date && (
            <span className={`inline-flex items-center gap-1 ${overdue ? 'text-bad' : ''}`}>
              <CalendarDays size={13} />
              {overdue ? 'Target date passed · ' : 'Target · '}{formatDate(item.target_date)}
            </span>
          )}
        </div>
      </div>

      <div className="w-full">
        <div className="flex items-center justify-between text-xs mb-1.5">
          <span className="text-muted dark:text-mutedDark">Progress</span>
          <span className="font-mono text-ink dark:text-offwhite">{progress}%</span>
        </div>
        <div className="h-1.5 w-full rounded-full bg-line dark:bg-lineDark overflow-hidden">
          <div className={`h-full rounded-full ${progressBarClass(item.status)}`} style={{ width: `${progress}%` }} />
        </div>
      </div>

      <div className="flex items-center gap-1 justify-end">
        <button
          onClick={onEdit}
          className="p-2 text-muted dark:text-mutedDark hover:text-gold transition-colors"
          aria-label={`Edit ${item.name}`}
          title="Edit"
        >
          <Pencil size={16} />
        </button>
        <button
          onClick={onDelete}
          className="p-2 text-muted dark:text-mutedDark hover:text-bad transition-colors"
          aria-label={`Delete ${item.name}`}
          title="Delete"
        >
          <Trash2 size={16} />
        </button>
      </div>
    </div>
  )
}

function LearningFormModal({ item, onClose, onSave }) {
  const [form, setForm] = useState(() =>
    item
      ? {
          name: item.name || '',
          cost: item.cost ?? '',
          relevanceTag: item.relevance_tag || '',
          targetDate: item.target_date || '',
          progressPct: item.progress_pct ?? 0,
          status: item.status || 'planned',
        }
      : DEFAULT_FORM,
  )
  const [saving, setSaving] = useState(false)
  const [formError, setFormError] = useState(null)

  const update = (key, value) => setForm((current) => ({ ...current, [key]: value }))

  const handleSubmit = async (event) => {
    event.preventDefault()
    setFormError(null)

    if (!form.name.trim()) {
      setFormError('Give this learning item a name.')
      return
    }

    const cost = Number(form.cost || 0)
    const progress = Number(form.progressPct)

    if (!Number.isFinite(cost) || cost < 0) {
      setFormError('Cost must be zero or a positive amount.')
      return
    }

    if (!Number.isInteger(progress) || progress < 0 || progress > 100) {
      setFormError('Progress must be a whole number from 0 to 100.')
      return
    }

    setSaving(true)
    const errorMessage = await onSave({ ...form, cost, progressPct: progress })
    setSaving(false)
    if (errorMessage) setFormError(errorMessage)
  }

  return (
    <Modal onClose={onClose} titleId="learning-form-title" className="fixed inset-0 flex items-center justify-center p-4 bg-black/30 dark:bg-black/50">
      <div className="w-full max-w-lg bg-surface dark:bg-charcoalSurface border border-line dark:border-lineDark rounded-xl shadow-xl max-h-[90vh] overflow-y-auto">
        <div className="flex items-center justify-between px-5 py-4 border-b border-line dark:border-lineDark">
          <div>
            <h2 id="learning-form-title" className="font-display text-lg font-semibold text-ink dark:text-offwhite">{item ? 'Edit learning item' : 'Add learning item'}</h2>
            <p className="text-xs text-muted dark:text-mutedDark mt-0.5">Track the investment and progress, without inventing an ROI figure.</p>
          </div>
          <button onClick={onClose} className="p-1.5 text-muted dark:text-mutedDark hover:text-ink dark:hover:text-offwhite" aria-label="Close">
            <X size={18} />
          </button>
        </div>

        <form onSubmit={handleSubmit} className="p-5 space-y-4">
          {formError && <p className="text-sm text-bad">{formError}</p>}

          <Field label="Name" required>
            <Input
              value={form.name}
              onChange={(e) => update('name', e.target.value)}
              placeholder="e.g. Advanced Excel course"
              className={FIELD_CLASS}
              autoFocus
            />
          </Field>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <Field label="Cost">
              <Input
                type="number"
                min="0"
                step="0.01"
                value={form.cost}
                onChange={(e) => update('cost', e.target.value)}
                placeholder="0"
                className={`${FIELD_CLASS} font-mono`}
              />
            </Field>

            <Field label="Relevance">
              <Input
                value={form.relevanceTag}
                onChange={(e) => update('relevanceTag', e.target.value)}
                placeholder="e.g. Career"
                className={FIELD_CLASS}
              />
            </Field>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <Field label="Target date">
              <Input
                type="date"
                value={form.targetDate}
                onChange={(e) => update('targetDate', e.target.value)}
                className={FIELD_CLASS}
              />
            </Field>

            <Field label="Status">
              <Select value={form.status} onChange={(e) => update('status', e.target.value)} className={FIELD_CLASS}>
                <option value="planned">Planned</option>
                <option value="in_progress">In progress</option>
                <option value="completed">Completed</option>
                <option value="dropped">Dropped</option>
              </Select>
            </Field>
          </div>

          <Field label={`Progress (${form.progressPct}%)`}>
            <input
              type="range"
              min="0"
              max="100"
              step="1"
              value={form.progressPct}
              onChange={(e) => update('progressPct', Number(e.target.value))}
              className="w-full accent-gold"
            />
          </Field>

          <div className="flex justify-end gap-2 pt-2">
            <button type="button" onClick={onClose} className="px-3.5 py-2 text-sm text-muted dark:text-mutedDark hover:text-ink dark:hover:text-offwhite">
              Cancel
            </button>
            <button
              type="submit"
              disabled={saving}
              className="px-4 py-2 rounded-lg bg-gold text-white text-sm font-medium hover:bg-gold/90 disabled:opacity-60"
            >
              {saving ? 'Saving...' : item ? 'Save changes' : 'Add item'}
            </button>
          </div>
        </form>
      </div>
    </Modal>
  )
}

function Field({ label, required = false, children }) {
  return (
    <label className="block">
      <span className="block text-xs font-medium text-ink dark:text-offwhite mb-1.5">
        {label}{required && <span className="text-bad ml-0.5">*</span>}
      </span>
      {children}
    </label>
  )
}

function DeleteModal({ item, onCancel, onConfirm }) {
  const [deleting, setDeleting] = useState(false)

  const confirm = async () => {
    setDeleting(true)
    await onConfirm()
    setDeleting(false)
  }

  return (
    <Modal onClose={onCancel} titleId="delete-learning-title" className="fixed inset-0 flex items-center justify-center p-4 bg-black/30 dark:bg-black/50">
      <div className="w-full max-w-sm bg-surface dark:bg-charcoalSurface border border-line dark:border-lineDark rounded-xl shadow-xl p-5">
        <h2 id="delete-learning-title" className="font-display text-lg font-semibold text-ink dark:text-offwhite">Delete learning item?</h2>
        <p className="text-sm text-muted dark:text-mutedDark mt-2">
          This will permanently remove <span className="text-ink dark:text-offwhite font-medium">{item.name}</span> from your learning record.
        </p>
        <div className="flex justify-end gap-2 mt-6">
          <button onClick={onCancel} disabled={deleting} className="px-3.5 py-2 text-sm text-muted dark:text-mutedDark hover:text-ink dark:hover:text-offwhite">
            Cancel
          </button>
          <button onClick={confirm} disabled={deleting} className="px-3.5 py-2 rounded-lg bg-bad text-white text-sm font-medium disabled:opacity-60">
            {deleting ? 'Deleting...' : 'Delete'}
          </button>
        </div>
      </div>
    </Modal>
  )
}

