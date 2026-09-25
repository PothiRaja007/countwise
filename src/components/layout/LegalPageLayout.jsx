import { Link } from 'react-router-dom'
import { useAuth } from '../../lib/AuthContext.jsx'
import PageHeader from './PageHeader.jsx'

// Phase 23B — shared wrapper for the three content pages (Privacy Policy,
// Terms & Conditions, AI/Data Processing Notice). Deliberately standalone,
// not wrapped in AppShell: these three routes render before every
// auth-state gate in App.jsx (so they're reachable without being logged
// in), which means Sidebar/MoneyInboxTrigger/ReminderBanner — all of
// which assume an authenticated user — would be the wrong thing to show
// here even for a logged-in visitor. "Back" returns to "/", which then
// falls through to App.jsx's normal gating (the app if signed in, Login
// if not) — no extra logic needed here for that.
//
// This is intentionally closer to a plain readable document than an app
// page: no cards, no tables, just PageHeader (for visual consistency, per
// the frozen spec) plus a title block and prose-style sections below.
export default function LegalPageLayout({ title, lastUpdated, children }) {
  const { profile, session } = useAuth()

  return (
    <div className="min-h-screen bg-paper dark:bg-charcoal p-6 sm:p-8">
      <div className="max-w-2xl mx-auto pb-16">
        <div className="flex items-center justify-between mb-8">
          <div className="font-display text-lg font-semibold tracking-tight">
            <span className="text-ink dark:text-offwhite">Count</span>
            <span className="text-gold">Wise</span>
          </div>
          <Link to="/" className="text-sm text-muted dark:text-mutedDark hover:text-gold transition-colors">
            {session ? '← Back to CountWise' : '← Back to Sign In'}
          </Link>
        </div>

        <PageHeader name={profile?.username} />

        <div className="mt-8 border-t border-line dark:border-lineDark pt-6">
          <h1 className="font-display text-2xl sm:text-3xl font-semibold tracking-tight text-ink dark:text-offwhite">
            {title}
          </h1>
          {lastUpdated && (
            <p className="text-xs text-muted dark:text-mutedDark mt-2">Last updated: {lastUpdated}</p>
          )}
        </div>

        {/* max-w-[65ch] keeps line length readable for dense text — this is
            denser reading than anything else in the app, so it gets its
            own explicit width constraint rather than inheriting the
            wrapper's max-w-2xl for the running text itself. */}
        <div className="mt-6 max-w-[65ch] space-y-8">{children}</div>
      </div>
    </div>
  )
}

// One heading + its paragraphs/lists. Text color/size is set once here and
// inherited by plain <p>/<ul>/<li> children — no need for a typography
// plugin (none is installed) or descendant-selector CSS.
export function LegalSection({ heading, children }) {
  return (
    <section>
      <h2 className="font-display text-base sm:text-lg font-semibold text-ink dark:text-offwhite mb-2">
        {heading}
      </h2>
      <div className="space-y-3 text-sm leading-relaxed text-muted dark:text-mutedDark [&_ul]:list-disc [&_ul]:pl-5 [&_ul]:space-y-1.5 [&_strong]:text-ink dark:[&_strong]:text-offwhite [&_strong]:font-medium">
        {children}
      </div>
    </section>
  )
}

// Visually distinct callout for content that describes a not-yet-built
// feature (CTC/Salary/PF disclaimers, V1.3 AI) — flags it in the UI itself,
// not just in code comments and the handoff, so it can't quietly go stale
// once those phases actually land.
export function FutureNote({ children }) {
  return (
    <div className="border border-gold/40 bg-gold/5 rounded-lg px-4 py-3">
      <p className="text-xs font-medium uppercase tracking-wide text-gold mb-1">Forward-looking note</p>
      <div className="text-sm leading-relaxed text-ink dark:text-offwhite space-y-2">{children}</div>
    </div>
  )
}
