// Pure Money Inbox logic — no UI, no Supabase calls. This orchestrates the
// already-frozen Phase 3 parsers (splitClauses/parseClause/matchCategory)
// into one call the UI can use, plus a soft duplicate-detection signal.
//
// Nothing in this file inserts into `transactions`. It only produces
// candidate objects for the review step to show, edit, and confirm.

import { splitClauses, parseClause, matchCategory } from './categorization.js'

/**
 * Split a Money Inbox entry into one review candidate per clause.
 *
 * @param {string} text - raw Money Inbox input, e.g. "coffee 80, bus 40, salary received 25000"
 * @param {{accountNames?: string[], categoryRules?: {keyword: string, category_id: string, priority?: number}[], referenceDate?: Date}} opts
 * @returns {Array<ReturnType<typeof parseClause> & {categoryId: string|null}>}
 */
export function buildReviewCandidates(text, { accountNames = [], categoryRules = [], referenceDate = new Date() } = {}) {
  const clauses = splitClauses(text)
  return clauses.map((clause) => {
    const candidate = parseClause(clause, { accountNames, referenceDate })
    // matchCategory does a lowercase substring match, so matching against
    // the clause's raw text (rather than a separately-extracted
    // description) still finds keywords like "coffee" or "fuel" fine.
    const categoryId = matchCategory(candidate.raw, categoryRules)
    return { ...candidate, categoryId }
  })
}

// Strip amount/date noise out of a clause so two descriptions of the same
// real-world thing ("coffee 80" vs "coffee") compare as similar instead of
// failing on token differences alone.
function descriptionSignature(text) {
  return (text || '')
    .toLowerCase()
    .replace(/₹/g, '')
    .replace(/[\d,]+(\.\d+)?/g, '')
    .replace(/\b(rs\.?|rupees|today|yesterday|tomorrow|this morning|last night)\b/g, '')
    .replace(/\s+/g, ' ')
    .trim()
}

/**
 * Soft duplicate signal only — never blocks, never auto-merges. Compares a
 * candidate's amount + description against transactions the caller has
 * already fetched (e.g. from the last ~15 minutes). This function does not
 * query anything itself.
 *
 * @param {{amount: number|null, raw: string}} candidate
 * @param {Array<{amount: number, description?: string, original_input?: string}>} recentTransactions
 * @returns {{isDuplicate: boolean, reason: string|null}}
 */
export function checkDuplicate(candidate, recentTransactions = []) {
  if (candidate.amount == null) return { isDuplicate: false, reason: null }

  const candidateSignature = descriptionSignature(candidate.raw)

  for (const t of recentTransactions) {
    if (t.amount !== candidate.amount) continue
    const txSignature = descriptionSignature(t.description || t.original_input || '')
    if (!candidateSignature || !txSignature) continue
    if (candidateSignature.includes(txSignature) || txSignature.includes(candidateSignature)) {
      return { isDuplicate: true, reason: 'Similar to one entered a few minutes ago' }
    }
  }

  return { isDuplicate: false, reason: null }
}
