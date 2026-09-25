// Consolidates the app's four recurring hand-written button treatments
// (V1.2.5 UI-primitives task). Each variant carries only what was 100%
// identical across every existing instance of that pattern: fill/text
// color, hover, disabled opacity, font-weight, text-sm. Padding, rounding,
// width, and icon/gap layout stay caller-supplied via className, exactly
// as each call site already had them — that variance is real (compact
// Settings buttons vs. full-width auth buttons vs. modal footer buttons)
// and baking any of it in here would risk two utility classes fighting
// over the same CSS property with no reliable winner.
const VARIANTS = {
  primary: 'text-sm font-medium bg-gold text-white hover:bg-gold/90 disabled:opacity-40 transition-colors',
  secondary: 'text-sm text-muted dark:text-mutedDark hover:bg-paper dark:hover:bg-charcoal transition-colors',
  destructive: 'text-sm font-medium bg-bad text-white hover:bg-bad/90 disabled:opacity-40 transition-colors',
  text: 'text-gold hover:underline',
}

export default function Button({ variant = 'primary', type = 'button', className = '', ...props }) {
  return <button type={type} className={`${VARIANTS[variant]} ${className}`.trim()} {...props} />
}
