// Pure calculation/parsing functions for the Budget Inbox flow (Phase
// 17.1, revised) — no Supabase calls inside, same pattern as every other
// engine file. Sits alongside budgetEngine.js, doesn't modify it.
//
// Scope note (unchanged from the original 17.1 pass, reconfirmed in the
// revision): no income-aware suggested spending ranges, no life-stage
// suggestion engine, no elaborate confidence scoring. suggestFromProfile
// below is a small static lookup table, and recentIncomeTotal is never
// used to derive a suggested amount anywhere in this file.
//
// Signature note: matchCategory() requires a `rules` list to categorize
// anything, so parseRecipeInput takes one. No function here resolves a
// category's display name — every candidate returns categoryId only (or,
// for the static profile list, a categoryName string with no real id yet)
// — resolving an id to a name is the caller's job, the same way
// budgetEngine.js never resolves names either.

import { splitClauses, matchCategory, parseAmount } from './categorization.js'
import { totalIncome } from './financialEngine.js'

// ---------------------------------------------------------------------
// Amount parsing: adds "1k"/"2k"/"2.5k" shorthand on top of whatever
// categorization.js's parseAmount() already understands (₹500, 500 rs,
// comma-grouped numbers). This lives here rather than in categorization.js
// itself so Money Inbox's parsing behavior is never touched by Budget
// Inbox work — K-notation is a Budget Inbox-only convenience.
// ---------------------------------------------------------------------

const K_NOTATION_PATTERN = /(\d+(?:\.\d+)?)\s*k\b/i

/**
 * Parse an amount from text, understanding K-notation ("1k" -> 1000,
 * "2.5k" -> 2500) in addition to everything parseAmount() already
 * handles. K-notation is checked first and is authoritative when
 * present — "2k" always means 2000, never "2".
 */
export function parseRecipeAmount(text) {
  const kMatch = text.match(K_NOTATION_PATTERN)
  if (kMatch) {
    return Math.round(Number(kMatch[1]) * 1000)
  }
  return parseAmount(text)
}

/**
 * Split pooled free-text input into per-clause budget candidates. Reuses
 * splitClauses()/matchCategory() from categorization.js — no
 * reimplemented clause-splitting or category-matching here.
 *
 * A clause with no amount found (including no K-notation match) returns
 * amount: null and requiresReview: true — this never invents a number. A
 * clause that doesn't match any category rule also gets requiresReview:
 * true, since a budget row can't be saved without a category.
 *
 * @param {string} text
 * @param {{keyword: string, category_id: string, priority?: number}[]} rules
 */
export function parseRecipeInput(text, rules) {
  const clauses = splitClauses(text)

  return clauses.map((clause) => {
    const amount = parseRecipeAmount(clause)
    const categoryId = matchCategory(clause, rules)

    return {
      categoryId,
      categoryName: null, // resolved by the caller against its own categories list
      amount,
      source: 'user',
      reason: null,
      requiresReview: amount === null || categoryId === null,
    }
  })
}

/**
 * Merge same-category candidates into a single row, summing their
 * amounts — e.g. "netflix 149, spotify 119" both resolving to
 * Subscriptions become one ₹268 Subscriptions line, not two. Candidates
 * with no resolved categoryId are never merged with anything, since each
 * still needs its own category assigned before it means anything.
 */
export function mergeByCategory(candidates) {
  const merged = []
  const indexByCategory = new Map()

  candidates.forEach((c) => {
    if (!c.categoryId) {
      merged.push({ ...c })
      return
    }
    if (indexByCategory.has(c.categoryId)) {
      const idx = indexByCategory.get(c.categoryId)
      const existing = merged[idx]
      const bothKnown = existing.amount !== null && c.amount !== null
      merged[idx] = {
        ...existing,
        amount: bothKnown ? existing.amount + c.amount : existing.amount ?? c.amount,
        requiresReview: existing.requiresReview || c.requiresReview,
      }
    } else {
      indexByCategory.set(c.categoryId, merged.length)
      merged.push({ ...c })
    }
  })

  return merged
}

function monthBounds(year, month) {
  // month is 0-indexed, same as JS Date
  const start = new Date(year, month, 1)
  const end = new Date(year, month + 1, 0) // day 0 of next month = last day of this one
  const toISO = (d) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
  return { start: toISO(start), end: toISO(end) }
}

// Deterministic rounding for a suggested historical amount — nearest ₹50.
// Documented and tested explicitly since "sensible rounded amount" is
// otherwise ambiguous: e.g. an average of 612.5 rounds to 600 (12.5 away
// from 600 vs 37.5 away from 650).
function roundToNearest50(n) {
  return Math.round(n / 50) * 50
}

