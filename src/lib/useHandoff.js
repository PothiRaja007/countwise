// P6 — the small hook an owner page uses to receive a handoff from Money Inbox.
//
//   const { handoff, done } = useHandoff('goals')
//
// `handoff` is the pending action Money Inbox prepared for this page, or null. Reading is
// ONE-TIME: the session store marks it used, so a second page, a refresh or a Back press
// gets nothing. A handoff that is for another page, another user, expired or not built is
// ignored without a word: the page just opens as it always did.
//
// React Strict Mode runs effects twice in development. The first run would take the
// handoff and the second would find it gone, so what was taken is kept in state and a ref
// remembers that this page already asked for this user; the second run does nothing.
//
// P7: Goals is the first page to use this. The hook only receives: whatever a page does with
// the handoff, confirming and writing included, is that page's own business.
//
// P7: the floating Money Inbox button is on every page, so a handoff can also arrive while the
// owner page is already open. The store tells open pages (onHandoff); the hook then reads again.
// A read that finds nothing never clears a handoff the page is already holding.
import { useCallback, useEffect, useRef, useState } from 'react'
import { useAuth } from './AuthContext.jsx'
import { takeHandoff, onHandoff } from './commandSession.js'

export function useHandoff(page) {
  const { user } = useAuth()
  const userId = user?.id ?? null
  const [handoff, setHandoff] = useState(null)
  const asked = useRef(null) // `${userId}|${page}` once this page has asked

  useEffect(() => {
    if (!userId) return
    const key = `${userId}|${page}`
    if (asked.current === key) return
    asked.current = key
    const result = takeHandoff(page, userId, Date.now())
    setHandoff(result.ok ? result.pending : null)
  }, [page, userId])

  // A handoff that arrives while this page is open (P7). Same one-time read, same user and page checks.
  useEffect(() => {
    if (!userId) return undefined
    return onHandoff((arrivedFor) => {
      if (arrivedFor !== page) return
      const result = takeHandoff(page, userId, Date.now())
      if (result.ok) setHandoff(result.pending)
    })
  }, [page, userId])

  // The page calls this when it has finished with the handoff (confirmed, cancelled or dismissed).
  const done = useCallback(() => setHandoff(null), [])

  return { handoff, done }
}
