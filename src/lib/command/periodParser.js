// P2 (Money Inbox command layer) — the PERIOD READER.
//
// Finds a MONTH-level period in a piece of text ("this month", "last month",
// "next month", "December", "October 2026", "2026-10") and says exactly which
// calendar month it is. It reads nothing else: no amounts, no intents, no names.
//
// WHY IT EXISTS: the app's older date parser silently treats "this month",
// "next month", "last month" and "in October" as TODAY. That is wrong for a
// question like "how much did I spend last month?". This reader never does that:
//   - a month it understands is returned exactly;
//   - a period word it does NOT support (today, week, year, quarter, "30 days")
//     is reported as 'unsupported', so the caller asks instead of quietly using
//     the current month;
//   - when it has to ASSUME something (a month name with no year, or the
//     default month) it says so, in plain words, in `assumption`.
// readPeriod never applies the default itself. currentMonthPeriod() is the
// explicit default, and the caller must choose to use it.
//
// PURE. No imports. No database, React or router. NO CLOCK: the caller passes the
// reference date. All month arithmetic is plain integer maths (no Date objects).
// Every result is deeply frozen.

export class PeriodReaderError extends Error {
  constructor(code, message) {
    super(message)
    this.name = 'PeriodReaderError'
    this.code = code
  }
}
const fail = (code, message) => { throw new PeriodReaderError(code, message) }

function freeze(value) {
  if (value && typeof value === 'object' && !Object.isFrozen(value)) {
    Object.freeze(value)
    for (const key of Object.keys(value)) freeze(value[key])
  }
  return value
}

// ---------- month arithmetic (integers only) ----------
const MONTH_NAMES = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December']
const pad = (n, width) => String(n).padStart(width, '0')

function daysInMonth(year, month) {
  if (month === 2) return year % 4 === 0 && (year % 100 !== 0 || year % 400 === 0) ? 29 : 28
  return [4, 6, 9, 11].includes(month) ? 30 : 31
}

/** The year and month `offset` months away from (year, month). */
function shiftMonth(year, month, offset) {
  const index = year * 12 + (month - 1) + offset
  return { year: Math.floor(index / 12), month: (index % 12) + 1 }
}

function makePeriod(year, month, details) {
  return {
    kind: 'month',
    month: `${pad(year, 4)}-${pad(month, 2)}`,
    start: `${pad(year, 4)}-${pad(month, 2)}-01`,
    end: `${pad(year, 4)}-${pad(month, 2)}-${pad(daysInMonth(year, month), 2)}`,
    label: `${MONTH_NAMES[month - 1]} ${year}`,
    how: details.how,
    matchedText: details.matchedText ?? null,
    assumed: details.assumed ?? false,
    assumption: details.assumption ?? null,
  }
}

function referenceParts(referenceDate) {
  if (!(referenceDate instanceof Date) || Number.isNaN(referenceDate.getTime())) {
    fail('reference_date_required', 'A valid Date must be passed in as the reference date; this module never reads the clock.')
  }
  return { year: referenceDate.getFullYear(), month: referenceDate.getMonth() + 1 }
}

/** The month for a given year and month (1 to 12), as if the user had written it in full. */
export function monthPeriod(year, month) {
  if (!Number.isInteger(year) || year < 1 || year > 9999) fail('invalid_month', `Not a valid year: ${year}`)
  if (!Number.isInteger(month) || month < 1 || month > 12) fail('invalid_month', `Not a valid month: ${month}`)
  return freeze(makePeriod(year, month, { how: 'explicit' }))
}

/** The explicit default: the reference month, clearly marked as assumed. readPeriod never applies this itself. */
export function currentMonthPeriod(referenceDate) {
  const ref = referenceParts(referenceDate)
  return freeze(makePeriod(ref.year, ref.month, { how: 'default', assumed: true, assumption: 'Using the current calendar month' }))
}

// ---------- what it understands ----------
const RELATIVE = [
  { re: /\b(?:this|current|present)\s+month\b/gi, offset: 0 },
  { re: /\b(?:last|previous|prior)\s+month\b/gi, offset: -1 },
  { re: /\b(?:next|following|coming)\s+month\b/gi, offset: 1 },
]

