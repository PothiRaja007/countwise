// Phase 38 — Financial Advice Boundary Audit, concrete finding #1.
//
// Three AI features (PF/Pension, CTC Explorer, Salary's "Explain this")
// sent their prompt to Gemini and displayed whatever text came back
// VERBATIM — zero validation. Financial Assist's narration (Phase 33b)
// has always validated its output before display; these three did not.
// Found by a full-codebase audit, not assumed from memory.
//
// This is the shared output-side check, applied to all three now. It is
// deliberately narrower than assistNarration.js's validateNarration():
// these prompts legitimately restate the already-given numbers in prose
// (that's the whole point — "explain this figure"), so there is no
// closed numeric set to check against the way Financial Assist's
// observation sentences have. What IS checked, uniformly: no advice, no
// certainty/guarantee language, no investment-specific language, and the
// text isn't empty or absurdly long.

import { FORBIDDEN_PHRASES } from './assistCopy.js'

// Extends the existing FORBIDDEN_PHRASES (advice/judgment) with the
// certainty/guarantee and investment-specific language this audit
// checked for across the whole app (see auditInvestmentLanguage.test.js).
export const EXPLANATION_FORBIDDEN_PHRASES = [
  ...FORBIDDEN_PHRASES,
  'guarantee', 'guarantees', 'guaranteed', 'promise', 'promises', 'promised', 'risk-free', 'definitely',
  'certainly', 'will grow', 'will earn', 'will save', 'will reach',
  'invest', 'investing', 'invest in', 'buy', 'sell', 'selling', 'allocate your', 'put your money',
  'best option', 'recommend', 'recommends', 'recommended', 'advice',
]

const MAX_EXPLANATION_CHARS = 1000

/**
 * @returns {{ ok: true } | { ok: false, reason: string }}
 */
export function validateExplanation(text) {
  if (typeof text !== 'string') return { ok: false, reason: 'not-a-string' }
  const trimmed = text.trim()
  if (trimmed.length === 0) return { ok: false, reason: 'empty' }
  if (trimmed.length > MAX_EXPLANATION_CHARS) return { ok: false, reason: 'too-long' }

  const lower = trimmed.toLowerCase()
  for (const phrase of EXPLANATION_FORBIDDEN_PHRASES) {
    if (new RegExp(`\\b${phrase.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}\\b`, 'i').test(lower)) {
      return { ok: false, reason: `forbidden-phrase:${phrase}` }
    }
  }
  return { ok: true }
}
