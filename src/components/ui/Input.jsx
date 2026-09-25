// Consolidates the app's bordered-field pattern (V1.2.5 UI-primitives
// task) — the one thing genuinely identical across every text input,
// textarea, and number/date field in the app: a bordered box with a gold
// focus border. Background, padding, rounding, text size, and font-mono
// vary by context (modal fields use bg-paper, page-level fields use
// bg-surface, etc.) and stay caller-supplied via className, same reasoning
// as Button.jsx — real variance, not drift, and baking any of it in here
// would risk fighting a caller's own override for the same property.
//
// `as="textarea"` covers the textarea instances (Money Inbox, Budget
// Recipe) — same border/focus treatment, just a different element; not
// worth a second file for what both call sites already styled identically
// apart from `resize-none`.
const BASE = 'border border-line dark:border-lineDark outline-none focus:border-gold'

export default function Input({ as = 'input', className = '', ...props }) {
  const Tag = as
  return <Tag className={`${BASE} ${className}`.trim()} {...props} />
}
