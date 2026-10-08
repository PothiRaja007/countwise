// P8 (Money Inbox command layer) — what the LEARNING PAGE does with a handoff.
//
//   learningDialogFromHandoff(pending, { items })
//        → { ok: true, dialog: 'create_item', prefill: { name, cost, targetDate }, notice }
//        | { ok: true, dialog: 'edit_status', itemId, prefill: { status }, notice }
//        | { ok: false, message }          (message is null when the handoff is simply ignored)
//   canChangeStatus(currentStatus, targetStatus) → { ok: true } | { ok: false, reason: 'same' | 'dropped' }
//   STATUS_LABELS
//
// THE RULES IT KEEPS:
//   - It only reads a handed-off CREATE_LEARNING_ITEM or MODIFY_LEARNING_STATUS. Anything else is ignored.
//   - It decides what to PUT IN FRONT OF THE USER and nothing more. It computes no money and
//     writes nothing: the page's own form confirms and saves.
//   - A status command changes the STATUS only. Progress is a separate field and is never
//     changed here; when the item is being completed below 100%, the user is told so in a note.
//   - An item that is gone, already in that status, or dropped (when the target is completed or
//     dropped) gives a plain message and no form. A dropped item can be revived to planned or in progress.
//   - The page's own list decides what the item is; the interpreter's matched id is only a pointer.
//
// PURE. Imports only its sibling modules. No database, no screen code, no clock, no
// randomness. Results are deeply frozen and inputs are never changed.

import { deepFreeze } from './intents.js'

export const STATUS_LABELS = deepFreeze({ planned: 'Planned', in_progress: 'In progress', completed: 'Completed', dropped: 'Dropped' })
const STATUSES = Object.keys(STATUS_LABELS)

// ---------- the words (pinned by tests) ----------
export const LEARNING_DIALOG_MESSAGES = deepFreeze({
  createBanner: 'From Money Inbox. Nothing is saved until you press Add item.',
  statusBanner: 'From Money Inbox. Nothing is saved until you press Save changes.',
  itemGone: "That learning item isn't available any more.",
  same: (name, status) => `${name} is already ${STATUS_LABELS[status].toLowerCase()}.`,
  dropped: (name) => `${name} is dropped. Set it to Planned or In progress first.`,
  progressStays: (pct) => `Progress is still ${pct}%. Set it to 100% if you want.`,
  dialogOpen: 'A learning form is already open. Finish or close it first, then send your message again.',
})

const IGNORE = deepFreeze({ ok: false, message: null })
const isText = (v) => typeof v === 'string' && v.trim() !== ''
const noteOf = (field) => (field && isText(field.note) ? [field.note] : [])

/**
 * May a command move an item from one status to another? Never to the status it already has.
 * A dropped item can only be revived (planned or in progress); it cannot go straight to
 * completed (or be "dropped" again).
 */
export function canChangeStatus(currentStatus, targetStatus) {
  if (!STATUSES.includes(targetStatus)) return deepFreeze({ ok: false, reason: 'unknown' })
  if (currentStatus === targetStatus) return deepFreeze({ ok: false, reason: 'same' })
  if (currentStatus === 'dropped' && (targetStatus === 'completed' || targetStatus === 'dropped')) return deepFreeze({ ok: false, reason: 'dropped' })
  return deepFreeze({ ok: true })
}

export function learningDialogFromHandoff(pending, context) {
  if (!pending || typeof pending !== 'object' || pending.status !== 'handed_off' || !pending.fields || typeof pending.fields !== 'object') return IGNORE
  const ctx = context && typeof context === 'object' ? context : {}
  const items = Array.isArray(ctx.items) ? ctx.items : []
  const f = pending.fields

  if (pending.intent === 'CREATE_LEARNING_ITEM') {
    if (!f.name || !isText(f.name.value)) return IGNORE
    const cost = f.cost && Number.isFinite(f.cost.value) && f.cost.value > 0 ? f.cost.value : ''
    const date = f.targetDate && /^\d{4}-\d{2}-\d{2}$/.test(String(f.targetDate.value)) ? f.targetDate.value : ''
    return deepFreeze({
      ok: true,
      dialog: 'create_item',
      prefill: { name: f.name.value.trim(), cost, targetDate: date },
      notice: [LEARNING_DIALOG_MESSAGES.createBanner, ...noteOf(f.name), ...(cost === '' ? [] : noteOf(f.cost)), ...(date === '' ? [] : noteOf(f.targetDate))],
    })
  }

  if (pending.intent === 'MODIFY_LEARNING_STATUS') {
    if (!f.item || !f.item.value || f.item.value.id == null) return IGNORE
    if (!f.newStatus || !STATUSES.includes(f.newStatus.value)) return IGNORE
    const target = f.newStatus.value
    const item = items.find((i) => i && String(i.id) === String(f.item.value.id))
    if (!item) return deepFreeze({ ok: false, message: LEARNING_DIALOG_MESSAGES.itemGone })
    const verdict = canChangeStatus(item.status, target)
    if (!verdict.ok) {
      if (verdict.reason === 'same') return deepFreeze({ ok: false, message: LEARNING_DIALOG_MESSAGES.same(item.name, target) })
      if (verdict.reason === 'dropped') return deepFreeze({ ok: false, message: LEARNING_DIALOG_MESSAGES.dropped(item.name) })
      return IGNORE
    }
    const pct = Number(item.progress_pct)
    const note = target === 'completed' && Number.isFinite(pct) && pct < 100 ? [LEARNING_DIALOG_MESSAGES.progressStays(pct)] : []
    return deepFreeze({
      ok: true,
      dialog: 'edit_status',
      itemId: item.id,
      prefill: { status: target },
      notice: [LEARNING_DIALOG_MESSAGES.statusBanner, ...noteOf(f.item), ...note],
    })
  }

  return IGNORE
}
