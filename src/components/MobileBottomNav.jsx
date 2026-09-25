import { useState } from 'react'
import { NavLink, useLocation } from 'react-router-dom'
import { LayoutGrid, List, Target, MoreHorizontal } from 'lucide-react'
import MoreMenu from './MoreMenu.jsx'

const itemClasses = ({ isActive }) =>
  `flex flex-col items-center justify-center gap-0.5 flex-1 h-full text-[11px] transition-colors ${
    isActive ? 'text-gold font-medium' : 'text-muted dark:text-mutedDark'
  }`

// "More" covers routes that don't have their own bottom-bar slot.
// Includes Phase 23.4's three WORK placeholder paths so the "More" tab
// still highlights correctly once 23.5 gives them real pages — listing
// them here doesn't expose anything: MoreMenu.jsx is what actually
// decides whether a link to them renders at all (via
// shouldShowWorkSection()), this array only affects which paths count as
// "under More" for the active-tab indicator.
const MORE_ROUTES = [
  '/calendar',
  '/budgets',
  '/ctc-explorer',
  '/salary',
  '/pf-pension',
  '/learning',
  '/behavior',
  '/charts',
  '/reports',
  '/settings',
]

// Mobile-only bottom navigation (Phase 11). Replaces Sidebar below the md
// breakpoint. The center gap is reserved space for the existing global
// MoneyInboxTrigger, which AppShell repositions there via CSS on mobile —
// this component does not render its own "+" button or Money Inbox logic,
// so there is exactly one Money Inbox trigger/state in the app at all times.
export default function MobileBottomNav({ darkMode, onToggleDark }) {
  const [moreOpen, setMoreOpen] = useState(false)
  const location = useLocation()
  const moreActive = MORE_ROUTES.includes(location.pathname)

  return (
    <>
      <nav className="md:hidden fixed bottom-0 inset-x-0 z-30 h-16 bg-surface dark:bg-charcoalSurface border-t border-line dark:border-lineDark flex items-stretch">
        <NavLink to="/" end className={itemClasses}>
          <LayoutGrid size={20} strokeWidth={1.75} />
          Home
        </NavLink>
        <NavLink to="/transactions" className={itemClasses}>
          <List size={20} strokeWidth={1.75} />
          Transactions
        </NavLink>

        {/* Reserved gap — the real Money Inbox trigger floats here on mobile (see AppShell) */}
        <div className="flex-1 h-full" aria-hidden="true" />

        <NavLink to="/goals" className={itemClasses}>
          <Target size={20} strokeWidth={1.75} />
          Goals
        </NavLink>
        <button
          onClick={() => setMoreOpen(true)}
          className={`flex flex-col items-center justify-center gap-0.5 flex-1 h-full text-[11px] transition-colors ${
            moreActive ? 'text-gold font-medium' : 'text-muted dark:text-mutedDark'
          }`}
        >
          <MoreHorizontal size={20} strokeWidth={1.75} />
          More
        </button>
      </nav>

      <MoreMenu
        open={moreOpen}
        onClose={() => setMoreOpen(false)}
        darkMode={darkMode}
        onToggleDark={onToggleDark}
      />
    </>
  )
}
