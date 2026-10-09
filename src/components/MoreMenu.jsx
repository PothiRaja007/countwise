import { NavLink } from 'react-router-dom'
import {
  Calendar,
  GraduationCap,
  PiggyBank,
  Star,
  BarChart2,
  Sparkles,
  FileText,
  Settings,
  Moon,
  Sun,
  LogOut,
  X,
  Briefcase,
  Banknote,
  Landmark,
  Coins,
  ShieldCheck,
  Download,
} from 'lucide-react'
import { useEffect, useState } from 'react'
import { useAuth } from '../lib/AuthContext.jsx'
import { shouldShowWorkSection } from '../lib/lifeStage.js'
import { supabase } from '../lib/supabaseClient.js'
import { checkIsAdmin } from '../lib/adminAccess.js'
import Modal from './ui/Modal.jsx'
import { useInstallState } from '../lib/installPrompt.js'

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
  { to: '/money-options', label: 'Money Options', icon: Coins },
  { to: '/behavior', label: 'Behavior Score', icon: Star },
  { to: '/charts', label: 'Charts', icon: BarChart2 },
  { to: '/reports', label: 'Reports', icon: FileText },
  { to: '/insights', label: 'Advanced Insights', icon: Sparkles },
  { to: '/settings', label: 'Settings', icon: Settings },
]

// Mobile-only "More" sheet — surfaces the pages that don't fit in the
// bottom bar, plus theme toggle and sign out. Settings now has its own
// page/link (Phase 14) but sign out stays here too since it's a fast,
// expected place to find it on mobile — Settings' own Account section
// (Phase 15+) will offer it as well once built.
export default function MoreMenu({ open, onClose, darkMode, onToggleDark }) {
  const { signOut, profile, user } = useAuth()
  const { standalone } = useInstallState() // Phase 41: web users only

  // Phase 39: same async admin check as Sidebar.jsx, same reasoning.
  const [isAdmin, setIsAdmin] = useState(false)
  useEffect(() => {
    if (user) checkIsAdmin(supabase, user.id).then(setIsAdmin)
  }, [user])

  // Same null/undefined-safe call as Sidebar.jsx — profile briefly null on
  // initial load resolves to shouldShowWorkSection(undefined) === false,
  // so WORK simply doesn't render yet rather than flashing then disappearing.
  const showWork = shouldShowWorkSection(profile?.income_type)
  const links = [
    ...LINKS_BEFORE_WORK,
    ...(showWork ? WORK_LINKS : []),
    ...LINKS_AFTER_WORK,
    ...(standalone ? [] : [{ to: '/get-app', label: 'Install CountWise', icon: Download }]),
    ...(isAdmin ? [{ to: '/admin/rules', label: 'Rule Assistant', icon: ShieldCheck }] : []),
  ]

  if (!open) return null

  return (
    <Modal onClose={onClose} label="More menu" className="fixed inset-0 md:hidden">
      <div className="absolute inset-0 bg-black/40" onClick={onClose} />
      <div className="absolute bottom-0 inset-x-0 max-h-[85vh] overflow-y-auto bg-surface dark:bg-charcoalSurface border-t border-line dark:border-lineDark rounded-t-xl p-3 pb-6">
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
                    ? 'bg-gold/10 text-goldText font-medium'
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
          className="w-full flex items-center gap-3 px-3 py-2.5 rounded-md text-sm text-badText hover:bg-paper dark:hover:bg-charcoal transition-colors"
        >
          <LogOut size={18} strokeWidth={1.75} />
          Sign out
        </button>
      </div>
    </Modal>
  )
}
