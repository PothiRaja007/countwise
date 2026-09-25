import { useEffect, useState } from 'react'
import { X } from 'lucide-react'
import { supabase } from '../lib/supabaseClient.js'
import { useAuth } from '../lib/AuthContext.jsx'
import { isReminderEligible } from '../lib/reminderEngine.js'

// Gentle, dismissible in-app nudge — never a modal, never blocking.
// Owns its own fetch (max transaction timestamp + user_preferences) so
// AppShell.jsx only needs to render <ReminderBanner /> once, keeping the
// spine diff to an import line + a render line, per §8's "small and
// additive" instruction for this phase.
export default function ReminderBanner() {
  const { user } = useAuth()
  const [visible, setVisible] = useState(false)

  // Resets immediately on any identity change — including logout, where
  // `user` becomes null — so a stale `true` from the previous session can
  // never survive into the next one, even briefly. Declared before the
  // eligibility-check effect below so it commits first: React runs a
  // component's effects in declaration order within the same commit, so
  // this reset is guaranteed to land before the new user's check can set
  // `visible` again. Keyed on `user?.id` rather than the whole `user`
  // object, so a token refresh that produces a new object reference for
  // the same identity doesn't cause a spurious reset/reflash.
  useEffect(() => {
    setVisible(false)
  }, [user?.id])

  useEffect(() => {
    if (!user) return
    let cancelled = false

    async function check() {
      const [prefsRes, lastTxRes] = await Promise.all([
        supabase.from('user_preferences').select('*').eq('user_id', user.id).maybeSingle(),
        supabase
          .from('transactions')
          .select('created_at')
          .eq('user_id', user.id)
          .order('created_at', { ascending: false })
          .limit(1)
          .maybeSingle(),
      ])

      if (cancelled) return
      if (prefsRes.error || lastTxRes.error) {
        // eslint-disable-next-line no-console
        console.error(prefsRes.error || lastTxRes.error)
        return
      }

      // No row yet (pre-Phase-13 user who's never touched Settings →
      // Notifications) — the table's own column defaults are the correct
      // stand-in: notifications on, remind after 2 days, never sent.
      const prefs = prefsRes.data || {
        notification_enabled: true,
        reminder_after_days: 2,
        last_reminder_sent_at: null,
        timezone: 'UTC',
      }

      if (!prefs.notification_enabled) return

      // Populate timezone from the browser on first real use, only while
      // it's still at the database default — never hardcode a timezone,
      // and never overwrite one the user's browser has already set.
      if (prefs.timezone === 'UTC') {
        const browserTz = Intl.DateTimeFormat().resolvedOptions().timeZone
        if (browserTz && browserTz !== 'UTC') {
          await supabase
            .from('user_preferences')
            .upsert({ user_id: user.id, timezone: browserTz }, { onConflict: 'user_id' })
        }
      }

      const lastTransactionAt = lastTxRes.data?.created_at || null
      const eligible = isReminderEligible({
        lastTransactionAt,
        reminderAfterDays: prefs.reminder_after_days,
        lastReminderSentAt: prefs.last_reminder_sent_at,
      })

      if (cancelled) return

      if (!eligible) {
        // Explicit reset, not just "leave it alone" — without this, a
        // user who was eligible last load but isn't this time (e.g. they
        // logged activity elsewhere, or this is simply a different,
        // ineligible user) would keep seeing whatever `visible` happened
        // to already be, forever, since nothing else ever clears it.
        setVisible(false)
        return
      }

      setVisible(true)
      // Record that a reminder was shown now, so it doesn't fire again on
      // every subsequent page load until the next real inactivity cycle.
      await supabase
        .from('user_preferences')
        .upsert({ user_id: user.id, last_reminder_sent_at: new Date().toISOString() }, { onConflict: 'user_id' })
    }

    check()
    return () => {
      cancelled = true
    }
  }, [user?.id])

  if (!visible) return null

  return (
    <div className="flex items-center justify-between gap-3 px-4 py-2.5 bg-gold/10 border-b border-gold/30 text-sm text-ink dark:text-offwhite">
      <span>Haven't checked in lately? Add any recent money activity when you're ready.</span>
      <button
        onClick={() => setVisible(false)}
        aria-label="Dismiss"
        className="shrink-0 p-1 rounded hover:bg-gold/20 text-muted dark:text-mutedDark"
      >
        <X size={15} />
      </button>
    </div>
  )
}
