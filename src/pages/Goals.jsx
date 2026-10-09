import { useEffect, useMemo, useRef, useState } from 'react'
import { X, Plus } from 'lucide-react'
import { supabase } from '../lib/supabaseClient.js'
import { useAuth } from '../lib/AuthContext.jsx'
import { goalProgress } from '../lib/financialEngine.js'
import { goalOpportunity } from '../lib/goalOpportunityEngine.js'
import PageHeader from '../components/layout/PageHeader.jsx'
import ErrorState from '../components/layout/ErrorState.jsx'
import GoalCard from '../components/goals/GoalCard.jsx'
import ContributeModal from '../components/goals/ContributeModal.jsx'
import Modal from '../components/ui/Modal.jsx'
import Button from '../components/ui/Button.jsx'
import Input from '../components/ui/Input.jsx'
import EmptyState from '../components/ui/EmptyState.jsx'
import { friendlyError } from '../lib/errorMessages.js'
import { useHandoff } from '../lib/useHandoff.js'
import { remember } from '../lib/commandSession.js'
import { goalDialogFromHandoff, pickCreatedGoal, GOAL_DIALOG_MESSAGES } from '../lib/command/goalDialog.js'

const MAX_ACTIVE_GOALS = 10

const TABS = [
  { key: 'active', label: 'Active' },
  { key: 'completed', label: 'Completed' },
  { key: 'archived', label: 'Archived' },
]

