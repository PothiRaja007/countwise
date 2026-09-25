import { Link } from 'react-router-dom'

// Phase 23B — unobtrusive, not nav-heavy per the task's own framing:
// these three pages aren't something a user navigates to routinely, so
// they live in a small footer rather than the Sidebar/MoreMenu nav
// groups (which stay untouched by this phase).
export default function Footer() {
  return (
    <footer className="mt-auto pt-6 pb-6 px-6 sm:px-8">
      <div className="flex flex-wrap gap-x-4 gap-y-1.5 text-xs text-muted dark:text-mutedDark">
        <Link to="/privacy" className="hover:text-gold transition-colors">
          Privacy Policy
        </Link>
        <Link to="/terms" className="hover:text-gold transition-colors">
          Terms &amp; Conditions
        </Link>
        <Link to="/ai-data-notice" className="hover:text-gold transition-colors">
          AI &amp; Data Processing
        </Link>
      </div>
    </footer>
  )
}
