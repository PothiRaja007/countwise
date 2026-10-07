// P4 (Money Inbox command layer) — the GUARD VIEW.
//
// Turns what the interpreter understood into plain words for a small panel, and
// decides what each button does. All the logic of the command guard lives here so it
// can be tested without a screen; the panel that shows it is a thin wrapper.
//
//   buildGuardView(result)                          → null for a transaction, else
//                                                     { kind, tone, title, message, summary, notes, choices, footer }
//   resolveGuardChoice(result, choiceId, now)       → { action: 'cancel' | 'edit' | 'continue_as_transaction'
//                                                       | 'unavailable' | 'expired' | 'start', ... }
//
// THE RULES IT KEEPS:
//   - It never says anything was done. Every understood command, question or page
//     request ends with "Nothing was saved." The only way to a transaction is the
//     clarification's own explicit "record it as an expense" style choice.
//   - It never offers Save or Confirm; understood requests offer only Edit and Cancel.
//   - A button for anything that is not built yet says so, and decides that with
//     isIntentAvailable, so it opens up by itself as later phases are built.
//   - A pension answer is worded as an estimate, never as a payment (decision 4).
//   - Plans are worded as plans and records as records (the four-state rule).
//
// PURE. Imports only its sibling modules. No database, no screen code, no clock
// (`now` is passed in), no randomness. Results are deeply frozen.

import { ALLOWED_PAGES, isIntentAvailable } from './intents.js'
import { statusAt, isClarificationExpired } from './pendingAction.js'

export class GuardViewError extends Error {
  constructor(code, message) {
    super(message)
    this.name = 'GuardViewError'
    this.code = code
  }
}
const fail = (code, message) => { throw new GuardViewError(code, message) }

function freeze(value) {
  if (value && typeof value === 'object' && !Object.isFrozen(value)) {
    Object.freeze(value)
    for (const key of Object.keys(value)) freeze(value[key])
  }
  return value
}

// ---------- the words (pinned by tests) ----------
export const GUARD_MESSAGES = freeze({
  footer: "This isn't available from Money Inbox yet. Nothing was saved.",
  needDetail: 'I need one more detail before I can answer. Nothing was saved.',
  unavailable: "That isn't available from Money Inbox yet. Nothing was saved.",
  expired: 'That question timed out. Please send your message again.',
  mixedTitle: 'One thing at a time',
  mixedMessage: 'Please do one thing at a time: a command, a question, or an entry.',
  competingTitle: 'Which did you mean?',
  unsupportedTitle: "I can't do that from here",
  referenceTitle: 'Which one?',
  edit: 'Edit my message',
  cancel: 'Cancel',
  pensionSummary: 'your pension estimate. Estimated from your salary structure; this is not a record of actual payments.',
})

// ---------- small formatters (this folder may not import the app's own) ----------
const MONTH_NAMES = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December']

/** 50000 → "₹50,000"; 100000 → "₹1,00,000"; 80.5 → "₹80.50". */
function money(value) {
  const fixed = Number.isInteger(value) ? String(value) : value.toFixed(2)
  const [whole, fraction] = fixed.split('.')
  const last3 = whole.slice(-3)
  const rest = whole.slice(0, -3)
  const grouped = rest ? `${rest.replace(/\B(?=(\d{2})+(?!\d))/g, ',')},${last3}` : last3
  return `₹${grouped}${fraction ? `.${fraction}` : ''}`
}

/** "2026-12-31" → "31 December 2026". */
function dateText(iso) {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(iso)
  return m ? `${Number(m[3])} ${MONTH_NAMES[Number(m[2]) - 1]} ${m[1]}` : String(iso)
}

const STATUS_TEXT = { planned: 'planned', in_progress: 'in progress', completed: 'completed', dropped: 'dropped' }
const PAGE_LABEL = Object.fromEntries(ALLOWED_PAGES.map((p) => [p.id, p.label]))
const FIELD_QUESTION = {
  goal: 'goal', category: 'category', item: 'learning item', account: 'account', amount: 'amount',
  newAmount: 'amount', period: 'month', month: 'month', targetDate: 'month', targetAmount: 'amount', cost: 'amount',
}

