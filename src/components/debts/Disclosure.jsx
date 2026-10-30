// D10: a small expander for secondary explanations. A native <details>, so it works without script, by keyboard, and
// its text stays in the page (nothing is removed, only collapsed). Important disclosures are NOT put in here.
export default function Disclosure({ summary, children, testId, className = '', defaultOpen = false }) {
  return (
    <details className={`group text-xs text-muted dark:text-mutedDark ${className}`} data-testid={testId} open={defaultOpen || undefined}>
      <summary className="cursor-pointer select-none inline-flex items-center gap-1 py-1.5 font-medium text-brown dark:text-gold hover:text-goldText">
        <svg width="12" height="12" viewBox="0 0 12 12" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true" className="transition-transform group-open:rotate-90"><path d="M4 2l4 4-4 4" /></svg>
        {summary}
      </summary>
      <div className="mt-1.5 space-y-1.5">{children}</div>
    </details>
  )
}