const MONTH_WORDS = {
  january: 1, jan: 1, february: 2, feb: 2, march: 3, mar: 3, april: 4, apr: 4, may: 5, june: 6, jun: 6,
  july: 7, jul: 7, august: 8, aug: 8, september: 9, sep: 9, sept: 9, october: 10, oct: 10,
  november: 11, nov: 11, december: 12, dec: 12,
}
const NAME_RE = new RegExp(`\\b(${Object.keys(MONTH_WORDS).sort((a, b) => b.length - a.length).join('|')})\\b(?:\\s+((?:19|20|21)\\d{2})\\b)?`, 'gi')
const ISO_RE = /(?<![\d-])((?:19|20|21)\d{2})-(0[1-9]|1[0-2])(?![\d-])/g

// Day-, week-, year- and quarter-level periods are out of scope here, so they
// are REPORTED, never ignored.
const UNSUPPORTED_RE = /\b(?:today|yesterday|tomorrow|tonight|weeks?|weekly|fortnight|years?|yearly|annual|quarters?|q[1-4])\b|\b\d+\s+days\b/gi

// "may" is also a common verb ("may I add 500"). It only counts as a month after
// one of these cue words, before a 4-digit year, or when it is the whole text.
const MAY_CUE_RE = /\b(?:in|by|for|of|during|until|till|from|since|to)\s+$/i
function mayCounts(text, index, hasYear) {
  if (hasYear) return true
  if (text.trim().toLowerCase() === 'may') return true
  return MAY_CUE_RE.test(text.slice(0, index))
}

function findUnsupported(text) {
  const words = []
  for (const m of text.matchAll(UNSUPPORTED_RE)) {
    const word = m[0].toLowerCase().replace(/\s+/g, ' ')
    if (!words.includes(word)) words.push(word)
  }
  return words
}

// ---------- the reader ----------
export function readPeriod(text, referenceDate, options) {
  const ref = referenceParts(referenceDate)
  if (typeof text !== 'string') fail('text_required', 'readPeriod needs the text to read')
  const prefer = options ? options.prefer : undefined
  if (prefer !== undefined && prefer !== 'past' && prefer !== 'future') fail('invalid_prefer', 'prefer must be "past" or "future"')

  const unsupported = findUnsupported(text)
  if (unsupported.length) return freeze({ status: 'unsupported', unsupported })

  // Every period phrase found, in the order it appears.
  const found = []
  for (const rule of RELATIVE) {
    for (const m of text.matchAll(rule.re)) found.push({ index: m.index, relative: rule.offset, matchedText: m[0] })
  }
  for (const m of text.matchAll(ISO_RE)) found.push({ index: m.index, year: Number(m[1]), month: Number(m[2]), matchedText: m[0] })
  for (const m of text.matchAll(NAME_RE)) {
    const month = MONTH_WORDS[m[1].toLowerCase()]
    const year = m[2] ? Number(m[2]) : null
    if (m[1].toLowerCase() === 'may' && !mayCounts(text, m.index, year !== null)) continue
    found.push({ index: m.index, month, year, matchedText: m[0] })
  }
  found.sort((a, b) => a.index - b.index)

  const periods = []
  for (const f of found) {
    if (f.relative !== undefined) {
      const { year, month } = shiftMonth(ref.year, ref.month, f.relative)
      periods.push(makePeriod(year, month, { how: 'relative', matchedText: f.matchedText }))
    } else if (f.year !== null) {
      periods.push(makePeriod(f.year, f.month, { how: 'explicit', matchedText: f.matchedText }))
    } else {
      // A month name with no year: the caller must say which direction to look.
      if (prefer === undefined) fail('prefer_required', 'A month name without a year needs options.prefer ("past" or "future").')
      const year = prefer === 'past' ? (f.month <= ref.month ? ref.year : ref.year - 1) : (f.month >= ref.month ? ref.year : ref.year + 1)
      const label = `${MONTH_NAMES[f.month - 1]} ${year}`
      const assumption = prefer === 'past'
        ? `No year given, so using the most recent ${MONTH_NAMES[f.month - 1]}: ${label}`
        : `No year given, so using the upcoming ${MONTH_NAMES[f.month - 1]}: ${label}`
      periods.push(makePeriod(year, f.month, { how: 'named', matchedText: f.matchedText, assumed: true, assumption }))
    }
  }

  // The same month said twice is still one month.
  const distinct = []
  for (const p of periods) if (!distinct.some((d) => d.month === p.month)) distinct.push(p)

  if (distinct.length === 0) return freeze({ status: 'none' })
  if (distinct.length === 1) return freeze({ status: 'found', period: distinct[0] })
  return freeze({ status: 'ambiguous', candidates: distinct.sort((a, b) => (a.month < b.month ? -1 : 1)) })
}
