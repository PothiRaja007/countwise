// Financial Assist — observation engine (Phase 33a).
//
// Pure: no React, no Supabase, no side effects, no display text. It turns
// already-recorded transactions and budgets into a short list of
// observations, expressed as ids + numbers only. Wording lives in
// assistCopy.js so the tone rules can be tested in one place.
//
// Non-negotiable rule, same as budgetEngine.js: this file never sums
// transaction amounts itself. Every figure comes from the existing
// primitives:
//   - totalExpenses()  (financialEngine.js) — narrowed to a category first
//     by filtering the list, exactly how budgetSpent() does it
//   - budgetSpent / budgetRemaining / budgetPercentUsed /
//     isBudgetOverAmount (budgetEngine.js), untouched
// Income, transfers and goal contributions never affect any figure,
// because totalExpenses() only ever counts type === 'expense'.
//
// Two observation kinds, mapped to CountWise's certainty language:
//   'observed' — a single-period fact (a budget's status right now)
//   'pattern'  — a comparison across two periods (this month vs last)
//
// Expected shapes:
//   transaction: { category_id, type, amount, transaction_date }
//   budget:      { id, category_id, amount, period_start, period_end }
//   category:    { id, name, kind }
//   today:       a JS Date

import { totalExpenses } from './financialEngine.js'
import { budgetSpent, budgetRemaining, budgetPercentUsed, isBudgetOverAmount } from './budgetEngine.js'

// Tunable thresholds. A change has to clear BOTH bars to be worth
// mentioning: a big percentage on a tiny amount, or a big amount that's
// a rounding error on a large category, is noise rather than signal.
export const MIN_ABSOLUTE_CHANGE = 500 // rupees
export const MIN_PERCENT_CHANGE = 20 // percent
export const BUDGET_NOTICE_PERCENT = 80
export const MAX_CATEGORY_CHANGES = 3
export const MAX_OBSERVATIONS = 6

/**
 * 'YYYY-MM-DD' from a Date's LOCAL parts. Never toISOString(): that
 * converts to UTC first, which shifts the date back a day for anyone
 * ahead of UTC (India, UTC+5:30) during the early hours of the morning.
 */
export function toISODateLocal(date) {
  const y = date.getFullYear()
  const m = String(date.getMonth() + 1).padStart(2, '0')
  const d = String(date.getDate()).padStart(2, '0')
  return `${y}-${m}-${d}`
}

/**
 * The two windows being compared: day 1 through today's date of this
 * month, versus the same day-range of the previous month. When the
 * previous month is shorter than today's date (e.g. today is Mar 31),
 * the previous window is clamped to that month's last day (Feb 28/29).
 * JS Date arithmetic handles the January -> December year rollover.
 */
export function monthToDateWindows(today) {
  const y = today.getFullYear()
  const m = today.getMonth()
  const d = today.getDate()

  const daysInPreviousMonth = new Date(y, m, 0).getDate()
  const previousDay = Math.min(d, daysInPreviousMonth)

  return {
    current: {
      start: toISODateLocal(new Date(y, m, 1)),
      end: toISODateLocal(new Date(y, m, d)),
    },
    previous: {
      start: toISODateLocal(new Date(y, m - 1, 1)),
      end: toISODateLocal(new Date(y, m - 1, previousDay)),
    },
  }
}

// Is a move from `previous` to `current` big enough to mention?
// Cross-multiplied rather than dividing, so the boundary case (exactly
// 20%) can't be lost to floating-point error.
function isMaterial(current, previous) {
  const abs = Math.abs(current - previous)
  if (previous > 0) {
    return abs >= MIN_ABSOLUTE_CHANGE && abs * 100 >= MIN_PERCENT_CHANGE * previous
  }
  // Nothing recorded in the earlier window: a percentage isn't defined,
  // so only the absolute floor applies.
  return current >= MIN_ABSOLUTE_CHANGE
}

/**
 * @returns {{ observations: Array, comparable: boolean }}
 *   comparable — whether the previous window had any recorded spending
 *   to compare against. Lets the UI tell "nothing notable changed" apart
 *   from "not enough history yet".
 */
export function computeObservations({ transactions = [], budgets = [], categories = [], today = new Date() } = {}) {
  const { current, previous } = monthToDateWindows(today)
  const todayISO = toISODateLocal(today)

  const currentTotal = totalExpenses(transactions, current.start, current.end)
  const previousTotal = totalExpenses(transactions, previous.start, previous.end)
  const comparable = previousTotal > 0

  const categoryName = new Map(categories.map((c) => [c.id, c.name]))

  // --- Budget status (single-period facts) -------------------------------
  const budgetObservations = budgets
    .filter((b) => b.period_start <= todayISO && b.period_end >= todayISO)
    .map((b) => {
      const percentUsed = budgetPercentUsed(transactions, b)
      if (percentUsed < BUDGET_NOTICE_PERCENT) return null
      return {
        id: `budget-status:${b.id}`,
        type: 'budget-status',
        kind: 'observed',
        severity: 'notice',
        figures: {
          categoryId: b.category_id,
          categoryName: categoryName.get(b.category_id) ?? 'A category',
          budgetAmount: b.amount,
          spent: budgetSpent(transactions, b),
          remaining: budgetRemaining(transactions, b),
          percentUsed,
          over: isBudgetOverAmount(transactions, b),
        },
      }
    })
    .filter(Boolean)
    .sort((a, b) => Number(b.figures.over) - Number(a.figures.over) || b.figures.percentUsed - a.figures.percentUsed)

  // --- Overall spending vs the same point last month ---------------------
  const overallObservations = []
  if (comparable && isMaterial(currentTotal, previousTotal)) {
    const change = currentTotal - previousTotal
    overallObservations.push({
      id: 'spend-vs-last-month',
      type: 'spend-vs-last-month',
      kind: 'pattern',
      severity: 'info',
      figures: {
        current: currentTotal,
        previous: previousTotal,
        change,
        percentChange: (change / previousTotal) * 100,
      },
    })
  }

  // --- Per-category changes ----------------------------------------------
  // Only when there's a real previous month to compare against: without
  // one, every category would read as "new" for a brand-new user.
  const categoryObservations = comparable
    ? categories
        .filter((c) => c.kind === 'expense')
        .map((c) => {
          const own = transactions.filter((t) => t.category_id === c.id)
          const cur = totalExpenses(own, current.start, current.end)
          const prev = totalExpenses(own, previous.start, previous.end)
          if (cur === 0 && prev === 0) return null
          if (!isMaterial(cur, prev)) return null
          const change = cur - prev
          return {
            id: `category-change:${c.id}`,
            type: 'category-change',
            kind: 'pattern',
            severity: 'info',
            figures: {
              categoryId: c.id,
              categoryName: c.name,
              current: cur,
              previous: prev,
              change,
              percentChange: prev > 0 ? (change / prev) * 100 : null,
              isNew: prev === 0,
            },
          }
        })
        .filter(Boolean)
        .sort((a, b) => Math.abs(b.figures.change) - Math.abs(a.figures.change))
        .slice(0, MAX_CATEGORY_CHANGES)
    : []

  const observations = [...budgetObservations, ...overallObservations, ...categoryObservations].slice(0, MAX_OBSERVATIONS)

  return { observations, comparable }
}
