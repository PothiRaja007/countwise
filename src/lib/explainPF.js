// Phase 34 — Gemini Explanation Layer, scoped to PF/Pension only.
//
// The one rule that matters: Gemini explains numbers that already exist.
// It never produces a number of its own. Every figure embedded in the
// prompt below comes from pfEngine.js's already-calculated result (via
// the caller) — this file does not compute, estimate, or reformat
// anything. It only assembles already-formatted values into prompt text.
//
// Same split as ctcExtraction.js: the pure schema/prompt logic lives
// here and is directly testable; the actual Gemini call
// (supabase.functions.invoke('gemini-explain', ...)) lives in
// PFPension.jsx itself, since that part needs Supabase and isn't pure.
// This calls the existing, unmodified gemini-explain Edge Function —
// plain text-only, no fileData, exactly as the Phase 30 test harness
// already proved works.
//
// Nothing here is ever written to the database. The explanation is
// ephemeral — fetched fresh from Gemini each time the user asks for it.

export const PF_EXPLANATION_SCHEMA = {
  type: 'object',
  properties: {
    explanation: { type: 'string' },
  },
  required: ['explanation'],
  additionalProperties: false,
}

/**
 * Builds the prompt for explaining a single already-calculated PF/EPF/EPS
 * row. Every value here is a caller-supplied, already-formatted display
 * string or number — this function only assembles them into prompt text.
 * The final sentence ("Do not introduce any numbers other than the ones
 * given above") is the safeguard against Gemini inventing or restating a
 * number incorrectly.
 *
 * @param {{
 *   label: string,               // e.g. "Employee PF"
 *   formattedAmount: string,     // already formatted via formatCurrency(), e.g. "₹2,400.00"
 *   rateUsed: number,            // e.g. 12
 *   effectiveFrom: string,       // already display-formatted, e.g. "1 Apr 2024"
 *   effectiveTo: string|null,    // already display-formatted, or null if open-ended
 *   sourceLabel: string,         // e.g. an official source URL, or a scheme name if no URL exists
 * }} params
 * @returns {string}
 */
export function buildPFExplanationPrompt({ label, formattedAmount, rateUsed, effectiveFrom, effectiveTo, sourceLabel }) {
  const periodText = effectiveTo
    ? `effective from ${effectiveFrom} through ${effectiveTo}`
    : `effective from ${effectiveFrom}, currently open-ended`

  return `${label} contribution: ${formattedAmount}, calculated at a rate of ${rateUsed}%, ${periodText}, sourced from ${sourceLabel}.

Explain in plain, simple language what this means for someone who has never seen a PF breakdown before, in 2-3 short sentences. Do not introduce any numbers other than the ones given above.`
}
