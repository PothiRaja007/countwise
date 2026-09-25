// supabase/functions/delete-account/index.ts
//
// Deletes the AUTHENTICATED CALLER'S OWN account. This is the one
// privileged, irreversible operation in all of v1.1 (§3.5/§6.10). The
// service-role key is read here, server-side, from the Edge Function's
// environment — it is never hardcoded, never committed, and never sent
// to or referenced by any file under src/.
//
// Deploy:
//   supabase functions deploy delete-account
// SUPABASE_URL, SUPABASE_ANON_KEY, and SUPABASE_SERVICE_ROLE_KEY are
// injected automatically by the Supabase platform for every Edge
// Function — no `supabase secrets set` step is required for this
// function specifically. Full deployment steps are in the Phase 21
// handoff notes, not repeated here.
//
// Security model:
//   1. The caller's JWT (forwarded Authorization header) is validated the
//      standard way — an anon-key client scoped to that header, then
//      auth.getUser() — never hand-rolled JWT parsing/verification.
//   2. The account to delete is ALWAYS the authenticated caller's own id.
//      If a request body supplies a userId, it must match the
//      authenticated id or the request is rejected — an arbitrary id in
//      the body is never trusted on its own.
//   3. Only after both checks pass does a service-role client get created
//      to call auth.admin.deleteUser(). Every user-owned table cascades
//      from auth.users(id) on delete cascade (verified independently in
//      Phase 16 against a real Postgres instance) — this function's own
//      job is small; the cascade does the rest.

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

    // --- Step 1: validate the caller's session (standard pattern, not
    // hand-rolled): a client scoped to the forwarded Authorization header,
    // then auth.getUser() to resolve it to a real, current user.
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

    const authenticatedUserId = userData.user.id

    // --- Step 2: the deletion target is always the authenticated user.
    // If the client sent a userId anyway, it must match — never accept an
    // arbitrary id from the request body as the thing to delete.
    let requestedUserId = authenticatedUserId
    try {
      const body = await req.json()
      if (body && typeof body.userId === 'string' && body.userId.length > 0) {
        requestedUserId = body.userId
      }
    } catch {
      // No body, or not JSON — fine. requestedUserId already defaults to
      // the authenticated user's own id.
    }

    if (requestedUserId !== authenticatedUserId) {
      return json({ error: 'You can only delete your own account' }, 403)
    }

    // --- Step 3: the actual privileged operation. Service-role client is
    // constructed here, inside the function, from the platform-injected
    // secret — this is the only place in the entire project this key is
    // ever read.
    const adminClient = createClient(
      Deno.env.get('SUPABASE_URL')!,
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
    )

    const { error: deleteErr } = await adminClient.auth.admin.deleteUser(authenticatedUserId)

    if (deleteErr) {
      // eslint-disable-next-line no-console
      console.error(deleteErr)
      return json({ error: 'Could not delete your account. Please try again or contact support.' }, 500)
    }

    return json({ success: true }, 200)
  } catch (err) {
    // eslint-disable-next-line no-console
    console.error(err)
    return json({ error: 'Unexpected error. Please try again.' }, 500)
  }
})
