import { useState } from 'react'
import { supabase } from '../lib/supabaseClient'
import Footer from '../components/Footer.jsx'
import PasswordInput from '../components/PasswordInput.jsx'
import { validatePassword, PASSWORD_RULE_LABELS } from '../lib/passwordRules.js'
import { friendlyError } from '../lib/errorMessages.js'
import Button from '../components/ui/Button.jsx'
import Input from '../components/ui/Input.jsx'

export default function Login() {
  const [mode, setMode] = useState('signin') // 'signin' | 'signup'
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState(null)
  const [info, setInfo] = useState(null)

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
        const { error: signInErr } = await supabase.auth.signInWithPassword({ email, password })
        if (signInErr) throw signInErr
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
      <div className="min-h-screen flex items-center justify-center p-6 bg-paper dark:bg-charcoal">
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

            {recoveryError && <p className="text-sm text-bad">{recoveryError}</p>}

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
            className="w-full text-sm text-muted dark:text-mutedDark hover:text-gold mt-4 transition-colors"
          >
            Back to Sign In
          </button>
        </div>
      </div>
    )
  }

  if (recoveryStep === 'verify') {
    return (
      <div className="min-h-screen flex items-center justify-center p-6 bg-paper dark:bg-charcoal">
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

            {recoveryError && <p className="text-sm text-bad">{recoveryError}</p>}
            {recoveryInfo && !recoveryError && <p className="text-sm text-good">{recoveryInfo}</p>}

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
              className="text-sm text-muted dark:text-mutedDark hover:text-gold transition-colors"
            >
              Back to Sign In
            </button>
            <button
              onClick={handleResendCode}
              disabled={recoveryLoading}
              className="text-sm text-muted dark:text-mutedDark hover:text-gold transition-colors disabled:opacity-40"
            >
              Resend code
            </button>
          </div>
        </div>
      </div>
    )
  }

  return (
    <div className="min-h-screen flex items-center justify-center p-6 bg-paper dark:bg-charcoal">
      <div className="max-w-sm w-full">
        <div className="text-center mb-8">
          {/* Fixed light tile so the icon's dark bars stay visible in both themes */}
          <div className="w-14 h-14 rounded-xl bg-paper border border-line flex items-center justify-center mx-auto mb-4">
            <img src="/logo-icon.png" alt="CountWise" className="w-9 h-9 object-contain" />
          </div>
          <div className="font-display text-2xl font-semibold tracking-tight mb-1">
            <span className="text-ink dark:text-offwhite">Count</span>
            <span className="text-gold">Wise</span>
          </div>
          <div className="text-xs font-medium tracking-widest text-muted dark:text-mutedDark uppercase mb-4">
            Every expense counts
          </div>
          <h1 className="font-display text-lg font-medium">
            {mode === 'signin' ? 'Log in' : 'Create your account'}
          </h1>
        </div>

        <form onSubmit={handleSubmit} className="space-y-3 bg-surface dark:bg-charcoalSurface border border-line dark:border-lineDark rounded-xl p-5">
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
                      className={`text-xs ${met ? 'text-good' : 'text-muted dark:text-mutedDark'}`}
                    >
                      {met ? '✓' : '·'} {rule}
                    </li>
                  )
                })}
              </ul>
            )}
          </div>

          {error && <p className="text-sm text-bad">{error}</p>}
          {info && <p className="text-sm text-good">{info}</p>}

          {mode === 'signin' && (
            <button
              type="button"
              onClick={() => setRecoveryStep('request')}
              className="text-xs text-muted dark:text-mutedDark hover:text-gold transition-colors"
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
          className="w-full text-sm text-muted dark:text-mutedDark hover:text-gold mt-4 transition-colors"
        >
          {mode === 'signin'
            ? "Don't have an account? Sign up"
            : 'Already have an account? Log in'}
        </button>

        {/* Phase 23B: reachable pre-signup, per that phase's task — the
            only other addition anywhere in this file. */}
        <Footer />
      </div>
    </div>
  )
}
