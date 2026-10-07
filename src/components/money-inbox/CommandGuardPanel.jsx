import Button from '../ui/Button.jsx'

// The command guard's panel (P4). It shows what Money Inbox understood when a
// message was a command, a question, a page request or unclear, instead of
// quietly treating it as an expense. All the wording and the meaning of each
// button come from lib/command/guardView.js; this component only draws them.
//
// It has no save, confirm or write call of its own: nothing in this panel can
// change financial data. Understood requests offer only "Edit my message" and
// "Cancel"; a clarification offers its own explicit choices.
export default function CommandGuardPanel({ view, onChoose }) {
  return (
    <div className="space-y-3" role="region" aria-live="polite" aria-label="Money Inbox needs a quick check">
      <h3 className="text-sm font-medium text-ink dark:text-offwhite">{view.title}</h3>

      {view.message && <p className="text-sm text-muted dark:text-mutedDark">{view.message}</p>}

      {view.notes.length > 0 && (
        <ul className="text-xs text-muted dark:text-mutedDark space-y-1 list-disc pl-4">
          {view.notes.map((note) => (
            <li key={note}>{note}</li>
          ))}
        </ul>
      )}

      {view.footer && <p className="text-xs text-muted dark:text-mutedDark">{view.footer}</p>}

      <div className="flex flex-wrap justify-end gap-2">
        {view.choices.map((choice) => (
          <Button
            key={choice.id}
            type="button"
            variant={choice.id === 'cancel' ? 'secondary' : 'primary'}
            onClick={() => onChoose(choice.id)}
            className="px-3 py-2 rounded-lg"
          >
            {choice.label}
          </Button>
        ))}
      </div>
    </div>
  )
}
