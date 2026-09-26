// supabase/functions/gemini-explain/index.ts
//
// Shared, feature-agnostic pipe to Gemini (Phase 30). An authenticated
// caller sends { prompt, schema }; this function calls Gemini in JSON mode
// against that schema, validates what comes back against the same schema,
// and returns it. It has NO side effects beyond that one outbound API call:
// it reads no user data and writes to no database table. Feature-specific
// prompts/schemas (CTC extraction etc.) belong to the callers, not here.
//
// Deploy:
//   supabase secrets set GEMINI_API_KEY=<key from Google AI Studio>
//   supabase functions deploy gemini-explain
// SUPABASE_URL and SUPABASE_ANON_KEY are injected by the platform. The
// Gemini key lives only in the Edge Function secret store — never in .env,
// never under src/.
//
// Model: Flash-Lite only. Pro requires billing (no free path), so it is
// deliberately not used. Free-tier limits are set by Google and change
// without notice, so nothing here predicts or hardcodes a rate limit — a
// 429 from Gemini is simply passed on to the caller as a generic
// "rate_limited" response for the client to handle.
//
// Security model (same pattern as delete-account / notify-login):
//   1. The caller's JWT is validated the standard way (anon-key client +
//      auth.getUser(token)) BEFORE the body is read or Gemini is contacted.
//   2. The Gemini key is read from the function's environment and sent in a
//      request header (not the URL), so it can't end up in URL logs.
//   3. Raw Gemini errors, response bodies, and the key are never returned
//      to the client or logged — only the upstream status code is logged.
//   4. Gemini's output is untrusted until it parses as JSON AND validates
//      against the caller's schema; otherwise it is rejected.

import { createClient } from 'npm:@supabase/supabase-js@2'
import Ajv from 'npm:ajv@8'

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

const MODEL = Deno.env.get('GEMINI_MODEL') || 'gemini-flash-lite-latest'
const GEMINI_URL = `https://generativelanguage.googleapis.com/v1beta/models/${MODEL}:generateContent`
const TIMEOUT_MS = 25_000
const MAX_PROMPT_CHARS = 20_000
const MAX_SCHEMA_CHARS = 10_000

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
    // --- Step 1: authenticate before doing anything else.
    const authHeader = req.headers.get('Authorization')
    if (!authHeader) {
      return json({ error: 'Missing Authorization header' }, 401)
    }

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

    // --- Step 2: validate the request body.
    let body: { prompt?: unknown; schema?: unknown }
    try {
      body = await req.json()
    } catch {
      return json({ error: 'Request body must be JSON' }, 400)
    }

    const { prompt, schema } = body ?? {}
    if (typeof prompt !== 'string' || prompt.trim().length === 0 || prompt.length > MAX_PROMPT_CHARS) {
      return json({ error: 'prompt must be a non-empty string' }, 400)
    }
    if (typeof schema !== 'object' || schema === null || Array.isArray(schema) || JSON.stringify(schema).length > MAX_SCHEMA_CHARS) {
      return json({ error: 'schema must be a JSON schema object' }, 400)
    }

    let validate: (data: unknown) => boolean
    try {
      validate = new Ajv({ strict: false }).compile(schema as object)
    } catch {
      return json({ error: 'schema is not a valid JSON schema' }, 400)
    }

    const apiKey = Deno.env.get('GEMINI_API_KEY')
    if (!apiKey) {
      console.error('GEMINI_API_KEY is not configured')
      return json({ error: 'ai_unavailable', message: 'The AI service is not available right now.' }, 503)
    }

    // --- Step 3: call Gemini in JSON mode, with a timeout.
    const controller = new AbortController()
    const timer = setTimeout(() => controller.abort(), TIMEOUT_MS)
    let upstream: Response
    try {
      upstream = await fetch(GEMINI_URL, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'x-goog-api-key': apiKey },
        body: JSON.stringify({
          contents: [{ role: 'user', parts: [{ text: prompt }] }],
          generationConfig: { responseMimeType: 'application/json', responseJsonSchema: schema },
        }),
        signal: controller.signal,
      })
    } catch (err) {
      console.error('Gemini request failed:', err instanceof Error ? err.name : 'unknown')
      if (err instanceof Error && err.name === 'AbortError') {
        return json({ error: 'timeout', message: 'The AI service took too long to respond. Please try again.' }, 504)
      }
      return json({ error: 'ai_unavailable', message: 'The AI service is not available right now.' }, 502)
    } finally {
      clearTimeout(timer)
    }

    if (upstream.status === 429) {
      console.error('Gemini responded 429')
      return json({ error: 'rate_limited', message: 'Too many requests right now. Please wait a moment and try again.' }, 429)
    }
    if (!upstream.ok) {
      console.error('Gemini responded', upstream.status)
      return json({ error: 'ai_unavailable', message: 'The AI service is not available right now.' }, 502)
    }

    // --- Step 4: Gemini's output is untrusted until parsed AND validated.
    let parsed: unknown
    try {
      const payload = await upstream.json()
      const text = payload?.candidates?.[0]?.content?.parts?.[0]?.text
      if (typeof text !== 'string') throw new Error('no text part')
      parsed = JSON.parse(text)
    } catch {
      console.error('Gemini returned a malformed response')
      return json({ error: 'bad_response', message: 'The AI service returned an unusable response. Please try again.' }, 502)
    }

    if (!validate(parsed)) {
      console.error('Gemini output failed schema validation')
      return json({ error: 'bad_response', message: 'The AI service returned an unusable response. Please try again.' }, 502)
    }

    return json({ data: parsed }, 200)
  } catch (err) {
    console.error('gemini-explain unexpected error:', err instanceof Error ? err.name : 'unknown')
    return json({ error: 'Unexpected error. Please try again.' }, 500)
  }
})
