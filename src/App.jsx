import { useState, useEffect, lazy, Suspense } from 'react'
import { Routes, Route, Navigate, useLocation } from 'react-router-dom'
import AppShell from './components/layout/AppShell.jsx'
import Login from './pages/Login.jsx'
// Phase 41 - first-access flow (see supabase/phase41_user_access.sql)
import { useAccessStage } from './lib/useAccessStage.js'
import { useFreshSignIn, clearFreshSignIn } from './lib/freshSignIn.js'
import { useAuth } from './lib/AuthContext.jsx'
import { supabase } from './lib/supabaseClient.js'

// Performance: only the login screen and the app shell are in the first download. Every
// other page is fetched the first time it is needed (and then kept by the installed app's
// file cache), so the login page no longer waits for charts, salary tools and so on.
const Overview = lazy(() => import('./pages/Overview.jsx'))
const Transactions = lazy(() => import('./pages/Transactions.jsx'))
const Goals = lazy(() => import('./pages/Goals.jsx'))
const LearningROI = lazy(() => import('./pages/LearningROI.jsx'))
const MoneyOptions = lazy(() => import('./pages/MoneyOptions.jsx'))
const AdminRuleAssistant = lazy(() => import('./pages/AdminRuleAssistant.jsx'))
const AdvancedInsights = lazy(() => import('./pages/AdvancedInsights.jsx'))
const Behavior = lazy(() => import('./pages/Behavior.jsx'))
const Charts = lazy(() => import('./pages/Charts.jsx'))
const Calendar = lazy(() => import('./pages/Calendar.jsx'))
const Budgets = lazy(() => import('./pages/Budgets.jsx'))
const Reports = lazy(() => import('./pages/Reports.jsx'))
const Settings = lazy(() => import('./pages/Settings.jsx'))
const CTCExplorer = lazy(() => import('./pages/CTCExplorer.jsx'))
const Salary = lazy(() => import('./pages/Salary.jsx'))
const PFPension = lazy(() => import('./pages/PFPension.jsx'))
const Onboarding = lazy(() => import('./pages/Onboarding.jsx'))
const ResetPassword = lazy(() => import('./pages/ResetPassword.jsx'))
const PrivacyPolicy = lazy(() => import('./pages/PrivacyPolicy.jsx'))
const TermsAndConditions = lazy(() => import('./pages/TermsAndConditions.jsx'))
const AIDataNotice = lazy(() => import('./pages/AIDataNotice.jsx'))
const WelcomeHome = lazy(() => import('./pages/WelcomeHome.jsx'))
const FirstRun = lazy(() => import('./pages/FirstRun.jsx'))
const AccessError = lazy(() => import('./pages/AccessError.jsx'))
const InstallInApp = lazy(() => import('./pages/InstallInApp.jsx'))
const PublicInstall = lazy(() => import('./pages/PublicAccessPages.jsx').then((m) => ({ default: m.PublicInstall })))
const PublicThankYou = lazy(() => import('./pages/PublicAccessPages.jsx').then((m) => ({ default: m.PublicThankYou })))


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
  // Phase 41: the Install and Thank You pages need no account either.
  '/install': PublicInstall,
  '/thank-you': PublicThankYou,
}

function AppInner() {
  const [darkMode, setDarkMode] = useState(false)
  const [themeLoaded, setThemeLoaded] = useState(false)
  const { session, profile, user, loading, passwordRecovery } = useAuth()
  const location = useLocation()

  // Phase 41: is this account NEW (no user_access row) or RETURNING? Called here, before
  // any early return, because hooks must run in the same order on every render.
  // `freshSignIn` = the user signed in during this browser session and has not yet
  // pressed "Go to app" (set by Login.jsx). `accessBypassed` lets someone past a
  // failed lookup so a database hiccup can never lock them out of their app.
  const access = useAccessStage(user?.id)
  const freshSignIn = useFreshSignIn()
  const [accessBypassed, setAccessBypassed] = useState(false)
  useEffect(() => {
    setAccessBypassed(false)
  }, [user?.id])

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

  // Phase 41 - first-access gate. Order matters:
  //   waiting -> error -> NEW account -> returning account right after sign-in -> existing gates
  if (access.status === 'idle' || access.status === 'loading') {
    return (
      <div className="min-h-screen flex items-center justify-center text-sm text-gray-500">
        Loading...
      </div>
    )
  }

  if (access.status === 'error' && !accessBypassed) {
    return <AccessError onRetry={access.retry} onContinue={() => setAccessBypassed(true)} />
  }

  if (access.status === 'new') {
    return <FirstRun access={access} />
  }

  if (access.status === 'returning' && freshSignIn) {
    return <WelcomeHome mode="returning" onGoToApp={clearFreshSignIn} />
  }

  if (!profile?.onboarding_complete) {
    return <Onboarding />
  }

  return (
    <AppShell darkMode={darkMode} onToggleDark={handleToggleDark}>
      <Suspense fallback={<div className="p-8 text-sm text-gray-500">Loading...</div>}>
      <Routes>
        <Route path="/" element={<Overview />} />
        <Route path="/transactions" element={<Transactions />} />
        <Route path="/calendar" element={<Calendar />} />
        <Route path="/goals" element={<Goals />} />
        <Route path="/budgets" element={<Budgets />} />
        <Route path="/learning" element={<LearningROI />} />
        <Route path="/money-options" element={<MoneyOptions />} />
        <Route path="/admin/rules" element={<AdminRuleAssistant />} />
        <Route path="/insights" element={<AdvancedInsights />} />
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
        {/* Phase 41: Install CountWise inside the app (sidebar / More menu entry, web users only). */}
        <Route path="/get-app" element={<InstallInApp />} />
        {/* Phase 41: after the first-time flow finishes, a stale /welcome address goes home. */}
        <Route path="/welcome/*" element={<Navigate to="/" replace />} />
      </Routes>
      </Suspense>
    </AppShell>
  )
}

// Wraps the whole app: while a lazily loaded page is downloading, show the same plain
// "Loading..." screen the app already uses for its other waits.
export default function App() {
  return (
    <Suspense
      fallback={
        <div className="min-h-screen flex items-center justify-center text-sm text-gray-500">Loading...</div>
      }
    >
      <AppInner />
    </Suspense>
  )
}
