import { useState, useEffect } from 'react'
import { Routes, Route, useLocation } from 'react-router-dom'
import AppShell from './components/layout/AppShell.jsx'
import Overview from './pages/Overview.jsx'
import Transactions from './pages/Transactions.jsx'
import Goals from './pages/Goals.jsx'
import LearningROI from './pages/LearningROI.jsx'
import Behavior from './pages/Behavior.jsx'
import Charts from './pages/Charts.jsx'
import Calendar from './pages/Calendar.jsx'
import Budgets from './pages/Budgets.jsx'
import Reports from './pages/Reports.jsx'
import Settings from './pages/Settings.jsx'
import CTCExplorer from './pages/CTCExplorer.jsx'
import Salary from './pages/Salary.jsx'
import PFPension from './pages/PFPension.jsx'
import Onboarding from './pages/Onboarding.jsx'
import Login from './pages/Login.jsx'
import ResetPassword from './pages/ResetPassword.jsx'
import PrivacyPolicy from './pages/PrivacyPolicy.jsx'
import TermsAndConditions from './pages/TermsAndConditions.jsx'
import AIDataNotice from './pages/AIDataNotice.jsx'
import { useAuth } from './lib/AuthContext.jsx'
import { supabase } from './lib/supabaseClient.js'

// Phase 23B: these three content pages must be reachable without being
// logged in (a prospective user should be able to read them pre-signup).
// This app doesn't route-gate at the top level otherwise — everything
// below is sequential state (loading / passwordRecovery / !session /
// onboarding), not path-based, until deep inside the authenticated
// <Routes> block — so this is checked first, before every one of those
// gates, keyed on the current path via useLocation().
const PUBLIC_PAGES = {
  '/privacy': PrivacyPolicy,
  '/terms': TermsAndConditions,
  '/ai-data-notice': AIDataNotice,
}

export default function App() {
  const [darkMode, setDarkMode] = useState(false)
  const [themeLoaded, setThemeLoaded] = useState(false)
  const { session, profile, user, loading, passwordRecovery } = useAuth()
  const location = useLocation()

  // Resets immediately on any identity change — including sign-out, where
  // user becomes null — so a stale themeLoaded=true from the previous
  // session can never survive into the next one. Same pattern as
  // ReminderBanner.jsx's fix for the identical class of bug: declared
  // before the profile-loading effect below so it commits first (React
  // runs a component's effects in declaration order within the same
  // commit), guaranteeing this reset lands before the new user's profile
  // can set themeLoaded again. Keyed on user?.id rather than the whole
  // user object, so a token refresh producing a new object reference for
  // the same identity doesn't cause a spurious reset/reflash.
  useEffect(() => {
    setThemeLoaded(false)
  }, [user?.id])

  // Initialize from the persisted preference once per identity, when the
  // profile first becomes available — after that, only explicit toggles
  // change darkMode, until the identity changes again above.
  useEffect(() => {
    if (profile && !themeLoaded) {
      setDarkMode(!!profile.dark_mode)
      setThemeLoaded(true)
    }
  }, [profile, themeLoaded])

  useEffect(() => {
    document.documentElement.classList.toggle('dark', darkMode)
  }, [darkMode])

  const handleToggleDark = async () => {
    const next = !darkMode
    setDarkMode(next)
    if (user) {
      await supabase.from('profiles').update({ dark_mode: next }).eq('id', user.id)
    }
  }

  // Phase 23B: checked before every other gate, including `loading` — these
  // pages are readable regardless of whether anyone is signed in, and
  // shouldn't need to wait on the auth check to resolve first.
  // LegalPageLayout only uses `profile`/`session` optionally (for the
  // greeting and the back-link text), both of which degrade fine while
  // still null/loading.
  const PublicPage = PUBLIC_PAGES[location.pathname]
  if (PublicPage) {
    return <PublicPage />
  }

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center text-sm text-gray-500">
        Loading...
      </div>
    )
  }

  // Subphase 23A.1: a recovery session must never be treated as a normal
  // login — checked before the `!session` branch below, since verifyOtp's
  // recovery session makes `session` truthy too. See AuthContext.jsx.
  if (passwordRecovery) {
    return <ResetPassword />
  }

  if (!session) {
    return <Login />
  }

  if (!profile?.onboarding_complete) {
    return <Onboarding />
  }

  return (
    <AppShell darkMode={darkMode} onToggleDark={handleToggleDark}>
      <Routes>
        <Route path="/" element={<Overview />} />
        <Route path="/transactions" element={<Transactions />} />
        <Route path="/calendar" element={<Calendar />} />
        <Route path="/goals" element={<Goals />} />
        <Route path="/budgets" element={<Budgets />} />
        <Route path="/learning" element={<LearningROI />} />
        <Route path="/behavior" element={<Behavior />} />
        <Route path="/charts" element={<Charts />} />
        <Route path="/reports" element={<Reports />} />
        <Route path="/settings" element={<Settings />} />
        {/* Phase 23.5 — WORK placeholder routes. Deliberately not gated by
            income_type here: the nav links from 23.4 are the only gate on
            how a user gets here normally, but a direct URL visit (e.g. a
            'student' account typing /salary) should just show the
            placeholder, not error or redirect. */}
        <Route path="/ctc-explorer" element={<CTCExplorer />} />
        <Route path="/salary" element={<Salary />} />
        <Route path="/pf-pension" element={<PFPension />} />
      </Routes>
    </AppShell>
  )
}