export default function Goals() {
  const { user, profile } = useAuth()
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(null)
  // Separate from `error` (page-level load failures shown via ErrorState).
  // This is for action-level messages (archive/reuse) — some are friendly
  // technical-failure text, some are intentional frontend validation
  // messages (e.g. the active-goal limit) that must stay visible as-is,
  // not get swallowed by ErrorState's generic "page failed to load" copy.
  const [actionError, setActionError] = useState(null)

  const [goals, setGoals] = useState([])
  const [goalContributions, setGoalContributions] = useState([])
  const [accounts, setAccounts] = useState([])
  const [transactions, setTransactions] = useState([])

  const [activeTab, setActiveTab] = useState('active')
  const [creating, setCreating] = useState(false)
  const [editingGoal, setEditingGoal] = useState(null)
  const [actionGoal, setActionGoal] = useState(null) // { goal, mode: 'contribution' | 'withdrawal' }
  const [archivingGoal, setArchivingGoal] = useState(null)

  // P7 — a goal command from Money Inbox. `commandDialog` says that the dialog that is open now
  // was opened for a command (and with what), so the banner and the pre-filled values show and
  // so that only a CONFIRMED save from such a dialog is remembered. Opening a dialog yourself
  // leaves it null, and the dialogs behave exactly as they always did.
  const { handoff, done } = useHandoff('goals')
  const handledHandoff = useRef(null)
  const [commandDialog, setCommandDialog] = useState(null) // { kind: 'create' | 'contribute', goalId?, prefill, notice }

  const load = async () => {
    if (!user) return
    setLoading(true)
    setError(null)

    const [goalsRes, contributionsRes, accountsRes, transactionsRes] = await Promise.all([
      supabase.from('goals').select('id, name, target_amount, target_date, status, updated_at').eq('user_id', user.id).order('updated_at', { ascending: false }),
      supabase.from('goal_contributions').select('id, goal_id, account_id, amount, type, contribution_date').eq('user_id', user.id),
      supabase.from('accounts').select('id, name, type').eq('user_id', user.id).eq('is_active', true),
      supabase.from('transactions').select('account_id, to_account_id, type, amount, transaction_date').eq('user_id', user.id),
    ])

    const firstError = goalsRes.error || contributionsRes.error || accountsRes.error || transactionsRes.error
    if (firstError) {
      setError(friendlyError(firstError, "Couldn't load your goals. Please try again."))
      setLoading(false)
      return
    }

    setGoals(goalsRes.data || [])
    setGoalContributions(contributionsRes.data || [])
    setAccounts(accountsRes.data || [])
    setTransactions(transactionsRes.data || [])
    setLoading(false)
  }

  useEffect(() => {
    load()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user])

  const progressByGoalId = useMemo(() => {
    const map = new Map()
    goals.forEach((g) => map.set(g.id, goalProgress(goalContributions, g.id)))
    return map
  }, [goals, goalContributions])

  // Phase 37 — computed once per render from the same already-fetched
  // contributions/transactions, not a separate fetch. Only for active and
  // overdue goals (archived/completed have nothing forward-looking to show).
  const opportunityByGoalId = useMemo(() => {
    const map = new Map()
    goals
      .filter((g) => g.status === 'active')
      .forEach((g) => map.set(g.id, goalOpportunity({ goal: g, contributions: goalContributions, transactions })))
    return map
  }, [goals, goalContributions, transactions])

  const activeGoals = useMemo(() => goals.filter((g) => g.status === 'active'), [goals])
  const visibleGoals = useMemo(() => goals.filter((g) => g.status === activeTab), [goals, activeTab])

  const activeGoalCount = activeGoals.length
  const atMaxActiveGoals = activeGoalCount >= MAX_ACTIVE_GOALS

  // P7 — receive a handoff. It waits until the goals are loaded (the dialogs need them), is
  // handled once per handoff id (React Strict Mode runs effects twice), and NEVER replaces a
  // form that is already open: whatever the user has typed there stays, and they are told to
  // finish it first. Nothing is saved here; the dialogs confirm and save with their own rules.
  useEffect(() => {
    if (!handoff || loading) return
    if (handledHandoff.current === handoff.id) return
    handledHandoff.current = handoff.id
    done()
    if (error) return
    if (creating || editingGoal || actionGoal || archivingGoal) {
      setActionError(GOAL_DIALOG_MESSAGES.dialogOpen)
      return
    }
    const outcome = goalDialogFromHandoff(handoff, { goals, accounts, activeCount: activeGoalCount, activeLimit: MAX_ACTIVE_GOALS })
    if (!outcome.ok) {
      if (outcome.message) setActionError(outcome.message)
      return
    }
    setActionError(null)
    if (outcome.dialog === 'create_goal') {
      setCommandDialog({ kind: 'create', prefill: outcome.prefill, notice: outcome.notice })
      setCreating(true)
    } else {
      const goal = goals.find((g) => String(g.id) === String(outcome.goalId))
      setCommandDialog({ kind: 'contribute', goalId: outcome.goalId, prefill: outcome.prefill, notice: outcome.notice })
      setActionGoal({ goal, mode: 'contribution' })
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [handoff, loading])

  // The command flag lasts only while its dialog is open.
  useEffect(() => {
    if (commandDialog && !creating && !actionGoal) setCommandDialog(null)
  }, [commandDialog, creating, actionGoal])

  // P7 — memory for "add 2000 to it", written ONLY after a confirmed save of a dialog that came
  // from a command. These wrap the existing save handlers and add to them; they change nothing in them.
  // A created goal is remembered only if the read-back finds exactly ONE new goal that matches what
  // was saved; if it cannot be told for sure, nothing is remembered (a wrong memory is worse than none).
  const rememberCreated = (submit) => async (values) => {
    const fromCommand = commandDialog?.kind === 'create'
    const beforeIds = goals.map((g) => g.id)
    const failure = await submit(values)
    if (!failure && fromCommand) {
      try {
        const { data, error: readErr } = await supabase.from('goals').select('id, name, target_amount, status').eq('user_id', user.id).eq('name', values.name)
        const created = readErr ? null : pickCreatedGoal(data, beforeIds, values)
        if (created) remember(created, user.id, Date.now())
      } catch {
        // nothing is remembered
      }
    }
    return failure
  }
  const rememberContributed = (goal, saved) => async () => {
    if (commandDialog?.kind === 'contribute' && String(commandDialog.goalId) === String(goal.id)) {
      try {
        remember({ id: goal.id, name: goal.name }, user.id, Date.now())
      } catch {
        // nothing is remembered
      }
    }
    await saved()
  }
  const createPrefill = creating && commandDialog?.kind === 'create' ? commandDialog : null
  const contributePrefill = actionGoal && commandDialog?.kind === 'contribute' && String(commandDialog.goalId) === String(actionGoal.goal.id) ? commandDialog : null

  const handleArchive = async () => {
    if (!archivingGoal) return
    setActionError(null)
    const { error: archiveErr } = await supabase.from('goals').update({ status: 'archived' }).eq('id', archivingGoal.id)
    if (archiveErr) {
      // eslint-disable-next-line no-console
      console.error(archiveErr)
      setActionError("Couldn't archive this goal. Please try again.")
      setArchivingGoal(null)
      return
    }
    setArchivingGoal(null)
    await load()
  }

  const handleReuse = async (goal) => {
    setActionError(null)
    if (atMaxActiveGoals) {
      setActionError(`You can only have ${MAX_ACTIVE_GOALS} active goals at once. Archive one first to start a new cycle.`)
      return
    }
    const { error: insertErr } = await supabase.from('goals').insert({
      user_id: user.id,
      name: goal.name,
      target_amount: goal.target_amount,
      target_date: null,
      status: 'active',
    })
    if (insertErr) {
      // eslint-disable-next-line no-console
      console.error(insertErr)
      setActionError("Couldn't start a new cycle for this goal. Please try again.")
      return
    }
    await load()
  }

  if (loading) {
    return (
      <div className="p-6 bg-paper dark:bg-charcoal min-h-screen">
        <p className="text-sm text-muted dark:text-mutedDark">Loading your goals...</p>
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
          <button onClick={() => setActionError(null)} aria-label="Dismiss error" className="shrink-0">
            <X size={14} />
          </button>
        </div>
      )}

      <div className="flex items-center justify-between">
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

        <Button
          onClick={() => setCreating(true)}
          className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg"
        >
          <Plus size={16} />
          New goal
        </Button>
      </div>

      {atMaxActiveGoals && activeTab === 'active' && (
        <p className="text-xs text-muted dark:text-mutedDark">
          You've reached the {MAX_ACTIVE_GOALS} active goal limit. Archive or complete a goal to add another.
        </p>
      )}

      {goals.length === 0 && <EmptyState message="Nothing you're saving toward yet." className="py-8" />}

      {goals.length > 0 && visibleGoals.length === 0 && (
        <EmptyState message={`No ${activeTab} goals.`} className="py-8" />
      )}

      {visibleGoals.length > 0 && (
        <div className="divide-y divide-line dark:divide-lineDark border-t border-b border-line dark:border-lineDark">
          {visibleGoals.map((goal) => (
            <GoalCard
              key={goal.id}
              goal={goal}
              currentProgress={progressByGoalId.get(goal.id) || 0}
              opportunity={opportunityByGoalId.get(goal.id) || null}
              onContribute={() => setActionGoal({ goal, mode: 'contribution' })}
              onWithdraw={() => setActionGoal({ goal, mode: 'withdrawal' })}
              onEdit={() => setEditingGoal(goal)}
              onArchive={() => setArchivingGoal(goal)}
              onReuse={() => handleReuse(goal)}
            />
          ))}
        </div>
      )}

      {creating && (
        <GoalFormModal
          title="New goal"
          submitLabel="Create goal"
          initialName={createPrefill ? createPrefill.prefill.name : undefined}
          initialTargetAmount={createPrefill ? createPrefill.prefill.targetAmount : undefined}
          initialTargetDate={createPrefill ? createPrefill.prefill.targetDate : undefined}
          notice={createPrefill ? createPrefill.notice : undefined}
          onClose={() => setCreating(false)}
          onSubmit={rememberCreated(async ({ name, targetAmount, targetDate }) => {
            if (atMaxActiveGoals) {
              return `You can only have ${MAX_ACTIVE_GOALS} active goals at once.`
            }
            const { error: insertErr } = await supabase.from('goals').insert({
              user_id: user.id,
              name,
              target_amount: targetAmount,
              target_date: targetDate || null,
              status: 'active',
            })
            if (insertErr) {
              // eslint-disable-next-line no-console
              console.error(insertErr)
              return "Couldn't create this goal. Please try again."
            }
            setCreating(false)
            await load()
            return null
          })}
        />
      )}

      {editingGoal && (
        <GoalFormModal
          title="Edit goal"
          submitLabel="Save"
          initialName={editingGoal.name}
          initialTargetAmount={editingGoal.target_amount}
          initialTargetDate={editingGoal.target_date || ''}
          onClose={() => setEditingGoal(null)}
          onSubmit={async ({ name, targetAmount, targetDate }) => {
            const { error: updateErr } = await supabase
              .from('goals')
              .update({ name, target_amount: targetAmount, target_date: targetDate || null })
              .eq('id', editingGoal.id)
            if (updateErr) {
              // eslint-disable-next-line no-console
              console.error(updateErr)
              return "Couldn't save these changes. Please try again."
            }
            setEditingGoal(null)
            await load()
            return null
          }}
        />
      )}

      {actionGoal && (
        <ContributeModal
          mode={actionGoal.mode}
          goal={actionGoal.goal}
          currentProgress={progressByGoalId.get(actionGoal.goal.id) || 0}
          accounts={accounts}
          transactions={transactions}
          goalContributions={goalContributions}
          userId={user.id}
          initialAmount={contributePrefill ? contributePrefill.prefill.amount : undefined}
          initialAccountId={contributePrefill ? contributePrefill.prefill.accountId : undefined}
          notice={contributePrefill ? contributePrefill.notice : undefined}
          onClose={() => setActionGoal(null)}
          onSaved={rememberContributed(actionGoal.goal, async () => {
            setActionGoal(null)
            await load()
          })}
          onError={setError}
        />
      )}

      {archivingGoal && (
        <ConfirmArchiveModal goal={archivingGoal} onCancel={() => setArchivingGoal(null)} onConfirm={handleArchive} />
      )}
    </div>
  )
}

function GoalFormModal({ title, submitLabel, initialName = '', initialTargetAmount = '', initialTargetDate = '', notice, onClose, onSubmit }) {
  const [name, setName] = useState(initialName)
  const [targetAmount, setTargetAmount] = useState(initialTargetAmount)
  const [targetDate, setTargetDate] = useState(initialTargetDate)
  const [saving, setSaving] = useState(false)
  const [formError, setFormError] = useState(null)
  const inFlight = useRef(false)

  const canSave = name.trim().length > 0 && Number(targetAmount) > 0

  const saveOnce = async () => {
    if (!canSave) return
    setSaving(true)
    setFormError(null)
    const err = await onSubmit({ name: name.trim(), targetAmount: Number(targetAmount), targetDate })
    setSaving(false)
    if (err) setFormError(err)
  }

  // P14 (N-6): a ref flips synchronously, so two clicks in the same instant cannot both pass,
  // which the disabled button alone (it only updates on the next render) cannot promise.
  const handleSave = async () => {
    if (inFlight.current) return
    inFlight.current = true
    try {
      await saveOnce()
    } finally {
      inFlight.current = false
    }
  }

  return (
    <Modal onClose={onClose} titleId="goal-form-title" className="fixed inset-0 bg-black/40 flex items-end sm:items-center justify-center">
      <div
        className="bg-surface dark:bg-charcoalSurface rounded-t-2xl sm:rounded-2xl border border-line dark:border-lineDark w-full sm:w-96 p-5 space-y-4"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between">
          <h2 id="goal-form-title" className="font-display text-lg font-semibold tracking-tight">{title}</h2>
          <button onClick={onClose} className="text-muted dark:text-mutedDark hover:text-ink dark:hover:text-offwhite" aria-label="Close">
            <X size={18} />
          </button>
        </div>

        {notice && notice.length > 0 && (
          <div className="text-xs text-muted dark:text-mutedDark space-y-1" data-testid="money-inbox-notice">
            {notice.map((line, i) => <p key={i}>{line}</p>)}
          </div>
        )}

        <div className="space-y-3">
          <Input
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="Goal name"
            className="w-full bg-paper dark:bg-charcoal rounded-lg px-3 py-2 text-sm"
          />
          <Input
            type="number"
            value={targetAmount}
            onChange={(e) => setTargetAmount(e.target.value)}
            placeholder="Target amount"
            className="w-full bg-paper dark:bg-charcoal rounded-lg px-3 py-2 text-sm font-mono"
          />
          <div>
            <Input
              type="date"
              value={targetDate}
              onChange={(e) => setTargetDate(e.target.value)}
              aria-label="Target date (optional)"
              className="w-full bg-paper dark:bg-charcoal rounded-lg px-3 py-2 text-sm font-mono"
            />
            <p className="text-xs text-muted dark:text-mutedDark mt-1">Optional — leave blank if this goal has no deadline.</p>
          </div>

          {formError && <p className="text-xs text-badText">{formError}</p>}
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

function ConfirmArchiveModal({ goal, onCancel, onConfirm }) {
  const [archiving, setArchiving] = useState(false)

  const handleConfirm = async () => {
    setArchiving(true)
    await onConfirm()
  }

  return (
    <Modal onClose={onCancel} titleId="archive-goal-title" className="fixed inset-0 bg-black/40 flex items-end sm:items-center justify-center">
      <div
        className="bg-surface dark:bg-charcoalSurface rounded-t-2xl sm:rounded-2xl border border-line dark:border-lineDark w-full sm:w-96 p-5 space-y-4"
        onClick={(e) => e.stopPropagation()}
      >
        <h2 id="archive-goal-title" className="font-display text-lg font-semibold tracking-tight">Archive goal?</h2>
        <p className="text-sm text-muted dark:text-mutedDark">
          Archive <span className="text-ink dark:text-offwhite">{goal.name}</span>? It stays in your Archived tab and its history is kept.
        </p>
        <div className="flex justify-end gap-2">
          <Button variant="secondary" onClick={onCancel} className="px-3 py-2 rounded-lg">
            Cancel
          </Button>
          <Button
            variant="destructive"
            onClick={handleConfirm}
            disabled={archiving}
            className="px-4 py-2 rounded-lg"
          >
            {archiving ? 'Archiving...' : 'Archive'}
          </Button>
        </div>
      </div>
    </Modal>
  )
}
