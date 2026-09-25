import { NavLink } from 'react-router-dom'
import {
  LayoutGrid,
  List,
  Calendar,
  Target,
  PiggyBank,
  GraduationCap,
  Star,
  BarChart2,
  FileText,
  Settings,
  Moon,
  Sun,
  LogOut,
  Briefcase,
  Banknote,
  Landmark,
} from 'lucide-react'
import { useAuth } from '../lib/AuthContext.jsx'
import { shouldShowWorkSection } from '../lib/lifeStage.js'

// Grouped per the locked CountWise information architecture (Phase 11,
// extended in Phase 14 per the frozen v1.1 spec §5, extended again in
// Phase 23.4 with the conditional WORK group below).
// Group headings are visual only — they don't affect routing.
//
// BASE_GROUPS never changes based on profile — it's the same for every
// user. WORK_GROUP is spliced in conditionally inside the component,
// between PLAN and GROW, rather than being part of this static array.
const BASE_GROUPS = [
  {
    heading: 'HOME',
    links: [
      { to: '/', label: 'Overview', icon: LayoutGrid },
      { to: '/transactions', label: 'Transactions', icon: List },
      { to: '/calendar', label: 'Calendar', icon: Calendar },
    ],
  },
  {
    heading: 'PLAN',
    links: [
      { to: '/goals', label: 'Goals', icon: Target },
      { to: '/budgets', label: 'Budgets', icon: PiggyBank },
    ],
  },
  {
    heading: 'GROW',
    links: [{ to: '/learning', label: 'Learning ROI', icon: GraduationCap }],
  },
  {
    heading: 'INSIGHTS',
    links: [
      { to: '/behavior', label: 'Behavior Score', icon: Star },
      { to: '/charts', label: 'Charts', icon: BarChart2 },
      { to: '/reports', label: 'Reports', icon: FileText },
    ],
  },
  {
    heading: 'SETTINGS',
    links: [{ to: '/settings', label: 'Settings', icon: Settings }],
  },
]

// Phase 23.4: WORK is only ever shown for 'employed'/'mixed', via
// shouldShowWorkSection() (imported, not reimplemented here). These three
// routes don't have real pages yet — that's Phase 23.5's job — but
// linking to them now is safe: react-router's <Routes> in App.jsx simply
// renders nothing for an unmatched path rather than crashing, and this
// group is hidden entirely (not just disabled) for anyone who wouldn't
// see it become real yet.
const WORK_GROUP = {
  heading: 'WORK',
  links: [
    { to: '/ctc-explorer', label: 'CTC Explorer', icon: Briefcase },
    { to: '/salary', label: 'Salary', icon: Banknote },
    { to: '/pf-pension', label: 'PF / Pension', icon: Landmark },
  ],
}

const navLinkClasses = ({ isActive }) =>
  `flex items-center gap-3 px-3 py-2 rounded-md text-sm transition-colors ${
    isActive
      ? 'bg-gold/10 text-gold font-medium border-l-2 border-gold -ml-px pl-[11px]'
      : 'text-muted dark:text-mutedDark hover:bg-paper dark:hover:bg-charcoal'
  }`

export default function Sidebar({ darkMode, onToggleDark }) {
  const { signOut, profile } = useAuth()

  // profile is null on initial load (before AuthContext finishes fetching
  // it) as well as for a genuinely student profile — shouldShowWorkSection()
  // already treats null/undefined the same as 'student' (false, never a
  // throw), so no extra loading check is needed here: WORK simply doesn't
  // render yet during that brief window, then appears once the real
  // income_type comes in, with no flash of incorrect content.
  const showWork = shouldShowWorkSection(profile?.income_type)
  const groups = [
    BASE_GROUPS[0], // HOME
    BASE_GROUPS[1], // PLAN
    ...(showWork ? [WORK_GROUP] : []),
    BASE_GROUPS[2], // GROW
    BASE_GROUPS[3], // INSIGHTS
    BASE_GROUPS[4], // SETTINGS
  ]

  return (
    // Hidden on mobile — MobileBottomNav takes over navigation below the md breakpoint.
    <aside className="hidden md:flex w-60 shrink-0 border-r border-line dark:border-lineDark bg-surface dark:bg-charcoalSurface flex-col h-screen sticky top-0">
      <div className="px-5 py-4 border-b border-line dark:border-lineDark flex items-center gap-2.5">
        {/* Fixed light tile so the icon's dark bars stay visible in both themes */}
        <div className="w-8 h-8 rounded-md bg-paper flex items-center justify-center shrink-0">
          <img src="/logo-icon.png" alt="" className="w-5 h-5 object-contain" />
        </div>
        <div className="font-display text-lg font-semibold tracking-tight leading-none">
          <span className="text-ink dark:text-offwhite">Count</span>
          <span className="text-gold">Wise</span>
        </div>
      </div>

      <nav className="flex-1 px-3 py-4 space-y-5 overflow-y-auto sidebar-scroll">
        {groups.map((group) => (
          <div key={group.heading}>
            <div className="px-3 mb-1.5 text-[11px] font-semibold tracking-[0.08em] text-muted dark:text-mutedDark uppercase">
              {group.heading}
            </div>
            <div className="space-y-0.5">
              {group.links.map(({ to, label, icon: Icon }) => (
                <NavLink key={to} to={to} end={to === '/'} className={navLinkClasses}>
                  <Icon size={17} strokeWidth={1.75} />
                  {label}
                </NavLink>
              ))}
            </div>
          </div>
        ))}
      </nav>

      <button
        onClick={onToggleDark}
        className="flex items-center gap-2 mx-3 px-3 py-2 rounded-md text-sm text-muted dark:text-mutedDark hover:bg-paper dark:hover:bg-charcoal transition-colors"
      >
        {darkMode ? <Sun size={17} strokeWidth={1.75} /> : <Moon size={17} strokeWidth={1.75} />}
        {darkMode ? 'Light mode' : 'Dark mode'}
      </button>

      <button
        onClick={signOut}
        className="flex items-center gap-2 mx-3 mb-4 px-3 py-2 rounded-md text-sm text-muted dark:text-mutedDark hover:bg-paper dark:hover:bg-charcoal transition-colors"
      >
        <LogOut size={17} strokeWidth={1.75} />
        Sign out
      </button>
    </aside>
  )
}
