// P9 (Money Inbox command layer) — what the BUDGETS PAGE does with a handoff.
//
//   budgetDialogFromHandoff(pending, { budgets, categories, currentMonth })
//        → { ok: true, dialog: 'recipe', month, notice }
//        | { ok: true, dialog: 'edit_budget', budgetId, prefill: { amount }, notice }
//        | { ok: true, dialog: 'create_budget', prefill: { categoryId, amount, month }, notice }
//        | { ok: false, message }          (message is null when the handoff is simply ignored)
//   monthAfter(month) → 'YYYY-MM' of the next month
//
// THE RULES IT KEEPS:
//   - It only reads a handed-off CREATE_BUDGET_MONTH or MODIFY_BUDGET_AMOUNT. Anything else is ignored.
//   - It decides what to PUT IN FRONT OF THE USER and nothing more. It writes nothing: the page's own
//     recipe or form confirms and saves.
//   - The page's own lists decide what exists. `categories` is the page's list of SPENDING categories, so
//     an income category (or one that is gone) is refused. `budgets` is the page's own rows.
//   - A relative change ("increase by 500") is calculated HERE, from the page's own row, never from a
//     remembered number. The result is only a pre-fill, labelled "calculated", and stays editable.
//     A result of zero or less is refused; so is a result equal to the current amount.
//   - Create: this month or next month only (the page tells us which month "this" is).
//   - Modify: the month the user typed, otherwise the current month, and the notice says which.
//   - With no row and an exact amount, the New budget form is offered pre-filled; with no row and a
//     relative change there is nothing to change, so the user is told how to say it.
//
// PURE. Imports only its sibling modules. No database, no screen code, no clock (the page passes
// `currentMonth` in), no randomness. Results are deeply frozen and inputs are never changed.

import { deepFreeze } from './intents.js'

const MONTH_NAMES = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December']
const MONTH_RE = /^(\d{4})-(0[1-9]|1[0-2])$/

/** "2026-11" → "November 2026" (no locale, no timezone). */
export function monthName(month) {
  const m = MONTH_RE.exec(month)
  return m ? `${MONTH_NAMES[Number(m[2]) - 1]} ${m[1]}` : String(month)
}

/** "2026-12" → "2027-01". Returns null for anything that is not YYYY-MM. */
export function monthAfter(month) {
  const m = MONTH_RE.exec(month)
  if (!m) return null
  const y = Number(m[1])
  const mo = Number(m[2])
  return mo === 12 ? `${y + 1}-01` : `${y}-${String(mo + 1).padStart(2, '0')}`
}

/** ₹ amount with Indian digit grouping, without a locale: 4500 → ₹4,500 ; 125000.5 → ₹1,25,000.50 */
export function inr(n) {
  const v = Math.round(Number(n) * 100) / 100
  const sign = v < 0 ? '-' : ''
  const [whole, frac] = Math.abs(v).toFixed(2).split('.')
  const last3 = whole.slice(-3)
  const rest = whole.slice(0, -3)
  const grouped = rest ? `${rest.replace(/\B(?=(\d{2})+(?!\d))/g, ',')},${last3}` : last3
  return `${sign}₹${grouped}${frac === '00' ? '' : `.${frac}`}`
}

// ---------- the words (pinned by tests) ----------
export const BUDGET_DIALOG_MESSAGES = deepFreeze({
  recipeBanner: (label) => `From Money Inbox. This recipe builds the budget for ${label}. Nothing is saved until you confirm it here.`,
  editBanner: 'From Money Inbox. Nothing is saved until you press Save.',
  createBanner: 'From Money Inbox. Nothing is saved until you press Create budget.',
  monthLimit: 'I can start a budget for this month or next month only.',
  allBudgeted: (label) => `Every spending category already has a budget for ${label}.`,
  noCategories: 'There are no spending categories to budget yet.',
  notSpending: 'Budgets are for spending categories.',
  noRowRelative: (name, label) => `You don't have a ${name} budget for ${label}. Try: Set my ${name.toLowerCase()} budget to ₹5,000.`,
  same: (name, label, amount) => `Your ${name} budget for ${label} is already ${inr(amount)}.`,
  tooLow: (name, label) => `That would take your ${name} budget for ${label} to ₹0 or below. Nothing was changed.`,
  usingCurrent: (label) => `Month: ${label} (the current month).`,
  usingTyped: (label) => `Month: ${label}.`,
  change: (from, to) => `Changing ${inr(from)} to ${inr(to)}.`,
  calculated: (from, direction, by, to) => `Calculated from your current ${inr(from)} budget: ${inr(from)} ${direction === 'increase' ? '+' : '-'} ${inr(by)} = ${inr(to)}. You can still change the amount.`,
  noRow: (name, label) => `You don't have a ${name} budget for ${label} yet. This will create one.`,
  formOpen: 'A budget form is already open. Finish or close it first, then send your message again.',
  recipeBusy: 'You are in the middle of a budget recipe. Finish it first, then send your message again.',
})

