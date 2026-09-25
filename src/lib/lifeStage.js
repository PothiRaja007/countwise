// Pure decision-logic functions for CountWise's life-stage architecture
// (Phase 23.1) — no Supabase calls inside, same pattern as every other
// engine/helper file in this project. These are the only two questions
// this subphase answers: "should the WORK section be visible at all" and
// "does this specific user need to be interrupted with the subtype
// prompt right now." Nothing about onboarding UI, Settings UI, or
// navigation wiring lives here — those are later subphases.

const VALID_INCOME_TYPES_FOR_WORK = new Set(['employed', 'mixed'])
const VALID_EMPLOYEE_SUBTYPES = new Set(['fresher', 'already_working'])

/**
 * Should the WORK section (navigation, employee-related pages) be shown
 * to this user at all?
 *
 * true for 'employed' and 'mixed'. false for 'student', and false — not
 * a thrown error — for null, undefined, or any unrecognized value. A
 * future income_type this function doesn't know about should never
 * silently unlock WORK; the safe default is to keep it hidden.
 *
 * @param {string|null|undefined} incomeType
 * @returns {boolean}
 */
export function shouldShowWorkSection(incomeType) {
  return VALID_INCOME_TYPES_FOR_WORK.has(incomeType)
}

/**
 * Should this user be interrupted right now with the "are you a fresher
 * or already working?" prompt?
 *
 * true only when incomeType is exactly 'employed' and employeeSubtype is
 * null/undefined. This is deliberately narrower than
 * shouldShowWorkSection() above — it answers "should we force this
 * choice on the user," not "is employee_subtype relevant to them at
 * all." Those are different questions on purpose.
 *
 * Locked rule: 'mixed' NEVER returns true here, even with a null
 * employeeSubtype. A mixed-income user is employee-eligible (per
 * shouldShowWorkSection) but is never forced or interrupted with this
 * prompt — subtype is, at most, something they can optionally set later
 * (a Settings-path concern for a later subphase, not this function).
 * Don't "fix" this to also cover 'mixed' without re-reading that rule —
 * it was deliberate, not an oversight.
 *
 * @param {string|null|undefined} incomeType
 * @param {string|null|undefined} employeeSubtype
 * @returns {boolean}
 */
export function needsEmployeeSubtypePrompt(incomeType, employeeSubtype) {
  return incomeType === 'employed' && (employeeSubtype === null || employeeSubtype === undefined)
}

/**
 * Is this a valid value for profiles.employee_subtype? Useful for
 * anything that writes this column later (Subphase 23.2 onboarding,
 * 23.3 Settings) — validate client-side with the same rule the database
 * check constraint enforces, rather than relying on a failed write to
 * catch a bad value.
 *
 * @param {*} value
 * @returns {boolean}
 */
export function isValidEmployeeSubtype(value) {
  return VALID_EMPLOYEE_SUBTYPES.has(value)
}
