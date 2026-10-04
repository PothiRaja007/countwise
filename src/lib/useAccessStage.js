// Phase 41 - is this account NEW (never finished the first-access stage) or
// RETURNING (has a row in user_access)?
//
//   status: 'idle'      no user signed in
//           'loading'   asking the database
//           'new'       no row  -> show the first-time flow
//           'returning' has a row
//           'error'     could not find out. NEVER treated as "new": the caller
//                       shows an error with Retry instead of guessing.
//
// AuthContext is not touched; this is a separate hook on purpose.
import { useCallback, useEffect, useState } from 'react'
import { supabase } from './supabaseClient'

export function useAccessStage(userId) {
  const [state, setState] = useState({ userId: null, status: 'idle', method: null })
  const [attempt, setAttempt] = useState(0)

  useEffect(() => {
    if (!userId) {
      setState({ userId: null, status: 'idle', method: null })
      return
    }
    let cancelled = false
    setState({ userId, status: 'loading', method: null })

    supabase
      .from('user_access')
      .select('method')
      .eq('user_id', userId)
      .maybeSingle()
      .then(({ data, error }) => {
        if (cancelled) return
        if (error) {
          // eslint-disable-next-line no-console
          console.error('user_access lookup failed:', error)
          setState({ userId, status: 'error', method: null })
          return
        }
        setState(
          data
            ? { userId, status: 'returning', method: data.method }
            : { userId, status: 'new', method: null }
        )
      })

    return () => {
      cancelled = true
    }
  }, [userId, attempt])

  // Derived, so the render right after a user appears is 'loading', never a stale value.
  const status = !userId ? 'idle' : state.userId === userId ? state.status : 'loading'
  const method = status === 'returning' ? state.method : null

  const retry = useCallback(() => setAttempt((n) => n + 1), [])

  // Records the choice. Only after the database confirms does the status flip.
  const markCompleted = useCallback(
    async (chosenMethod) => {
      if (!userId) return { ok: false }
      const { error } = await supabase
        .from('user_access')
        .upsert({ user_id: userId, method: chosenMethod }, { onConflict: 'user_id' })
      if (error) {
        // eslint-disable-next-line no-console
        console.error('user_access save failed:', error)
        return { ok: false, error }
      }
      setState({ userId, status: 'returning', method: chosenMethod })
      return { ok: true }
    },
    [userId]
  )

  return { status, method, retry, markCompleted }
}
