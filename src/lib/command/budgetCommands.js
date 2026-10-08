// P9 (Money Inbox command layer) — BUDGET COMMANDS on the Money Inbox side.
//
// Two commands are real from P9: "create a budget for a month" and "change a budget's amount".
// Money Inbox only UNDERSTANDS them and hands them over; the Budgets page confirms and writes.
// This module extends the P4 panel for those two commands and decides what its buttons do:
//
//   budgetCommandView(baseView, result, expenseCategories, now)  → the panel view, extended (or baseView untouched)
//   resolveBudgetCommandChoice(result, choiceId, expenseCategories, now)
//        → { action: 'hand_off', pending } | { action: 'pick_category', result }
//        | { action: 'expired' | 'unavailable' | 'unknown', message? } | { action: 'pass' }
//   budgetChoiceNotice(choiceId)                                  → the "how to say it" line, or null
//
// THE RULES IT KEEPS:
//   - Only CREATE_BUDGET_MONTH and MODIFY_BUDGET_AMOUNT results are touched. Everything else gets its
//     base view back, so questions, page requests and the other owners cannot change.
//   - "Continue in Budgets" is offered only for a READY, built, unexpired budget command.
//   - A category is offered as a button only when the interpreter itself found several matches, only
//     SPENDING categories, only when the change (exact or relative) is already known, at most five, and
//     only when the buttons can be told apart. A pick that was not offered is refused.
//   - No amount is calculated and nothing is saved here. Whether the budget exists, and what a relative
//     change comes to, is decided by the Budgets page from its own rows.
//   - No budget memory (decision 6: memory is for goals only).
//
// PURE. Imports only its sibling modules. No database, no screen code, no clock
// (`now` is passed in), no randomness. Results are deeply frozen and inputs are never changed.

import { getContract, isIntentAvailable, deepFreeze } from './intents.js'
import { statusAt, resolveFields } from './pendingAction.js'

export const BUDGET_COMMAND_INTENTS = deepFreeze(['CREATE_BUDGET_MONTH', 'MODIFY_BUDGET_AMOUNT'])
export const MAX_PICK_BUTTONS = 5

// ---------- the words (pinned by tests) ----------
export const BUDGET_COMMAND_MESSAGES = deepFreeze({
  continueLabel: 'Continue in Budgets',
  footerReady: "Nothing is saved yet. You'll confirm it in Budgets.",
  footerPick: "Pick the category, then you'll confirm in Budgets. Nothing is saved yet.",
  expired: 'That timed out. Please send your message again.',
  unavailable: "That isn't available from Money Inbox yet. Nothing was saved.",
  createExample: "Tell me the month, for example: Create next month's budget.",
  setExample: 'Tell me how much, for example: Set my food budget to ₹5,000.',
  chose: (name) => `You chose ${name}.`,
})

const CONTINUE_ID = 'continue_budgets'
const PICK_PREFIX = 'pick_budget_'
const CATEGORY_ASKS = ['category_ambiguous', 'category_unknown']

function requireNow(now) {
  if (typeof now !== 'number' || !Number.isFinite(now)) throw new TypeError('A numeric `now` (milliseconds) must be passed in; this module never reads the clock.')
}

/** A budget command result from the interpreter (not a question, a page request or a clarification). */
export function isBudgetCommand(result) {
  return !!result && typeof result === 'object' && result.kind === 'command' && !!result.pending
    && BUDGET_COMMAND_INTENTS.includes(result.pending.intent)
    && Array.isArray(result.asks) && Array.isArray(result.notes)
}

/** Ready to be handed to the Budgets page: built, complete, nothing left to ask, and not timed out. */
export function isReadyBudgetCommand(result, now) {
  requireNow(now)
  if (!isBudgetCommand(result)) return false
  const p = result.pending
  return isIntentAvailable(p.intent)
    && result.asks.length === 0 && p.ambiguities.length === 0 && p.missing.length === 0
    && statusAt(p, now) === 'ready'
}

const categoryList = (rows) => (Array.isArray(rows) ? rows : [])
  .filter((c) => c && c.id != null && typeof c.name === 'string' && c.name.trim())
  .map((c) => ({ id: String(c.id), name: c.name }))

/**
 * The categories the user may pick from, for a change that has no category yet. They come from the
 * interpreter's own ambiguity list, limited to spending categories. The change must already be known;
 * at most five; and none are offered if two buttons would read the same.
 */
