// Deterministic date parsing for Money Inbox natural-language entries.
// No dependencies, no LLM. Always returns an ISO date string 'YYYY-MM-DD'.
// Defaults to referenceDate (today) when nothing recognizable is found —
// this default is not a financial guess (type/amount/accounts), just a
// fallback for an omitted date, so it does not need "assumed" tracking.

const WEEKDAYS = ['sunday', 'monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday']

const MONTHS = {
  jan: 0, january: 0,
  feb: 1, february: 1,
  mar: 2, march: 2,
  apr: 3, april: 3,
  may: 4,
  jun: 5, june: 5,
  jul: 6, july: 6,
  aug: 7, august: 7,
  sep: 8, sept: 8, september: 8,
  oct: 9, october: 9,
  nov: 10, november: 10,
  dec: 11, december: 11,
}

function toISO(date) {
  const y = date.getFullYear()
  const m = String(date.getMonth() + 1).padStart(2, '0')
  const d = String(date.getDate()).padStart(2, '0')
  return `${y}-${m}-${d}`
}

function addDays(date, days) {
  const d = new Date(date)
  d.setDate(d.getDate() + days)
  return d
}

// Most recent date <= fromDate that falls on targetWeekday (0=Sun..6=Sat).
function mostRecentWeekdayOnOrBefore(fromDate, targetWeekday) {
  let d = new Date(fromDate)
  while (d.getDay() !== targetWeekday) {
    d = addDays(d, -1)
  }
  return d
}

/**
 * Parse a date reference out of free text.
 * @param {string} text
 * @param {Date} referenceDate - defaults to now; pass explicitly in tests for determinism
 * @returns {string} ISO date 'YYYY-MM-DD'
 */
export function parseDate(text, referenceDate = new Date()) {
  const lower = text.toLowerCase()
  const today = new Date(referenceDate.getFullYear(), referenceDate.getMonth(), referenceDate.getDate())

  if (/\btoday\b/.test(lower)) return toISO(today)
  if (/\btomorrow\b/.test(lower)) return toISO(addDays(today, 1))
  if (/\byesterday\b/.test(lower)) return toISO(addDays(today, -1))
  if (/\blast night\b/.test(lower)) return toISO(addDays(today, -1))
  if (/\bthis morning\b/.test(lower)) return toISO(today)

  // ISO date: 2026-08-25
  const iso = lower.match(/\b(\d{4})-(\d{2})-(\d{2})\b/)
  if (iso) {
    const d = new Date(Number(iso[1]), Number(iso[2]) - 1, Number(iso[3]))
    return toISO(d)
  }

  // dd/mm/yyyy
  const dmy = lower.match(/\b(\d{1,2})\/(\d{1,2})\/(\d{4})\b/)
  if (dmy) {
    const d = new Date(Number(dmy[3]), Number(dmy[2]) - 1, Number(dmy[1]))
    return toISO(d)
  }

  // "last <weekday>" — strictly before today, even if today matches
  const lastWeekday = lower.match(/\blast\s+(sunday|monday|tuesday|wednesday|thursday|friday|saturday)\b/)
  if (lastWeekday) {
    const target = WEEKDAYS.indexOf(lastWeekday[1])
    const searchFrom = addDays(today, -1)
    return toISO(mostRecentWeekdayOnOrBefore(searchFrom, target))
  }

  // bare weekday name — most recent occurrence, today included if it matches
  const bareWeekday = lower.match(/\b(sunday|monday|tuesday|wednesday|thursday|friday|saturday)\b/)
  if (bareWeekday) {
    const target = WEEKDAYS.indexOf(bareWeekday[1])
    return toISO(mostRecentWeekdayOnOrBefore(today, target))
  }

  // "25 Aug" or "Aug 25" (optionally with year, but v1 assumes current year)
  const monthNamesPattern = Object.keys(MONTHS).join('|')
  const dayMonth = lower.match(new RegExp(`\\b(\\d{1,2})\\s+(${monthNamesPattern})\\b`))
  const monthDay = lower.match(new RegExp(`\\b(${monthNamesPattern})\\s+(\\d{1,2})\\b`))
  if (dayMonth) {
    const day = Number(dayMonth[1])
    const month = MONTHS[dayMonth[2]]
    return toISO(new Date(today.getFullYear(), month, day))
  }
  if (monthDay) {
    const month = MONTHS[monthDay[1]]
    const day = Number(monthDay[2])
    return toISO(new Date(today.getFullYear(), month, day))
  }

  // Nothing recognized — default to today
  return toISO(today)
}
