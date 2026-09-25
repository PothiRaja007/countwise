// Consolidates the app's bordered-select pattern (V1.2.5 UI-primitives
// task) — same border/focus treatment as Input.jsx, same reasoning for
// leaving background/padding/rounding/width as caller-supplied className.
// A separate file from Input.jsx because <select> takes <option> children
// with different semantics, even though the visual base is identical.
const BASE = 'border border-line dark:border-lineDark outline-none focus:border-gold'

export default function Select({ className = '', children, ...props }) {
  return (
    <select className={`${BASE} ${className}`.trim()} {...props}>
      {children}
    </select>
  )
}
