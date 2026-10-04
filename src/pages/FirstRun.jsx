import { useEffect, useState } from 'react'
import { Navigate, Route, Routes, useLocation, useNavigate } from 'react-router-dom'
import WelcomeHome from './WelcomeHome.jsx'
import InstallAccess from './InstallAccess.jsx'
import ThankYou from './ThankYou.jsx'
import { BROWSER_SHOWS_THANK_YOU, methodFromVia } from '../lib/accessFlow.js'
import { clearFreshSignIn } from '../lib/freshSignIn.js'
import { useInstallState } from '../lib/installPrompt.js'

// Phase 41 - the one-time flow for a NEW account:
//   /welcome  ->  /welcome/install  ->  /welcome/thank-you  ->  the app
//   (or /welcome -> /welcome/thank-you directly for "Use CountWise in browser")
// Each step has its own address, so Back and Refresh work. The choice is saved to
// user_access only at the very end; closing the tab earlier shows the flow again
// next time. Rendered by App.jsx only while the account has no user_access row.
export default function FirstRun({ access }) {
  const navigate = useNavigate()
  const { pathname } = useLocation()
  const { standalone } = useInstallState()
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState(null)

  useEffect(() => {
    window.scrollTo(0, 0)
  }, [pathname])

  const finish = async (method) => {
    setBusy(true)
    setError(null)
    // Clear BEFORE saving: once the row exists the account counts as returning,
    // and a leftover "just signed in" note would show the returning-user Home page.
    clearFreshSignIn()
    const result = await access.markCompleted(method)
    if (!result.ok) {
      setError('We could not save your choice. Please check your connection and try again.')
      setBusy(false)
      return
    }
    navigate('/', { replace: true })
  }

  const goBrowser = () => {
    const via = standalone ? 'installed' : 'browser'
    if (BROWSER_SHOWS_THANK_YOU) navigate(`/welcome/thank-you?via=${via}`)
    else finish(methodFromVia(via))
  }

  return (
    <Routes>
      <Route
        path="/welcome"
        element={
          <WelcomeHome
            mode="new"
            onInstall={() => navigate('/welcome/install')}
            onUseBrowser={goBrowser}
          />
        }
      />
      <Route
        path="/welcome/install"
        element={
          <InstallAccess
            mode="first-run"
            onInstalled={(via) => navigate(`/welcome/thank-you?via=${via}`)}
            onUseBrowser={goBrowser}
          />
        }
      />
      <Route
        path="/welcome/thank-you"
        element={
          <ThankYou
            mode="first-run"
            busy={busy}
            error={error}
            onContinue={(via) => finish(methodFromVia(via))}
          />
        }
      />
      <Route path="*" element={<Navigate to="/welcome" replace />} />
    </Routes>
  )
}
