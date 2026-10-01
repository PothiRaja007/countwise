// Phase 40 — Advanced AI Insights (capstone, synthesis only).
//
// Per the roadmap's own description: "advanced synthesis, not simply add
// a chatbot." This file computes NOTHING new. Every number it ever shows
// comes from an engine that already existed and was already tested:
//   - computeObservations() / describeObservation()  (Phase 33a/33b)
//   - computeBehaviorScore()                         (existing)
//   - goalOpportunity()                               (Phase 37)
// This file's only job is to combine their already-generated text into
// one prompt, and validate whatever Gemini sends back — reusing the
// EXACT SAME validation primitives already proven elsewhere, not new ones:
//   - extractNumbers() / allowedNumbers()  from assistNarration.js (33b)
//   - EXPLANATION_FORBIDDEN_PHRASES        from explanationSafety.js (38)
//
// This is the most sensitive AI surface in the app, because it spans
// every domain at once — money patterns, goals, and behavior — so it
// gets the union of every safeguard already built for each individually,
// not a new, narrower one.

import { extractNumbers, allowedNumbers } from './assistNarration.js'
import { EXPLANATION_FORBIDDEN_PHRASES } from './explanationSafety.js'

export const ADVANCED_INSIGHTS_SCHEMA = {
  type: 'object',
  properties: { summary: { type: 'string' } },
  required: ['summary'],
  additionalProperties: false,
}

export const MAX_INSIGHTS_CHARS = 800

/**
 * @param {Array<{ heading: string, lines: string[] }>} sections
 *   Each section's lines are ALREADY the exact text shown on screen
 *   (describeObservation() output, behavior flag descriptions, goal
 *   opportunity sentences) — never recomputed or reworded here.
 */
export function buildAdvancedInsightsPrompt(sections) {
  const body = sections
    .filter((s) => s.lines.length > 0)
    .map((s) => `${s.heading}:\n${s.lines.map((l) => `- ${l}`).join('\n')}`)
    .join('\n\n')
  return [
    "Below are several already-calculated summaries from a personal finance app, covering different parts of the same person's finances this month: spending patterns, savings goals, and an overall behavior summary.",
    '',
    body,
    '',
    'Write a short, plain-language summary connecting what these sections show, in 2 to 4 sentences.',
    'Rules:',
    '- Use only the facts and numbers given above. Do not calculate, round, abbreviate, or invent any new number.',
    '- Describe what the data shows across these sections. Do not explain why, and do not guess at causes.',
    '- Do not give advice, suggestions, warnings, or predictions.',
    '- Do not judge any of this as good or bad, and do not praise or criticise.',
    '- Do not mention investing, buying, selling, or use words like guarantee, promise, definitely, or risk-free.',
    '- Do not mention dates or months by name.',
    '- Use a calm, neutral tone.',
  ].join('\n')
}

/**
 * @param {string} text
 * @param {Array<{ figures: Record<string, number> }>} figureSources
 *   Every underlying engine result, wrapped as { figures } — the exact
 *   shape allowedNumbers() (from assistNarration.js) already expects, so
 *   no new number-collection logic is written here at all.
 */
export function validateAdvancedInsights(text, figureSources) {
  if (typeof text !== 'string') return { ok: false, reason: 'not-a-string' }
  const trimmed = text.trim()
  if (trimmed.length === 0) return { ok: false, reason: 'empty' }
  if (trimmed.length > MAX_INSIGHTS_CHARS) return { ok: false, reason: 'too-long' }

  for (const phrase of EXPLANATION_FORBIDDEN_PHRASES) {
    if (new RegExp(`\\b${phrase.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}\\b`, 'i').test(trimmed)) {
      return { ok: false, reason: `forbidden-phrase:${phrase}` }
    }
  }

  const allowed = allowedNumbers(figureSources)
  for (const n of extractNumbers(trimmed)) {
    if (!allowed.some((a) => Math.abs(a - n) < 0.005)) {
      return { ok: false, reason: `unlisted-number:${n}` }
    }
  }
  return { ok: true }
}
