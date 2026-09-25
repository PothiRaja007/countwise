// Pure calculation functions for Salary (Subphase 25.1) — no Supabase
// calls, no side effects, same pattern as every other engine file in this
// project (financialEngine.js, budgetEngine.js, ctcEngine.js).
//
// Scope reminder: this subphase is the calculation/data layer only. It
// does not touch `transactions`, does not create an income row, and does
// not build the "confirm actual receipt" UI — that's Subphase 25.2. This
// file has no connection point into financialEngine.js at all yet; that
// connection is 25.2's job, not this one's.
//
// Expected shape for a component (matches salary_components columns):
//   { name, category, monthly_amount }
// category is one of: 'basic' | 'allowance' | 'employee_deduction' |
//   'employer_contribution' | 'other' | 'needs_clarification'
// monthly_amount may be null — a component the user couldn't confidently
// fill in stays null rather than getting a guessed number. Never invent a
// value for a null monthly_amount anywhere in this file.

/**
 * Is this one component "incomplete" — either missing a confirmed
 * amount, or not confidently categorized yet? Same rule as ctcEngine.js's
 * equivalent, applied to salary's category set.
 */
function isIncomplete(component) {
  return (
    component.monthly_amount === null ||
    component.monthly_amount === undefined ||
    component.category === 'needs_clarification'
  )
}

/**
 * Groups components' monthly_amount by category. Same shape and
 * incomplete-handling as ctcEngine.js's sumByCategory() — components that
 * are incomplete (per isIncomplete() above) are excluded from the sums
 * and returned separately in `incomplete`, so nothing silently gets
 * counted on a guess.
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
    totals[category] = (totals[category] || 0) + component.monthly_amount
  }

  return { totals, incomplete }
}

/**
 * Estimated monthly gross reaching the employee — the sum of 'basic' and
 * 'allowance' only.
 *
 * 'employer_contribution' and 'employee_deduction' are deliberately not
 * part of this figure: employer contributions never reach the employee as
 * cash, and employee deductions are subtracted in
 * estimatedTakeHomeMonthly() below, not folded into gross here. 'other'
 * and 'needs_clarification' components are also excluded — gross is
 * intentionally narrow (basic + allowance only), not "everything except
 * the two obvious exclusions." Incomplete components (per sumByCategory)
 * never contribute — a component with no confirmed amount contributes
 * nothing to this total.
 *
 * @param {Array} components
 * @returns {number}
 */
export function estimatedGrossMonthly(components) {
  const { totals } = sumByCategory(components)
  return (totals.basic || 0) + (totals.allowance || 0)
}

/**
 * A rough monthly take-home estimate: estimated gross minus the sum of
 * 'employee_deduction' components.
 *
 * LIMITATION, stated plainly: this is an estimate built entirely from
 * user-provided numbers. It does not model real statutory tax or PF math
 * — no income-tax slabs, no verified employee PF rate. That requires
 * verified financial_rules (Phase 26/27 territory), which does not exist
 * yet. Whatever the employee has typed into 'employee_deduction' is taken
 * at face value; this function does not check whether that number is
 * statutorily correct. Any UI built on this figure must label it as an
 * estimate based on the values provided, never a guaranteed or
 * statutorily-verified take-home amount.
 *
 * @param {Array} components
 * @returns {number}
 */
export function estimatedTakeHomeMonthly(components) {
  const { totals } = sumByCategory(components)
  const gross = estimatedGrossMonthly(components)
  return gross - (totals.employee_deduction || 0)
}

/**
 * Does this set of components have anything the UI should treat as
 * unresolved — a missing amount, or a category still marked
 * 'needs_clarification'? Same pattern as ctcEngine.js's equivalent.
 *
 * @param {Array} components
 * @returns {boolean}
 */
export function hasIncompleteComponents(components) {
  return components.some(isIncomplete)
}
