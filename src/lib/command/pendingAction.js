// P1 (Money Inbox command layer) — the PENDING ACTION and the CLARIFICATION.
//
// A pending action describes something the user seems to want. It is NOT the
// thing itself. Parsing an action never equals executing it: there is no status
// here that means "saved" or "done", because this layer cannot save anything. Only
// the owning feature, through its own dialog and its own rules, confirms and writes.
//
// PURE: no database, no React, no router. NO CLOCK and NO RANDOMNESS: every
// function that needs the time takes `now` (milliseconds) as an argument, and the
// caller supplies the action's `id`. Every function returns a NEW, deeply frozen
// object and never changes its input.
import {
  getContract, allowedFields, deepFreeze, FIELD_KINDS, FIELD_ORIGINS, CLARIFY_REASONS, HANDOFF_FLOWS, CONTRACTS,
} from './intents.js'

export const PENDING_ACTION_TTL_MS = 5 * 60 * 1000 // decision (approval 4): 5 minutes
export const STATUSES = deepFreeze(['needs_input', 'ready', 'handed_off', 'cancelled', 'expired'])
const TERMINAL = ['handed_off', 'cancelled', 'expired']
export const isTerminal = (status) => TERMINAL.includes(status)

export class PendingActionError extends Error {
  constructor(code, message) {
    super(message)
    this.name = 'PendingActionError'
    this.code = code
  }
}
const fail = (code, message) => { throw new PendingActionError(code, message) }

function requireNow(now) {
  if (typeof now !== 'number' || !Number.isFinite(now)) fail('now_required', 'A numeric `now` (milliseconds) must be passed in; this module never reads the clock.')
}

// ---------- fields ----------
const FIELD_KEYS = ['value', 'kind', 'origin', 'note', 'confidence']
const ENGINE_ONLY_KINDS = ['calculated', 'estimated', 'suggested']

function emptyValue(value) {
  if (value === undefined || value === null || value === '') return true
  if (typeof value === 'number' && !Number.isFinite(value)) return true
  if (Array.isArray(value) && value.length === 0) return true
  return false
}

/** Validate one field against the contract and return a clean, independent copy. */
function normalizeField(contract, name, field) {
  if (!allowedFields(contract).includes(name)) fail('unknown_field', `"${name}" is not a field of ${contract.id}`)
  if (!field || typeof field !== 'object' || Array.isArray(field)) fail('invalid_field', `Field "${name}" must be an object`)
  for (const key of Object.keys(field)) if (!FIELD_KEYS.includes(key)) fail('invalid_field', `Field "${name}" has an unknown key "${key}"`)
  const { value, kind, origin, note, confidence } = field
  if (emptyValue(value)) fail('empty_value', `Field "${name}" has no value (leave it out instead)`)
  if (!FIELD_KINDS.includes(kind)) fail('bad_kind', `Field "${name}": "${kind}" is not a state`)
  if (!FIELD_ORIGINS.includes(origin)) fail('bad_origin', `Field "${name}": "${origin}" is not an origin`)
  // Rule 1: what the user typed is either a record or a plan, never a calculation.
  if (origin === 'typed' && !['actual', 'planned'].includes(kind)) fail('typed_kind', `Field "${name}": a typed value can only be actual or planned, not ${kind}`)
  // Rule 2: only an existing engine may produce a calculated, estimated or suggested value.
  if (ENGINE_ONLY_KINDS.includes(kind) && origin !== 'engine') fail('engine_only_kind', `Field "${name}": a ${kind} value must come from an existing engine, not "${origin}"`)
  // Rule 3: only fields the contract names may be estimated or suggested.
  if (kind === 'estimated' && !contract.mayBeEstimated.includes(name)) fail('estimate_not_allowed', `${contract.id}.${name} may not be estimated`)
  if (kind === 'suggested' && !contract.mayBeSuggested.includes(name)) fail('suggestion_not_allowed', `${contract.id}.${name} may not be suggested`)
  // Rule 4: a default must say, in plain words, what was assumed.
  if (origin === 'default' && !(typeof note === 'string' && note.trim())) fail('default_needs_note', `Field "${name}" uses a default, so it needs a note saying what was assumed`)
  if (note !== undefined && typeof note !== 'string') fail('invalid_field', `Field "${name}": note must be text`)
  if (confidence !== undefined && !['certain', 'uncertain'].includes(confidence)) fail('bad_confidence', `Field "${name}": confidence must be certain or uncertain`)
  const clean = { value: structuredClone(value), kind, origin }
  if (note !== undefined) clean.note = note
  if (confidence !== undefined) clean.confidence = confidence
  return clean
}

