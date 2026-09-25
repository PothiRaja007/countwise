// supabase/functions/notify-login/index.ts
//
// Best-effort side notification: "you just signed in to CountWise."
// Called fire-and-forget by Login.jsx right after signInWithPassword()
// succeeds. This function's failure must NEVER block or affect the
// actual login — it only ever runs after the login itself already
// succeeded client-side.
//
// Architecture (Subphase 23A.2 — different from 23A.1's password-recovery
// flow, which rides Supabase's own built-in recovery email entirely; this
// one exists because a plain successful password sign-in does not fire
// any of Supabase's built-in auth email hooks — verified against current
// Supabase docs while building this: the Send Email Hook and the
// dedicated security-notification email types cover signup, magic link,
// invite, recovery, email/password/phone change, and MFA/identity
// linking — not a plain successful sign-in. If that ever changes, this
// whole custom function becomes redundant, but as of this build it's
// still the only way to do this.):
//
//   Client: signInWithPassword() succeeds
//        -> supabase.functions.invoke('notify-login')  (fire-and-forget)
//        -> this function validates the caller's session,
//           resolves their email server-side, checks their
//           login_notifications_enabled preference,
//           calls Resend's API with a server-side secret.
//
// Deploy:
//   supabase functions deploy notify-login
// RESEND_API_KEY must be set as a Supabase Edge Function secret — see the
// Subphase 23A.2 handoff notes for the exact command. SUPABASE_URL and
// SUPABASE_ANON_KEY are injected automatically by the platform, same as
// every other function in this project (see delete-account/index.ts).
//
// Security model (same pattern as delete-account/index.ts, reused not
// reinvented):
//   1. The caller's JWT (forwarded Authorization header) is validated the
//      standard way — an anon-key client scoped to that header, then
//      auth.getUser() — never hand-rolled JWT parsing/verification.
//   2. The email notified is ALWAYS the authenticated caller's own email,
//      read from the validated session server-side. Nothing in the
//      request body is ever trusted for this — there is no legitimate
//      reason for this function to accept an email/userId parameter at
//      all, unlike delete-account which had to support an optional
//      cross-check.
//   3. No financial data of any kind is included in the email — just the
//      fact that a sign-in happened, and when.

import { createClient } from 'npm:@supabase/supabase-js@2'

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

function json(body: unknown, status: number) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, 'Content-Type': 'application/json' },
  })
}

Deno.serve(async (req: Request) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders })
  }

  if (req.method !== 'POST') {
    return json({ error: 'Method not allowed' }, 405)
  }

  try {
    const authHeader = req.headers.get('Authorization')
    if (!authHeader) {
      return json({ error: 'Missing Authorization header' }, 401)
    }

    // --- Step 1: validate the caller's session — same standard pattern
    // as delete-account/index.ts, not reinvented.
    const userClient = createClient(
      Deno.env.get('SUPABASE_URL')!,
      Deno.env.get('SUPABASE_ANON_KEY')!,
      { global: { headers: { Authorization: authHeader } } }
    )

    const token = authHeader.replace(/^Bearer\s+/i, '')
    const { data: userData, error: userErr } = await userClient.auth.getUser(token)

    if (userErr || !userData?.user) {
      return json({ error: 'Invalid or expired session' }, 401)
    }

    const userId = userData.user.id
    const email = userData.user.email

    if (!email) {
      // No email on this account (shouldn't happen for an
      // email/password user, but this function must never throw for an
      // edge case it can't help) — nothing to notify, quietly succeed.
      return json({ success: true, skipped: 'no_email' }, 200)
    }

    // --- Step 2: respect the user's own toggle. Uses the userClient
    // (scoped to their own session, RLS-protected) — reading this does
    // not need service-role privileges.
    const { data: prefs, error: prefsErr } = await userClient
      .from('user_preferences')
      .select('login_notifications_enabled')
      .eq('user_id', userId)
      .maybeSingle()

    // Distinguish "no row yet" (normal — the column's own database
    // default is true, same fallback used everywhere else this table is
    // read) from an actual query failure. Previously this error was
    // silently discarded and treated identically to "no row", which meant
    // a real failure here (e.g. a schema-cache lag right after a migration,
    // or a transient RLS/connection hiccup) would silently fall through to
    // "enabled" with no way to tell the two cases apart from the Logs tab.
    // Kept the same default (true) for both cases, since this is a
    // best-effort notification, not a security-critical gate, and failing
    // toward "sent" is safer for the user than silently dropping a real
    // security notification — but now each path is logged distinctly so
    // live testing can actually see which one happened.
    if (prefsErr) {
      // eslint-disable-next-line no-console
      console.error('notify-login: user_preferences lookup failed, defaulting to enabled:', prefsErr)
    } else if (!prefs) {
      // eslint-disable-next-line no-console
      console.log('notify-login: no user_preferences row yet, defaulting to enabled (db default)')
    } else {
      // eslint-disable-next-line no-console
      console.log(`notify-login: login_notifications_enabled=${prefs.login_notifications_enabled}`)
    }

    const enabled = prefs ? prefs.login_notifications_enabled : true
    if (!enabled) {
      // eslint-disable-next-line no-console
      console.log('notify-login: notifications disabled, skipping send')
      return json({ success: true, skipped: 'disabled' }, 200)
    }

    // --- Step 3: send via Resend, using the server-side secret. Plain,
    // non-alarming copy — no balance, no transactions, no financial
    // detail of any kind, just the fact and the time.
    const resendApiKey = Deno.env.get('RESEND_API_KEY')
    if (!resendApiKey) {
      // eslint-disable-next-line no-console
      console.error('RESEND_API_KEY is not configured')
      return json({ error: 'Notification service not configured' }, 500)
    }

    const signInTime = new Date().toUTCString()
    const fromAddress = Deno.env.get('NOTIFY_LOGIN_FROM') || 'CountWise <onboarding@resend.dev>'

    // eslint-disable-next-line no-console
    console.log('notify-login: sending sign-in notification email')

    const resendRes = await fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${resendApiKey}`,
      },
      body: JSON.stringify({
        from: fromAddress,
        to: [email],
        subject: 'New sign-in to your CountWise account',
        html: `<p>New sign-in to your CountWise account.</p><p>${signInTime}</p><p>If this was you, no action is needed. If you don't recognize this, change your password from Settings → Security.</p>`,
      }),
    })

    if (!resendRes.ok) {
      const errBody = await resendRes.text()
      // eslint-disable-next-line no-console
      console.error('Resend API error:', resendRes.status, errBody)
      // Best-effort: report failure to the caller, but the caller (Login.jsx)
      // is instructed to never surface this to the user or block on it.
      return json({ error: 'Could not send notification email' }, 502)
    }

    return json({ success: true }, 200)
  } catch (err) {
    // eslint-disable-next-line no-console
    console.error(err)
    return json({ error: 'Unexpected error' }, 500)
  }
})
