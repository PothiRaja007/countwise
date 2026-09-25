import { useEffect, useState } from 'react'
import { Plus, X, ArrowLeft } from 'lucide-react'
import { supabase } from '../lib/supabaseClient.js'
import { useAuth } from '../lib/AuthContext.jsx'
import { formatCurrency } from '../lib/format.js'
import PageHeader from '../components/layout/PageHeader.jsx'
import ErrorState from '../components/layout/ErrorState.jsx'
import { sumByCategory, estimatedGrossAnnual, estimatedMonthlyTakeHome, hasIncompleteComponents } from '../lib/ctcEngine.js'
import { friendlyError } from '../lib/errorMessages.js'
import ValueBadge from '../components/ui/ValueBadge.jsx'
import Button from '../components/ui/Button.jsx'
import Input from '../components/ui/Input.jsx'
import Select from '../components/ui/Select.jsx'
import EmptyState from '../components/ui/EmptyState.jsx'

// Subphase 24.2 — the real CTC Explorer page, replacing the 23.5 stub.
// Manual entry only: the user types in the components from their own
// offer letter. No file upload, no PDF/document parsing, no AI call —
// those are explicitly locked to V1.3 (Phase 30+). Every number shown
// here comes from ctcEngine.js (Subphase 24.1) — this file does not do
// its own financial math.

const CATEGORY_OPTIONS = [
  { value: 'basic', label: 'Basic' },
  { value: 'hra', label: 'HRA' },
  { value: 'special_allowance', label: 'Special Allowance' },
  { value: 'employer_pf', label: 'Employer PF' },
  { value: 'gratuity', label: 'Gratuity' },
  { value: 'variable_pay', label: 'Variable Pay' },
  { value: 'other', label: 'Other' },
  { value: 'needs_clarification', label: 'Needs Clarification' },
]

const CATEGORY_LABELS = Object.fromEntries(CATEGORY_OPTIONS.map((c) => [c.value, c.label]))

let draftIdCounter = 0
function nextDraftId() {
  draftIdCounter += 1
  return `draft-${draftIdCounter}`
}

// Shared read-only breakdown — used both while building a new exploration
// and while revisiting a saved one. Zero inline math: every figure here
// is read straight off ctcEngine.js's return values, never re-derived.
function CtcBreakdown({ components }) {
  if (components.length === 0) return null

  const { totals } = sumByCategory(components)
  const gross = estimatedGrossAnnual(components)
  const takeHome = estimatedMonthlyTakeHome(components)
  const incomplete = hasIncompleteComponents(components)
  const missingAmountNames = components
    .filter((c) => c.annual_amount === null || c.annual_amount === undefined)
    .map((c) => c.name)
  const needsClarificationNames = components
    .filter((c) => c.category === 'needs_clarification' && c.annual_amount !== null && c.annual_amount !== undefined)
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
            Estimated annual gross:{' '}
            <ValueBadge kind="estimated" provenance={{ assumptions: gross.assumption }}>
              <span className="font-mono">{formatCurrency(gross.annualGross)}</span>
            </ValueBadge>
          </p>
          <p className="text-xs text-muted dark:text-mutedDark mt-0.5">
            Based on the values and assumptions you provided — {gross.assumption}
          </p>
        </div>
        <div>
          <p className="text-sm text-ink dark:text-offwhite">
            Estimated monthly take-home:{' '}
            <ValueBadge kind="estimated" provenance={{ assumptions: takeHome.assumptions }}>
              <span className="font-mono">{formatCurrency(takeHome.monthlyEstimate)}</span>
            </ValueBadge>
          </p>
          <p className="text-xs text-muted dark:text-mutedDark mt-0.5">
            A rough estimate based on the values and assumptions you provided — it does not account for income tax or
            your own PF contribution.
          </p>
        </div>
      </div>
    </div>
  )
}

// The add-component entry form, reused in "new exploration" mode only.
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

    let annualAmount = null
    if (amountStr.trim() !== '') {
      const parsed = Number(amountStr)
      if (!Number.isFinite(parsed) || parsed <= 0) {
        setFormError("Enter a valid amount, or leave it blank if you're not sure yet.")
        return
      }
      annualAmount = parsed
    }

    onAdd({ id: nextDraftId(), name: trimmedName, category, annual_amount: annualAmount })
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
          <label className="block text-xs font-medium text-muted dark:text-mutedDark mb-1">Annual amount (optional)</label>
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

