// Phase 39 — Admin Financial Rule Assistant.
//
// Pure logic only: the Gemini extraction schema/prompt, defensive
// validation of whatever comes back (same pattern as ctcExtraction.js),
// and prepareRuleApproval() — the one piece of real business logic this
// phase adds, and the one most worth getting precisely right, since a
// mistake here writes bad data into the SAME table every PF/tax
// calculation in the app reads from.
//
// The actual Supabase call lives in AdminRuleAssistant.jsx, same split
// as every other AI feature in this codebase.
//
// Gemini NEVER writes an active rule. It only ever proposes a structured
// draft; prepareRuleApproval() computes what WOULD be written, and only
// the admin's explicit "Approve and activate" click executes it, with
// verification_status fixed to 'verified' by that click — never a value
// Gemini can set itself (the schema below deliberately has no
// verification_status field at all).

export const RULE_PROPOSAL_SCHEMA = {
  type: 'object',
  properties: {
    scheme: { type: 'string' },
    rule_key: { type: 'string' },
    value: { type: ['number', 'null'] },
    unit: { type: 'string' },
    effective_from: { type: ['string', 'null'] },
    source_url: { type: ['string', 'null'] },
    note: { type: 'string' },
  },
  required: ['scheme', 'rule_key', 'value', 'unit', 'effective_from', 'note'],
  additionalProperties: false,
}

export const RULE_EXTRACTION_PROMPT_PREFIX = `You are helping an administrator of a personal finance app extract a proposed statutory financial rule change from an official notification, circular, or description — for example a change to an EPF/EPS contribution rate, a tax slab, or a similar government-set figure.

Read the text below and return:
- "scheme": a short lowercase identifier for the scheme (for example "epf", "eps", "income_tax"). Use an existing one if the text is clearly about it, otherwise propose a short sensible one.
- "rule_key": a short lowercase identifier for exactly which figure this is (for example "employee_contribution_rate", "wage_ceiling"). Match an existing convention where the text makes that obvious.
- "value": the numeric value as a plain number, with no currency symbol or percent sign. Only return a number if the text clearly and specifically states one — never guess, estimate, or infer a figure that isn't explicitly given.
- "unit": the unit the value is in (for example "percent", "rupees", "rupees_per_month").
- "effective_from": the date this rule takes effect, as YYYY-MM-DD. Only return a date if the text clearly states one — otherwise return null.
- "source_url": the official source URL if the text includes or clearly references one, otherwise null. Never invent a URL.
- "note": one short plain sentence summarizing what you read, including anything you were NOT confident about.

Do not give advice, suggestions, or recommendations. Do not use words like guarantee, promise, definitely, or risk-free. This is a factual extraction task, not an explanation or opinion.

Text to read:
`

export function buildRuleExtractionPrompt(rawText) {
  return RULE_EXTRACTION_PROMPT_PREFIX + `"${rawText}"`
}

/**
 * Defensive validation of Gemini's response — never trusted as-is.
 * Returns sanitized fields individually (null for anything that didn't
 * check out) rather than discarding the whole proposal, since a partial
 * extraction still saves the admin typing the parts that WERE read
 * correctly; the review form requires every field to be filled in by a
 * human either way before approval is even possible (see
 * proposalIsReadyForApproval()).
 */
export function validateRuleProposal(raw) {
  const fallback = { scheme: null, rule_key: null, value: null, unit: null, effective_from: null, source_url: null, note: null }
  if (!raw || typeof raw !== 'object') return fallback

  const str = (v) => (typeof v === 'string' && v.trim().length > 0 ? v.trim() : null)
  const scheme = str(raw.scheme)?.toLowerCase().replace(/[^a-z0-9_]/g, '_') ?? null
  const rule_key = str(raw.rule_key)?.toLowerCase().replace(/[^a-z0-9_]/g, '_') ?? null
  const value = typeof raw.value === 'number' && Number.isFinite(raw.value) && raw.value >= 0 ? raw.value : null
  const unit = str(raw.unit)
  const effective_from = typeof raw.effective_from === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(raw.effective_from) ? raw.effective_from : null
  const source_url = typeof raw.source_url === 'string' && /^https?:\/\//.test(raw.source_url.trim()) ? raw.source_url.trim() : null
  const note = str(raw.note)?.slice(0, 500) ?? null

  return { scheme, rule_key, value, unit, effective_from, source_url, note }
}

/** Every field a proposal needs before the "Approve and activate" button may be used — checked again just before the write, not only in the UI. */
export function proposalIsReadyForApproval(p) {
  return !!(p && p.scheme && p.rule_key && typeof p.value === 'number' && p.value >= 0 && p.unit && p.effective_from && /^\d{4}-\d{2}-\d{2}$/.test(p.effective_from))
}

/**
 * Computes WHAT TO WRITE for an approval — the actual DB calls (in that
 * exact order) live in the page component, this function only decides
 * their shape, so the date-boundary logic is independently testable
 * without a live database.
 *
 * `existingActiveRule` is the current row (if any) with effective_to
 * null for this scheme+rule_key — the caller fetches it first.
 *
 * effective_to is EXCLUSIVE (financialRules.js's own selectApplicableRule
 * treats a rule's range as [effective_from, effective_to) ). Closing out
 * an old rule therefore means setting its effective_to to EXACTLY the
 * new rule's effective_from — not the day before, which would leave a
 * real gap with no applicable rule for that one day. Verified against a
 * real Postgres with the table's actual unique constraint, not assumed:
 * inserting the new row before closing the old one fails the constraint
 * (two rows with effective_to null for the same scheme+rule_key), so
 * updateOldRule (when present) must be applied, and its own write must
 * complete, before insertNewRule runs.
 *
 * @returns {{
 *   updateOldRule: { id: string, effective_to: string } | null,
 *   insertNewRule: { scheme, rule_key, value, unit, effective_from, effective_to: null, source_url, retrieved_at: string, verification_status: 'verified' },
 * } | { error: string }}
 */
export function prepareRuleApproval(proposal, existingActiveRule, now = new Date()) {
  if (!proposalIsReadyForApproval(proposal)) return { error: 'This proposal is missing a required field.' }

  if (existingActiveRule) {
    if (existingActiveRule.scheme !== proposal.scheme || existingActiveRule.rule_key !== proposal.rule_key) {
      return { error: 'The existing active rule does not match this proposal\u2019s scheme/rule_key — refusing to guess which row to close.' }
    }
    if (existingActiveRule.effective_to !== null && existingActiveRule.effective_to !== undefined) {
      return { error: 'The provided "existing active rule" is not actually open-ended (effective_to is already set) — nothing to close.' }
    }
    if (proposal.effective_from <= existingActiveRule.effective_from) {
      return { error: 'The new effective_from must be after the existing rule\u2019s effective_from — refusing to create a rule that starts before, or on, the one it would replace.' }
    }
  }

  return {
    updateOldRule: existingActiveRule ? { id: existingActiveRule.id, effective_to: proposal.effective_from } : null,
    insertNewRule: {
      scheme: proposal.scheme,
      rule_key: proposal.rule_key,
      value: proposal.value,
      unit: proposal.unit,
      effective_from: proposal.effective_from,
      effective_to: null,
      source_url: proposal.source_url,
      retrieved_at: now.toISOString(),
      verification_status: 'verified',
    },
  }
}
