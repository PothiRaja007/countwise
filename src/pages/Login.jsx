import { useState } from 'react'
import { supabase } from '../lib/supabaseClient'
import Footer from '../components/Footer.jsx'
import PasswordInput from '../components/PasswordInput.jsx'
import { validatePassword, PASSWORD_RULE_LABELS } from '../lib/passwordRules.js'
import { friendlyError } from '../lib/errorMessages.js'
import Button from '../components/ui/Button.jsx'
import Input from '../components/ui/Input.jsx'
import { markOAuthLogin, clearOAuthLogin } from '../lib/oauthLoginFlag.js'
import { markFreshSignIn, clearFreshSignIn } from '../lib/freshSignIn.js'

// Standard multicolour Google "G" (decorative; the button text carries the meaning).
function GoogleIcon() {
  return (
    <svg className="w-[18px] h-[18px]" viewBox="0 0 48 48" aria-hidden="true">
      <path fill="#EA4335" d="M24 9.5c3.54 0 6.71 1.22 9.21 3.6l6.85-6.85C35.9 2.38 30.47 0 24 0 14.62 0 6.51 5.38 2.56 13.22l7.98 6.19C12.43 13.72 17.74 9.5 24 9.5z" />
      <path fill="#4285F4" d="M46.98 24.55c0-1.57-.15-3.09-.38-4.55H24v9.02h12.94c-.58 2.96-2.26 5.48-4.78 7.18l7.73 6c4.51-4.18 7.09-10.36 7.09-17.65z" />
      <path fill="#FBBC05" d="M10.53 28.59c-.48-1.45-.76-2.99-.76-4.59s.27-3.14.76-4.59l-7.98-6.19C.92 16.46 0 20.12 0 24c0 3.88.92 7.54 2.56 10.78l7.97-6.19z" />
      <path fill="#34A853" d="M24 48c6.48 0 11.93-2.13 15.89-5.81l-7.73-6c-2.15 1.45-4.92 2.3-8.16 2.3-6.26 0-11.57-4.22-13.47-9.91l-7.98 6.19C6.51 42.62 14.62 48 24 48z" />
    </svg>
  )
}

