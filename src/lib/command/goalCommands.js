// P7 (Money Inbox command layer) — GOAL COMMANDS on the Money Inbox side.
//
// Two commands are real from P7: "create a goal" and "add money to a goal". Money Inbox
// only UNDERSTANDS them and hands them over; the Goals page confirms and writes.
// This module extends the P4 panel for those two commands and decides what its buttons do:
//
//   goalCommandView(baseView, result, goals, now)  → the panel view, extended (or baseView untouched)
//   resolveGoalCommandChoice(result, choiceId, goals, now)
//        → { action: 'hand_off', pending } | { action: 'pick_goal', result }
//        | { action: 'expired' | 'unavailable' | 'unknown', message? } | { action: 'pass' }
//   choiceNotice(choiceId, goals)                  → the "how to say it" line, or null
//
// THE RULES IT KEEPS:
//   - Only CREATE_GOAL and MODIFY_GOAL_CONTRIBUTE results are touched. Everything else gets
//     its base view back, so questions, page requests and the other owners cannot change.
//   - "Continue in Goals" is offered only for a READY, built, unexpired goal command. A
//     command with something missing or unclear never gets it.
//   - Goals are offered as buttons only from the user's own ACTIVE goals, at most five,
//     and only as a choice for the user to make. A pick that was not offered is refused.
//   - Nothing is saved here. Hand-off is only a description of what to put in front of the
//     user on the Goals page, which confirms it with its own dialog and its own rules.
//
// PURE. Imports only its sibling modules. No database, no screen code, no clock
// (`now` is passed in), no randomness. Results are deeply frozen and inputs are never changed.

import { getContract, isIntentAvailable, deepFreeze } from './intents.js'
import { statusAt, resolveFields } from './pendingAction.js'
import { REFERENCE_NOTE } from './commandContext.js'

export const GOAL_COMMAND_INTENTS = deepFreeze(['CREATE_GOAL', 'MODIFY_GOAL_CONTRIBUTE'])
export const MAX_PICK_BUTTONS = 5

// ---------- the words (pinned by tests) ----------
export const GOAL_COMMAND_MESSAGES = deepFreeze({
  continueLabel: 'Continue in Goals',
  footerReady: "Nothing is saved yet. You'll confirm it in Goals.",
  footerPick: "Pick the goal, then you'll confirm in Goals. Nothing is saved yet.",
  expired: 'That timed out. Please send your message again.',
  unavailable: "That isn't available from Money Inbox yet. Nothing was saved.",
  createExample: 'Tell me the details in one line, for example: Create a goal called Laptop for ₹50,000.',
  addExample: (name) => `Tell me how much, for example: Add ₹2,000 to my ${name} goal.`,
  chose: (name) => `You chose ${name}.`,
})

const CONTINUE_ID = 'continue_goals'
const PICK_PREFIX = 'pick_goal_'
const GOAL_ASKS = ['goal_ambiguous', 'goal_reference_unresolved']

function requireNow(now) {
  if (typeof now !== 'number' || !Number.isFinite(now)) throw new TypeError('A numeric `now` (milliseconds) must be passed in; this module never reads the clock.')
}

/** A goal command result from the interpreter (not a question, a page request or a clarification). */
export function isGoalCommand(result) {
  return !!result && typeof result === 'object' && result.kind === 'command' && !!result.pending
    && GOAL_COMMAND_INTENTS.includes(result.pending.intent)
    && Array.isArray(result.asks) && Array.isArray(result.notes)
}

/** Ready to be handed to the Goals page: built, complete, nothing left to ask, and not timed out. */
export function isReadyGoalCommand(result, now) {
  requireNow(now)
  if (!isGoalCommand(result)) return false
  const p = result.pending
  return isIntentAvailable(p.intent)
    && result.asks.length === 0 && p.ambiguities.length === 0 && p.missing.length === 0
    && statusAt(p, now) === 'ready'
}

const activeList = (goals) => (Array.isArray(goals) ? goals : [])
  .filter((g) => g && g.id != null && typeof g.name === 'string' && g.name.trim())
  .map((g) => ({ id: String(g.id), name: g.name }))

/**
 * The goals the user may pick from, for a contribution that has no goal yet. They come from the
 * interpreter's own list when it had one, otherwise from the user's goals; only active goals,
 * and never more than five (more than that is a list to read on the Goals page, not to guess from).
 */
