import { useState } from 'react'
import PageHeader from '../components/layout/PageHeader.jsx'
import { useAuth } from '../lib/AuthContext.jsx'
import ProfileSection from '../components/settings/ProfileSection.jsx'
import CategoriesSection from '../components/settings/CategoriesSection.jsx'
import AccountsSection from '../components/settings/AccountsSection.jsx'
import DataPrivacySection from '../components/settings/DataPrivacySection.jsx'
import NotificationsSection from '../components/settings/NotificationsSection.jsx'
import SecuritySection from '../components/settings/SecuritySection.jsx'

// Settings is a thin shell over an ordered list of section definitions.
// Each section owns its own component file under src/components/settings/.
// Later phases (20 — Notifications/Money Inbox prefs, 21 — Data & Privacy's
// remaining pieces e.g. Account Deletion) each add one entry to this array —
// nothing about this shell needs to change to accommodate them. Don't
// hardcode section content here; this file only knows how to list and
// switch sections.
const SECTIONS = [
  { id: 'profile', label: 'Profile', component: ProfileSection },
  { id: 'categories', label: 'Categories', component: CategoriesSection },
  { id: 'accounts', label: 'Accounts', component: AccountsSection },
  { id: 'export', label: 'Data & Privacy', component: DataPrivacySection },
  { id: 'notifications', label: 'Notifications', component: NotificationsSection },
  { id: 'security', label: 'Security', component: SecuritySection },
]

export default function Settings() {
  const { profile } = useAuth()
  const [activeId, setActiveId] = useState(SECTIONS[0].id)

  return (
    <div className="min-h-screen bg-paper dark:bg-charcoal p-6 sm:p-8 text-ink dark:text-offwhite">
      <PageHeader name={profile?.username} />

      <div className="mt-10 max-w-3xl">
        <p className="text-xs uppercase tracking-[0.14em] text-muted dark:text-mutedDark">Settings</p>
        <h1 className="font-display text-3xl sm:text-4xl font-semibold tracking-tight mt-2">Settings</h1>

        <div className="mt-6 flex gap-1 border-b border-line dark:border-lineDark" role="tablist">
          {SECTIONS.map((section) => (
            <button
              key={section.id}
              role="tab"
              aria-selected={section.id === activeId}
              onClick={() => setActiveId(section.id)}
              className={`px-3 py-2 text-sm -mb-px border-b-2 transition-colors ${
                section.id === activeId
                  ? 'border-gold text-gold font-medium'
                  : 'border-transparent text-muted dark:text-mutedDark hover:text-ink dark:hover:text-offwhite'
              }`}
            >
              {section.label}
            </button>
          ))}
        </div>

        {/* All sections stay mounted — only visibility toggles. Each
            section's own fetched state (e.g. CategoriesSection's category
            list) survives switching tabs, instead of refetching and
            flashing "Loading..." every time a tab is clicked. */}
        <div className="mt-6">
          {SECTIONS.map((section) => {
            const SectionComponent = section.component
            return (
              <div key={section.id} hidden={section.id !== activeId}>
                <SectionComponent />
              </div>
            )
          })}
        </div>
      </div>
    </div>
  )
}
