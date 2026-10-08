// P7 (Money Inbox command layer) — what the GOALS PAGE does with a handoff.
//
//   goalDialogFromHandoff(pending, { goals, accounts, activeCount, activeLimit })
//        → { ok: true, dialog: 'create_goal', prefill: { name, targetAmount, targetDate }, notice }
//        | { ok: true, dialog: 'contribute', goalId, prefill: { amount, accountId }, notice }
//        | { ok: false, message }          (message is null when the handoff is simply ignored)
//   pickCreatedGoal(rows, beforeIds, saved) → { id, name } | null
//
// THE RULES IT KEEPS:
//   - It only reads a handed-off CREATE_GOAL or MODIFY_GOAL_CONTRIBUTE. Anything else is ignored.
//   - It decides what to PUT IN FRONT OF THE USER and nothing more. It computes no money and
//     writes nothing: the page's own dialogs confirm, check their own rules and save.
//   - A goal that is gone, completed or archived, or the ten-goal limit, gives a plain message
//     and no dialog. The account is filled in only if the user typed it and it still exists.
//   - pickCreatedGoal names the goal that was just created only when exactly ONE new goal
//     matches what was saved. If it cannot be told for sure, it returns null and the page
//     remembers nothing (a wrong memory would make "it" mean the wrong goal).
//
// PURE. Imports only its sibling modules. No database, no screen code, no clock, no
// randomness. Results are deeply frozen and inputs are never changed.

import { deepFreeze } from './intents.js'

// ---------- the words (pinned by tests) ----------
export const GOAL_DIALOG_MESSAGES = deepFreeze({
  createBanner: 'From Money Inbox. Nothing is saved until you press Create goal.',
  contributeBanner: 'From Money Inbox. Nothing is saved until you press Contribute.',
  goalGone: "That goal isn't available any more.",
  completed: (name) => `${name} is already completed. You can start a new cycle from the Completed tab.`,
  archived: (name) => `${name} is archived.`,
  limit: (limit) => `You can only have ${limit} active goals at once. Archive or complete a goal to add another.`,
  dialogOpen: 'A goal form is already open. Finish or close it first, then send your message again.',
})

const IGNORE = deepFreeze({ ok: false, message: null })
const isText = (v) => typeof v === 'string' && v.trim() !== ''

const noteOf = (field) => (field && isText(field.note) ? [field.note] : [])

export function goalDialogFromHandoff(pending, context) {
  if (!pending || typeof pending !== 'object' || pending.status !== 'handed_off' || !pending.fields || typeof pending.fields !== 'object') return IGNORE
  const ctx = context && typeof context === 'object' ? context : {}
  const goals = Array.isArray(ctx.goals) ? ctx.goals : []
  const accounts = Array.isArray(ctx.accounts) ? ctx.accounts : []
  const f = pending.fields

  if (pending.intent === 'CREATE_GOAL') {
    if (!f.name || !isText(f.name.value)) return IGNORE
    if (Number.isFinite(ctx.activeCount) && Number.isFinite(ctx.activeLimit) && ctx.activeCount >= ctx.activeLimit) {
      return deepFreeze({ ok: false, message: GOAL_DIALOG_MESSAGES.limit(ctx.activeLimit) })
    }
    const amount = f.targetAmount && Number.isFinite(f.targetAmount.value) && f.targetAmount.value > 0 ? f.targetAmount.value : ''
    const date = f.targetDate && /^\d{4}-\d{2}-\d{2}$/.test(String(f.targetDate.value)) ? f.targetDate.value : ''
    return deepFreeze({
      ok: true,
      dialog: 'create_goal',
      prefill: { name: f.name.value.trim(), targetAmount: amount, targetDate: date },
      notice: [GOAL_DIALOG_MESSAGES.createBanner, ...noteOf(f.name), ...(amount === '' ? [] : noteOf(f.targetAmount)), ...(date === '' ? [] : noteOf(f.targetDate))],
    })
  }

  if (pending.intent === 'MODIFY_GOAL_CONTRIBUTE') {
    if (!f.goal || !f.goal.value || f.goal.value.id == null) return IGNORE
    if (!f.amount || !Number.isFinite(f.amount.value) || !(f.amount.value > 0)) return IGNORE
    const goal = goals.find((g) => g && String(g.id) === String(f.goal.value.id))
    if (!goal) return deepFreeze({ ok: false, message: GOAL_DIALOG_MESSAGES.goalGone })
    if (goal.status === 'completed') return deepFreeze({ ok: false, message: GOAL_DIALOG_MESSAGES.completed(goal.name) })
    if (goal.status !== 'active') return deepFreeze({ ok: false, message: goal.status === 'archived' ? GOAL_DIALOG_MESSAGES.archived(goal.name) : GOAL_DIALOG_MESSAGES.goalGone })
    // The account is the user's choice. It is filled in only when they typed it and it still exists.
    let accountId = ''
    if (f.account && f.account.value && f.account.value.id != null) {
      const account = accounts.find((a) => a && String(a.id) === String(f.account.value.id))
      if (account) accountId = account.id
    }
    return deepFreeze({
      ok: true,
      dialog: 'contribute',
      goalId: goal.id,
      prefill: { amount: f.amount.value, accountId },
      notice: [GOAL_DIALOG_MESSAGES.contributeBanner, ...noteOf(f.goal)],
    })
  }

  return IGNORE
}

/**
 * Which goal did a just-confirmed "create" make? `rows` are the user's goals read AFTER the save
 * ({ id, name, target_amount, status }), `beforeIds` the ids the page knew BEFORE it, and `saved`
 * what was submitted ({ name, targetAmount }). Exactly one new, active goal with that name and
 * target means it is the one. Zero or several, or anything unreadable, means "cannot tell": null.
 */
export function pickCreatedGoal(rows, beforeIds, saved) {
  if (!Array.isArray(rows) || !Array.isArray(beforeIds) || !saved || !isText(saved.name) || !Number.isFinite(saved.targetAmount)) return null
  const before = new Set(beforeIds.map((id) => String(id)))
  const matches = rows.filter((r) => r && r.id != null && !before.has(String(r.id))
    && r.name === saved.name && r.status === 'active' && Number(r.target_amount) === saved.targetAmount)
  if (matches.length !== 1) return null
  return deepFreeze({ id: String(matches[0].id), name: matches[0].name })
}
