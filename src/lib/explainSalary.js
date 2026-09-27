// Phase 34 (extended) — Gemini Explanation Layer for Salary.
// Same pattern as explainPF.js / explainCTC.js — read explainPF.js's
// header comment first if this one seems terse; the rules are identical.
//
// The one rule that matters: Gemini explains numbers that already exist.
// It never produces a number of its own. Every figure embedded in the
// prompt below comes from salaryEngine.js's already-calculated results
// (via the caller) — this file does not compute, estimate, or reformat
// anything. It only assembles already-formatted values into prompt text.
//
// Same split as explainPF.js/explainCTC.js: the pure schema/prompt logic
// lives here and is directly testable; the actual Gemini call
// (supabase.functions.invoke('gemini-explain', ...)) lives in Salary.jsx
// itself, since that part needs Supabase and isn't pure. This calls the
// existing, unmodified gemini-explain Edge Function.
//
// Note: unlike ctcEngine.js, salaryEngine.js's estimatedGrossMonthly()/
// estimatedTakeHomeMonthly() return bare numbers, not assumption text
// alongside them — so the caller (Salary.jsx) supplies the assumption
// strings here, using the same wording it already displays next to those
// figures in SalaryBreakdown. This file still does not invent or judge
// that wording; it only assembles whatever the caller passes in.
//
// Nothing here is ever written to the database. The explanation is
// ephemeral — fetched fresh from Gemini each time the user asks for it.

export const SALARY_EXPLANATION_SCHEMA = {
  type: 'object',
  properties: {
    explanation: { type: 'string' },
  },
  required: ['explanation'],
  additionalProperties: false,
}

/**
 * Builds the prompt for explaining one already-calculated salary
 * breakdown. Every value here is a caller-supplied, already-formatted
 * display string — this function only assembles them into prompt text.
 * The final sentence ("Do not introduce any numbers other than the ones
 * given above") is the safeguard against Gemini inventing or restating a
 * number incorrectly.
 *
 * @param {{
 *   categoryBreakdown: Array<{label: string, formattedAmount: string}>, // from salaryEngine.js's sumByCategory(), already formatted via formatCurrency()
 *   formattedGrossMonthly: string,     // already formatted, e.g. "₹65,000.00" — from salaryEngine.js's estimatedGrossMonthly()
 *   grossAssumption: string,           // the same assumption text Salary.jsx already displays next to the gross figure
 *   formattedTakeHomeMonthly: string,  // already formatted — from salaryEngine.js's estimatedTakeHomeMonthly()
 *   takeHomeAssumption: string,        // the same assumption text Salary.jsx already displays next to the take-home figure
 * }} params
 * @returns {string}
 */
export function buildSalaryExplanationPrompt({
  categoryBreakdown,
  formattedGrossMonthly,
  grossAssumption,
  formattedTakeHomeMonthly,
  takeHomeAssumption,
}) {
  const categoryLines = categoryBreakdown.map((c) => `${c.label}: ${c.formattedAmount}`).join(', ')

  return `A monthly salary breakdown has been calculated from the following category totals: ${categoryLines}.

Estimated monthly gross: ${formattedGrossMonthly}. ${grossAssumption}

Estimated monthly take-home: ${formattedTakeHomeMonthly}. ${takeHomeAssumption}

Explain in plain, simple language what this salary breakdown means for someone seeing it for the first time, in 2-3 short sentences. Do not introduce any numbers other than the ones given above.`
}
