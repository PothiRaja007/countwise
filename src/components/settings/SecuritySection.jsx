import { useEffect, useState } from 'react'
import { supabase } from '../../lib/supabaseClient.js'
import { useAuth } from '../../lib/AuthContext.jsx'
import Button from '../ui/Button.jsx'

// Subphase 23A.2 — the only control this section has for now. Its own
// user_preferences column (login_notifications_enabled), deliberately
// separate from Phase 20's notification_enabled (inactivity reminders) —
// same reasoning as documented in the migration SQL: two independently
// toggleable concerns, not one switch. 23A.1's password-recovery flow
// lives entirely on the Login page and needs no Settings control, so this
// toggle is the whole of "Security" for now.
export default function SecuritySection() {
  const { user } = useAuth()
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(null)
  const [saving, setSaving] = useState(false)
  const [saved, setSaved] = useState(false)

  const [enabled, setEnabled] = useState(true)
  const [initialEnabled, setInitialEnabled] = useState(true)

  const dirty = enabled !== initialEnabled

  useEffect(() => {
    if (!user) return
    let cancelled = false

    async function load() {
      setLoading(true)
      setError(null)

      const { data, error: fetchErr } = await supabase
        .from('user_preferences')
        .select('login_notifications_enabled')
        .eq('user_id', user.id)
        .maybeSingle()

      if (cancelled) return
      setLoading(false)

      if (fetchErr) {
        // eslint-disable-next-line no-console
        console.error(fetchErr)
        setError('Something went wrong loading your security settings. Please try again.')
        return
      }

      // No row yet is normal for any account created before this column
      // existed — the schema's own default (true) is the right fallback.
      const value = data ? data.login_notifications_enabled : true
      setEnabled(value)
      setInitialEnabled(value)
    }

    load()
    return () => {
      cancelled = true
    }
  }, [user])

  const handleSave = async () => {
    if (!user) return
    setSaving(true)
    setError(null)
    setSaved(false)

    const { error: saveErr } = await supabase
      .from('user_preferences')
      .upsert({ user_id: user.id, login_notifications_enabled: enabled }, { onConflict: 'user_id' })

    setSaving(false)

    if (saveErr) {
      // eslint-disable-next-line no-console
      console.error(saveErr)
      setError("Couldn't save this. Please try again.")
      return
    }

    setInitialEnabled(enabled)
    setSaved(true)
  }

  if (loading) {
    return <p className="text-sm text-muted dark:text-mutedDark">Loading...</p>
  }

  return (
    <div className="space-y-5 max-w-sm">
      <div className="flex items-start justify-between gap-4">
        <div>
          <span className="block text-sm font-medium text-ink dark:text-offwhite">Sign-in notifications</span>
          <p className="text-xs text-muted dark:text-mutedDark mt-0.5">
            Get an email whenever your account is signed into.
          </p>
        </div>
        <button
          role="switch"
          aria-checked={enabled}
          onClick={() => {
            setEnabled((v) => !v)
            setSaved(false)
          }}
          className={`shrink-0 w-10 h-6 rounded-full transition-colors relative ${
            enabled ? 'bg-ink dark:ring-1 dark:ring-lineDark' : 'bg-surface ring-2 ring-ink'
          }`}
        >
          <span
            className={`absolute left-0 top-0.5 w-5 h-5 rounded-full shadow transition-transform ${
              enabled ? 'translate-x-[18px] bg-surface' : 'translate-x-0.5 bg-ink'
            }`}
          />
        </button>
      </div>

      {error && <p className="text-sm text-bad">{error}</p>}
      {saved && !dirty && <p className="text-sm text-good">Saved.</p>}

      <Button
        onClick={handleSave}
        disabled={!dirty || saving}
        className="px-4 py-2 rounded-md"
      >
        {saving ? 'Saving...' : 'Save'}
      </Button>
    </div>
  )
}
