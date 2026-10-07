// P3 (Money Inbox command layer) — the AMOUNT READER.
//
// Finds the money amount in a typed sentence: ₹500, 500 rs, 25k, 2 lakh, 1,00,000.
// It reads nothing else: no intents, no names, no periods.
//
// WHY IT IS A SEPARATE COPY: the command folder may import only its own modules
// (rule I10), so it cannot borrow the transaction parser's reader. This one follows
// the same rules, and `commandAmountCrossCheck.test.js` proves the two agree.
//
// ONE DELIBERATE DIFFERENCE: the transaction parser quietly picks one number when a
// sentence has several ("coffee 80, bus 40"). A command must never do that. Two
// different amounts at the same level of certainty come back as `ambiguous`, with
// both listed, so the caller asks.
//
// Priority (as in the transaction parser): explicit currency (₹, rs, rupees), then
// shorthand (25k, 2 lakh, 1.5L), then a plain number. Numbers that are really part
// of a date ("12 Sept", "December 2026"), a quantity ("5kg", "2pm") or a head-count
// ("3 months", "5 friends") are set aside. A bare "L" is lakh only where a large sum
// is plausible, never for litres.
//
// PURE. No imports. No database, React or router. No clock, no randomness.
// Results are deeply frozen.

export class AmountReaderError extends Error {
  constructor(code, message) {
    super(message)
    this.name = 'AmountReaderError'
    this.code = code
  }
}

function freeze(value) {
  if (value && typeof value === 'object' && !Object.isFrozen(value)) {
    Object.freeze(value)
    for (const key of Object.keys(value)) freeze(value[key])
  }
  return value
}

const MONTH = '(?:jan(?:uary)?|feb(?:ruary)?|mar(?:ch)?|apr(?:il)?|may|june?|july?|aug(?:ust)?|sep(?:t(?:ember)?)?|oct(?:ober)?|nov(?:ember)?|dec(?:ember)?)'
const DATE_NUMBERS = [
  /\b\d{4}-\d{2}-\d{2}\b/g, // a full ISO date first, so its day is not left behind
  /\b(?:19|20|21)\d{2}-\d{2}\b/g, // "2026-12"
  new RegExp(`\\b${MONTH}\\.?\\s+(?:19|20|21)\\d{2}\\b`, 'g'), // "december 2026"
  new RegExp(`\\b\\d{1,2}(?:st|nd|rd|th)?\\s+(?:of\\s+)?${MONTH}\\b\\.?`, 'g'),
  new RegExp(`\\b${MONTH}\\.?\\s+\\d{1,2}(?:st|nd|rd|th)?\\b`, 'g'),
  /\b\d+\s+days?\s+ago\b/g,
  /\b\d{1,2}[/-]\d{1,2}(?:[/-]\d{2,4})?\b/g,
]
const QUANTITY = /\d+(?:\.\d+)?\s*(?:kgs?|gms?|g|ml|l|ltrs?|litres?|liters?|kms?|cm|m|hrs?|hours?|mins?|minutes?|pm|am|x|%)(?![a-z0-9])/g
const COUNTS = /\d+\s*(?:people|persons?|pax|friends|guys|members|cups|plates|items?|pcs|pieces?|tickets?|days?|nights?|weeks?|months?|years?)(?![a-z0-9])/g
const BIG_MONEY = /\b(?:salary|ctc|bonus|package|income|loan|payout|deposit|advance|down\s*payment|emi|insurance|investment|savings|fees?|tuition|car|bike|flat|house|sip|fd)\b/
const LITRE_CONTEXT = /\b(?:petrol|diesel|fuel|oil|milk|water|juice|cng|lpg|gas|litres?|liters?|ltrs?)\b/
const UNIT_VALUE = { k: 1e3, l: 1e5, lac: 1e5, lacs: 1e5, lakh: 1e5, lakhs: 1e5, crore: 1e7, crores: 1e7 }

const toNumber = (s) => Number(s.replace(/,/g, ''))
const scale = (n, unit) => Math.round(n * (UNIT_VALUE[unit] ?? 1) * 100) / 100

/** Keep the first of each distinct value. Zero, negative and non-numbers are not amounts. */
function distinct(list) {
  const out = []
  for (const item of list) {
    if (!Number.isFinite(item.value) || item.value <= 0) continue
    if (!out.some((o) => o.value === item.value)) out.push(item)
  }
  return out
}

function answer(list) {
  if (list.length === 0) return null
  if (list.length === 1) return { status: 'found', value: list[0].value, raw: list[0].raw, candidates: [list[0]] }
  return { status: 'ambiguous', candidates: list }
}

/**
 * Read the amount in `text`.
 * @returns {{status:'found', value:number, raw:string, candidates:object[]} | {status:'ambiguous', candidates:{value:number, raw:string}[]} | {status:'none'}}
 */
export function readAmount(text) {
  if (typeof text !== 'string') throw new AmountReaderError('text_required', 'readAmount needs the text to read')
  let lower = text.toLowerCase()
  for (const re of DATE_NUMBERS) lower = lower.replace(re, ' ')

  // 1. Explicit currency: ₹500, ₹25k, ₹2 lakh, 500 rs, 500 rupees.
  const currency = []
  for (const m of lower.matchAll(/₹\s*([\d,]*\d[\d,]*(?:\.\d+)?)\s*(k|lakhs?|lacs?|crores?)?(?![a-z0-9])/g)) {
    currency.push({ value: scale(toNumber(m[1]), m[2]), raw: m[0].trim() })
  }
  for (const m of lower.matchAll(/([\d,]*\d[\d,]*(?:\.\d+)?)\s*(?:rs\.?|rupees)\b/g)) {
    currency.push({ value: toNumber(m[1]), raw: m[0].trim() })
  }
  const first = answer(distinct(currency))
  if (first) return freeze(first)

  // 2. Shorthand: 25k, 1.5k, 2 lakh, 1.5L (L only where a large sum is plausible).
  const litres = LITRE_CONTEXT.test(lower)
  const shorthand = []
  for (const m of lower.matchAll(/(?:^|[^\w.,])(\d[\d,]*(?:\.\d+)?)\s*(k|lakhs?|lacs?|crores?|l)(?![a-z0-9])/g)) {
    if (m[2] === 'l' && (litres || !BIG_MONEY.test(lower))) continue
    shorthand.push({ value: scale(toNumber(m[1]), m[2]), raw: m[0].trim() })
  }
  const second = answer(distinct(shorthand))
  if (second) return freeze(second)

  // 3. Plain numbers, once quantities and head-counts are set aside.
  const cleaned = lower.replace(QUANTITY, ' ').replace(COUNTS, ' ')
  const plain = []
  for (const m of cleaned.matchAll(/\b(\d[\d,]*(?:\.\d+)?)\b/g)) plain.push({ value: toNumber(m[1]), raw: m[1] })
  const third = answer(distinct(plain))
  if (third) return freeze(third)

  return freeze({ status: 'none' })
}
