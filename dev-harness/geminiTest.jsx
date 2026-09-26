// TEMPORARY Phase 30 harness — proves the gemini-explain pipe end to end
// with a real logged-in session. Delete this folder and gemini-test.html
// once Phase 31a has a real caller. Not part of the app: it is its own Vite
// entry (dev server only; `vite build` only bundles index.html).
import React, { useState } from 'react'
import ReactDOM from 'react-dom/client'
import { BrowserRouter } from 'react-router-dom'
import { AuthProvider, useAuth } from '../src/lib/AuthContext.jsx'
import { supabase } from '../src/lib/supabaseClient.js'
import Login from '../src/pages/Login.jsx'
import '../src/index.css'

const FN = 'gemini-explain'
const URL_BASE = import.meta.env.VITE_SUPABASE_URL
const ANON = import.meta.env.VITE_SUPABASE_ANON_KEY

const DEFAULT_PROMPT = 'Return a JSON object with a single field greeting containing a friendly hello.'
const SCHEMA = {
  type: 'object',
  properties: { greeting: { type: 'string' } },
  required: ['greeting'],
}

async function callViaClient(prompt) {
  const { data, error } = await supabase.functions.invoke(FN, { body: { prompt, schema: SCHEMA } })
  if (!error) return { status: 200, body: data }
  const res = error.context
  let body = null
  try { body = await res.json() } catch { /* not JSON */ }
  return { status: res?.status ?? 'network-error', body: body ?? { error: error.message } }
}

async function callRaw(token, prompt = 'hi') {
  const res = await fetch(`${URL_BASE}/functions/v1/${FN}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', apikey: ANON, ...(token ? { Authorization: `Bearer ${token}` } : {}) },
    body: JSON.stringify({ prompt, schema: SCHEMA }),
  })
  let body = null
  try { body = await res.json() } catch { body = await res.text().catch(() => null) }
  return { status: res.status, body }
}

function Harness() {
  const { session, loading, signOut } = useAuth()
  const [prompt, setPrompt] = useState(DEFAULT_PROMPT)
  const [log, setLog] = useState([])
  const [busy, setBusy] = useState(false)
  const add = (label, result) => setLog((l) => [{ label, ...result, at: new Date().toLocaleTimeString() }, ...l])

  if (loading) return <p className="p-6">Loading…</p>
  if (!session) return <Login />

  const run = async (fn) => { setBusy(true); try { await fn() } finally { setBusy(false) } }

  const send = () => run(async () => add('authenticated call', await callViaClient(prompt)))

  const rapid = () => run(async () => {
    const results = await Promise.all(Array.from({ length: 8 }, () => callViaClient(prompt)))
    results.forEach((r, i) => add(`rapid #${i + 1}`, r))
  })

  const reject = () => run(async () => {
    add('no Authorization header', await callRaw(null))
    add('tampered JWT', await callRaw(session.access_token.slice(0, -4) + 'AAAA'))
    add('anon key as bearer (valid JWT, not a user)', await callRaw(ANON))
  })

  return (
    <div className="p-6 max-w-3xl mx-auto space-y-4 text-ink">
      <h1 className="font-display text-2xl">Gemini pipe test (temporary)</h1>
      <p className="text-sm text-muted">Signed in as {session.user.email}. Nothing here writes to the database.</p>
      <textarea value={prompt} onChange={(e) => setPrompt(e.target.value)} rows={3} className="w-full border border-line rounded p-2 text-sm" />
      <div className="flex flex-wrap gap-2">
        <button disabled={busy} onClick={send} className="px-3 py-2 rounded bg-gold text-white text-sm">Send prompt</button>
        <button disabled={busy} onClick={rapid} className="px-3 py-2 rounded border border-line text-sm">Fire 8 rapid calls</button>
        <button disabled={busy} onClick={reject} className="px-3 py-2 rounded border border-line text-sm">Test rejection paths</button>
        <button onClick={signOut} className="px-3 py-2 rounded border border-line text-sm ml-auto">Sign out</button>
      </div>
      <div className="space-y-2">
        {log.map((r, i) => (
          <pre key={i} className="text-xs border border-line rounded p-2 overflow-x-auto"><b>{r.at} · {r.label} → HTTP {r.status}</b>{'\n'}{JSON.stringify(r.body, null, 2)}</pre>
        ))}
      </div>
    </div>
  )
}

ReactDOM.createRoot(document.getElementById('root')).render(
  <BrowserRouter>
    <AuthProvider>
      <Harness />
    </AuthProvider>
  </BrowserRouter>
)
