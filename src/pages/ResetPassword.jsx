import { useState } from 'react'
import { supabase } from '../lib/supabaseClient'
import { useAuth } from '../lib/AuthContext.jsx'
import PasswordInput from '../components/PasswordInput.jsx'
import { validatePassword, PASSWORD_RULE_LABELS } from '../lib/passwordRules.js'
import Button from '../components/ui/Button.jsx'

// Rendered by App.jsx exclusively while a recovery session is active
// (see AuthContext.jsx's passwordRecovery flag). Steps 1–2 (request +
// verify code) live in Login.jsx, since those happen before any session
// exists. By the time this component renders, the user has already
// verified their code (or clicked a recovery link) and Supabase has
// established the recovery session that updateUser() needs.
export default function ResetPassword() {
  const { clearPasswordRecovery } = useAuth()
  const [password, setPassword] = useState('')
  const [confirmPassword, setConfirmPassword] = useState('')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState(null)
  const [done, setDone] = useState(false)

  const passwordCheck = validatePassword(password)

  const handleSubmit = async (e) => {
    e.preventDefault()
    setError(null)

    if (!passwordCheck.valid) {
      setError('Please meet all the password requirements below.')
      return
    }
    if (password !== confirmPassword) {
      setError('Passwords do not match.')
      return
    }

    setLoading(true)
    const { error: updateErr } = await supabase.auth.updateUser({ password })
    setLoading(false)

    if (updateErr) {
      // eslint-disable-next-line no-console
      console.error(updateErr)
      setError("Couldn't update your password. Please try again.")
      return
    }

    setDone(true)
  }

  const handleBackToSignIn = async () => {
    // Explicit sign-out rather than dropping the user straight into the
    // main app on their recovery session — matches the locked UX's Step 4
    // ("success + button back to Sign In"), not a silent auto-login.
    await supabase.auth.signOut()
    clearPasswordRecovery()
  }

  if (done) {
    return (
      <div className="min-h-screen flex items-center justify-center p-6 bg-paper dark:bg-charcoal">
        <div className="max-w-sm w-full text-center">
          <h1 className="font-display text-lg font-medium mb-2">Password changed successfully</h1>
          <p className="text-sm text-muted dark:text-mutedDark mb-6">You can now sign in with your new password.</p>
          <Button
            onClick={handleBackToSignIn}
            className="w-full py-2.5 rounded-lg"
          >
            Back to Sign In
          </Button>
        </div>
      </div>
    )
  }

  return (
    <div className="min-h-screen flex items-center justify-center p-6 bg-paper dark:bg-charcoal">
      <div className="max-w-sm w-full">
        <div className="text-center mb-8">
          <h1 className="font-display text-lg font-medium">Set a new password</h1>
          <p className="text-sm text-muted dark:text-mutedDark mt-1">Choose a new password for your account.</p>
        </div>

        <form
          onSubmit={handleSubmit}
          className="space-y-3 bg-surface dark:bg-charcoalSurface border border-line dark:border-lineDark rounded-xl p-5"
        >
          <div>
            <label className="block text-xs font-medium text-muted dark:text-mutedDark mb-1.5">New password</label>
            <PasswordInput
              required
              minLength={8}
              placeholder="At least 8 characters"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
            />
            <ul className="mt-2 space-y-1">
              {PASSWORD_RULE_LABELS.map((rule) => {
                const met = !passwordCheck.failures.includes(rule)
                return (
                  <li key={rule} className={`text-xs ${met ? 'text-good' : 'text-muted dark:text-mutedDark'}`}>
                    {met ? '✓' : '·'} {rule}
                  </li>
                )
              })}
            </ul>
          </div>
          <div>
            <label className="block text-xs font-medium text-muted dark:text-mutedDark mb-1.5">
              Confirm new password
            </label>
            <PasswordInput
              required
              placeholder="Re-enter your new password"
              value={confirmPassword}
              onChange={(e) => setConfirmPassword(e.target.value)}
            />
          </div>

          {error && <p className="text-sm text-bad">{error}</p>}

          <Button
            type="submit"
            disabled={loading || !passwordCheck.valid}
            className="w-full py-2.5 rounded-lg"
          >
            {loading ? 'Updating...' : 'Update password'}
          </Button>
        </form>
      </div>
    </div>
  )
}
