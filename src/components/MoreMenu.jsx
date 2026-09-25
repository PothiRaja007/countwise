import { NavLink } from 'react-router-dom'
import {
  Calendar,
  GraduationCap,
  PiggyBank,
  Star,
  BarChart2,
  FileText,
  Settings,
  Moon,
  Sun,
  LogOut,
  X,
  Briefcase,
  Banknote,
  Landmark,
} from 'lucide-react'
import { useAuth } from '../lib/AuthContext.jsx'
import { shouldShowWorkSection } from '../lib/lifeStage.js'
import Modal from './ui/Modal.jsx'

// Split the same way Sidebar.jsx's groups are, so WORK can be spliced in
// between "Budgets" and "Learning ROI" — same relative position as
// Sidebar's PLAN → WORK → GROW ordering, just without Sidebar's group
// headers (this menu has never used section headings, so WORK doesn't
// get one here either — consistent with the rest of this file, not a
// new pattern introduced for Phase 23.4).
const LINKS_BEFORE_WORK = [
  { to: '/calendar', label: 'Calendar', icon: Calendar },
  { to: '/budgets', label: 'Budgets', icon: PiggyBank },
]

// Phase 23.4: same three placeholder routes as Sidebar.jsx's WORK_GROUP —
// reuses shouldShowWorkSection(), not a reimplemented inline condition.
const WORK_LINKS = [
  { to: '/ctc-explorer', label: 'CTC Explorer', icon: Briefcase },
  { to: '/salary', label: 'Salary', icon: Banknote },
  { to: '/pf-pension', label: 'PF / Pension', icon: Landmark },
]

const LINKS_AFTER_WORK = [
  { to: '/learning', label: 'Learning ROI', icon: GraduationCap },
  { to: '/behavior', label: 'Behavior Score', icon: Star },
  { to: '/charts', label: 'Charts', icon: BarChart2 },
  { to: '/reports', label: 'Reports', icon: FileText },
  { to: '/settings', label: 'Settings', icon: Settings },
]

// Mobile-only "More" sheet — surfaces the pages that don't fit in the
// bottom bar, plus theme toggle and sign out. Settings now has its own
// page/link (Phase 14) but sign out stays here too since it's a fast,
// expected place to find it on mobile — Settings' own Account section
// (Phase 15+) will offer it as well once built.
export default function MoreMenu({ open, onClose, darkMode, onToggleDark }) {
  const { signOut, profile } = useAuth()

  // Same null/undefined-safe call as Sidebar.jsx — profile briefly null on
  // initial load resolves to shouldShowWorkSection(undefined) === false,
  // so WORK simply doesn't render yet rather than flashing then disappearing.
  const showWork = shouldShowWorkSection(profile?.income_type)
  const links = [...LINKS_BEFORE_WORK, ...(showWork ? WORK_LINKS : []), ...LINKS_AFTER_WORK]

  if (!open) return null

  return (
    <Modal onClose={onClose} label="More menu" className="fixed inset-0 md:hidden">
      <div className="absolute inset-0 bg-black/40" onClick={onClose} />
      <div className="absolute bottom-0 inset-x-0 bg-surface dark:bg-charcoalSurface border-t border-line dark:border-lineDark rounded-t-xl p-3 pb-6">
        <div className="flex items-center justify-between px-2 py-2 mb-1">
          <span className="text-sm font-medium text-ink dark:text-offwhite">More</span>
          <button onClick={onClose} aria-label="Close menu" className="text-muted dark:text-mutedDark p-1">
            <X size={18} />
          </button>
        </div>

        <div className="space-y-0.5">
          {links.map(({ to, label, icon: Icon }) => (
            <NavLink
              key={to}
              to={to}
              onClick={onClose}
              className={({ isActive }) =>
                `flex items-center gap-3 px-3 py-2.5 rounded-md text-sm transition-colors ${
                  isActive
                    ? 'bg-gold/10 text-gold font-medium'
                    : 'text-muted dark:text-mutedDark hover:bg-paper dark:hover:bg-charcoal'
                }`
              }
            >
              <Icon size={18} strokeWidth={1.75} />
              {label}
            </NavLink>
          ))}
        </div>

        <div className="my-2 border-t border-line dark:border-lineDark" />

        <button
          onClick={() => {
            onToggleDark()
          }}
          className="w-full flex items-center gap-3 px-3 py-2.5 rounded-md text-sm text-muted dark:text-mutedDark hover:bg-paper dark:hover:bg-charcoal transition-colors"
        >
          {darkMode ? <Sun size={18} strokeWidth={1.75} /> : <Moon size={18} strokeWidth={1.75} />}
          {darkMode ? 'Light mode' : 'Dark mode'}
        </button>

        <button
          onClick={signOut}
          className="w-full flex items-center gap-3 px-3 py-2.5 rounded-md text-sm text-bad hover:bg-paper dark:hover:bg-charcoal transition-colors"
        >
          <LogOut size={18} strokeWidth={1.75} />
          Sign out
        </button>
      </div>
    </Modal>
  )
}
