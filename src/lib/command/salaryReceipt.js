// P10 (Money Inbox command layer) — "RECEIVED MY SALARY" (RECORD_SALARY), the Money Inbox side.
//
// "Received my salary" (with no amount) is an ordinary transaction to the interpreter. Money Inbox may
// then offer a starting amount from the user's ACTIVE SALARY STRUCTURE, clearly labelled as an estimate,
// and put it in the text box. From there it is the unchanged transaction path: the review screen, and its
// one insert after the user presses Confirm. This module decides the pure parts:
//
//   detectSalaryReceipt(text)                  → null | { text }
//   salaryReceiptState({ readFailed, hasStructure, takeHome })
//                                              → { status: 'estimate', amount } | { status: 'no_structure' | 'no_figure' | 'unreadable' }
//   salaryReceiptView(state)                   → the panel: title, message, footer, buttons
//   salaryReceiptPending(state, { id, source, now }) → a READY RECORD_SALARY pending action whose amount is 'estimated'
//   salaryReceiptText(original, amount)        → the user's own words + the whole-rupee amount
//   resolveSalaryChoice(state, choiceId)       → { action: 'use_estimate' | 'type_amount' | 'open_salary' | 'cancel' | 'unknown' }
//
// THE RULES IT KEEPS:
//   - Only a short, plain "I received my salary" sentence with NO digit is recognised. "salary 25000",
//     "salary received 52000 sbi", "salary 25k received and rent 4k paid" are never touched.
//   - The suggested amount is an estimate (kind 'estimated', origin 'engine'), never a record. It is only a
//     starting point in the text box; nothing is saved until the review screen's Confirm.
//   - No structure, or no usable figure: it says so and suggests nothing. It never invents a number.
//   - Nothing is saved here and nothing is handed off to another page.
//
// PURE. Imports only its sibling modules. No database, no screen code, no clock (`now` and `id` are passed
// in), no randomness. Results are deeply frozen and inputs are never changed.

import { deepFreeze } from './intents.js'
import { createPendingAction } from './pendingAction.js'

// ---------- the words (pinned by tests) ----------
export const SALARY_MESSAGES = deepFreeze({
  estimateTitle: (amountText) => `Estimated take-home from your active salary structure: ${amountText}`,
  estimateMessage: 'This is an estimate, not money you have received.',
  noStructure: "You have no active salary structure, so I can't suggest an amount.",
  noFigure: "Your active salary structure has no usable take-home figure, so I can't suggest an amount.",
  unreadable: "I couldn't read your salary structure, so I'm not suggesting an amount.",
  footer: 'Nothing is saved until you press Confirm on the review screen.',
  useLabel: (amountText) => `Use ${amountText}`,
  typeLabel: "I'll type the amount",
  openSalaryLabel: 'Open Salary',
  cancelLabel: 'Cancel',
  amountNote: (amountText) => `Estimated from your active salary structure (${amountText}). It is an estimate, not money received.`,
  fillNote: 'The amount is an estimate from your salary structure, not money received. Change it if it differs, then press Review.',
  noSuggestion: "I couldn't prepare a suggestion. Type the amount yourself and press Review.",
})

export const SALARY_CHOICES = deepFreeze({ use: 'use_estimate', type: 'type_amount', open: 'open_salary', cancel: 'cancel' })

// ---------- recognising the sentence ----------
const WHEN = '(?:\\s+(?:today|yesterday))?'
const END = '\\s*[.!]*\\s*$'
const SENTENCES = [
  new RegExp(`^(?:i\\s+)?(?:have\\s+)?(?:just\\s+)?(?:now\\s+)?(?:received|recieved|got)\\s+(?:my|the|this\\s+month'?s|last\\s+month'?s)\\s+(?:monthly\\s+)?salary${WHEN}${END}`, 'i'),
  new RegExp(`^(?:my\\s+|the\\s+|this\\s+month'?s\\s+)?(?:monthly\\s+)?salary\\s+(?:was\\s+|is\\s+|got\\s+|has\\s+been\\s+)?(?:received|recieved|credited)${WHEN}${END}`, 'i'),
  new RegExp(`^(?:my\\s+|the\\s+)?(?:monthly\\s+)?salary\\s+(?:came|arrived)(?:\\s+in)?${WHEN}${END}`, 'i'),
]

