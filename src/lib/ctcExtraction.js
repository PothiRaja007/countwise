// Phase 31a — CTC document extraction. Pure constants + one pure
// validation function; the actual Gemini call (via supabase.functions
// .invoke('gemini-explain', ...)) lives in CTCExplorer.jsx itself, since
// that part needs Supabase and isn't pure. This file exists so the
// schema/prompt/validation logic has one place to live and one place to
// test, rather than being buried inline in the page component.
//
// Category list matches CTCExplorer.jsx's own CATEGORY_OPTIONS exactly —
// minus 'needs_clarification', which is a UI-only state a person can pick
// for a component they haven't sorted out yet. It is never a valid
// classification for Gemini to assign, so it's deliberately excluded here.
export const CTC_EXTRACTION_CATEGORIES = [
  'basic',
  'hra',
  'special_allowance',
  'employer_pf',
  'gratuity',
  'variable_pay',
  'other',
]

// Sent as both Gemini's generationConfig.responseJsonSchema AND the
// gemini-explain Edge Function's own server-side Ajv validation of
// whatever Gemini returns — the same object serves both purposes, exactly
// as gemini-explain expects.
export const CTC_EXTRACTION_SCHEMA = {
  type: 'array',
  items: {
    type: 'object',
    properties: {
      name: { type: 'string' },
      category: { type: 'string', enum: CTC_EXTRACTION_CATEGORIES },
      annual_amount: { type: ['number', 'null'] },
    },
    required: ['name', 'category', 'annual_amount'],
    additionalProperties: false,
  },
}

export const CTC_EXTRACTION_PROMPT = `You are extracting compensation components from a job offer letter or CTC (Cost to Company) breakdown document.

Extract every distinct compensation component visible in the document — for example Basic Salary, HRA, Special Allowance, Employer PF contribution, Gratuity, variable/bonus pay, and anything else listed as part of the package. Do not include a total/summary CTC row — only individual components.

For each component, return:
- "name": the component's name as written in the document (or a short, clear label if it isn't explicitly named)
- "category": the closest match from exactly these values — ${CTC_EXTRACTION_CATEGORIES.map((c) => `"${c}"`).join(', ')}. If nothing fits well, use "other".
- "annual_amount": the component's ANNUAL amount as a plain number, with no currency symbols and no thousands separators. Only return a number if the document clearly states or clearly implies a specific annual figure for this component. If the amount is unclear, ambiguous, or not stated, return null — never guess or estimate a number.

Return only a JSON array of these objects, matching the schema exactly.`

/**
 * Defensive client-side validation of Gemini's (already server-validated)
 * response, per the task's own rule: never trust a category value outside
 * the allowed list, and never let anything but a genuine positive number
 * through as an amount. Malformed entries (no usable name) are dropped
 * rather than crashing the page. Never throws — a non-array input simply
 * yields an empty result.
 *
 * @param {unknown} raw
 * @returns {Array<{name: string, category: string, annual_amount: number|null}>}
 */
export function validateExtractedComponents(raw) {
  if (!Array.isArray(raw)) return []

  return raw
    .filter((item) => item && typeof item === 'object' && typeof item.name === 'string' && item.name.trim().length > 0)
    .map((item) => ({
      name: item.name.trim(),
      category: CTC_EXTRACTION_CATEGORIES.includes(item.category) ? item.category : 'other',
      annual_amount:
        typeof item.annual_amount === 'number' && Number.isFinite(item.annual_amount) && item.annual_amount > 0
          ? item.annual_amount
          : null,
    }))
}
