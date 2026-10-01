// Phase 34 (extended) — Gemini Explanation Layer for CTC Explorer.
// Same pattern as explainPF.js — read that file's header comment first if
// this one seems terse; the rules are identical, just applied to a
// different data shape.
//
// The one rule that matters: Gemini explains numbers that already exist.
// It never produces a number of its own. Every figure embedded in the
// prompt below comes from ctcEngine.js's already-calculated results (via
// the caller) — this file does not compute, estimate, or reformat
// anything. It only assembles already-formatted values into prompt text.
//
// Same split as explainPF.js: the pure schema/prompt logic lives here and
// is directly testable; the actual Gemini call
// (supabase.functions.invoke('gemini-explain', ...)) lives in
// CTCExplorer.jsx itself, since that part needs Supabase and isn't pure.
// This calls the existing, unmodified gemini-explain Edge Function.
//
// Nothing here is ever written to the database. The explanation is
// ephemeral — fetched fresh from Gemini each time the user asks for it.

export const CTC_EXPLANATION_SCHEMA = {
  type: 'object',
  properties: {
    explanation: { type: 'string' },
  },
  required: ['explanation'],
  additionalProperties: false,
}

/**
 * Builds the prompt for explaining one already-calculated CTC breakdown.
 * Every value here is a caller-supplied, already-formatted display string
 * — this function only assembles them into prompt text. The final
 * sentence ("Do not introduce any numbers other than the ones given
 * above") is the safeguard against Gemini inventing or restating a
 * number incorrectly.
 *
 * @param {{
 *   categoryBreakdown: Array<{label: string, formattedAmount: string}>, // from ctcEngine.js's sumByCategory(), already formatted via formatCurrency()
 *   formattedGrossAnnual: string,    // already formatted, e.g. "₹8,60,000.00" — from ctcEngine.js's estimatedGrossAnnual().annualGross
 *   grossAssumption: string,         // ctcEngine.js's estimatedGrossAnnual().assumption, verbatim
 *   formattedMonthlyTakeHome: string,// already formatted — from ctcEngine.js's estimatedMonthlyTakeHome().monthlyEstimate
 *   takeHomeAssumptions: string[],   // ctcEngine.js's estimatedMonthlyTakeHome().assumptions, verbatim
 * }} params
 * @returns {string}
 */
export function buildCTCExplanationPrompt({
  categoryBreakdown,
  formattedGrossAnnual,
  grossAssumption,
  formattedMonthlyTakeHome,
  takeHomeAssumptions,
}) {
  const categoryLines = categoryBreakdown.map((c) => `${c.label}: ${c.formattedAmount}`).join(', ')
  const takeHomeAssumptionText = takeHomeAssumptions.join(' ')

  return `A CTC (Cost to Company) breakdown has been calculated from the following category totals: ${categoryLines}.

Estimated annual gross: ${formattedGrossAnnual}. ${grossAssumption}

Estimated monthly take-home: ${formattedMonthlyTakeHome}. ${takeHomeAssumptionText}

Explain in plain, simple language what this CTC breakdown means for someone who has never seen one before, in 2-3 short sentences. Do not introduce any numbers other than the ones given above. Do not give advice, suggestions, or recommendations. Do not use words like guarantee, promise, definitely, or risk-free. Do not mention investing, buying, or selling anything.`
}
