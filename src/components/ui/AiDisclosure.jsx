// One place for the "this sends data to Google" line shown next to every
// AI action, so the wording and the link to the AI & Data Processing
// Notice can never drift apart between pages. Pass the sentence that says
// what THIS action sends; the pointer to the notice is appended.
//
// Maintenance rule (same as the notice itself): a new AI action must show
// one of these, and the notice must be updated in the same change.
export default function AiDisclosure({ children, className = '' }) {
  return (
    <p className={`text-[11px] text-muted dark:text-mutedDark mt-1 max-w-xl leading-4 ${className}`.trim()}>
      {children} Read the{' '}
      <a href="/ai-data-notice" target="_blank" rel="noopener noreferrer" className="underline hover:text-gold">
        AI &amp; Data Processing Notice
      </a>{' '}
      first.
    </p>
  )
}
