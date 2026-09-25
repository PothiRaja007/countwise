// Natural-language quick-entry parsing + rule-based auto-categorization.
// No LLM, no network call — fully offline, deterministic.
//
// v1 functions (parseQuickEntry, matchCategory, DEFAULT_RULE_KEYWORDS) are
// kept unchanged below for backward compatibility. Phase 3 adds multi-
// transaction Money Inbox parsing: parseAmount, detectType, detectAccounts,
// splitClauses, parseClause.

import { parseDate } from './dateParser.js'

/**
 * Parse a free-text entry like "coffee 80" or "80 coffee" or "uber to college 120.50"
 * into { amountRaw, description }. Amount = last standalone number found.
 */
export function parseQuickEntry(text) {
  const trimmed = text.trim()
  const match = trimmed.match(/(\d+(\.\d+)?)/g)
  if (!match) return { amountRaw: null, description: trimmed }
  const amountRaw = match[match.length - 1]
  const description = trimmed.replace(amountRaw, '').replace(/\s+/g, ' ').trim()
  return { amountRaw: Number(amountRaw), description }
}

/**
 * Match a description against a user's category_rules (+ default rules).
 * rules: [{ keyword, category_id, priority }]
 * Returns category_id or null if no match (caller should prompt manual pick).
 */
export function matchCategory(description, rules) {
  if (!description) return null
  const lower = description.toLowerCase()
  const hits = rules.filter((r) => lower.includes(r.keyword.toLowerCase()))
  if (hits.length === 0) return null
  hits.sort((a, b) => (b.priority ?? 0) - (a.priority ?? 0))
  return hits[0].category_id
}

// Seed keyword sets an onboarding step can insert as category_rules,
// keyed by default category name so IDs can be resolved after the
// default categories are fetched from Supabase.
export const DEFAULT_RULE_KEYWORDS = {
  Food: ['coffee', 'lunch', 'dinner', 'breakfast', 'snack', 'restaurant', 'zomato', 'swiggy', 'tea', 'canteen'],
  Transport: ['uber', 'ola', 'bus', 'metro', 'auto', 'taxi', 'train'],
  Fuel: ['petrol', 'diesel', 'fuel', 'gas station'],
  Entertainment: ['movie', 'netflix', 'spotify', 'game', 'party', 'outing'],
  'Bills & Utilities': ['recharge', 'electricity', 'rent', 'wifi', 'phone bill', 'subscription'],
  Education: ['book', 'course', 'certification', 'exam fee', 'tuition fee', 'stationery'],
  Shopping: ['amazon', 'flipkart', 'clothes', 'shoes'],
  Health: ['pharmacy', 'doctor', 'medicine', 'gym'],
  Salary: ['salary', 'stipend'],
  'Tuition/Freelance income': ['tuition', 'freelance', 'client payment'],
  Allowance: ['allowance', 'pocket money'],
}

// ---------------------------------------------------------------------
// Phase 3: Money Inbox multi-transaction parsing
// ---------------------------------------------------------------------

/**
 * Extract a monetary amount from text. Handles ₹500, 500 rs, 500 rupees,
 * and comma-grouped numbers (25,000). Returns a number or null.
 */
export function parseAmount(text) {
  const lower = text.toLowerCase()
  const patterns = [
    /₹\s*([\d,]+(?:\.\d+)?)/,
    /([\d,]+(?:\.\d+)?)\s*(?:rs\.?|rupees)\b/,
    /\b([\d,]+(?:\.\d+)?)\b/,
  ]
  for (const pattern of patterns) {
    const m = lower.match(pattern)
    if (m) {
      const n = Number(m[1].replace(/,/g, ''))
      if (!Number.isNaN(n)) return n
    }
  }
  return null
}

/**
 * Detect transaction type from keywords. Never silently guesses income or
 * transfer — only expense gets a marked fallback, since it's the
 * overwhelmingly common no-verb case and the review step always shows it
 * before saving (see project decision log).
 *
 * @param {string} text
 * @param {{hasAmount?: boolean}} opts
 * @returns {{type: 'expense'|'income'|'transfer'|null, assumed: boolean}}
 */
export function detectType(text, { hasAmount = true } = {}) {
  const lower = text.toLowerCase()
  const transferKeywords = ['moved', 'transferred', 'transfer']
  const expenseKeywords = ['spent', 'paid', 'bought', 'purchased', 'spend']
  const incomeKeywords = ['received', 'got', 'earned', 'credited', 'salary']

  if (transferKeywords.some((k) => lower.includes(k))) {
    return { type: 'transfer', assumed: false }
  }
  if (expenseKeywords.some((k) => lower.includes(k))) {
    return { type: 'expense', assumed: false }
  }
  if (incomeKeywords.some((k) => lower.includes(k))) {
    return { type: 'income', assumed: false }
  }
  if (hasAmount) {
    // No verb, but there's a number — overwhelmingly a bare expense entry
    // like "coffee 80". Pre-fill it, but flag it as assumed so the review
    // UI can show it as a suggestion rather than a confident parse.
    return { type: 'expense', assumed: true }
  }
  return { type: null, assumed: false }
}

/**
 * Match known account names in text. For transfers, resolves direction via
 * "from X to Y". Matching is case-insensitive substring matching against
 * the accountNames list (the user's real account names from Supabase).
 *
 * @param {string} text
 * @param {string[]} accountNames
 * @returns {{fromAccount: string|null, toAccount: string|null, account: string|null}}
 */
export function detectAccounts(text, accountNames = []) {
  const lower = text.toLowerCase()
  const findAccount = (segment) => {
    const segLower = segment.toLowerCase()
    return accountNames.find((n) => segLower.includes(n.toLowerCase())) || null
  }

  const fromToMatch = lower.match(/from\s+(.+?)\s+to\s+(.+?)(?:[.,]|$)/)
  if (fromToMatch) {
    return {
      fromAccount: findAccount(fromToMatch[1]),
      toAccount: findAccount(fromToMatch[2]),
      account: null,
    }
  }

  return { fromAccount: null, toAccount: null, account: findAccount(text) }
}

/**
 * Split a Money Inbox entry into individual transaction clauses on commas
 * or "and". Each clause is parsed independently by parseClause().
 * @param {string} text
 * @returns {string[]}
 */
export function splitClauses(text) {
  return text
    .split(/\s*,\s*|\s+and\s+/i)
    .map((s) => s.trim())
    .filter(Boolean)
}

/**
 * Orchestrate all Phase 3 parsing for a single clause into one structured
 * transaction candidate. needsReview is true whenever something couldn't
 * be confidently determined and requires the user's eyes before saving —
 * this is separate from `assumedType`, which flags a specific pre-filled
 * (but still reviewable) guess.
 *
 * @param {string} text
 * @param {{accountNames?: string[], referenceDate?: Date}} opts
 */
export function parseClause(text, { accountNames = [], referenceDate = new Date() } = {}) {
  const date = parseDate(text, referenceDate)
  const amount = parseAmount(text)
  const { type, assumed } = detectType(text, { hasAmount: amount !== null })
  const { fromAccount, toAccount, account } = detectAccounts(text, accountNames)

  const needsReview =
    amount === null ||
    type === null ||
    (type === 'transfer' && (!fromAccount || !toAccount))

  return {
    raw: text,
    date,
    amount,
    type,
    assumedType: assumed,
    account,
    fromAccount,
    toAccount,
    needsReview,
  }
}
