import { useEffect, useState } from 'react'
import { Plus, X, ArrowLeft, Wallet, Star } from 'lucide-react'
import { supabase } from '../lib/supabaseClient.js'
import { useAuth } from '../lib/AuthContext.jsx'
import { formatCurrency } from '../lib/format.js'
import PageHeader from '../components/layout/PageHeader.jsx'
import ErrorState from '../components/layout/ErrorState.jsx'
import { sumByCategory, estimatedGrossMonthly, estimatedTakeHomeMonthly, hasIncompleteComponents } from '../lib/salaryEngine.js'
import MoneyInboxInput from '../components/money-inbox/MoneyInboxInput.jsx'
import { friendlyError } from '../lib/errorMessages.js'
import ValueBadge from '../components/ui/ValueBadge.jsx'
import Button from '../components/ui/Button.jsx'
import Input from '../components/ui/Input.jsx'
import Select from '../components/ui/Select.jsx'
import EmptyState from '../components/ui/EmptyState.jsx'

// Subphase 25.2 — the real Salary page, replacing the 23.5 stub.
// Manual entry only, same as CTC Explorer — no file upload, no AI call.
// Every number shown here comes from salaryEngine.js (Subphase 25.1) —
// this file does not do its own financial math.
//
// Part B (the actual-receipt flow) does NOT insert into `transactions`
// itself. It hands a pre-filled string to the existing, already-tested
// Money Inbox input/review/confirm pipeline and lets that pipeline do the
// one and only validated insert this whole app uses. See the "I received
// this month's salary" section below.

const CATEGORY_OPTIONS = [
  { value: 'basic', label: 'Basic' },
  { value: 'allowance', label: 'Allowance' },
  { value: 'employee_deduction', label: 'Employee Deduction' },
  { value: 'employer_contribution', label: 'Employer Contribution' },
  { value: 'other', label: 'Other' },
  { value: 'needs_clarification', label: 'Needs Clarification' },
]

const CATEGORY_LABELS = Object.fromEntries(CATEGORY_OPTIONS.map((c) => [c.value, c.label]))

let draftIdCounter = 0
function nextDraftId() {
  draftIdCounter += 1
  return `draft-${draftIdCounter}`
}