// ---------- the one-line summary of what was understood ----------
function summarize(pending) {
  const f = pending.fields
  const v = (name) => (f[name] ? f[name].value : undefined)
  const unclear = (what) => `${what} (which one isn't clear yet)`
  const period = (name, fallback) => {
    if (!f[name]) return unclear(fallback)
    return f[name].origin === 'default' ? `${v(name).label} (the current month, because you didn't say)` : v(name).label
  }
  switch (pending.intent) {
    case 'CREATE_GOAL':
      return `plan a goal${v('name') ? ` “${v('name')}”` : ''}${v('targetAmount') ? ` with a target of ${money(v('targetAmount'))}` : ''}${v('targetDate') ? ` by ${dateText(v('targetDate'))}` : ''}`
    case 'MODIFY_GOAL_CONTRIBUTE':
      return `put ${v('amount') ? money(v('amount')) : unclear('an amount')} towards ${v('goal') ? `your ${v('goal').name} goal` : unclear('a goal')}`
    case 'CREATE_BUDGET_MONTH':
      return `plan your budget for ${f.month ? v('month').label : unclear('a month')}`
    case 'MODIFY_BUDGET_AMOUNT': {
      const change = f.newAmount ? `set it to ${money(v('newAmount'))}`
        : f.relativeChange ? `${v('relativeChange').direction} it by ${money(v('relativeChange').amount)}`
          : unclear('to a new amount')
      return `change ${v('category') ? `your ${v('category').name} budget` : unclear('a budget')}: ${change}${f.month ? ` for ${v('month').label}` : ''}`
    }
    case 'CREATE_LEARNING_ITEM':
      return `add ${v('name') ? `“${v('name')}”` : 'a learning item'} to your learning list${v('cost') ? ` (planned cost ${money(v('cost'))})` : ''}${v('targetDate') ? ` by ${dateText(v('targetDate'))}` : ''}`
    case 'MODIFY_LEARNING_STATUS':
      return `mark ${v('item') ? v('item').name : unclear('a learning item')} as ${v('newStatus') ? STATUS_TEXT[v('newStatus')] : 'a new status'}`
    case 'QUERY_SPEND':
      return `how much you spent${v('category') ? ` on ${v('category').name}` : ''} in ${period('period', 'a month')}`
    case 'QUERY_BUDGET_LEFT':
      return `how much is left in ${v('category') ? `your ${v('category').name} budget` : unclear('a budget')} for ${period('month', 'a month')}`
    case 'QUERY_GOAL_PROGRESS':
      return `how much you have put into ${v('goal') ? `your ${v('goal').name} goal` : unclear('a goal')}`
    case 'QUERY_BALANCE':
      return v('account') ? `the balance in ${v('account').name}` : 'your total balance'
    case 'QUERY_PENSION_ESTIMATE':
      return GUARD_MESSAGES.pensionSummary
    case 'NAVIGATE':
      return `open ${PAGE_LABEL[v('page')] || v('page')}`
    default:
      return fail('unknown_intent', `No summary for ${pending.intent}`)
  }
}

function detailNotes(result) {
  const notes = [...result.notes]
  for (const a of result.pending.ambiguities) {
    notes.push(`Which ${FIELD_QUESTION[a.field] || a.field}? ${a.options.map((o) => o.label).join(', ')}`)
  }
  if (result.pending.missing.length) notes.push(`Still missing: ${result.pending.missing.join(', ')}`)
  return notes
}

const CLARIFY_TITLES = {
  mixed_input: () => GUARD_MESSAGES.mixedTitle,
  competing_meaning: () => GUARD_MESSAGES.competingTitle,
  missing_required: () => GUARD_MESSAGES.unsupportedTitle,
  ambiguous_reference: () => GUARD_MESSAGES.referenceTitle,
  bare_word: (source) => `What would you like to do with “${source}”?`,
}

const EDIT_AND_CANCEL = [{ id: 'edit', label: GUARD_MESSAGES.edit }, { id: 'cancel', label: GUARD_MESSAGES.cancel }]

/** The panel's content for an interpreter result, or null when it is an ordinary transaction. */
export function buildGuardView(result) {
  if (!result || typeof result !== 'object' || typeof result.kind !== 'string') fail('invalid_result', 'buildGuardView needs an interpreter result')
  if (result.kind === 'transaction') return null

  if (result.kind === 'clarify') {
    const c = result.clarification
    const message = c.reason === 'mixed_input' ? GUARD_MESSAGES.mixedMessage : null
    return freeze({
      kind: 'clarify', tone: 'ask', title: CLARIFY_TITLES[c.reason](c.source), message, summary: null,
      notes: result.notes.filter((n) => n !== message),
      choices: c.choices.map(({ id, label }) => ({ id, label })),
      footer: null,
    })
  }

  if (!['command', 'query', 'navigate'].includes(result.kind)) fail('invalid_result', `Unknown kind "${result.kind}"`)
  const summary = summarize(result.pending)
  const title = result.kind === 'query' ? `I understood a question: ${summary}` : `I understood: ${summary}`
  return freeze({
    kind: result.kind, tone: 'info', title, message: null, summary,
    // An intent that is built but still has an open question needs one more detail; one that is not built yet says so.
    notes: detailNotes(result), choices: EDIT_AND_CANCEL, footer: isIntentAvailable(result.pending.intent) ? GUARD_MESSAGES.needDetail : GUARD_MESSAGES.footer,
  })
}

/**
 * What a pressed button does.
 * `now` is milliseconds. `isAvailable` is for tests; the app uses the real availability.
 * Cancel and Edit always work; every other choice stops working five minutes after the question.
 */
export function resolveGuardChoice(result, choiceId, now, isAvailable = isIntentAvailable) {
  if (typeof now !== 'number' || !Number.isFinite(now)) fail('now_required', 'A numeric `now` (milliseconds) must be passed in; this module never reads the clock.')
  if (!result || !['command', 'query', 'navigate', 'clarify'].includes(result.kind)) fail('invalid_result', 'There is nothing to choose from here')
  const view = buildGuardView(result)
  const choice = view.choices.find((c) => c.id === choiceId)
  if (!choice) fail('unknown_choice', `"${choiceId}" is not one of the choices`)
  if (choiceId === 'cancel') return freeze({ action: 'cancel' })
  if (choiceId === 'edit') return freeze({ action: 'edit' })

  const expired = result.kind === 'clarify' ? isClarificationExpired(result.clarification, now) : statusAt(result.pending, now) === 'expired'
  if (expired) return freeze({ action: 'expired', message: GUARD_MESSAGES.expired })

  const intent = result.clarification.choices.find((c) => c.id === choiceId).intent
  if (intent === 'RECORD_TRANSACTION' && isAvailable(intent)) return freeze({ action: 'continue_as_transaction' })
  if (intent && isAvailable(intent)) return freeze({ action: 'start', intent, choiceId })
  return freeze({ action: 'unavailable', message: GUARD_MESSAGES.unavailable })
}
