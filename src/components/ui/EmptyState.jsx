import Button from './Button.jsx'

// Consolidates the app's empty-state patterns (V1.2.5 UI-primitives task).
// The overwhelming majority of existing empty states are a single muted
// line — `text-sm text-muted dark:text-mutedDark`, identical everywhere,
// with only the message text and surrounding spacing (py-6/py-8/py-12/...)
// differing, so that spacing stays caller-supplied via className exactly
// like Button/Input/Select. The one richer pattern (icon + heading +
// subtext + CTA) previously existed only in LearningROI.jsx; reproduced
// here byte-for-byte (same classes, same structure) so its locked copy
// renders identically, and offered to every page rather than staying a
// one-off local component.
//
// Every locked empty-state string in the app (Transactions, Goals,
// Learning ROI, Behavior, Charts, CTC Explorer, Salary, ...) passes
// through unchanged as `message` — this component never alters copy.
export default function EmptyState({ icon: Icon, message, subtext, action, className = '' }) {
  const isRich = Icon || subtext || action

  if (!isRich) {
    return <p className={`text-sm text-muted dark:text-mutedDark ${className}`.trim()}>{message}</p>
  }

  return (
    <div className={`py-16 text-center border-b border-line dark:border-lineDark ${className}`.trim()}>
      {Icon && <Icon size={24} className="mx-auto text-muted dark:text-mutedDark" strokeWidth={1.5} />}
      <p className="font-display text-xl font-semibold text-ink dark:text-offwhite mt-4">{message}</p>
      {subtext && <p className="text-sm text-muted dark:text-mutedDark mt-1">{subtext}</p>}
      {action && (
        <Button
          variant="text"
          onClick={action.onClick}
          className="mt-5 inline-flex items-center gap-1.5 text-sm font-medium"
        >
          {action.icon ? <action.icon size={15} /> : null}
          {action.label}
        </Button>
      )}
    </div>
  )
}