// Shared read-only breakdown — used both while building a new structure
// and while revisiting a saved one. Zero inline math: every figure here is
// read straight off salaryEngine.js's return values, never re-derived.
function SalaryBreakdown({ components }) {
  if (components.length === 0) return null

  const { totals } = sumByCategory(components)
  const gross = estimatedGrossMonthly(components)
  const takeHome = estimatedTakeHomeMonthly(components)
  const incomplete = hasIncompleteComponents(components)
  const missingAmountNames = components
    .filter((c) => c.monthly_amount === null || c.monthly_amount === undefined)
    .map((c) => c.name)
  const needsClarificationNames = components
    .filter((c) => c.category === 'needs_clarification' && c.monthly_amount !== null && c.monthly_amount !== undefined)
    .map((c) => c.name)

  return (
    <div className="mt-6 space-y-5">
      {incomplete && (
        <div className="rounded-lg border border-line dark:border-lineDark bg-paper dark:bg-charcoal p-4">
          <p className="text-sm font-medium text-ink dark:text-offwhite">Some components still need clarification</p>
          {missingAmountNames.length > 0 && (
            <p className="text-xs text-muted dark:text-mutedDark mt-1">
              No amount entered yet for: {missingAmountNames.join(', ')}. Left out of the totals below until you fill them in.
            </p>
          )}
          {needsClarificationNames.length > 0 && (
            <p className="text-xs text-muted dark:text-mutedDark mt-1">
              Still marked "Needs Clarification": {needsClarificationNames.join(', ')}. Also left out of the totals below.
            </p>
          )}
        </div>
      )}

      <div>
        <p className="text-xs font-medium text-muted dark:text-mutedDark uppercase tracking-wide mb-2">By category</p>
        <div className="space-y-1.5">
          {Object.entries(totals).map(([category, amount]) => (
            <div key={category} className="flex items-center justify-between text-sm">
              <span className="text-ink dark:text-offwhite">{CATEGORY_LABELS[category] || category}</span>
              <span className="font-mono text-muted dark:text-mutedDark">{formatCurrency(amount)}</span>
            </div>
          ))}
          {Object.keys(totals).length === 0 && <EmptyState message="No confirmed amounts yet." />}
        </div>
      </div>

      <div className="border-t border-line dark:border-lineDark pt-4 space-y-3">
        <div>
          <p className="text-sm text-ink dark:text-offwhite">
            Estimated monthly gross:{' '}
            <ValueBadge
              kind="estimated"
              provenance={{ assumptions: 'Basic + Allowance only — based on the values you provided, not a statutory calculation.' }}
            >
              <span className="font-mono">{formatCurrency(gross)}</span>
            </ValueBadge>
          </p>
          <p className="text-xs text-muted dark:text-mutedDark mt-0.5">
            Basic + Allowance only — based on the values you provided, not a statutory calculation.
          </p>
        </div>
        <div>
          <p className="text-sm text-ink dark:text-offwhite">
            Estimated monthly take-home:{' '}
            <ValueBadge
              kind="estimated"
              provenance={{
                assumptions:
                  "Does not account for income tax or verified PF rates. Your actual salary may differ; you'll be able to correct the amount when you log what you actually received.",
              }}
            >
              <span className="font-mono">{formatCurrency(takeHome)}</span>
            </ValueBadge>
          </p>
          <p className="text-xs text-muted dark:text-mutedDark mt-0.5">
            A rough estimate based on the values you provided — it does not account for income tax or verified PF
            rates. Your actual salary may differ; you'll be able to correct the amount when you log what you
            actually received.
          </p>
        </div>
      </div>
    </div>
  )
}

// The add-component entry form, reused in "new structure" mode only.
function ComponentEntryForm({ onAdd }) {
  const [name, setName] = useState('')
  const [category, setCategory] = useState('basic')
  const [amountStr, setAmountStr] = useState('')
  const [formError, setFormError] = useState(null)

  const handleAdd = () => {
    setFormError(null)
    const trimmedName = name.trim()
    if (!trimmedName) {
      setFormError('Give this component a name first.')
      return
    }

    let monthlyAmount = null
    if (amountStr.trim() !== '') {
      const parsed = Number(amountStr)
      if (!Number.isFinite(parsed) || parsed <= 0) {
        setFormError("Enter a valid amount, or leave it blank if you're not sure yet.")
        return
      }
      monthlyAmount = parsed
    }

    onAdd({ id: nextDraftId(), name: trimmedName, category, monthly_amount: monthlyAmount })
    setName('')
    setCategory('basic')
    setAmountStr('')
  }

  return (
    <div className="rounded-lg border border-line dark:border-lineDark p-4 space-y-3">
      <div className="grid grid-cols-1 sm:grid-cols-[1fr_auto_auto] gap-3">
        <div>
          <label className="block text-xs font-medium text-muted dark:text-mutedDark mb-1">Component</label>
          <Input
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="e.g. Basic Salary"
            className="w-full text-sm py-2 px-3 rounded-md bg-surface dark:bg-charcoalSurface"
          />
        </div>
        <div>
          <label className="block text-xs font-medium text-muted dark:text-mutedDark mb-1">Category</label>
          <Select
            value={category}
            onChange={(e) => setCategory(e.target.value)}
            className="text-sm py-2 px-3 rounded-md bg-surface dark:bg-charcoalSurface"
          >
            {CATEGORY_OPTIONS.map((opt) => (
              <option key={opt.value} value={opt.value}>
                {opt.label}
              </option>
            ))}
          </Select>
        </div>
        <div>
          <label className="block text-xs font-medium text-muted dark:text-mutedDark mb-1">Monthly amount (optional)</label>
          <Input
            value={amountStr}
            onChange={(e) => setAmountStr(e.target.value)}
            placeholder="Leave blank if unsure"
            inputMode="decimal"
            className="w-full sm:w-40 text-sm py-2 px-3 rounded-md bg-surface dark:bg-charcoalSurface"
          />
        </div>
      </div>

      {formError && <p className="text-xs text-bad">{formError}</p>}

      <Button variant="text" onClick={handleAdd} className="flex items-center gap-1.5 text-sm font-medium">
        <Plus size={14} />
        Add component
      </Button>
    </div>
  )
}

