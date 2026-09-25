import { createContext, useContext, useEffect, useState } from 'react'
import { supabase } from './supabaseClient'

const AuthContext = createContext(null)

export function AuthProvider({ children }) {
  const [session, setSession] = useState(null)
  const [profile, setProfile] = useState(null)
  const [loading, setLoading] = useState(true)
  // Subphase 23A.1: Supabase fires a distinct 'PASSWORD_RECOVERY' auth
  // event (separate from 'SIGNED_IN') when a recovery session is
  // established via verifyOtp({type:'recovery'}) or a recovery-link
  // click. Without tracking this, App.jsx's plain `!session` check would
  // treat a recovery session as a normal login and drop the user straight
  // into the main app mid-flow, skipping the "set new password" step
  // entirely. This flag lets App.jsx intercept that case. Reset only via
  // clearPasswordRecovery() — an explicit action once the recovery flow
  // truly finishes, not by any other auth event.
  const [passwordRecovery, setPasswordRecovery] = useState(false)

  const loadProfile = async (userId) => {
    if (!userId) {
      setProfile(null)
      return
    }
    const { data } = await supabase
      .from('profiles')
      .select('*')
      .eq('id', userId)
      .maybeSingle()
    setProfile(data || null)
  }

  useEffect(() => {
    let mounted = true

    supabase.auth.getSession().then(async ({ data: { session } }) => {
      if (!mounted) return
      setSession(session)
      await loadProfile(session?.user?.id)
      setLoading(false)
    })

    const { data: listener } = supabase.auth.onAuthStateChange(async (event, session) => {
      if (event === 'PASSWORD_RECOVERY') setPasswordRecovery(true)
      setSession(session)

      // Bug fix: USER_UPDATED fires from supabase.auth.updateUser() — in
      // this app, that's exclusively ResetPassword.jsx's password change
      // (confirmed: it's the only call site). Previously this event fell
      // through to the same `setLoading(true) / await loadProfile() /
      // setLoading(false)` path as every other event. Because App.jsx
      // checks `loading` before `passwordRecovery`, that brief `loading =
      // true` unmounted ResetPassword.jsx — wiping its local `done` state
      // — right after a password update that had already succeeded, then
      // remounted it fresh (done=false) once loading cleared. The user's
      // password change was never actually undone, but they never saw the
      // success screen either, and landed back on the empty form — read
      // as "it errored" even though updateUser() had already succeeded.
      // USER_UPDATED doesn't change which user is signed in, so there's
      // no need to show the global loading interstitial for it — still
      // refresh the profile in case it changed, just without touching
      // `loading`.
      if (event === 'USER_UPDATED') {
        await loadProfile(session?.user?.id)
        return
      }

      setLoading(true)
      await loadProfile(session?.user?.id)
      setLoading(false)
    })

    return () => {
      mounted = false
      listener.subscription.unsubscribe()
    }
  }, [])

  const refreshProfile = async () => {
    await loadProfile(session?.user?.id)
  }

  const signOut = async () => {
    await supabase.auth.signOut()
  }

  const clearPasswordRecovery = () => setPasswordRecovery(false)

  const value = {
    session,
    user: session?.user || null,
    profile,
    loading,
    refreshProfile,
    signOut,
    passwordRecovery,
    clearPasswordRecovery,
  }

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>
}

export function useAuth() {
  const ctx = useContext(AuthContext)
  if (!ctx) throw new Error('useAuth must be used inside AuthProvider')
  return ctx
}
