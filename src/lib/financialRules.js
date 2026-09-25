// Read helper for the financial_rules table (Phase 27).
//
// IMPORTANT DISTINCTION from every other file in src/lib: this file is
// NOT pure. getActiveRule() and getVerifiedRule() below call Supabase —
// their entire job is querying financial_rules, so there's no way to do
// that without a network call. Don't mistake them for pure functions
// like financialEngine.js/budgetEngine.js/goalEngine.js/lifeStage.js.
//
// The one piece of genuine logic here — deciding *which* row applies for
// a given date — is deliberately split out into selectApplicableRule(),
// which IS pure and IS fully unit-tested (see financialRules.test.js).
// That split exists specifically so the part that actually matters (the
// date-range/verification selection logic, which is what makes "don't
// blindly use the latest rule" real) can be tested with zero network
// dependency, the same way every other engine in this project is tested.
//
// The Supabase client import below is deliberately dynamic (`await
// import(...)`), not a static top-of-file import. supabaseClient.js
// reads import.meta.env.VITE_SUPABASE_URL, which only exists under Vite
// — plain `node` (how this project's tests run) throws on that read the
// moment the module loads, even if the code path using it is never
// reached. A static import would make loading THIS file fail under
// `node financialRules.test.js`, only because that test also happens to
// import selectApplicableRule() from the same file — a bug this project
// had never hit before, since every previous Supabase-calling lib file
// (e.g. budgetSave.js) never had its own test file. Lazy-loading the
// client means the pure function stays importable and testable in plain
// Node, and the real client only loads when an actual query runs.
function toISODateString(value) {
  if (value instanceof Date) {
    const y = value.getFullYear()
    const m = String(value.getMonth() + 1).padStart(2, '0')
    const d = String(value.getDate()).padStart(2, '0')
    return `${y}-${m}-${d}`
  }
  return String(value)
}

/**
 * Pure selection logic: given a set of already-fetched financial_rules
 * rows (expected to all share one scheme+rule_key — this function does
 * not filter by those, the caller's query already did), find the row
 * whose effective range covers asOfDate: effective_from is inclusive,
 * effective_to is exclusive (a rule effective_to '2027-01-01' is no
 * longer applicable ON 2027-01-01 — that's the date the next rule's
 * effective_from starts). A row with effective_to null is open-ended and
 * matches any asOfDate on or after its effective_from.
 *
 * Returns null if no row covers asOfDate — never guesses, never falls
 * back to "closest" or "most recent."
 *
 * @param {object[]} rows - financial_rules rows for one scheme+rule_key
 * @param {string|Date} asOfDate
 * @param {{verifiedOnly?: boolean}} options - when true, only considers verification_status === 'verified' rows
 */
export function selectApplicableRule(rows, asOfDate, { verifiedOnly = false } = {}) {
  const asOf = toISODateString(asOfDate)
  const candidates = verifiedOnly ? rows.filter((r) => r.verification_status === 'verified') : rows

  const match = candidates.find((r) => {
    const from = toISODateString(r.effective_from)
    const to = r.effective_to ? toISODateString(r.effective_to) : null
    return asOf >= from && (to === null || asOf < to)
  })

  return match || null
}

async function fetchRuleRows(scheme, ruleKey) {
  const { supabase } = await import('./supabaseClient.js')
  const { data, error } = await supabase.from('financial_rules').select('*').eq('scheme', scheme).eq('rule_key', ruleKey)

  if (error) {
    // eslint-disable-next-line no-console
    console.error(error)
    return []
  }

  return data || []
}

/**
 * The rule applicable to asOfDate for (scheme, ruleKey), regardless of
 * verification_status. This is the one function every future PF/tax
 * calculation must use for "which rule applies right now" — never
 * `order by effective_from desc limit 1`, which would silently return
 * whichever row happens to be newest instead of the one actually correct
 * for the date in question.
 *
 * Returns null if no row covers that date, or the query itself failed —
 * callers must handle "no rule" as a real, expected case, not an error
 * to paper over with a guessed number.
 *
 * @param {string} scheme
 * @param {string} ruleKey
 * @param {string|Date} asOfDate
 */
export async function getActiveRule(scheme, ruleKey, asOfDate) {
  const rows = await fetchRuleRows(scheme, ruleKey)
  return selectApplicableRule(rows, asOfDate, { verifiedOnly: false })
}

/**
 * Same as getActiveRule(), additionally requiring verification_status
 * === 'verified'. A needs_review rule must never be usable in an actual
 * calculation — only getActiveRule() (or a future admin flow) should
 * ever see one. Any real PF/tax/salary math should call this function,
 * not getActiveRule(), and must handle a null return (no verified rule
 * exists yet for this date) gracefully rather than assuming one always
 * will.
 *
 * @param {string} scheme
 * @param {string} ruleKey
 * @param {string|Date} asOfDate
 */
export async function getVerifiedRule(scheme, ruleKey, asOfDate) {
  const rows = await fetchRuleRows(scheme, ruleKey)
  return selectApplicableRule(rows, asOfDate, { verifiedOnly: true })
}
