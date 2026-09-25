import { Archive, RotateCcw, Pencil, ArrowDownToLine, ArrowUpFromLine } from 'lucide-react'
import { formatCurrency } from '../../lib/format.js'
import { suggestedMonthlyPace, goalStatusLabel, progressPercent } from '../../lib/goalEngine.js'

// Status badge copy — per §36, "overdue" must never render as "failed."
const STATUS_LABELS = {
  active: 'Active',
  completed: 'Completed',
  archived: 'Archived',
  overdue: 'Target date passed',
}

const STATUS_CLASSES = {
  active: 'text-muted dark:text-mutedDark',
  completed: 'text-good',
  archived: 'text-muted dark:text-mutedDark',
  overdue: 'text-bad',
}

function formatTargetDate(dateStr) {
  if (!dateStr) return null
  return new Date(dateStr).toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' })
}

export default function GoalCard({ goal, currentProgress, onContribute, onWithdraw, onEdit, onArchive, onReuse }) {
  const displayStatus = goalStatusLabel(goal)
  const { percent, overage } = progressPercent(currentProgress, goal.target_amount)
  const pace = displayStatus === 'active' || displayStatus === 'overdue' ? suggestedMonthlyPace(goal, currentProgress) : null

  const barColorClass = displayStatus === 'completed' ? 'bg-good' : displayStatus === 'overdue' ? 'bg-bad' : 'bg-gold'

  return (
    <div className="py-4">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <div className="flex items-center gap-2 flex-wrap">
            <h3 className="font-display text-base font-semibold tracking-tight text-ink dark:text-offwhite truncate">
              {goal.name}
            </h3>
            <span className={`text-xs font-medium ${STATUS_CLASSES[displayStatus]}`}>{STATUS_LABELS[displayStatus]}</span>
          </div>
          <div className="font-mono text-sm text-muted dark:text-mutedDark mt-0.5">
            {formatCurrency(currentProgress)} of {formatCurrency(goal.target_amount)}
            {overage > 0 && <span className="text-good ml-1">({formatCurrency(overage)} over target)</span>}
          </div>
          {goal.target_date && (
            <div className="text-xs text-muted dark:text-mutedDark mt-0.5">Target: {formatTargetDate(goal.target_date)}</div>
          )}
        </div>

        <div className="flex items-center gap-1 shrink-0">
          {(displayStatus === 'active' || displayStatus === 'overdue') && (
            <>
              <button
                onClick={onContribute}
                className="p-1.5 text-muted dark:text-mutedDark hover:text-gold"
                aria-label="Contribute to goal"
                title="Contribute"
              >
                <ArrowDownToLine size={16} />
              </button>
              <button
                onClick={onWithdraw}
                className="p-1.5 text-muted dark:text-mutedDark hover:text-gold"
                aria-label="Withdraw from goal"
                title="Withdraw"
              >
                <ArrowUpFromLine size={16} />
              </button>
              <button onClick={onEdit} className="p-1.5 text-muted dark:text-mutedDark hover:text-gold" aria-label="Edit goal" title="Edit">
                <Pencil size={16} />
              </button>
              <button
                onClick={onArchive}
                className="p-1.5 text-muted dark:text-mutedDark hover:text-bad"
                aria-label="Archive goal"
                title="Archive"
              >
                <Archive size={16} />
              </button>
            </>
          )}
          {displayStatus === 'completed' && (
            <button
              onClick={onReuse}
              className="flex items-center gap-1.5 px-2.5 py-1.5 text-xs font-medium rounded-md text-gold hover:bg-paper dark:hover:bg-charcoal"
              title="Start a new cycle for this goal"
            >
              <RotateCcw size={14} />
              Start new cycle
            </button>
          )}
        </div>
      </div>

      <div className="mt-3 h-1.5 w-full rounded-full bg-line dark:bg-lineDark overflow-hidden">
        <div className={`h-full rounded-full ${barColorClass}`} style={{ width: `${percent}%` }} />
      </div>

      {pace !== null && pace > 0 && (
        <div className="text-xs text-muted dark:text-mutedDark mt-1.5">
          At this pace, saving <span className="font-mono">{formatCurrency(pace)}</span>/month keeps this goal on track.
        </div>
      )}
    </div>
  )
}