function pickOptions(result, goals) {
  const p = result.pending
  if (p.intent !== 'MODIFY_GOAL_CONTRIBUTE' || p.fields.goal) return []
  const active = new Map(activeList(goals).map((g) => [g.id, g]))
  const ambiguity = p.ambiguities.find((a) => a.field === 'goal')
  let ids
  if (ambiguity) ids = ambiguity.options.map((o) => String(o.id))
  else if (p.missing.includes('goal')) ids = [...active.keys()]
  else return []
  const options = ids.filter((id) => active.has(id)).map((id) => active.get(id))
  return options.length >= 1 && options.length <= MAX_PICK_BUTTONS ? options : []
}

/** The panel for a goal command. Anything that is not a goal command gets its base view back unchanged. */
export function goalCommandView(baseView, result, goals, now) {
  requireNow(now)
  if (!baseView || !isGoalCommand(result)) return baseView
  const keep = baseView.choices.filter((c) => c.id === 'edit' || c.id === 'cancel')
  if (isReadyGoalCommand(result, now)) {
    return deepFreeze({
      ...baseView,
      choices: [{ id: CONTINUE_ID, label: GOAL_COMMAND_MESSAGES.continueLabel }, ...keep],
      footer: GOAL_COMMAND_MESSAGES.footerReady,
    })
  }
  const options = isIntentAvailable(result.pending.intent) && statusAt(result.pending, now) !== 'expired' ? pickOptions(result, goals) : []
  if (options.length) {
    return deepFreeze({
      ...baseView,
      choices: [...options.map((g) => ({ id: `${PICK_PREFIX}${g.id}`, label: g.name })), ...keep],
      footer: GOAL_COMMAND_MESSAGES.footerPick,
    })
  }
  return baseView
}

/** What a pressed button of a goal command does. 'pass' means it is not ours (Edit, Cancel, or not a goal command). */
export function resolveGoalCommandChoice(result, choiceId, goals, now) {
  requireNow(now)
  if (!isGoalCommand(result) || choiceId === 'edit' || choiceId === 'cancel') return deepFreeze({ action: 'pass' })
  const isContinue = choiceId === CONTINUE_ID
  const isPick = typeof choiceId === 'string' && choiceId.startsWith(PICK_PREFIX)
  if (!isContinue && !isPick) return deepFreeze({ action: 'unknown' })
  const p = result.pending
  if (!isIntentAvailable(p.intent)) return deepFreeze({ action: 'unavailable', message: GOAL_COMMAND_MESSAGES.unavailable })
  if (statusAt(p, now) === 'expired') return deepFreeze({ action: 'expired', message: GOAL_COMMAND_MESSAGES.expired })

  if (isContinue) {
    return isReadyGoalCommand(result, now) ? deepFreeze({ action: 'hand_off', pending: p }) : deepFreeze({ action: 'unknown' })
  }

  const picked = pickOptions(result, goals).find((g) => `${PICK_PREFIX}${g.id}` === choiceId)
  if (!picked) return deepFreeze({ action: 'unknown' })
  const contract = getContract(p.intent)
  const note = GOAL_COMMAND_MESSAGES.chose(picked.name)
  const kind = contract.becomes === 'none' ? 'actual' : contract.becomes
  let resolved
  try {
    resolved = resolveFields(p, { goal: { value: { id: picked.id, name: picked.name }, kind, origin: 'matched', note } }, now)
  } catch {
    return deepFreeze({ action: 'unknown' })
  }
  return deepFreeze({
    action: 'pick_goal',
    result: {
      ...result,
      pending: resolved,
      asks: result.asks.filter((a) => !GOAL_ASKS.includes(a)),
      notes: [...result.notes.filter((n) => n !== REFERENCE_NOTE), note],
    },
  })
}

/**
 * The clarification buttons "Create a goal" and "Add money to <goal>" carry no details, so
 * nothing can be handed over. This is the one line that tells the user how to say it.
 */
export function choiceNotice(choiceId, goals) {
  if (typeof choiceId !== 'string') return null
  if (choiceId === 'create_goal') return GOAL_COMMAND_MESSAGES.createExample
  const m = /^goal_add_(.+)$/.exec(choiceId)
  if (!m) return null
  const goal = activeList(goals).find((g) => g.id === m[1])
  return goal ? GOAL_COMMAND_MESSAGES.addExample(goal.name) : null
}