export default function Login() {
  const [mode, setMode] = useState('signin') // 'signin' | 'signup'
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState(null)
  const [info, setInfo] = useState(null)
  const [oauthLoading, setOauthLoading] = useState(false)

  // Subphase 23A.1 — password recovery Steps 1–2 (request code, verify
  // code). Step 3 (new password) + Step 4 (success) live in
  // ResetPassword.jsx, rendered by App.jsx once a recovery session
  // actually exists — see AuthContext.jsx's passwordRecovery flag.
  const [recoveryStep, setRecoveryStep] = useState(null) // null | 'request' | 'verify'
  const [recoveryEmail, setRecoveryEmail] = useState('')
  const [recoveryCode, setRecoveryCode] = useState('')
  const [recoveryLoading, setRecoveryLoading] = useState(false)
  const [recoveryError, setRecoveryError] = useState(null)
  const [recoveryInfo, setRecoveryInfo] = useState(null)

  const RECOVERY_SENT_MESSAGE = "If an account exists for this email, we've sent instructions."

  // Only gates sign-up — an existing account's password is validated
  // against Supabase's own stored hash on sign-in, not against these
  // client-side rules (which are about setting a strong new password).
  const passwordCheck = validatePassword(password)

  const handleSubmit = async (e) => {
    e.preventDefault()
    setLoading(true)
    setError(null)
    setInfo(null)

    try {
      if (mode === 'signup') {
        const { error: signUpErr } = await supabase.auth.signUp({ email, password })
        if (signUpErr) throw signUpErr
        setInfo('Account created. Check your email to confirm, then sign in.')
        setMode('signin')
      } else {
        clearOAuthLogin() // a password login must never inherit a stale Google mark
        const { error: signInErr } = await supabase.auth.signInWithPassword({ email, password })
        if (signInErr) throw signInErr
        markFreshSignIn() // Phase 41: show the CountWise Home page once after this sign-in
        // On success, onAuthStateChange in AuthContext handles the redirect.

        // Subphase 23A.2 — best-effort "new sign-in" notification. Fired
        // and forgotten deliberately: not awaited, and any failure here
        // must never block or visibly disrupt a login that already
        // succeeded. The Edge Function itself re-derives the user's
        // identity from their session server-side — nothing sensitive is
        // sent from here.
        supabase.functions.invoke('notify-login').catch((notifyErr) => {
          // eslint-disable-next-line no-console
          console.error('notify-login failed (non-blocking):', notifyErr)
        })
      }
    } catch (err) {
      setError(friendlyError(err, 'Something went wrong. Please try again.'))
    } finally {
      setLoading(false)
    }
  }

  // Google sign-in. Supabase redirects the browser to Google and back to this
  // app; AuthContext's onAuthStateChange then picks up the new session exactly
  // like a password sign-in, so no extra routing is needed here.
  const handleGoogle = async () => {
    setOauthLoading(true)
    setError(null)
    setInfo(null)
    markOAuthLogin()
    markFreshSignIn() // survives the trip to Google and back (sessionStorage)
    const { error: oauthErr } = await supabase.auth.signInWithOAuth({
      provider: 'google',
      options: {
        redirectTo: window.location.origin,
        queryParams: { prompt: 'select_account' },
      },
    })
    if (oauthErr) {
      // eslint-disable-next-line no-console
      console.error(oauthErr)
      clearOAuthLogin()
      clearFreshSignIn()
      setError(friendlyError(oauthErr, 'Could not start Google sign-in. Please try again.'))
      setOauthLoading(false)
    }
    // On success the browser is already navigating to Google; nothing else to do.
  }

  const resetRecoveryState = () => {
    setRecoveryStep(null)
    setRecoveryEmail('')
    setRecoveryCode('')
    setRecoveryError(null)
    setRecoveryInfo(null)
  }

  // Always the same outcome shown regardless of whether the email
  // actually belongs to an account — resetPasswordForEmail() itself
  // doesn't leak this at the API level, and this UI must not undo that
  // by branching its message on the response.
  const handleRequestCode = async (e) => {
    e.preventDefault()
    setRecoveryLoading(true)
    setRecoveryError(null)
    await supabase.auth.resetPasswordForEmail(recoveryEmail)
    setRecoveryLoading(false)
    setRecoveryInfo(RECOVERY_SENT_MESSAGE)
    setRecoveryStep('verify')
  }

  const handleResendCode = async () => {
    setRecoveryLoading(true)
    setRecoveryError(null)
    // Supabase's own auth endpoints already rate-limit/expire this
    // server-side — no client-side throttling duplicated here.
    await supabase.auth.resetPasswordForEmail(recoveryEmail)
    setRecoveryLoading(false)
    setRecoveryInfo(RECOVERY_SENT_MESSAGE)
  }

  const handleVerifyCode = async (e) => {
    e.preventDefault()
    setRecoveryLoading(true)
    setRecoveryError(null)
    setRecoveryInfo(null)

    const { error: verifyErr } = await supabase.auth.verifyOtp({
      email: recoveryEmail,
      token: recoveryCode,
      type: 'recovery',
    })

    setRecoveryLoading(false)

    if (verifyErr) {
      // eslint-disable-next-line no-console
      console.error(verifyErr)
      setRecoveryError('That code is invalid or has expired. Please request a new one.')
      return
    }

    // Success establishes a recovery session — AuthContext detects the
    // 'PASSWORD_RECOVERY' event and App.jsx switches to ResetPassword.jsx
    // automatically. Nothing else to do here.
  }

  if (recoveryStep === 'request') {
    return (
      <main className="min-h-screen flex items-center justify-center p-6 bg-paper dark:bg-charcoal">
        <div className="max-w-sm w-full">
          <div className="text-center mb-8">
            <h1 className="font-display text-lg font-medium">Reset your password</h1>
            <p className="text-sm text-muted dark:text-mutedDark mt-1">
              Enter your email and we'll send you a code.
            </p>
          </div>

          <form
            onSubmit={handleRequestCode}
            className="space-y-3 bg-surface dark:bg-charcoalSurface border border-line dark:border-lineDark rounded-xl p-5"
          >
            <div>
              <label className="block text-xs font-medium text-muted dark:text-mutedDark mb-1.5">Email</label>
              <Input
                type="email"
                required
                placeholder="you@example.com"
                value={recoveryEmail}
                onChange={(e) => setRecoveryEmail(e.target.value)}
                className="w-full px-3 py-2.5 rounded-lg bg-paper dark:bg-charcoal text-sm focus:ring-2 focus:ring-gold/40"
              />
            </div>

            {recoveryError && <p className="text-sm text-badText">{recoveryError}</p>}

            <Button
              type="submit"
              disabled={recoveryLoading}
              className="w-full py-2.5 rounded-lg"
            >
              {recoveryLoading ? 'Sending...' : 'Send code'}
            </Button>
          </form>

          <button
            onClick={resetRecoveryState}
            className="w-full text-sm text-muted dark:text-mutedDark hover:text-goldText mt-4 transition-colors"
          >
            Back to Sign In
          </button>
        </div>
      </main>
    )
  }

  if (recoveryStep === 'verify') {
    return (
      <main className="min-h-screen flex items-center justify-center p-6 bg-paper dark:bg-charcoal">
        <div className="max-w-sm w-full">
          <div className="text-center mb-8">
            <h1 className="font-display text-lg font-medium">Enter your code</h1>
            <p className="text-sm text-muted dark:text-mutedDark mt-1">{RECOVERY_SENT_MESSAGE}</p>
          </div>

          <form
            onSubmit={handleVerifyCode}
            className="space-y-3 bg-surface dark:bg-charcoalSurface border border-line dark:border-lineDark rounded-xl p-5"
          >
            <div>
              <label className="block text-xs font-medium text-muted dark:text-mutedDark mb-1.5">
                Verification code
              </label>
              <Input
                type="text"
                required
                inputMode="numeric"
                placeholder="Enter the code from your email"
                value={recoveryCode}
                onChange={(e) => setRecoveryCode(e.target.value)}
                className="w-full px-3 py-2.5 rounded-lg bg-paper dark:bg-charcoal text-sm focus:ring-2 focus:ring-gold/40"
              />
            </div>

            {recoveryError && <p className="text-sm text-badText">{recoveryError}</p>}
            {recoveryInfo && !recoveryError && <p className="text-sm text-goodText">{recoveryInfo}</p>}

            <Button
              type="submit"
              disabled={recoveryLoading}
              className="w-full py-2.5 rounded-lg"
            >
              {recoveryLoading ? 'Verifying...' : 'Verify'}
            </Button>
          </form>

          <div className="flex items-center justify-between mt-4">
            <button
              onClick={resetRecoveryState}
              className="text-sm text-muted dark:text-mutedDark hover:text-goldText transition-colors"
            >
              Back to Sign In
            </button>
            <button
              onClick={handleResendCode}
              disabled={recoveryLoading}
              className="text-sm text-muted dark:text-mutedDark hover:text-goldText transition-colors disabled:opacity-40"
            >
              Resend code
            </button>
          </div>
        </div>
      </main>
    )
  }

  return (
    <main className="min-h-screen flex items-center justify-center p-6 bg-paper dark:bg-charcoal">
      <div className="max-w-sm w-full">
        <div className="text-center mb-8">
          {/* Fixed light tile so the icon's dark bars stay visible in both themes */}
          <div className="w-14 h-14 rounded-xl bg-paper border border-line flex items-center justify-center mx-auto mb-4">
            <img src="/logo-icon.png" alt="CountWise" className="w-9 h-9 object-contain" />
          </div>
          <div className="font-display text-2xl font-semibold tracking-tight mb-1">
            <span className="text-ink dark:text-offwhite">Count</span>
            <span className="text-goldText">Wise</span>
          </div>
          <div className="text-xs font-medium tracking-widest text-muted dark:text-mutedDark uppercase mb-4">
            Every expense counts
          </div>
          <h1 className="font-display text-lg font-medium">
            {mode === 'signin' ? 'Log in' : 'Create your account'}
          </h1>
        </div>

        <form onSubmit={handleSubmit} className="space-y-3 bg-surface dark:bg-charcoalSurface border border-line dark:border-lineDark rounded-xl p-5">
          <button
            type="button"
            onClick={handleGoogle}
            disabled={oauthLoading || loading}
            className="w-full flex items-center justify-center gap-2.5 py-2.5 rounded-lg border border-line dark:border-lineDark bg-paper dark:bg-charcoal text-sm font-medium text-ink dark:text-offwhite hover:border-gold/60 focus:outline-none focus-visible:ring-2 focus-visible:ring-gold/40 transition-colors disabled:opacity-50"
          >
            <GoogleIcon />
            {oauthLoading ? 'Redirecting to Google...' : 'Continue with Google'}
          </button>

          <div className="flex items-center gap-3 text-xs text-muted dark:text-mutedDark" aria-hidden="true">
            <span className="flex-1 h-px bg-line dark:bg-lineDark" />
            or
            <span className="flex-1 h-px bg-line dark:bg-lineDark" />
          </div>

          <div>
            <label className="block text-xs font-medium text-muted dark:text-mutedDark mb-1.5">Email</label>
            <Input
              type="email"
              required
              placeholder="you@example.com"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              className="w-full px-3 py-2.5 rounded-lg bg-paper dark:bg-charcoal text-sm focus:ring-2 focus:ring-gold/40"
            />
          </div>
          <div>
            <label className="block text-xs font-medium text-muted dark:text-mutedDark mb-1.5">Password</label>
            <PasswordInput
              required
              minLength={mode === 'signup' ? 8 : undefined}
              placeholder="••••••••"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
            />
            {mode === 'signup' && (
              <ul className="mt-2 space-y-1">
                {PASSWORD_RULE_LABELS.map((rule) => {
                  const met = !passwordCheck.failures.includes(rule)
                  return (
                    <li
                      key={rule}
                      className={`text-xs ${met ? 'text-goodText' : 'text-muted dark:text-mutedDark'}`}
                    >
                      {met ? '✓' : '·'} {rule}
                    </li>
                  )
                })}
              </ul>
            )}
          </div>

          {error && <p className="text-sm text-badText">{error}</p>}
          {info && <p className="text-sm text-goodText">{info}</p>}

          {mode === 'signin' && (
            <button
              type="button"
              onClick={() => setRecoveryStep('request')}
              className="text-xs text-muted dark:text-mutedDark hover:text-goldText transition-colors"
            >
              Forgot password?
            </button>
          )}

          <Button
            type="submit"
            disabled={loading || (mode === 'signup' && !passwordCheck.valid)}
            className="w-full py-2.5 rounded-lg"
          >
            {loading ? 'Please wait...' : mode === 'signin' ? 'Log in' : 'Sign up'}
          </Button>
        </form>

        <button
          onClick={() => {
            setMode(mode === 'signin' ? 'signup' : 'signin')
            setError(null)
            setInfo(null)
          }}
          className="w-full text-sm text-muted dark:text-mutedDark hover:text-goldText mt-4 transition-colors"
        >
          {mode === 'signin'
            ? "Don't have an account? Sign up"
            : 'Already have an account? Log in'}
        </button>

        {/* Phase 23B: reachable pre-signup, per that phase's task — the
            only other addition anywhere in this file. */}
        <Footer />
      </div>
    </main>
  )
}
