// P8b (Money Inbox command layer) — the OPTIONAL "track it in Learning ROI" offer after a payment.
//
// A learning-style payment ("Paid 8000 for a Power BI certification") is an ordinary transaction. It goes
// through the normal review screen and is saved exactly as before. Only AFTER it was really saved, Money
// Inbox may offer to open the Learning page's own "Add learning item" form, pre-filled. This module decides
// the three pure parts of that:
//
//   detectLearningPayment(savedRows)        → null | { name, amount, source }
//   learningOfferView(offer)                → the words and the two buttons of the offer
//   learningOfferPending(offer, { id, now }) → a READY CREATE_LEARNING_ITEM pending action (the hand-over)
//
// THE RULES IT KEEPS:
//   - It looks only at what was really saved. Exactly one saved row, an expense, a positive amount, and a
//     learning word with a recognisable name in front of it. Anything unclear gives null: a missed offer
//     costs nothing, a wrong offer is a nag.
//   - The offer is an offer. Nothing is saved here or by accepting it; the Learning page confirms and
//     saves with its own form. No link between the payment and the learning item is created.
//   - The cost carried over is information only and is never added to balances.
//
// PURE. Imports only its sibling modules. No database, no screen code, no clock (`now` and `id` are passed
// in), no randomness. Results are deeply frozen and inputs are never changed.

import { deepFreeze } from './intents.js'
import { createPendingAction } from './pendingAction.js'

// ---------- the words (pinned by tests) ----------
export const LEARNING_OFFER_MESSAGES = deepFreeze({
  title: (name) => `Your payment is saved. Track “${name}” in Learning ROI?`,
  footer: 'Nothing else is saved until you press Add item in Learning ROI.',
  openLabel: 'Open Learning ROI',
  skipLabel: 'No thanks',
  couldNotOpen: "Your payment is saved, but Learning ROI couldn't be opened. You can add the item from the Learning page.",
  nameNote: 'Name taken from your payment. Change it if you like.',
  costNote: (amountText) => `Cost taken from the payment you just saved (${amountText}). It is information only and is not added to your balances.`,
})

export const LEARNING_OFFER_CHOICES = deepFreeze({ open: 'track_learning', skip: 'skip_learning' })
export const LEARNING_WORDS = deepFreeze(['course', 'certification', 'certificate', 'bootcamp', 'tutorial', 'masterclass', 'workshop', 'exam'])

const NAME_MIN = 2
const NAME_MAX = 60
const WORD = new RegExp(`\\b(?:${LEARNING_WORDS.join('|')})s?\\b`, 'i')
const MONEY_WORD = /[₹$]|\b(?:rs|inr|rupees?)\b|\d/i
const LEADING_FILLER = /^(?:(?:a|an|the|my|our|one|online)(?:\s+|$))+/i

/** The name the user typed, from "for" up to and including the learning word. Null when it is not clear. */
function nameFromText(text) {
  const match = WORD.exec(text)
  if (!match) return null
  const before = text.slice(0, match.index)
  const forAt = before.search(/\bfor\b(?!.*\bfor\b)/i)
  if (forAt < 0) return null
  const between = before.slice(forAt + 3).trim().replace(LEADING_FILLER, '').trim()
  if (!between) return null // "for a course": a learning word with nothing to call it
  if (MONEY_WORD.test(between)) return null // an amount or currency inside the name means the sentence is not simple
  const name = `${between} ${match[0]}`.replace(/\s+/g, ' ').trim()
  return name.length >= NAME_MIN && name.length <= NAME_MAX ? name : null
}

/**
 * The offer for what was saved, or null. `savedRows` are the rows the transactions table received
 * (the same objects the review screen inserted), for the whole review.
 */
export function detectLearningPayment(savedRows) {
  if (!Array.isArray(savedRows) || savedRows.length !== 1) return null
  const row = savedRows[0]
  if (!row || typeof row !== 'object' || row.type !== 'expense') return null
  const amount = typeof row.amount === 'number' ? row.amount : NaN
  if (!Number.isFinite(amount) || amount <= 0) return null
  if (typeof row.original_input !== 'string') return null
  const source = row.original_input.trim()
  if (!source) return null
  const name = nameFromText(source)
  return name ? deepFreeze({ name, amount, source }) : null
}

const isOffer = (offer) => !!offer && typeof offer === 'object' && typeof offer.name === 'string' && offer.name.trim() !== ''
  && Number.isFinite(offer.amount) && offer.amount > 0 && typeof offer.source === 'string' && offer.source.trim() !== ''

/** ₹ with Indian digit grouping; whole amounts without decimals. Written by hand so it never depends on the device's locale data. */
function rupees(amount) {
  const fixed = Number.isInteger(amount) ? String(amount) : amount.toFixed(2)
  const [whole, decimals] = fixed.split('.')
  const last3 = whole.slice(-3)
  const rest = whole.slice(0, -3)
  const grouped = rest ? `${rest.replace(/\B(?=(\d{2})+(?!\d))/g, ',')},${last3}` : last3
  return `₹${grouped}${decimals ? `.${decimals}` : ''}`
}

/** The panel for a saved learning payment: the question and exactly two buttons. */
export function learningOfferView(offer) {
  if (!isOffer(offer)) throw new TypeError('learningOfferView needs an offer from detectLearningPayment')
  return deepFreeze({
    title: LEARNING_OFFER_MESSAGES.title(offer.name),
    footer: LEARNING_OFFER_MESSAGES.footer,
    choices: [
      { id: LEARNING_OFFER_CHOICES.open, label: LEARNING_OFFER_MESSAGES.openLabel },
      { id: LEARNING_OFFER_CHOICES.skip, label: LEARNING_OFFER_MESSAGES.skipLabel },
    ],
  })
}

/** What "Open Learning ROI" hands over: a ready CREATE_LEARNING_ITEM with the name and the cost, each with its plain-words note. */
export function learningOfferPending(offer, { id, now } = {}) {
  if (!isOffer(offer)) throw new TypeError('learningOfferPending needs an offer from detectLearningPayment')
  return createPendingAction({
    id,
    intent: 'CREATE_LEARNING_ITEM',
    source: offer.source,
    fields: {
      name: { value: offer.name, kind: 'planned', origin: 'typed', note: LEARNING_OFFER_MESSAGES.nameNote },
      cost: { value: offer.amount, kind: 'planned', origin: 'typed', note: LEARNING_OFFER_MESSAGES.costNote(rupees(offer.amount)) },
    },
  }, now)
}
