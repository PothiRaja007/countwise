import { useEffect, useState } from 'react'
import { supabase } from '../../lib/supabaseClient.js'
import { useAuth } from '../../lib/AuthContext.jsx'
import Button from '../ui/Button.jsx'
import Input from '../ui/Input.jsx'

// Deliberately minimal per §6.7: on/off + "remind me after N days" only.
// No quiet hours, no weekend toggle, no reminder-time picker — those all
// assume delivery infrastructure this in-app-only version doesn't have.
export default function NotificationsSection() {
  const { user } = useAuth()
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(null)
  const [saving, setSaving] = useState(false)
  const [saved, setSaved] = useState(false)

  const [enabled, setEnabled] = useState(true)
  const [afterDays, setAfterDays] = useState(2)
  const [initial, setInitial] = useState({ enabled: true, afterDays: 2 })

  const dirty = enabled !== initial.enabled || Number(afterDays) !== initial.afterDays

  useEffect(() => {
    if (!user) return
    let cancelled = false

    async function load() {
      setLoading(true)
      setError(null)

      const { data, error: fetchErr } = await supabase
        .from('user_preferences')
        .select('*')
        .eq('user_id', user.id)
        .maybeSingle()

      if (cancelled) return
      setLoading(false)

      if (fetchErr) {
        // eslint-disable-next-line no-console
        console.error(fetchErr)
        setError('Something went wrong loading your notification settings. Please try again.')
        return
      }

      // No row yet is normal for any account created before this table
      // existed — the schema's own column defaults are the right fallback
      // (notifications on, remind after 2 days).
      const row = data || { notification_enabled: true, reminder_after_days: 2, timezone: 'UTC' }
      setEnabled(row.notification_enabled)
      setAfterDays(row.reminder_after_days)
      setInitial({ enabled: row.notification_enabled, afterDays: row.reminder_after_days })

      // Populate timezone from the browser on first real use, only while
      // still at the database default — never hardcode a timezone. This
      // mirrors the same check in ReminderBanner.jsx so it's captured
      // whichever surface the user touches first.
      if (row.timezone === 'UTC') {
        const browserTz = Intl.DateTimeFormat().resolvedOptions().timeZone
        if (browserTz && browserTz !== 'UTC') {
          await supabase
            .from('user_preferences')
            .upsert({ user_id: user.id, timezone: browserTz }, { onConflict: 'user_id' })
        }
      }
    }

    load()
    return () => {
      cancelled = true
    }
  }, [user])

  const handleSave = async () => {
    if (!user) return
    const days = Math.max(1, Math.round(Number(afterDays) || 1))
    setSaving(true)
    setError(null)
    setSaved(false)

    const { error: saveErr } = await supabase
      .from('user_preferences')
      .upsert(
        { user_id: user.id, notification_enabled: enabled, reminder_after_days: days },
        { onConflict: 'user_id' }
      )

    setSaving(false)

    if (saveErr) {
      // eslint-disable-next-line no-console
      console.error(saveErr)
      setError("Couldn't save your notification settings. Please try again.")
      return
    }

    setAfterDays(days)
    setInitial({ enabled, afterDays: days })
    setSaved(true)
  }

  if (loading) {
    return <p className="text-sm text-muted dark:text-mutedDark">Loading...</p>
  }

  return (
    <div className="space-y-5 max-w-sm">
      <div className="flex items-start justify-between gap-4">
        <div>
          <span className="block text-sm font-medium text-ink dark:text-offwhite">Check-in reminders</span>
          <p className="text-xs text-muted dark:text-mutedDark mt-0.5">
            A gentle in-app nudge if you haven't logged anything in a while.
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

      <div>
        <label htmlFor="remind-after-days" className="block text-xs font-medium text-muted dark:text-mutedDark mb-1">
          Remind me after
        </label>
        <div className="flex items-center gap-2">
          <Input
            id="remind-after-days"
            type="number"
            min="1"
            value={afterDays}
            disabled={!enabled}
            onChange={(e) => {
              setAfterDays(e.target.value)
              setSaved(false)
            }}
            className="w-20 text-sm py-2 px-3 rounded-md bg-surface dark:bg-charcoalSurface disabled:opacity-40 font-mono"
          />
          <span className="text-sm text-muted dark:text-mutedDark">days of no activity</span>
        </div>
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
