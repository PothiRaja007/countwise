import Sidebar from '../Sidebar.jsx'
import MoneyInboxTrigger from '../money-inbox/MoneyInboxTrigger.jsx'
import MobileBottomNav from '../MobileBottomNav.jsx'
import ReminderBanner from '../ReminderBanner.jsx'
import Footer from '../Footer.jsx'

// Wraps every authenticated page. Money Inbox is rendered once here, not
// per-page, so it's reachable from anywhere in the app (Phase 4b).
//
// Phase 11: MobileBottomNav is mounted here (the only shared entry point
// navigation is allowed to touch). There is still exactly one
// trigger/state in the app; nothing here duplicates Money Inbox logic.
//
// Money-Inbox-entry-points rebuild: MoneyInboxTrigger used to be wrapped
// in a div here that repositioned it for mobile via descendant-selector
// `!important` overrides on the button's own utility classes
// ([&>button]:!bottom-3 ...). That wrapper is gone — the button now owns
// its own responsive position directly (see MoneyInboxTrigger.jsx), so
// this file no longer needs to reach into a child's classes from outside.
export default function AppShell({ darkMode, onToggleDark, children }) {
  return (
    <div className="flex">
      <Sidebar darkMode={darkMode} onToggleDark={onToggleDark} />
      <main className="flex-1 pb-16 md:pb-0 flex flex-col min-h-screen">
        {/* Phase 20: gentle inactivity nudge. Owns its own fetch/eligibility
            check entirely inside ReminderBanner.jsx — this is the single
            additive line + import for that feature, nothing else in this
            file's layout/routing logic changes. */}
        <ReminderBanner />
        <div className="flex-1">{children}</div>
        {/* Phase 23B: Privacy/Terms/AI-notice links — unobtrusive, footer
            only, per that phase's task. Every child page already renders
            its own min-h-screen block, so this footer naturally sits below
            it without needing per-page changes. */}
        <Footer />
      </main>
      <MoneyInboxTrigger />
      <MobileBottomNav darkMode={darkMode} onToggleDark={onToggleDark} />
    </div>
  )
}