function pickOptions(result, expenseCategories) {
  const p = result.pending
  if (p.intent !== 'MODIFY_BUDGET_AMOUNT' || p.fields.category) return []
  if (!p.fields.newAmount && !p.fields.relativeChange) return []
  const ambiguity = p.ambiguities.find((a) => a.field === 'category')
  if (!ambiguity) return []
  const known = new Map(categoryList(expenseCategories).map((c) => [c.id, c]))
  const options = ambiguity.options.map((o) => String(o.id)).filter((id) => known.has(id)).map((id) => known.get(id))
  if (options.length < 1 || options.length > MAX_PICK_BUTTONS) return []
  return new Set(options.map((c) => c.name)).size === options.length ? options : []
}

/** The panel for a budget command. Anything that is not a budget command gets its base view back unchanged. */
export function budgetCommandView(baseView, result, expenseCategories, now) {
  requireNow(now)
  if (!baseView || !isBudgetCommand(result)) return baseView
  const keep = baseView.choices.filter((c) => c.id === 'edit' || c.id === 'cancel')
  if (isReadyBudgetCommand(result, now)) {
    return deepFreeze({
      ...baseView,
      choices: [{ id: CONTINUE_ID, label: BUDGET_COMMAND_MESSAGES.continueLabel }, ...keep],
      footer: BUDGET_COMMAND_MESSAGES.footerReady,
    })
  }
  const options = isIntentAvailable(result.pending.intent) && statusAt(result.pending, now) !== 'expired' ? pickOptions(result, expenseCategories) : []
  if (options.length) {
    return deepFreeze({
      ...baseView,
      choices: [...options.map((c) => ({ id: `${PICK_PREFIX}${c.id}`, label: c.name })), ...keep],
      footer: BUDGET_COMMAND_MESSAGES.footerPick,
    })
  }
  return baseView
}

/** What a pressed button of a budget command does. 'pass' means it is not ours (Edit, Cancel, or not a budget command). */
export function resolveBudgetCommandChoice(result, choiceId, expenseCategories, now) {
  requireNow(now)
  if (!isBudgetCommand(result) || choiceId === 'edit' || choiceId === 'cancel') return deepFreeze({ action: 'pass' })
  const isContinue = choiceId === CONTINUE_ID
  const isPick = typeof choiceId === 'string' && choiceId.startsWith(PICK_PREFIX)
  if (!isContinue && !isPick) return deepFreeze({ action: 'unknown' })
  const p = result.pending
  if (!isIntentAvailable(p.intent)) return deepFreeze({ action: 'unavailable', message: BUDGET_COMMAND_MESSAGES.unavailable })
  if (statusAt(p, now) === 'expired') return deepFreeze({ action: 'expired', message: BUDGET_COMMAND_MESSAGES.expired })

  if (isContinue) {
    return isReadyBudgetCommand(result, now) ? deepFreeze({ action: 'hand_off', pending: p }) : deepFreeze({ action: 'unknown' })
  }

  const picked = pickOptions(result, expenseCategories).find((c) => `${PICK_PREFIX}${c.id}` === choiceId)
  if (!picked) return deepFreeze({ action: 'unknown' })
  const contract = getContract(p.intent)
  const note = BUDGET_COMMAND_MESSAGES.chose(picked.name)
  const kind = contract.becomes === 'none' ? 'actual' : contract.becomes
  let resolved
  try {
    resolved = resolveFields(p, { category: { value: { id: picked.id, name: picked.name }, kind, origin: 'matched', note } }, now)
  } catch {
    return deepFreeze({ action: 'unknown' })
  }
  return deepFreeze({
    action: 'pick_category',
    result: {
      ...result,
      pending: resolved,
      asks: result.asks.filter((a) => !CATEGORY_ASKS.includes(a)),
      notes: [...result.notes, note],
    },
  })
}

/**
 * The clarification buttons "Create a monthly budget" and "Set a budget amount" carry no details, so
 * nothing can be handed over. This is the one line that tells the user how to say it.
 */
export function budgetChoiceNotice(choiceId) {
  if (choiceId === 'create_budget') return BUDGET_COMMAND_MESSAGES.createExample
  if (choiceId === 'set_budget_amount') return BUDGET_COMMAND_MESSAGES.setExample
  return null
}
