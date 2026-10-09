// P11 (Money Inbox command layer) — the HIDDEN-MIX GUARD.
//
// The interpreter already answers "please do one thing at a time" when a message holds two different kinds of
// request. It misses a few, because it cannot tell what a clause with an owned word ("course", "budget") or a
// phrase it only calls a transaction ("pension estimate") is. Those messages then reached the review screen as a
// single entry and the other half was dropped without a word. Nothing was ever saved without Confirm, but the user
// was not told. This module closes that gap WITHOUT touching the interpreter or the parser:
//
//   detectHiddenMix(text, context, now)  → null | the interpreter's own mixed-input answer
//
// HOW: the message is split into clauses with the same separators the interpreter uses. Each clause is asked of the
// existing interpret(). A clause is
//   a REQUEST  if the interpreter calls it a command, a question, a page request or an unclear command (not a bare
//              word), or it is a plain "pension estimate" request (pensionEstimate.js);
//   an ENTRY   if it holds an amount (a digit), or it is a plain "I received my salary" sentence (salaryReceipt.js).
// The message is a hidden mix when it has a request AND an entry, or two requests of different kinds. Entry + entry
// (several purchases, an amount-less salary row next to a payment) is NOT a mix: that is the normal multi-row review.
//
// The answer is exactly the one the interpreter gives for mixed input: reason 'mixed_input', one choice "Edit my
// message" (plus the automatic Cancel), the same note. It starts nothing and writes nothing.
//
// It is deliberately cautious: anything it is not sure about returns null and the message takes the normal path.
//
// PURE. Imports only its sibling modules. No database, no screen code, no clock, no randomness: `now` is passed in.

import { interpret } from './interpreter.js'
import { createClarification } from './pendingAction.js'
import { deepFreeze } from './intents.js'
import { detectSalaryReceipt } from './salaryReceipt.js'
import { looksLikePensionEstimateRequest } from './pensionEstimate.js'

// ---------- the words (pinned by tests) ----------
// The same wording the interpreter uses for mixed input.
export const MIXED_INPUT_MESSAGES = deepFreeze({
  note: 'Please do one thing at a time: a command, a question, or an entry.',
  editLabel: 'Edit my message',
})

const MAX_LENGTH = 400
const MAX_CLAUSES = 8

// The same separators the interpreter splits on. A comma between digits ("1,25,000") is not a separator.
function splitClauses(text) {
  return text
    .replace(/(\d),(?=\d)/g, '$1\u0001')
    .split(/\s*(?:,|;|\band then\b|\bthen\b|\band\b|\balso\b|\bplus\b|\bbut\b)\s*/i)
    .map((p) => p.replace(/\u0001/g, ',').trim())
    .filter(Boolean)
}

// Names only: the interpreter reads nothing else from a list, and extra fields (a status) are not allowed.
const names = (rows) => (Array.isArray(rows) ? rows.filter((r) => r && r.id != null && typeof r.name === 'string' && r.name.trim()).map((r) => ({ id: String(r.id), name: r.name })) : [])

function interpretContext(context) {
  const c = context && typeof context === 'object' ? context : {}
  // The interpreter needs an id to build an action it is about to throw away; any non-empty text will do.
  const out = { id: typeof c.id === 'string' && c.id ? c.id : 'mixed-input', goals: names(c.goals), categories: names(c.categories), learningItems: names(c.learningItems), accounts: names(c.accounts) }
  if (c.referenceDate instanceof Date && !Number.isNaN(c.referenceDate.getTime())) out.referenceDate = c.referenceDate
  return out
}

function wholeIsEntry(text, ctx, now) {
  try { return interpret(text, ctx, now).kind === 'transaction' } catch { return false }
}

/** What one clause is: 'request:<label>', 'entry', or null (not sure, so it does not count). */
function clauseRole(clause, ctx, now) {
  if (looksLikePensionEstimateRequest(clause)) return 'request:QUERY_PENSION_ESTIMATE'
  if (detectSalaryReceipt(clause)) return 'entry'
  let result
  try {
    result = interpret(clause, ctx, now)
  } catch {
    return null
  }
  if (result.kind === 'command' || result.kind === 'query' || result.kind === 'navigate') {
    const intent = result.pending && result.pending.intent ? result.pending.intent : result.kind
    return `request:${intent}`
  }
  if (result.kind === 'clarify') {
    // A bare word ("milk", "pension") is not a request; any other unclear command-shaped clause is.
    const reason = result.clarification && result.clarification.reason
    return reason === 'bare_word' ? null : `request:${reason || 'clarify'}`
  }
  return /\d/.test(clause) ? 'entry' : null
}

/**
 * Is this message two kinds of thing at once that the interpreter did not catch? Returns null (go on as before) or
 * the interpreter's own mixed-input answer. The screen calls it for any message the interpreter did NOT already
 * answer with a clarification (a transaction, a command, a question or a page request): the interpreter judges the
 * whole sentence, so a clause it cannot read can be silently dropped from a command or a question just as from an entry.
 *
 * @param {string} text the typed message
 * @param {{id?: string, referenceDate?: Date, goals?: object[], categories?: object[], learningItems?: object[], accounts?: object[]}} [context]
 * @param {number} now milliseconds; never read from a clock here
 */
export function detectHiddenMix(text, context, now) {
  if (typeof text !== 'string') throw new TypeError('detectHiddenMix needs the typed text')
  if (typeof now !== 'number' || !Number.isFinite(now)) throw new TypeError('detectHiddenMix needs a numeric `now`')
  const original = text.trim()
  if (!original || original.length > MAX_LENGTH) return null
  const clauses = splitClauses(original)
  if (clauses.length < 2 || clauses.length > MAX_CLAUSES) return null
  const ctx = interpretContext(context)
  const allRoles = clauses.map((c) => clauseRole(c, ctx, now))
  const roles = allRoles.filter(Boolean)
  const requests = new Set(roles.filter((r) => r.startsWith('request:')))
  const entries = roles.filter((r) => r === 'entry').length
  // Requests only: the same request said twice is harmless when the interpreter understood the message, but when it
  // read the whole thing as an entry the user would get an empty review row, so that too is asked.
  const onlyRequests = allRoles.every((r) => r && r.startsWith('request:')) && wholeIsEntry(original, ctx, now)
  const mixed = (requests.size >= 1 && entries >= 1) || requests.size >= 2 || onlyRequests
  if (!mixed) return null
  const clarification = createClarification({ reason: 'mixed_input', source: original, choices: [{ id: 'edit', label: MIXED_INPUT_MESSAGES.editLabel }] }, now)
  return deepFreeze({ kind: 'clarify', clarification, asks: [], notes: [MIXED_INPUT_MESSAGES.note] })
}
