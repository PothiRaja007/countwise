// Pure calculation functions for CTC Explorer (Subphase 24.1) — no
// Supabase calls, no side effects, same pattern as every other engine
// file in this project (financialEngine.js, budgetEngine.js, etc.).
//
// Scope reminder: this subphase is data-model + engine only. There is no
// document upload/extraction here or anywhere near this file — the user
// types their offer letter's components into a form (that form is
// Subphase 24.2, not built yet). Gemini/OCR/PDF-parsing are explicitly
// locked to V1.3 (Phase 30+).
//
// Expected shape for a component (matches ctc_components columns):
//   { name, category, annual_amount, is_recurring_monthly, notes }
// category is one of: 'basic' | 'hra' | 'special_allowance' |
//   'employer_pf' | 'gratuity' | 'variable_pay' | 'other' |
//   'needs_clarification'
// annual_amount may be null — a component the user couldn't confidently
// fill in stays null rather than getting a guessed number. Never invent
// a value for a null annual_amount anywhere in this file.

const EXCLUDED_FROM_GROSS = new Set(['employer_pf', 'gratuity'])

/**
 * Is this one component "incomplete" — either missing a confirmed
 * amount, or not confidently categorized yet?
 */
function isIncomplete(component) {
  return (
    component.annual_amount === null ||
    component.annual_amount === undefined ||
    component.category === 'needs_clarification'
  )
}

/**
 * Groups components' annual_amount by category.
 *
 * Components that are incomplete (per isIncomplete() above — a null
 * amount, or an unclear category) are excluded from the sums and
 * returned separately in `incomplete`, so nothing silently gets counted
 * on a guess. The UI decides what to do with `incomplete` (e.g. show a
 * "needs clarification" list) — this function only separates the two
 * groups, it doesn't decide how to present them.
 *
 * @param {Array} components
 * @returns {{ totals: Object<string, number>, incomplete: Array }}
 */
export function sumByCategory(components) {
  const totals = {}
  const incomplete = []

  for (const component of components) {
    if (isIncomplete(component)) {
      incomplete.push(component)
      continue
    }
    const category = component.category
    totals[category] = (totals[category] || 0) + component.annual_amount
  }

  return { totals, incomplete }
}

/**
 * Estimated annual gross — the sum of every category EXCEPT employer_pf
 * and gratuity.
 *
 * STATED ASSUMPTION (deliberately not buried): employer PF and gratuity
 * are excluded here because they are employer-side retirement/benefit
 * contributions, not cash that ordinarily reaches the employee as salary
 * or that the employee is taxed on as pay. This is CountWise's own
 * simplifying assumption for this subphase, not a statutory definition —
 * a future phase with verified financial_rules (Phase 27) may refine it.
 * Whatever figure the UI builds from this must be labelled "based on the
 * values and assumptions provided," never presented as a guaranteed
 * number — this function's return shape carries the assumption text
 * specifically so the UI can't drop that context.
 *
 * Incomplete components (per sumByCategory) are never included — a
 * component with no confirmed amount contributes nothing to this total,
 * and `hasIncompleteAmounts` tells the UI whether that happened.
 *
 * @param {Array} components
 * @returns {{ annualGross: number, excludedCategories: string[], assumption: string, hasIncompleteAmounts: boolean }}
 */
export function estimatedGrossAnnual(components) {
  const { totals, incomplete } = sumByCategory(components)

  let annualGross = 0
  for (const [category, amount] of Object.entries(totals)) {
    if (!EXCLUDED_FROM_GROSS.has(category)) {
      annualGross += amount
    }
  }

  return {
    annualGross,
    excludedCategories: [...EXCLUDED_FROM_GROSS],
    assumption:
      'Excludes employer PF and gratuity — these are employer-side contributions, not part of what typically reaches you as gross pay. This is a stated CountWise simplifying assumption, not a statutory rule.',
    hasIncompleteAmounts: incomplete.length > 0,
  }
}

/**
 * A rough, conservative monthly take-home estimate.
 *
 * This deliberately does NOT attempt real statutory deduction math —
 * no income-tax slabs, no employee PF rate. That's PF/tax territory
 * (Phase 26/27, once financial_rules exists), not this subphase. What
 * this returns is closer to "estimated gross reaching you monthly,
 * before any statutory deductions" than an actual take-home figure, and
 * the return shape says so explicitly rather than letting a bare number
 * be mistaken for a confident take-home amount.
 *
 * @param {Array} components
 * @returns {{ monthlyEstimate: number, isApproximate: true, assumptions: string[], hasIncompleteAmounts: boolean }}
 */
export function estimatedMonthlyTakeHome(components) {
  const gross = estimatedGrossAnnual(components)
  const monthlyEstimate = Math.round((gross.annualGross / 12) * 100) / 100

  return {
    monthlyEstimate,
    isApproximate: true,
    assumptions: [
      gross.assumption,
      'Does not account for income tax or the employee\'s own PF contribution — those require verified statutory rules (a future phase), and are not modeled here.',
      'This is a rough approximation of what reaches you before statutory deductions, not a guaranteed take-home figure.',
    ],
    hasIncompleteAmounts: gross.hasIncompleteAmounts,
  }
}

/**
 * Does this set of components have anything the UI should treat as
 * unresolved — a missing amount, or a category still marked
 * 'needs_clarification'? The UI uses this to decide whether to show a
 * "some components need clarification" state rather than a confident
 * final breakdown.
 *
 * @param {Array} components
 * @returns {boolean}
 */
export function hasIncompleteComponents(components) {
  return components.some(isIncomplete)
}