function normalizeFields(contract, fields) {
  if (fields === undefined) return {}
  if (!fields || typeof fields !== 'object' || Array.isArray(fields)) fail('invalid_field', '`fields` must be an object')
  return Object.fromEntries(Object.entries(fields).map(([name, field]) => [name, normalizeField(contract, name, field)]))
}

function normalizeAmbiguities(contract, list, fields) {
  if (list === undefined) return []
  if (!Array.isArray(list)) fail('invalid_ambiguity', '`ambiguities` must be a list')
  const seen = new Set()
  return list.map((a) => {
    if (!a || typeof a.field !== 'string' || !allowedFields(contract).includes(a.field)) fail('invalid_ambiguity', `An ambiguity must name a field of ${contract.id}`)
    if (a.field in fields) fail('ambiguous_field_has_value', `"${a.field}" cannot have a value and still be ambiguous`)
    if (seen.has(a.field)) fail('invalid_ambiguity', `"${a.field}" is listed twice`)
    seen.add(a.field)
    if (!Array.isArray(a.options) || a.options.length < 2) fail('invalid_ambiguity', `"${a.field}" needs at least two options`)
    const ids = new Set()
    const options = a.options.map((o) => {
      if (!o || typeof o.id !== 'string' || !o.id || typeof o.label !== 'string' || !o.label.trim()) fail('invalid_ambiguity', `Every option of "${a.field}" needs an id and a label`)
      if (ids.has(o.id)) fail('invalid_ambiguity', `Option ids of "${a.field}" must be unique`)
      ids.add(o.id)
      return { id: o.id, label: o.label }
    })
    return { field: a.field, options }
  })
}

/** What is still missing, and the resulting status. */
function derive(contract, fields, ambiguities) {
  const ambiguous = new Set(ambiguities.map((a) => a.field))
  const missing = contract.required.filter((f) => !(f in fields) && !ambiguous.has(f))
  for (const group of contract.requireOneOf) {
    const present = group.filter((f) => f in fields)
    if (present.length > 1) fail('conflicting_fields', `Only one of ${group.join(' / ')} may be given`)
    if (present.length === 0 && !group.some((f) => ambiguous.has(f))) missing.push(group.join('|'))
  }
  const uncertain = Object.values(fields).some((f) => f.confidence === 'uncertain')
  const status = missing.length === 0 && ambiguities.length === 0 && !uncertain ? 'ready' : 'needs_input'
  return { missing, status }
}

const build = (action) => deepFreeze({
  id: action.id, intent: action.intent, source: action.source,
  createdAt: action.createdAt, expiresAt: action.expiresAt,
  status: action.status, becomes: action.becomes,
  fields: action.fields, missing: action.missing, ambiguities: action.ambiguities,
})

// ---------- the pending action ----------
const INPUT_KEYS = ['id', 'intent', 'source', 'fields', 'ambiguities']

export function createPendingAction(input, now) {
  requireNow(now)
  if (!input || typeof input !== 'object' || Array.isArray(input)) fail('invalid_input', 'createPendingAction needs an object')
  for (const key of Object.keys(input)) {
    if (['becomes', 'status', 'missing', 'createdAt', 'expiresAt'].includes(key)) fail(`caller_set_${key}`, `\`${key}\` comes from the contract and the functions; the caller cannot set it`)
    if (!INPUT_KEYS.includes(key)) fail('unknown_input_key', `Unknown input "${key}"`)
  }
  if (typeof input.id !== 'string' || !input.id.trim()) fail('invalid_input', 'An id is required (the caller supplies it)')
  if (typeof input.source !== 'string' || !input.source.trim()) fail('invalid_input', 'The typed text (`source`) is required')
  if (!CONTRACTS[input.intent]) fail('unknown_intent', `Unknown intent: ${input.intent}`)
  const contract = getContract(input.intent)
  const fields = normalizeFields(contract, input.fields)
  const ambiguities = normalizeAmbiguities(contract, input.ambiguities, fields)
  const { missing, status } = derive(contract, fields, ambiguities)
  return build({
    id: input.id, intent: contract.id, source: input.source,
    createdAt: now, expiresAt: now + PENDING_ACTION_TTL_MS,
    status, becomes: contract.becomes, fields, missing, ambiguities,
  })
}

