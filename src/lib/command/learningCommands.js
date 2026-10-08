// P8 (Money Inbox command layer) — LEARNING COMMANDS on the Money Inbox side.
//
// Two commands are real from P8: "add a learning item" and "change a learning item's status".
// Money Inbox only UNDERSTANDS them and hands them over; the Learning page confirms and writes.
// This module extends the P4 panel for those two commands and decides what its buttons do:
//
//   learningCommandView(baseView, result, items, now)  → the panel view, extended (or baseView untouched)
//   resolveLearningCommandChoice(result, choiceId, items, now)
//        → { action: 'hand_off', pending } | { action: 'pick_item', result }
//        | { action: 'expired' | 'unavailable' | 'unknown', message? } | { action: 'pass' }
//   learningChoiceNotice(choiceId, items)              → the "how to say it" line, or null
//
// THE RULES IT KEEPS:
//   - Only CREATE_LEARNING_ITEM and MODIFY_LEARNING_STATUS results are touched. Everything else gets
//     its base view back, so questions, page requests and the other owners cannot change.
//   - "Continue in Learning" is offered only for a READY, built, unexpired learning command.
//   - Items are offered as buttons only from the user's own list, only when the new status is known,
//     only items that status can actually be applied to, at most five, and only when the buttons can be
//     told apart. A pick that was not offered is refused.
//   - Nothing is saved here. Hand-off is only a description of what to put in front of the user on the
//     Learning page, which confirms it with its own form and its own rules.
//
// PURE. Imports only its sibling modules. No database, no screen code, no clock
// (`now` is passed in), no randomness. Results are deeply frozen and inputs are never changed.

import { getContract, isIntentAvailable, deepFreeze } from './intents.js'
import { statusAt, resolveFields } from './pendingAction.js'
import { canChangeStatus, STATUS_LABELS } from './learningDialog.js'

export const LEARNING_COMMAND_INTENTS = deepFreeze(['CREATE_LEARNING_ITEM', 'MODIFY_LEARNING_STATUS'])
export const MAX_PICK_BUTTONS = 5

// ---------- the words (pinned by tests) ----------
export const LEARNING_COMMAND_MESSAGES = deepFreeze({
  continueLabel: 'Continue in Learning',
  footerReady: "Nothing is saved yet. You'll confirm it in Learning.",
  footerPick: "Pick the item, then you'll confirm in Learning. Nothing is saved yet.",
  expired: 'That timed out. Please send your message again.',
  unavailable: "That isn't available from Money Inbox yet. Nothing was saved.",
  createExample: 'Tell me the details in one line, for example: Add Power BI certification to my learning.',
  statusExample: (name) => `Tell me the new status, for example: Mark my ${name} as completed.`,
  chose: (name) => `You chose ${name}.`,
})

const CONTINUE_ID = 'continue_learning'
const PICK_PREFIX = 'pick_learning_'
const ITEM_ASKS = ['item_ambiguous', 'item_not_found']

function requireNow(now) {
  if (typeof now !== 'number' || !Number.isFinite(now)) throw new TypeError('A numeric `now` (milliseconds) must be passed in; this module never reads the clock.')
}

/** A learning command result from the interpreter (not a question, a page request or a clarification). */
export function isLearningCommand(result) {
  return !!result && typeof result === 'object' && result.kind === 'command' && !!result.pending
    && LEARNING_COMMAND_INTENTS.includes(result.pending.intent)
    && Array.isArray(result.asks) && Array.isArray(result.notes)
}

/** Ready to be handed to the Learning page: built, complete, nothing left to ask, and not timed out. */
export function isReadyLearningCommand(result, now) {
  requireNow(now)
  if (!isLearningCommand(result)) return false
  const p = result.pending
  return isIntentAvailable(p.intent)
    && result.asks.length === 0 && p.ambiguities.length === 0 && p.missing.length === 0
    && statusAt(p, now) === 'ready'
}

const itemList = (items) => (Array.isArray(items) ? items : [])
  .filter((i) => i && i.id != null && typeof i.name === 'string' && i.name.trim())
  .map((i) => ({ id: String(i.id), name: i.name, status: typeof i.status === 'string' ? i.status : null }))

const labelOf = (i) => (i.status && STATUS_LABELS[i.status] ? `${i.name} · ${STATUS_LABELS[i.status]}` : i.name)

/**
 * The items the user may pick from, for a status change that has no item yet. They come from the
 * interpreter's own list when it had one, otherwise from the user's items. The new status must
 * already be known; items it cannot be applied to are left out; at most five; and none are offered
 * if two buttons would read the same (the user could not tell them apart).
 */
