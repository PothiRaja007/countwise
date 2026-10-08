// P6 (Money Inbox command layer) — the HANDOFF and the NAVIGATION lookups.
//
// A handoff is the one-time, expiring package Money Inbox gives to the page that owns
// a command (Goals, Budgets, Learning) once that command is ready. The owning page,
// never this layer, confirms it and writes. A handoff is NOT the thing itself: it has
// no "executed" or "saved" state, because this layer cannot save anything.
//
//   createHandoff(pending, userId, now, isAvailable?)
//                                  → a deeply frozen handoff, or throws HandoffError
//   readHandoff(handoff, page, userId, now, usedIds, isAvailable?)
//                                  → { ok: true, pending } | { ok: false, reason }
//   navigationFromResult(result, isAvailable?)  → { page, route } | null
//   navigationFromChoice(choiceId, isAvailable?) → { page, route } | null
//
// THE RULES IT KEEPS:
//   - Only a READY action, for an intent that is handed to an owner page (a dialog or a
//     page flow, with a route), that is built, can become a handoff. P1's own
//     markHandedOff decides readiness and expiry, so its rules apply unchanged.
//   - A handoff is accepted only by the right page, for the right user, inside the
//     pending action's own five minutes, and only once. Anything else gives a reason,
//     and the page behaves as if there was no handoff.
//   - Navigation opens only the six pages in ALLOWED_PAGES. The route always comes from
//     that table, never from the typed text.
//
// PURE. Imports only its sibling modules. No database, no screen code, no clock
// (`now` is passed in), no randomness. Results are deeply frozen.

import { ALLOWED_PAGES, getContract, isIntentAvailable, deepFreeze, HANDOFF_FLOWS } from './intents.js'
import { markHandedOff, statusAt } from './pendingAction.js'

export class HandoffError extends Error {
  constructor(code, message) {
    super(message)
    this.name = 'HandoffError'
    this.code = code
  }
}
const fail = (code, message) => { throw new HandoffError(code, message) }

/** Why a page was given nothing. A page never shows any of these to the user. */
export const HANDOFF_REASONS = deepFreeze(['no_handoff', 'other_user', 'expired', 'already_used', 'wrong_page', 'unavailable'])

function requireNow(now) {
  if (typeof now !== 'number' || !Number.isFinite(now)) fail('now_required', 'A numeric `now` (milliseconds) must be passed in; this module never reads the clock.')
}
function requireUser(userId) {
  if (typeof userId !== 'string' || !userId.trim()) fail('user_required', 'A user id is required')
}

const pageForRoute = (route) => ALLOWED_PAGES.find((p) => p.route === route)

/** The page that owns an intent, or null when it has none (a question, a transaction, a page request). */
function ownerPage(contract) {
  if (!HANDOFF_FLOWS.includes(contract.flow) || contract.flow === 'router' || !contract.route) return null
  const page = pageForRoute(contract.route)
  return page ? page.id : null
}

// ---------- the handoff ----------
export function createHandoff(pending, userId, now, isAvailable = isIntentAvailable) {
  requireNow(now)
  requireUser(userId)
  if (!pending || typeof pending !== 'object' || typeof pending.intent !== 'string') fail('invalid_pending', 'createHandoff needs a pending action')
  const contract = getContract(pending.intent)
  const page = ownerPage(contract)
  if (!page) fail('not_hand_off', `${contract.id} is not handed to an owner page`)
  if (!isAvailable(contract.id)) fail('unavailable', `${contract.id} is not built yet`)
  if (statusAt(pending, now) !== 'ready') fail('not_ready', 'Only a ready action can be handed off')
  // P1 decides the rest (expiry, readiness, the flow) and returns the action marked as handed off.
  const handedOff = markHandedOff(pending, now)
  return deepFreeze({ id: handedOff.id, userId, page, createdAt: now, pending: handedOff })
}

function hasBeenUsed(usedIds, id) {
  if (usedIds instanceof Set) return usedIds.has(id)
  if (Array.isArray(usedIds)) return usedIds.includes(id)
  return false
}

export function readHandoff(handoff, page, userId, now, usedIds, isAvailable = isIntentAvailable) {
  requireNow(now)
  const no = (reason) => ({ ok: false, reason })
  if (!handoff || typeof handoff !== 'object' || !handoff.pending || typeof handoff.page !== 'string') return no('no_handoff')
  if (typeof userId !== 'string' || !userId || handoff.userId !== userId) return no('other_user')
  // The five minutes belong to the pending action; a handed-off action is final, so its own
  // expiry time is compared directly.
  if (now >= handoff.pending.expiresAt) return no('expired')
  if (hasBeenUsed(usedIds, handoff.id)) return no('already_used')
  if (handoff.page !== page) return no('wrong_page')
  if (!isAvailable(handoff.pending.intent)) return no('unavailable')
  return deepFreeze({ ok: true, pending: handoff.pending })
}

// ---------- navigation ----------
const destination = (pageId) => {
  const page = ALLOWED_PAGES.find((p) => p.id === pageId)
  return page ? deepFreeze({ page: page.id, route: page.route }) : null
}

/** A complete "open a page" result → where to go. Null for anything else, including an unclear page. */
export function navigationFromResult(result, isAvailable = isIntentAvailable) {
  if (!result || result.kind !== 'navigate' || !result.pending || result.pending.intent !== 'NAVIGATE') return null
  if (!isAvailable('NAVIGATE')) return null
  if (result.asks.length || result.pending.ambiguities.length || result.pending.missing.length) return null
  const field = result.pending.fields.page
  if (!field || typeof field.value !== 'string') return null
  return destination(field.value)
}

/** One of the clarification's "open_<page>" choices → where to go. Null for any other choice. */
export function navigationFromChoice(choiceId, isAvailable = isIntentAvailable) {
  if (typeof choiceId !== 'string') return null
  const m = /^open_([a-z]+)$/.exec(choiceId)
  if (!m || !isAvailable('NAVIGATE')) return null
  return destination(m[1])
}
