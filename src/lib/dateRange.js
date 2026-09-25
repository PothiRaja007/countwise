// Pure date-range helpers — no Supabase calls, no JSX. Extracted out of
// Charts.jsx (Phase 19) so Reports.jsx can reuse the exact same period
// logic instead of a second, subtly-different implementation. Charts.jsx
// was updated to import from here instead of defining these locally —
// flagged explicitly in the Phase 19 handoff since Charts.jsx is otherwise
// meant to stay untouched.

export const PERIODS = [
  { key: '30D', label: '30D', days: 30 },
  { key: '3M', label: '3M', days: 90 },
  { key: '6M', label: '6M', days: 180 },
  { key: '1Y', label: '1Y', days: 365 },
]

export function toISODate(date) {
  const y = date.getFullYear()
  const m = String(date.getMonth() + 1).padStart(2, '0')
  const d = String(date.getDate()).padStart(2, '0')
  return `${y}-${m}-${d}`
}

export function fromISODate(iso) {
  const [y, m, d] = iso.split('-').map(Number)
  return new Date(y, m - 1, d)
}

export function addDays(date, days) {
  const d = new Date(date)
  d.setDate(d.getDate() + days)
  return d
}

export function startOfToday() {
  const now = new Date()
  return new Date(now.getFullYear(), now.getMonth(), now.getDate())
}

/** The last `days` days ending at `endDate` (inclusive on both ends). */
export function periodRange(days, endDate = startOfToday()) {
  const end = toISODate(endDate)
  const start = toISODate(addDays(endDate, -(days - 1)))
  return { start, end }
}

/** The period of the same length immediately preceding `currentStart`. */
export function previousRange(days, currentStart) {
  const end = addDays(fromISODate(currentStart), -1)
  return periodRange(days, end)
}

export function formatShortDate(iso) {
  return fromISODate(iso).toLocaleDateString('en-IN', { day: 'numeric', month: 'short' })
}