function pickOptions(result, items) {
  const p = result.pending
  if (p.intent !== 'MODIFY_LEARNING_STATUS' || p.fields.item) return []
  const target = p.fields.newStatus && p.fields.newStatus.value
  if (typeof target !== 'string') return []
  const known = new Map(itemList(items).map((i) => [i.id, i]))
  const ambiguity = p.ambiguities.find((a) => a.field === 'item')
  let ids
  if (ambiguity) ids = ambiguity.options.map((o) => String(o.id))
  else if (p.missing.includes('item')) ids = [...known.keys()]
  else return []
  const options = ids.filter((id) => known.has(id)).map((id) => known.get(id)).filter((i) => canChangeStatus(i.status, target).ok)
  if (options.length < 1 || options.length > MAX_PICK_BUTTONS) return []
  return new Set(options.map(labelOf)).size === options.length ? options : []
}

/** The panel for a learning command. Anything that is not a learning command gets its base view back unchanged. */
export function learningCommandView(baseView, result, items, now) {
  requireNow(now)
  if (!baseView || !isLearningCommand(result)) return baseView
  const keep = baseView.choices.filter((c) => c.id === 'edit' || c.id === 'cancel')
  if (isReadyLearningCommand(result, now)) {
    return deepFreeze({
      ...baseView,
      choices: [{ id: CONTINUE_ID, label: LEARNING_COMMAND_MESSAGES.continueLabel }, ...keep],
      footer: LEARNING_COMMAND_MESSAGES.footerReady,
    })
  }
  const options = isIntentAvailable(result.pending.intent) && statusAt(result.pending, now) !== 'expired' ? pickOptions(result, items) : []
  if (options.length) {
    return deepFreeze({
      ...baseView,
      choices: [...options.map((i) => ({ id: `${PICK_PREFIX}${i.id}`, label: labelOf(i) })), ...keep],
      footer: LEARNING_COMMAND_MESSAGES.footerPick,
    })
  }
  return baseView
}

/** What a pressed button of a learning command does. 'pass' means it is not ours (Edit, Cancel, or not a learning command). */
export function resolveLearningCommandChoice(result, choiceId, items, now) {
  requireNow(now)
  if (!isLearningCommand(result) || choiceId === 'edit' || choiceId === 'cancel') return deepFreeze({ action: 'pass' })
  const isContinue = choiceId === CONTINUE_ID
  const isPick = typeof choiceId === 'string' && choiceId.startsWith(PICK_PREFIX)
  if (!isContinue && !isPick) return deepFreeze({ action: 'unknown' })
  const p = result.pending
  if (!isIntentAvailable(p.intent)) return deepFreeze({ action: 'unavailable', message: LEARNING_COMMAND_MESSAGES.unavailable })
  if (statusAt(p, now) === 'expired') return deepFreeze({ action: 'expired', message: LEARNING_COMMAND_MESSAGES.expired })

  if (isContinue) {
    return isReadyLearningCommand(result, now) ? deepFreeze({ action: 'hand_off', pending: p }) : deepFreeze({ action: 'unknown' })
  }

  const picked = pickOptions(result, items).find((i) => `${PICK_PREFIX}${i.id}` === choiceId)
  if (!picked) return deepFreeze({ action: 'unknown' })
  const contract = getContract(p.intent)
  const note = LEARNING_COMMAND_MESSAGES.chose(picked.name)
  const kind = contract.becomes === 'none' ? 'actual' : contract.becomes
  let resolved
  try {
    resolved = resolveFields(p, { item: { value: { id: picked.id, name: picked.name }, kind, origin: 'matched', note } }, now)
  } catch {
    return deepFreeze({ action: 'unknown' })
  }
  return deepFreeze({
    action: 'pick_item',
    result: {
      ...result,
      pending: resolved,
      asks: result.asks.filter((a) => !ITEM_ASKS.includes(a)),
      notes: [...result.notes, note],
    },
  })
}

/**
 * The clarification buttons "Add a learning item" and "Change the status of <item>" carry no details,
 * so nothing can be handed over. This is the one line that tells the user how to say it.
 */
export function learningChoiceNotice(choiceId, items) {
  if (typeof choiceId !== 'string') return null
  if (choiceId === 'add_learning') return LEARNING_COMMAND_MESSAGES.createExample
  const m = /^learning_status_(.+)$/.exec(choiceId)
  if (!m) return null
  const item = itemList(items).find((i) => i.id === m[1])
  return item ? LEARNING_COMMAND_MESSAGES.statusExample(item.name) : null
}