const IGNORE = deepFreeze({ ok: false, message: null })
const isText = (v) => typeof v === 'string' && v.trim() !== ''
const noteOf = (field) => (field && isText(field.note) ? [field.note] : [])
const round2 = (n) => Math.round(n * 100) / 100
const refuse = (message) => deepFreeze({ ok: false, message })

export function budgetDialogFromHandoff(pending, context) {
  if (!pending || typeof pending !== 'object' || pending.status !== 'handed_off' || !pending.fields || typeof pending.fields !== 'object') return IGNORE
  const ctx = context && typeof context === 'object' ? context : {}
  const budgets = Array.isArray(ctx.budgets) ? ctx.budgets : []
  const categories = Array.isArray(ctx.categories) ? ctx.categories : []
  const currentMonth = typeof ctx.currentMonth === 'string' && MONTH_RE.test(ctx.currentMonth) ? ctx.currentMonth : null
  const f = pending.fields
  if (!currentMonth) return IGNORE

  const hasRow = (categoryId, month) => budgets.find((b) => b && String(b.category_id) === String(categoryId) && typeof b.period_start === 'string' && b.period_start.slice(0, 7) === month)

  if (pending.intent === 'CREATE_BUDGET_MONTH') {
    const month = f.month && f.month.value && f.month.value.month
    if (typeof month !== 'string' || !MONTH_RE.test(month)) return IGNORE
    if (month !== currentMonth && month !== monthAfter(currentMonth)) return refuse(BUDGET_DIALOG_MESSAGES.monthLimit)
    const label = monthName(month)
    if (categories.length === 0) return refuse(BUDGET_DIALOG_MESSAGES.noCategories)
    if (categories.every((c) => c && hasRow(c.id, month))) return refuse(BUDGET_DIALOG_MESSAGES.allBudgeted(label))
    return deepFreeze({ ok: true, dialog: 'recipe', month, notice: [BUDGET_DIALOG_MESSAGES.recipeBanner(label), ...noteOf(f.month)] })
  }

  if (pending.intent === 'MODIFY_BUDGET_AMOUNT') {
    if (!f.category || !f.category.value || f.category.value.id == null) return IGNORE
    const exact = f.newAmount && Number.isFinite(f.newAmount.value) && f.newAmount.value > 0 ? round2(f.newAmount.value) : null
    const rel = f.relativeChange && f.relativeChange.value
    const relative = rel && (rel.direction === 'increase' || rel.direction === 'decrease') && Number.isFinite(rel.amount) && rel.amount > 0 ? { direction: rel.direction, amount: round2(rel.amount) } : null
    if (exact === null && !relative) return IGNORE

    let month = currentMonth
    let monthLine = BUDGET_DIALOG_MESSAGES.usingCurrent(monthName(currentMonth))
    const typed = f.month && f.month.value && f.month.value.month
    if (typed !== undefined && typed !== null) {
      if (typeof typed !== 'string' || !MONTH_RE.test(typed)) return IGNORE
      month = typed
      monthLine = BUDGET_DIALOG_MESSAGES.usingTyped(monthName(typed))
    }
    const label = monthName(month)

    const category = categories.find((c) => c && String(c.id) === String(f.category.value.id))
    if (!category) return refuse(BUDGET_DIALOG_MESSAGES.notSpending)
    const name = category.name
    const row = hasRow(category.id, month)

    if (!row) {
      if (exact === null) return refuse(BUDGET_DIALOG_MESSAGES.noRowRelative(name, label))
      return deepFreeze({
        ok: true,
        dialog: 'create_budget',
        prefill: { categoryId: category.id, amount: exact, month },
        notice: [BUDGET_DIALOG_MESSAGES.createBanner, BUDGET_DIALOG_MESSAGES.noRow(name, label), monthLine, ...noteOf(f.category)],
      })
    }

    const current = Number(row.amount)
    if (!Number.isFinite(current)) return IGNORE
    const target = exact !== null ? exact : round2(relative.direction === 'increase' ? current + relative.amount : current - relative.amount)
    if (target <= 0) return refuse(BUDGET_DIALOG_MESSAGES.tooLow(name, label))
    if (target === round2(current)) return refuse(BUDGET_DIALOG_MESSAGES.same(name, label, current))
    return deepFreeze({
      ok: true,
      dialog: 'edit_budget',
      budgetId: row.id,
      prefill: { amount: target },
      notice: [
        BUDGET_DIALOG_MESSAGES.editBanner,
        `${name} budget · ${label}`,
        monthLine,
        exact !== null ? BUDGET_DIALOG_MESSAGES.change(current, target) : BUDGET_DIALOG_MESSAGES.calculated(current, relative.direction, relative.amount, target),
        ...noteOf(f.category),
      ],
    })
  }

  return IGNORE
}