export default function CTCExplorer() {
  const { user, profile } = useAuth()

  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(null)
  const [explorations, setExplorations] = useState([])

  // 'list' | 'new' | 'view'
  const [mode, setMode] = useState('list')

  // --- new-exploration draft state ---
  const [draftLabel, setDraftLabel] = useState('My CTC breakdown')
  const [draftCtcAnnual, setDraftCtcAnnual] = useState('')
  const [draftComponents, setDraftComponents] = useState([])
  const [saving, setSaving] = useState(false)
  const [saveError, setSaveError] = useState(null)

  // --- viewing a saved exploration ---
  const [viewingExploration, setViewingExploration] = useState(null)
  const [viewingComponents, setViewingComponents] = useState([])
  const [viewLoading, setViewLoading] = useState(false)
  const [viewError, setViewError] = useState(null)

  const load = async () => {
    if (!user) return
    setLoading(true)
    setError(null)

    const { data, error: fetchErr } = await supabase
      .from('ctc_explorations')
      .select('id, label, ctc_annual, created_at')
      .eq('user_id', user.id)
      .order('created_at', { ascending: false })

    if (fetchErr) {
      setError(friendlyError(fetchErr, "Couldn't load your CTC explorations. Please try again."))
      setLoading(false)
      return
    }

    setExplorations(data || [])
    setLoading(false)
  }

  useEffect(() => {
    load()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user])

  const resetDraft = () => {
    setDraftLabel('My CTC breakdown')
    setDraftCtcAnnual('')
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

    const ctcAnnual = Number(draftCtcAnnual)
    if (!draftCtcAnnual.trim() || !Number.isFinite(ctcAnnual) || ctcAnnual <= 0) {
      setSaveError('Enter the total CTC from your offer letter (a positive amount) before saving.')
      return
    }

    setSaving(true)

    const { data: exploration, error: explorationErr } = await supabase
      .from('ctc_explorations')
      .insert({ user_id: user.id, label: draftLabel.trim() || 'My CTC breakdown', ctc_annual: ctcAnnual })
      .select('id')
      .single()

    if (explorationErr) {
      // eslint-disable-next-line no-console
      console.error(explorationErr)
      setSaveError("Couldn't save this exploration. Please try again.")
      setSaving(false)
      return
    }

    if (draftComponents.length > 0) {
      const rows = draftComponents.map((c) => ({
        exploration_id: exploration.id,
        user_id: user.id,
        name: c.name,
        category: c.category,
        annual_amount: c.annual_amount,
      }))

      const { error: componentsErr } = await supabase.from('ctc_components').insert(rows)

      if (componentsErr) {
        // eslint-disable-next-line no-console
        console.error(componentsErr)
        // Compensating cleanup — don't leave a saved exploration with no
        // components silently behind if the components half failed.
        await supabase.from('ctc_explorations').delete().eq('id', exploration.id)
        setSaveError("Couldn't save the components for this exploration. Please try again.")
        setSaving(false)
        return
      }
    }

    setSaving(false)
    resetDraft()
    setMode('list')
    await load()
  }

  const openExploration = async (exploration) => {
    setMode('view')
    setViewingExploration(exploration)
    setViewingComponents([])
    setViewError(null)
    setViewLoading(true)

    const { data, error: fetchErr } = await supabase
      .from('ctc_components')
      .select('id, name, category, annual_amount')
      .eq('exploration_id', exploration.id)
      .order('created_at', { ascending: true })

    if (fetchErr) {
      setViewError(friendlyError(fetchErr, "Couldn't load this exploration. Please try again."))
      setViewLoading(false)
      return
    }

    setViewingComponents(data || [])
    setViewLoading(false)
  }

  const backToList = () => {
    setMode('list')
    setViewingExploration(null)
    setViewingComponents([])
    setViewError(null)
  }

  if (loading) {
    return (
      <div className="p-6 bg-paper dark:bg-charcoal min-h-screen">
        <p className="text-sm text-muted dark:text-mutedDark">Loading your CTC explorations...</p>
      </div>
    )
  }

  return (
    <div className="p-6 sm:p-8 space-y-6 bg-paper dark:bg-charcoal min-h-screen text-ink dark:text-offwhite">
      <PageHeader name={profile?.username} />

      {error && <ErrorState message={error} onRetry={load} />}

      <div>
        <p className="text-xs uppercase tracking-[0.14em] text-muted dark:text-mutedDark">Work</p>
        <h1 className="font-display text-3xl sm:text-4xl font-semibold tracking-tight mt-2">CTC Explorer</h1>
        <p className="text-sm text-muted dark:text-mutedDark mt-2 max-w-xl">
          Break down what a job offer's CTC actually means — type in the components from your offer letter and see
          an estimated gross and take-home, based on what you enter.
        </p>
      </div>

      {mode === 'list' && (
        <div className="space-y-4">
          <Button
            onClick={startNew}
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg"
          >
            <Plus size={16} />
            New exploration
          </Button>

          {explorations.length === 0 ? (
            <EmptyState message="Nothing explored yet." className="py-8" />
          ) : (
            <div className="divide-y divide-line dark:divide-lineDark border-t border-b border-line dark:border-lineDark">
              {explorations.map((exp) => (
                <button
                  key={exp.id}
                  onClick={() => openExploration(exp)}
                  className="w-full flex items-center justify-between py-3 text-left hover:bg-surface dark:hover:bg-charcoalSurface transition-colors"
                >
                  <div>
                    <p className="text-sm font-medium">{exp.label}</p>
                    <p className="text-xs text-muted dark:text-mutedDark mt-0.5">
                      {new Date(exp.created_at).toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' })}
                    </p>
                  </div>
                  <span className="font-mono text-sm text-muted dark:text-mutedDark">{formatCurrency(exp.ctc_annual)}</span>
                </button>
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

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div>
              <label className="block text-xs font-medium text-muted dark:text-mutedDark mb-1">Label</label>
              <Input
                value={draftLabel}
                onChange={(e) => setDraftLabel(e.target.value)}
                className="w-full text-sm py-2 px-3 rounded-md bg-surface dark:bg-charcoalSurface"
              />
            </div>
            <div>
              <label className="block text-xs font-medium text-muted dark:text-mutedDark mb-1">Total CTC (annual, from offer letter)</label>
              <Input
                value={draftCtcAnnual}
                onChange={(e) => setDraftCtcAnnual(e.target.value)}
                placeholder="e.g. 1200000"
                inputMode="decimal"
                className="w-full text-sm py-2 px-3 rounded-md bg-surface dark:bg-charcoalSurface"
              />
            </div>
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
                        {c.annual_amount === null ? 'No amount yet' : formatCurrency(c.annual_amount)}
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

          <CtcBreakdown components={draftComponents} />

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
              {saving ? 'Saving...' : 'Save exploration'}
            </Button>
          </div>
        </div>
      )}

      {mode === 'view' && viewingExploration && (
        <div className="space-y-6 max-w-2xl">
          <button onClick={backToList} className="flex items-center gap-1 text-sm text-muted dark:text-mutedDark hover:text-ink dark:hover:text-offwhite">
            <ArrowLeft size={14} />
            Back
          </button>

          <div>
            <h2 className="font-display text-xl font-semibold tracking-tight">{viewingExploration.label}</h2>
            <p className="text-sm text-muted dark:text-mutedDark mt-1">
              Total CTC: <span className="font-mono">{formatCurrency(viewingExploration.ctc_annual)}</span>
            </p>
          </div>

          {viewLoading && <p className="text-sm text-muted dark:text-mutedDark">Loading...</p>}
          {viewError && <ErrorState message={viewError} onRetry={() => openExploration(viewingExploration)} />}

          {!viewLoading && !viewError && (
            <>
              {viewingComponents.length === 0 ? (
                <EmptyState message="No components were added to this exploration." className="py-4" />
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
                        {c.annual_amount === null ? 'No amount yet' : formatCurrency(c.annual_amount)}
                      </span>
                    </div>
                  ))}
                </div>
              )}

              <CtcBreakdown components={viewingComponents} />
            </>
          )}
        </div>
      )}
    </div>
  )
}
