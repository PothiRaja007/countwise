// P6 (Money Inbox command layer) — SHORT-LIVED CONTEXT: remembering one goal.
//
// So that "add 2000 to it" can mean the goal the user used a moment ago. Goals only
// (decision 6), ten minutes only. This module only describes what is remembered and
// how a reference is resolved; the one place that holds the memory is lib/commandSession.js.
//
//   rememberGoal(memory, goal, userId, now)               → a new memory
//   recallGoal(memory, userId, now)                       → { id, name } | null
//   applyReferenceMemory(result, memory, goals, userId, now) → a new result
//
// THE RULES IT KEEPS (decision A6, memory only):
//   - "it", "that goal" and "the same one" are resolved ONLY from a remembered goal that
//     is fresh (under ten minutes) and still exists among the user's own goals.
//   - With no fresh memory the question stays exactly as the interpreter left it. There is
//     no fallback to "the only goal": one goal and no memory still asks.
//   - A goal the user typed, a vague "my goal", a category, an account and a learning item
//     are never touched, and nothing is ever guessed between two goals.
//   - The resolved goal enters through P1's own resolveFields, as a goal matched from the
//     user's own list, with a plain note saying why it was used.
//
// PURE. Imports only its sibling modules. No database, no screen code, no clock
// (`now` is passed in), no randomness. Results are deeply frozen and inputs are never changed.

import { getContract, allowedFields, deepFreeze } from './intents.js'
import { resolveFields } from './pendingAction.js'

export class ContextError extends Error {
  constructor(code, message) {
    super(message)
    this.name = 'ContextError'
    this.code = code
  }
}
const fail = (code, message) => { throw new ContextError(code, message) }

export const MEMORY_TTL_MS = 10 * 60 * 1000 // decision 6: ten minutes

/**
 * The note the interpreter adds when the user said "it" or "that" and nothing says which
 * goal. It tells a reference apart from a vague "my goal"; a test pins it to the
 * interpreter's real output so the two cannot drift apart.
 */
export const REFERENCE_NOTE = 'There is nothing to say which one “it” or “that” means yet.'
const REFERENCE_ASK = 'goal_reference_unresolved'

// ---------- the words (pinned by tests) ----------
export const CONTEXT_MESSAGES = deepFreeze({
  remembered: (name) => `Using your ${name} goal, the one you used a moment ago.`,
})

function requireNow(now) {
  if (typeof now !== 'number' || !Number.isFinite(now)) fail('now_required', 'A numeric `now` (milliseconds) must be passed in; this module never reads the clock.')
}
const isText = (v) => typeof v === 'string' && v.trim() !== ''

// ---------- the memory ----------
/** Remember one goal for ten minutes. It replaces whatever was remembered before. */
export function rememberGoal(memory, goal, userId, now) {
  requireNow(now)
  if (!isText(userId)) fail('user_required', 'A user id is required')
  if (!goal || typeof goal !== 'object' || (!isText(goal.id) && !Number.isFinite(goal.id)) || !isText(goal.name)) fail('invalid_goal', 'A goal needs an id and a name')
  return deepFreeze({ goal: { id: String(goal.id), name: goal.name }, userId, at: now })
}

/** The remembered goal, or null when there is none, it is for someone else, or it is ten minutes old or more. */
export function recallGoal(memory, userId, now) {
  requireNow(now)
  if (!memory || typeof memory !== 'object' || !memory.goal || !isText(userId) || memory.userId !== userId) return null
  const age = now - memory.at
  if (!(age >= 0 && age < MEMORY_TTL_MS)) return null
  return deepFreeze({ id: memory.goal.id, name: memory.goal.name })
}

// ---------- resolving "it" ----------
/**
 * If the interpreter could not say which goal "it" or "that" meant, and a fresh remembered
 * goal still exists, fill the goal in. Otherwise return the result untouched.
 * `goals` is the user's own current, non-archived goals ({ id, name }).
 */
export function applyReferenceMemory(result, memory, goals, userId, now) {
  requireNow(now)
  const same = result
  if (!result || typeof result !== 'object' || !result.pending || !Array.isArray(result.asks) || !Array.isArray(result.notes)) return same
  const pending = result.pending
  let contract
  try { contract = getContract(pending.intent) } catch { return same }
  if (!allowedFields(contract).includes('goal') || pending.fields.goal) return same
  if (!result.asks.includes(REFERENCE_ASK) || !result.notes.includes(REFERENCE_NOTE)) return same

  const remembered = recallGoal(memory, userId, now)
  if (!remembered || !Array.isArray(goals)) return same
  const current = goals.find((g) => g && String(g.id) === remembered.id && isText(g.name))
  if (!current) return same

  const note = CONTEXT_MESSAGES.remembered(current.name)
  const kind = contract.becomes === 'none' ? 'actual' : contract.becomes
  let resolved
  try {
    resolved = resolveFields(pending, { goal: { value: { id: String(current.id), name: current.name }, kind, origin: 'matched', note } }, now)
  } catch { return same }
  return deepFreeze({
    ...result,
    pending: resolved,
    asks: result.asks.filter((a) => a !== REFERENCE_ASK),
    notes: [...result.notes.filter((n) => n !== REFERENCE_NOTE), note],
  })
}