/** The status as of `now`: a non-final action past its expiry is expired. */
export function statusAt(action, now) {
  requireNow(now)
  if (isTerminal(action.status)) return action.status
  return now >= action.expiresAt ? 'expired' : action.status
}

function assertActive(action, now) {
  const effective = statusAt(action, now)
  if (effective === 'expired') fail('expired', 'This action has expired')
  if (isTerminal(effective)) fail('terminal', `This action is already ${effective}`)
}

/** Add or replace fields (for example after the user picks one of the options). */
export function resolveFields(action, patch, now) {
  requireNow(now)
  assertActive(action, now)
  const contract = getContract(action.intent)
  const merged = { ...action.fields, ...normalizeFields(contract, patch) }
  const ambiguities = action.ambiguities.filter((a) => !(a.field in merged))
  const { missing, status } = derive(contract, merged, ambiguities)
  return build({ ...action, fields: merged, ambiguities, missing, status })
}

/** Mark that the owning feature has been given the action. Only a READY action, and only where there is an owner to give it to. */
export function markHandedOff(action, now) {
  requireNow(now)
  assertActive(action, now)
  const contract = getContract(action.intent)
  if (action.status !== 'ready') fail('not_ready', 'Only a ready action can be handed off')
  if (!HANDOFF_FLOWS.includes(contract.flow)) fail('not_hand_off', `${contract.id} is not handed to another page (${contract.flow})`)
  return build({ ...action, status: 'handed_off' })
}

/** Cancel. Cancelling an already-cancelled action changes nothing; a handed-off or expired action cannot be cancelled. */
export function cancelPendingAction(action, now) {
  requireNow(now)
  if (action.status === 'cancelled') return build({ ...action })
  assertActive(action, now)
  return build({ ...action, status: 'cancelled' })
}

// ---------- the clarification ----------
// The "what did you mean?" answer. It is not a pending action: it asks, and
// choosing one of its choices starts a pending action. Cancel is ALWAYS present.
export const CANCEL_CHOICE_ID = 'cancel'

export function createClarification(input, now) {
  requireNow(now)
  if (!input || typeof input !== 'object' || Array.isArray(input)) fail('invalid_clarification', 'createClarification needs an object')
  for (const key of Object.keys(input)) if (!['reason', 'source', 'choices'].includes(key)) fail('invalid_clarification', `Unknown input "${key}"`)
  if (!CLARIFY_REASONS.includes(input.reason)) fail('invalid_clarification', `"${input.reason}" is not a clarification reason`)
  if (typeof input.source !== 'string' || !input.source.trim()) fail('invalid_clarification', 'The typed text (`source`) is required')
  if (!Array.isArray(input.choices) || input.choices.length < 1 || input.choices.length > 4) fail('invalid_clarification', 'A clarification needs 1 to 4 choices (Cancel is added automatically)')
  const ids = new Set()
  const choices = input.choices.map((c) => {
    if (!c || typeof c.id !== 'string' || !c.id.trim() || typeof c.label !== 'string' || !c.label.trim()) fail('invalid_clarification', 'Every choice needs an id and a label')
    if (c.id === CANCEL_CHOICE_ID) fail('invalid_clarification', '"cancel" is reserved; Cancel is added automatically')
    if (ids.has(c.id)) fail('invalid_clarification', 'Choice ids must be unique')
    ids.add(c.id)
    if (c.intent !== undefined && !CONTRACTS[c.intent]) fail('invalid_clarification', `Choice "${c.id}" names an unknown intent`)
    return c.intent === undefined ? { id: c.id, label: c.label } : { id: c.id, label: c.label, intent: c.intent }
  })
  // Mixed input (decision 5): the user is asked to do one thing at a time, so the only choice is to edit the message.
  if (input.reason === 'mixed_input' && !(choices.length === 1 && choices[0].id === 'edit')) fail('invalid_clarification', 'A mixed_input clarification offers exactly one choice, "edit", plus Cancel')
  return deepFreeze({
    kind: 'clarify', reason: input.reason, source: input.source,
    createdAt: now, expiresAt: now + PENDING_ACTION_TTL_MS,
    choices: [...choices, { id: CANCEL_CHOICE_ID, label: 'Cancel' }],
  })
}

export function isClarificationExpired(clarification, now) {
  requireNow(now)
  return now >= clarification.expiresAt
}
