import { useNavigate } from 'react-router-dom'
import InstallAccess from './InstallAccess.jsx'
import ThankYou from './ThankYou.jsx'

// Phase 41 - the account-free versions of the Install and Thank You pages
// (/install and /thank-you). They save nothing; they are listed in App.jsx's
// PUBLIC_PAGES so they work signed in or signed out.
export function PublicInstall() {
  const navigate = useNavigate()
  return (
    <InstallAccess
      mode="public"
      onInstalled={(via) => navigate(`/thank-you?via=${via}`)}
      onUseBrowser={() => navigate('/')}
    />
  )
}

export function PublicThankYou() {
  const navigate = useNavigate()
  return <ThankYou mode="public" onContinue={() => navigate('/')} />
}
