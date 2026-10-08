// P6 (Money Inbox command layer) — the ONE place short-lived command state is held.
//
// The pure rules live in lib/command/handoff.js and lib/command/commandContext.js. This
// file only HOLDS what they describe, in this tab's memory and nowhere else:
//   - the one current handoff (what Money Inbox gives an owner page),
//   - the ids of handoffs already read (a handoff can be read only once),
//   - the one remembered goal (ten minutes).
//
// It is in memory on purpose. Nothing here is written to the browser's storage, to the
// router's history state or to the database, so a refresh loses it, Back cannot bring it
// back, and the typed text never ends up in the browser history. It is cleared when the
// user signs out (AuthContext) and is ignored for any other user.
//
// No React, no network, no clock: every function that needs the time takes `now`.
import { createHandoff, readHandoff } from './command/handoff.js'
import { rememberGoal, recallGoal } from './command/commandContext.js'

const state = { handoff: null, used: new Set(), memory: null }

// P7: pages that are ALREADY open when a handoff arrives (the floating Money Inbox button is
// on every page, Goals included) are told which page it is for. A listener only hears
// "a handoff for <page> arrived"; it still has to read it with takeHandoff, once.
// Listeners belong to mounted pages, not to the session, so clearing the session keeps them.
const listeners = new Set()

/** Tell me when a handoff arrives. Returns the function that stops the telling. */
export function onHandoff(listener) {
  if (typeof listener !== 'function') throw new TypeError('onHandoff needs a function')
  listeners.add(listener)
  return () => { listeners.delete(listener) }
}

/** Forget everything: the handoff, the used ids and the remembered goal. */
export function clearCommandSession() {
  state.handoff = null
  state.used = new Set()
  state.memory = null
}

// ---------- the handoff ----------
/** Prepare and hold a handoff for an owner page (it replaces any earlier one). Throws if the action cannot be handed off. */
export function putHandoff(pending, userId, now, isAvailable) {
  state.handoff = isAvailable ? createHandoff(pending, userId, now, isAvailable) : createHandoff(pending, userId, now)
  const held = state.handoff
  for (const listener of [...listeners]) {
    try { listener(held.page) } catch { /* a page that fails to listen must not stop the handoff */ }
  }
  return held
}

/**
 * What a page gets when it asks. One read only: a good handoff is marked used and removed.
 * A handoff meant for another page stays where it is. One that is expired, for someone
 * else, used, or not built is dropped. The page is never told why, only { ok: false }.
 */
export function takeHandoff(page, userId, now, isAvailable) {
  const result = isAvailable
    ? readHandoff(state.handoff, page, userId, now, state.used, isAvailable)
    : readHandoff(state.handoff, page, userId, now, state.used)
  if (result.ok) {
    state.used.add(state.handoff.id)
    state.handoff = null
  } else if (result.reason !== 'wrong_page' && result.reason !== 'no_handoff') {
    state.handoff = null
  }
  return result
}

/** Whether a handoff is being held (for tests and for the page that wants to know without reading). */
export function hasHandoff() {
  return state.handoff !== null
}

// ---------- the remembered goal ----------
/** Remember one goal for ten minutes (written by the owning pages from P7 on). */
export function remember(goal, userId, now) {
  state.memory = rememberGoal(state.memory, goal, userId, now)
}

/** The remembered goal for this user, or null. Memory that belongs to someone else is dropped. */
export function recall(userId, now) {
  const m = state.memory
  if (m && m.userId !== userId) state.memory = null
  return recallGoal(state.memory, userId, now)
}

/** The raw memory, for applyReferenceMemory. Memory that belongs to someone else is dropped first. */
export function memoryFor(userId) {
  if (state.memory && state.memory.userId !== userId) state.memory = null
  return state.memory
}