/**
 * Suggest budget candidates from the last 3 calendar months of spending
 * (the 3 full months before referenceDate's month — not the month being
 * budgeted for). Groups expense transactions by category_id per month,
 * and only suggests a category that appears in at least 2 of those 3
 * months. The suggested amount is the average of that category's monthly
 * totals across however many of the 3 months it actually appeared in,
 * rounded to the nearest ₹50 — a "recent average," not a prediction.
 *
 * @param {{category_id: string, type: string, amount: number, transaction_date: string}[]} transactions
 * @param {string[]} existingCandidateCategoryIds - categories already covered elsewhere (pooled input, or already budgeted this month), excluded here
 * @param {Date} referenceDate - defaults to now; overridable for tests
 */
export function suggestFromHistory(transactions, existingCandidateCategoryIds, referenceDate = new Date()) {
  const excluded = new Set(existingCandidateCategoryIds)

  const months = [1, 2, 3].map((i) => {
    const d = new Date(referenceDate.getFullYear(), referenceDate.getMonth() - i, 1)
    return monthBounds(d.getFullYear(), d.getMonth())
  })

  // categoryId -> { total, monthsPresent }
  const byCategory = new Map()

  months.forEach(({ start, end }) => {
    const monthTotals = new Map() // categoryId -> this month's sum
    transactions.forEach((t) => {
      if (t.type !== 'expense') return
      if (!t.category_id) return
      if (t.transaction_date < start || t.transaction_date > end) return
      monthTotals.set(t.category_id, (monthTotals.get(t.category_id) || 0) + t.amount)
    })
    monthTotals.forEach((sum, categoryId) => {
      const entry = byCategory.get(categoryId) || { total: 0, monthsPresent: 0 }
      entry.total += sum
      entry.monthsPresent += 1
      byCategory.set(categoryId, entry)
    })
  })

  const candidates = []
  byCategory.forEach((entry, categoryId) => {
    if (entry.monthsPresent < 2) return
    if (excluded.has(categoryId)) return
    const amount = roundToNearest50(entry.total / entry.monthsPresent)
    candidates.push({
      categoryId,
      categoryName: null,
      amount,
      source: 'history',
      reason: 'Based on recent spending',
      requiresReview: false,
    })
  })

  return candidates
}

// Static lookup only — deliberately not an income-aware or life-stage
// suggestion engine (both explicitly cut). No amount is ever attached to
// a profile suggestion — there's no historical evidence behind it, so
// inventing a number here would be exactly the fabricated precision this
// phase is supposed to avoid. Names match real shared default categories
// (post Phase 17.1's category corrections) so they resolve to a real
// category for most users instead of sitting permanently unmatched.
const PROFILE_SUGGESTIONS_BY_INCOME_TYPE = {
  student: ['Transport', 'Food', 'Mobile Recharge', 'Education', 'Subscriptions'],
  employed: ['Rent', 'Food', 'Mobile Recharge', 'Subscriptions', 'Transport'],
}

/**
 * Static per-profile category suggestions. `income_type: 'mixed'` (and
 * anything unrecognized) yields no suggestions, since the spec only
 * defines student/employed lists and guessing a third list isn't this
 * file's call to make.
 *
 * Suggestions carry a category *name* (not id) since this is a static
 * list, not tied to any specific user's real category rows — matching a
 * name to the user's actual categories (or leaving it unmatched) is the
 * caller's job, same as categoryName resolution elsewhere in this file.
 *
 * @param {string} incomeType
 * @param {string[]} existingCandidateCategoryNames - names already covered elsewhere, excluded here
 */
export function suggestFromProfile(incomeType, existingCandidateCategoryNames) {
  const excluded = new Set(existingCandidateCategoryNames)
  const names = PROFILE_SUGGESTIONS_BY_INCOME_TYPE[incomeType] || []

  return names
    .filter((name) => !excluded.has(name))
    .map((name) => ({
      categoryId: null,
      categoryName: name,
      amount: null,
      source: 'profile',
      reason: 'Suggested',
      requiresReview: true,
    }))
}

/**
 * Thin wrapper around financialEngine.js's totalIncome() — exists so the
 * Budget Inbox UI has its own clearly-named entry point for "recent
 * income" rather than reaching into financialEngine.js directly. Labeled
 * in the UI as "recent income" only — never framed as a prediction or a
 * budget target, and never merged into the planned-total figure. If the
 * result is 0, the caller should simply not show the comparison at all.
 */
export function recentIncomeTotal(transactions, periodStart, periodEnd) {
  return totalIncome(transactions, periodStart, periodEnd)
}