export default function Salary() {
  const { user, profile } = useAuth()

  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(null)
  const [structures, setStructures] = useState([])

  // 'list' | 'new' | 'view'
  const [mode, setMode] = useState('list')

  // --- new-structure draft state ---
  const [draftLabel, setDraftLabel] = useState('My salary structure')
  const [draftComponents, setDraftComponents] = useState([])
  const [saving, setSaving] = useState(false)
  const [saveError, setSaveError] = useState(null)

  // --- viewing a saved structure ---
  const [viewingStructure, setViewingStructure] = useState(null)
  const [viewingComponents, setViewingComponents] = useState([])
  const [viewLoading, setViewLoading] = useState(false)
  const [viewError, setViewError] = useState(null)

  // --- "I received this month's salary" pass-through into Money Inbox ---
  const [receiveSalaryText, setReceiveSalaryText] = useState(null) // non-null while the modal is open
  const [activeComponents, setActiveComponents] = useState([])
  const [activeLoading, setActiveLoading] = useState(false)

  const load = async () => {
    if (!user) return
    setLoading(true)
    setError(null)

    const { data, error: fetchErr } = await supabase
      .from('salary_structures')
      .select('id, label, is_active, created_at')
      .eq('user_id', user.id)
      .order('created_at', { ascending: false })

    if (fetchErr) {
      setError(friendlyError(fetchErr, "Couldn't load your salary structures. Please try again."))
      setLoading(false)
      return
    }

    setStructures(data || [])
    setLoading(false)
  }

  useEffect(() => {
    load()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user])

  // Load the active structure's components whenever the structure list
  // changes, so estimatedTakeHomeMonthly() has real data to pre-fill the
  // "I received this month's salary" amount with. This never writes
  // anything — read-only, purely for the pre-fill default.
  useEffect(() => {
    const activeStructure = structures.find((s) => s.is_active)
    if (!activeStructure) {
      setActiveComponents([])
      return
    }

    let cancelled = false
    setActiveLoading(true)
    supabase
      .from('salary_components')
      .select('name, category, monthly_amount')
      .eq('structure_id', activeStructure.id)
      .then(({ data, error: fetchErr }) => {
        if (cancelled) return
        setActiveComponents(fetchErr ? [] : data || [])
        setActiveLoading(false)
      })
    return () => {
      cancelled = true
    }
  }, [structures])

  const resetDraft = () => {
    setDraftLabel('My salary structure')
    setDraftComponents([])
    setSaveError(null)
  }

  const startNew = () => {
    resetDraft()
    setMode('new')
  }

  const cancelNew = () => {
    resetDraft()
    setMode('list')
  }

  const handleAddDraftComponent = (component) => {
    setDraftComponents((prev) => [...prev, component])
  }

  const handleRemoveDraftComponent = (id) => {
    setDraftComponents((prev) => prev.filter((c) => c.id !== id))
  }

  const handleSave = async () => {
    setSaveError(null)
    setSaving(true)

    // New structures become the active one by default — support for
    // multiple structures (e.g. before/after a raise) means older ones
    // stay saved, just no longer active. Deactivate everything else first
    // so at most one row is ever active at a time.
    const { error: deactivateErr } = await supabase
      .from('salary_structures')
      .update({ is_active: false })
      .eq('user_id', user.id)

    if (deactivateErr) {
      // eslint-disable-next-line no-console
      console.error(deactivateErr)
      setSaveError("Couldn't save this structure. Please try again.")
      setSaving(false)
      return
    }

    const { data: structure, error: structureErr } = await supabase
      .from('salary_structures')
      .insert({ user_id: user.id, label: draftLabel.trim() || 'My salary structure', is_active: true })
      .select('id')
      .single()

    if (structureErr) {
      // eslint-disable-next-line no-console
      console.error(structureErr)
      setSaveError("Couldn't save this structure. Please try again.")
      setSaving(false)
      return
    }

    if (draftComponents.length > 0) {
      const rows = draftComponents.map((c) => ({
        structure_id: structure.id,
        user_id: user.id,
        name: c.name,
        category: c.category,
        monthly_amount: c.monthly_amount,
      }))

      const { error: componentsErr } = await supabase.from('salary_components').insert(rows)

      if (componentsErr) {
        // eslint-disable-next-line no-console
        console.error(componentsErr)
        // Compensating cleanup — don't leave a saved structure with no
        // components silently behind if the components half failed.
        await supabase.from('salary_structures').delete().eq('id', structure.id)
        setSaveError("Couldn't save the components for this structure. Please try again.")
        setSaving(false)
        return
      }
    }

    setSaving(false)
    resetDraft()
    setMode('list')
    await load()
  }

  const openStructure = async (structure) => {
    setMode('view')
    setViewingStructure(structure)
    setViewingComponents([])
    setViewError(null)
    setViewLoading(true)

    const { data, error: fetchErr } = await supabase
      .from('salary_components')
      .select('id, name, category, monthly_amount')
      .eq('structure_id', structure.id)
      .order('created_at', { ascending: true })

    if (fetchErr) {
      setViewError(friendlyError(fetchErr, "Couldn't load this structure. Please try again."))
      setViewLoading(false)
      return
    }

    setViewingComponents(data || [])
    setViewLoading(false)
  }

  const backToList = () => {
    setMode('list')
    setViewingStructure(null)
    setViewingComponents([])
    setViewError(null)
  }

  const handleSetActive = async (structure) => {
    if (structure.is_active) return
    setError(null)

    const { error: deactivateErr } = await supabase
      .from('salary_structures')
      .update({ is_active: false })
      .eq('user_id', user.id)
      .neq('id', structure.id)

    if (deactivateErr) {
      // eslint-disable-next-line no-console
      console.error(deactivateErr)
      setError("Couldn't update your active structure. Please try again.")
      return
    }

    const { error: activateErr } = await supabase
      .from('salary_structures')
      .update({ is_active: true })
      .eq('id', structure.id)

    if (activateErr) {
      // eslint-disable-next-line no-console
      console.error(activateErr)
      setError("Couldn't update your active structure. Please try again.")
      return
    }

    await load()
  }

  // Part B: pre-fills Money Inbox's own text input with a starting guess
  // — fully editable there, and editable again field-by-field in
  // ReviewDrawer before anything is confirmed. This function never
  // touches `transactions` itself; it only opens the existing pipeline.
  const handleReceiveSalary = () => {
    const takeHome = activeComponents.length > 0 ? estimatedTakeHomeMonthly(activeComponents) : null
    const amountText = takeHome && takeHome > 0 ? ` ${Math.round(takeHome)}` : ' '
    setReceiveSalaryText(`salary received${amountText}`)
  }

  if (loading) {
    return (
      <div className="p-6 bg-paper dark:bg-charcoal min-h-screen">
        <p className="text-sm text-muted dark:text-mutedDark">Loading your salary structures...</p>
      </div>
    )
  }

  return (
    <div className="p-6 sm:p-8 space-y-6 bg-paper dark:bg-charcoal min-h-screen text-ink dark:text-offwhite">
      <PageHeader name={profile?.username} />

      {error && <ErrorState message={error} onRetry={load} />}

      <div>
        <p className="text-xs uppercase tracking-[0.14em] text-muted dark:text-mutedDark">Work</p>
        <h1 className="font-display text-3xl sm:text-4xl font-semibold tracking-tight mt-2">Salary</h1>
        <p className="text-sm text-muted dark:text-mutedDark mt-2 max-w-xl">
          Build a salary structure to see an estimated gross and take-home — then log what you actually receive each
          month separately, once it's in your account.
        </p>
      </div>

      {mode === 'list' && (
        <div className="space-y-6">
          <div className="rounded-lg border border-line dark:border-lineDark p-4 flex items-center justify-between gap-3 flex-wrap">
            <div className="flex items-center gap-2 min-w-0">
              <Wallet size={16} className="text-gold shrink-0" />
              <div className="min-w-0">
                <p className="text-sm font-medium">I received this month's salary</p>
                <p className="text-xs text-muted dark:text-mutedDark mt-0.5">
                  {activeLoading
                    ? 'Loading your estimate...'
                    : activeComponents.length > 0
                      ? `Starts from your active structure's estimated take-home — fully editable before you confirm.`
                      : `No active structure yet — you can still log it and type the amount yourself.`}
                </p>
              </div>
            </div>
            <Button
              onClick={handleReceiveSalary}
              className="shrink-0 px-3 py-1.5 rounded-lg"
            >
              Log it
            </Button>
          </div>

          <div className="flex items-center justify-between">
            <p className="text-xs font-medium text-muted dark:text-mutedDark uppercase tracking-wide">Salary structures</p>
            <Button
              onClick={startNew}
              className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg"
            >
              <Plus size={16} />
              New structure
            </Button>
          </div>

          {structures.length === 0 ? (
            <EmptyState message="No salary structures yet." className="py-8" />
          ) : (
            <div className="divide-y divide-line dark:divide-lineDark border-t border-b border-line dark:border-lineDark">
              {structures.map((s) => (
                <div key={s.id} className="flex items-center justify-between py-3 gap-3">
                  <button onClick={() => openStructure(s)} className="text-left min-w-0 flex-1 hover:opacity-80 transition-opacity">
                    <div className="flex items-center gap-2">
                      <p className="text-sm font-medium truncate">{s.label}</p>
                      {s.is_active && (
                        <span className="flex items-center gap-1 text-xs px-1.5 py-0.5 rounded border border-gold/40 text-gold shrink-0">
                          <Star size={11} className="fill-gold" />
                          Active
                        </span>
                      )}
                    </div>
                    <p className="text-xs text-muted dark:text-mutedDark mt-0.5">
                      {new Date(s.created_at).toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' })}
                    </p>
                  </button>
                  {!s.is_active && (
                    <Button
                      variant="text"
                      onClick={() => handleSetActive(s)}
                      className="shrink-0 text-xs font-medium"
                    >
                      Set active
                    </Button>
                  )}
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {mode === 'new' && (
        <div className="space-y-6 max-w-2xl">
          <button onClick={cancelNew} className="flex items-center gap-1 text-sm text-muted dark:text-mutedDark hover:text-ink dark:hover:text-offwhite">
            <ArrowLeft size={14} />
            Back
          </button>

          <div>
            <label className="block text-xs font-medium text-muted dark:text-mutedDark mb-1">Label</label>
            <Input
              value={draftLabel}
              onChange={(e) => setDraftLabel(e.target.value)}
              className="w-full sm:w-80 text-sm py-2 px-3 rounded-md bg-surface dark:bg-charcoalSurface"
            />
            <p className="text-xs text-muted dark:text-mutedDark mt-1">
              Saving this will make it your active structure — any previous one stays saved, just no longer active.
            </p>
          </div>

          <div>
            <p className="text-xs font-medium text-muted dark:text-mutedDark uppercase tracking-wide mb-2">Components</p>

            {draftComponents.length > 0 && (
              <div className="divide-y divide-line dark:divide-lineDark border-t border-b border-line dark:border-lineDark mb-3">
                {draftComponents.map((c) => (
                  <div key={c.id} className="flex items-center justify-between py-2.5 gap-2">
                    <div className="min-w-0">
                      <span className="text-sm font-medium truncate">{c.name}</span>
                      <ValueBadge kind="actual" confidence={c.category === 'needs_clarification' ? 'uncertain' : undefined}>
                        <span className="text-xs text-muted dark:text-mutedDark ml-2">{CATEGORY_LABELS[c.category]}</span>
                      </ValueBadge>
                    </div>
                    <div className="flex items-center gap-3 shrink-0">
                      <span className="font-mono text-sm text-muted dark:text-mutedDark">
                        {c.monthly_amount === null ? 'No amount yet' : formatCurrency(c.monthly_amount)}
                      </span>
                      <button
                        onClick={() => handleRemoveDraftComponent(c.id)}
                        aria-label={`Remove ${c.name}`}
                        className="text-muted dark:text-mutedDark hover:text-bad"
                      >
                        <X size={16} />
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            )}

            <ComponentEntryForm onAdd={handleAddDraftComponent} />
          </div>

          <SalaryBreakdown components={draftComponents} />

          {saveError && <p className="text-sm text-bad">{saveError}</p>}

          <div className="flex items-center gap-2 pt-2">
            <button
              onClick={cancelNew}
              className="px-3 py-2 text-sm rounded-lg text-muted dark:text-mutedDark hover:bg-surface dark:hover:bg-charcoalSurface transition-colors"
            >
              Cancel
            </button>
            <Button
              onClick={handleSave}
              disabled={saving}
              className="px-4 py-2 rounded-lg"
            >
              {saving ? 'Saving...' : 'Save structure'}
            </Button>
          </div>
        </div>
      )}

      {mode === 'view' && viewingStructure && (
        <div className="space-y-6 max-w-2xl">
          <button onClick={backToList} className="flex items-center gap-1 text-sm text-muted dark:text-mutedDark hover:text-ink dark:hover:text-offwhite">
            <ArrowLeft size={14} />
            Back
          </button>

          <div className="flex items-center gap-2">
            <h2 className="font-display text-xl font-semibold tracking-tight">{viewingStructure.label}</h2>
            {viewingStructure.is_active && (
              <span className="flex items-center gap-1 text-xs px-1.5 py-0.5 rounded border border-gold/40 text-gold">
                <Star size={11} className="fill-gold" />
                Active
              </span>
            )}
          </div>

          {viewLoading && <p className="text-sm text-muted dark:text-mutedDark">Loading...</p>}
          {viewError && <ErrorState message={viewError} onRetry={() => openStructure(viewingStructure)} />}

          {!viewLoading && !viewError && (
            <>
              {viewingComponents.length === 0 ? (
                <EmptyState message="No components were added to this structure." className="py-4" />
              ) : (
                <div className="divide-y divide-line dark:divide-lineDark border-t border-b border-line dark:border-lineDark">
                  {viewingComponents.map((c) => (
                    <div key={c.id} className="flex items-center justify-between py-2.5 gap-2">
                      <div className="min-w-0">
                        <span className="text-sm font-medium truncate">{c.name}</span>
                        <ValueBadge kind="actual" confidence={c.category === 'needs_clarification' ? 'uncertain' : undefined}>
                          <span className="text-xs text-muted dark:text-mutedDark ml-2">{CATEGORY_LABELS[c.category]}</span>
                        </ValueBadge>
                      </div>
                      <span className="font-mono text-sm text-muted dark:text-mutedDark shrink-0">
                        {c.monthly_amount === null ? 'No amount yet' : formatCurrency(c.monthly_amount)}
                      </span>
                    </div>
                  ))}
                </div>
              )}

              <SalaryBreakdown components={viewingComponents} />
            </>
          )}
        </div>
      )}

      {receiveSalaryText !== null && (
        <MoneyInboxInput
          initialText={receiveSalaryText}
          onClose={() => setReceiveSalaryText(null)}
          onSaved={() => setReceiveSalaryText(null)}
        />
      )}
    </div>
  )
}