/** A plain "I received my salary" sentence with no amount in it, or null. */
export function detectSalaryReceipt(text) {
  if (typeof text !== 'string') return null
  const s = text.replace(/\s+/g, ' ').trim()
  if (!s || s.length > 60 || /[\d,;]/.test(s)) return null
  if (!SENTENCES.some((re) => re.test(s))) return null
  return deepFreeze({ text: s.replace(/[\s.!]+$/, '') })
}

// ---------- amounts ----------
/** ₹ with Indian digit grouping; written by hand so it never depends on the device's locale data. */
function rupees(amount) {
  const whole = String(Math.round(amount))
  const last3 = whole.slice(-3)
  const rest = whole.slice(0, -3)
  return `₹${rest ? `${rest.replace(/\B(?=(\d{2})+(?!\d))/g, ',')},${last3}` : last3}`
}

/** What the screen found. `takeHome` is the existing engine's figure for the active structure. */
export function salaryReceiptState({ readFailed = false, hasStructure = false, takeHome = null } = {}) {
  if (readFailed) return deepFreeze({ status: 'unreadable' })
  if (!hasStructure) return deepFreeze({ status: 'no_structure' })
  const amount = typeof takeHome === 'number' && Number.isFinite(takeHome) ? Math.round(takeHome) : 0
  return amount > 0 ? deepFreeze({ status: 'estimate', amount }) : deepFreeze({ status: 'no_figure' })
}

const isState = (s) => !!s && typeof s === 'object' && ['estimate', 'no_structure', 'no_figure', 'unreadable'].includes(s.status)
  && (s.status !== 'estimate' || (Number.isInteger(s.amount) && s.amount > 0))

/** The panel for what was found. An estimate gets the amount; every other state suggests nothing. */
export function salaryReceiptView(state) {
  if (!isState(state)) throw new TypeError('salaryReceiptView needs a state from salaryReceiptState')
  const M = SALARY_MESSAGES
  const type = { id: SALARY_CHOICES.type, label: M.typeLabel }
  const cancel = { id: SALARY_CHOICES.cancel, label: M.cancelLabel }
  if (state.status === 'estimate') {
    const amountText = rupees(state.amount)
    return deepFreeze({
      title: M.estimateTitle(amountText), message: M.estimateMessage, footer: M.footer,
      choices: [{ id: SALARY_CHOICES.use, label: M.useLabel(amountText) }, type, cancel],
    })
  }
  const title = state.status === 'no_structure' ? M.noStructure : state.status === 'no_figure' ? M.noFigure : M.unreadable
  return deepFreeze({ title, message: null, footer: M.footer, choices: [type, { id: SALARY_CHOICES.open, label: M.openSalaryLabel }, cancel] })
}

/** What a pressed button means. A button the panel did not offer is 'unknown'. */
export function resolveSalaryChoice(state, choiceId) {
  if (!isState(state)) return deepFreeze({ action: 'unknown' })
  const offered = salaryReceiptView(state).choices.find((c) => c.id === choiceId)
  return deepFreeze({ action: offered ? offered.id : 'unknown' })
}

/** The estimate as a ready RECORD_SALARY pending action: the amount is 'estimated', from the engine, with a plain note. */
export function salaryReceiptPending(state, { id, source, now } = {}) {
  if (!isState(state) || state.status !== 'estimate') throw new TypeError('salaryReceiptPending needs an estimate state')
  return createPendingAction({
    id,
    intent: 'RECORD_SALARY',
    source,
    fields: { amount: { value: state.amount, kind: 'estimated', origin: 'engine', note: SALARY_MESSAGES.amountNote(rupees(state.amount)) } },
  }, now)
}

/** The user's own words with the amount added, so a date word such as "yesterday" is kept. */
export function salaryReceiptText(original, amount) {
  if (typeof original !== 'string' || !original.trim()) throw new TypeError('salaryReceiptText needs the typed text')
  if (!Number.isInteger(amount) || amount <= 0) throw new TypeError('salaryReceiptText needs a whole positive amount')
  return `${original.replace(/[\s.!]+$/, '')} ${amount}`
}
