// Financial Assist — AI narration (Phase 33b).
//
// Pure: no React, no Supabase, no network. This file does three things:
//   1. builds the prompt from observations that were ALREADY calculated
//      (assistEngine.js) and worded (assistCopy.js),
//   2. defines the response schema, and
//   3. VERIFIES whatever Gemini sends back before it can be shown.
//
// Phase 34 relied on the prompt alone ("do not introduce any numbers").
// A prompt is a request, not a guarantee. Here the AI's text is treated
// as untrusted: it is shown only if every number in it traces back to an
// observation and it contains no advice, judgment, praise, prediction or
// guessed cause. If the check fails the text is discarded and the
// deterministic observations, which are always shown, stand on their own.
//
// The schema deliberately uses only the plain keywords already proven to
// work against the live gemini-explain function in Phase 34. Length is
// enforced here instead of with schema keywords whose support in
// Gemini's JSON-schema mode isn't confirmed.

import { FORBIDDEN_PHRASES } from './assistCopy.js'

export const NARRATION_SCHEMA = {
  type: 'object',
  properties: { summary: { type: 'string' } },
  required: ['summary'],
  additionalProperties: false,
}

export const MAX_NARRATION_CHARS = 700

// On top of the advice/judgment list: praise (also a judgment), and
// speculation about causes or the future. The observations describe what
// the recorded data shows and nothing else.
const EXTRA_FORBIDDEN = [
  'because', 'due to', 'probably', 'likely', 'perhaps', 'seems', 'suggests',
  'expect', 'expected', 'going to', 'next month', 'trend', 'trending',
  'consider', 'recommend', 'recommended', 'ought', 'worth noting',
  'good', 'great', 'excellent', 'well done', 'congrats', 'congratulations',
  'impressive', 'healthy', 'unhealthy',
]

export const NARRATION_FORBIDDEN = [...FORBIDDEN_PHRASES, ...EXTRA_FORBIDDEN]

/**
 * @param {Array<{headline: string, detail: string}>} described - the same
 *   text the user already sees on screen, one entry per observation.
 */
export function buildNarrationPrompt(described) {
  const lines = described.map((d, i) => `${i + 1}. ${d.headline}: ${d.detail}`).join('\n')
  return [
    "Below are observations about one person's recorded spending this month. Each was calculated from their transactions and is a fact.",
    '',
    lines,
    '',
    'Write a short, plain-language summary of these observations in 2 to 3 sentences.',
    'Rules:',
    '- Use only the facts and numbers above. Write amounts and percentages exactly as they appear above; do not calculate, round or abbreviate any number.',
    '- Describe what changed. Do not explain why, and do not guess at causes.',
    '- Do not give advice, suggestions, warnings or predictions.',
    '- Do not judge the spending as good or bad, and do not praise or criticise.',
    '- Do not mention dates or months, and do not say how many observations there are.',
    '- Use a calm, neutral tone.',
  ].join('\n')
}

const NUMBER_RE = /\d[\d,]*(?:\.\d+)?/g

/** Every numeric token in a text, as a number ("₹1,700.00" -> 1700). */
export function extractNumbers(text) {
  return (text.match(NUMBER_RE) || []).map((token) => Number(token.replace(/,/g, ''))).filter(Number.isFinite)
}

/**
 * Every number the observations give the AI permission to mention.
 * Generic over `figures`, so a new figure added to the engine is allowed
 * automatically. Percent-like figures may appear rounded, floored, or to
 * one decimal — all honest renderings of the same value.
 */
export function allowedNumbers(observations) {
  const allowed = []
  for (const obs of observations) {
    for (const [key, value] of Object.entries(obs.figures || {})) {
      if (typeof value !== 'number' || !Number.isFinite(value)) continue
      const abs = Math.abs(value)
      allowed.push(abs)
      if (/percent/i.test(key)) {
        allowed.push(Math.floor(abs), Math.round(abs), Math.round(abs * 10) / 10)
      }
    }
  }
  return allowed
}

function escapeRegExp(s) {
  return s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
}

/**
 * Decide whether AI-written text may be shown.
 * @returns {{ ok: true } | { ok: false, reason: string }}
 */
export function validateNarration(text, observations) {
  if (typeof text !== 'string') return { ok: false, reason: 'not-a-string' }
  const trimmed = text.trim()
  if (trimmed.length === 0) return { ok: false, reason: 'empty' }
  if (trimmed.length > MAX_NARRATION_CHARS) return { ok: false, reason: 'too-long' }

  for (const phrase of NARRATION_FORBIDDEN) {
    if (new RegExp(`\\b${escapeRegExp(phrase)}\\b`, 'i').test(trimmed)) {
      return { ok: false, reason: `forbidden-phrase:${phrase}` }
    }
  }

  const allowed = allowedNumbers(observations)
  for (const n of extractNumbers(trimmed)) {
    if (!allowed.some((a) => Math.abs(a - n) < 0.005)) {
      return { ok: false, reason: `unlisted-number:${n}` }
    }
  }

  return { ok: true }
}
