// Natural-language quick-entry parsing + rule-based auto-categorization.
// No LLM, no network call — fully offline, deterministic.
//
// v1 functions (parseQuickEntry, matchCategory, DEFAULT_RULE_KEYWORDS) are
// kept unchanged below for backward compatibility. Phase 3 adds multi-
// transaction Money Inbox parsing: parseAmount, detectType, detectAccounts,
// splitClauses, parseClause.

import { parseDate } from './dateParser.js'

/**
 * Parse a free-text entry like "coffee 80" or "80 coffee" or "uber to college 120.50"
 * into { amountRaw, description }. Amount = last standalone number found.
 */
export function parseQuickEntry(text) {
  const trimmed = text.trim()
  const match = trimmed.match(/(\d+(\.\d+)?)/g)
  if (!match) return { amountRaw: null, description: trimmed }
  const amountRaw = match[match.length - 1]
  const description = trimmed.replace(amountRaw, '').replace(/\s+/g, ' ').trim()
  return { amountRaw: Number(amountRaw), description }
}

/**
 * Match a description against a user's category_rules (+ default rules).
 * rules: [{ keyword, category_id, priority }]
 * Returns category_id or null if no match (caller should prompt manual pick).
 */
// Whole-word keyword matching (G0). A bare substring match let a keyword hide
// inside another word: "tea" in "team", "bus" in "business", "ola" in "cola",
// "rent" in "current", "book" in "booking", "train" in "training". The keyword
// must now start at a word boundary and end at one, allowing only a plural (and,
// for keywords longer than 4 letters, a past-tense "d"/"ed"): "movies", "snacks",
// "recharged" still match; "team", "business", "training" do not.
function keywordMatches(lower, keyword) {
  const k = keyword.toLowerCase().trim()
  if (!k) return false
  const escaped = k.replace(/[.*+?^${}()|[\]\\]/g, '\\$&').replace(/\s+/g, '\\s+')
  const suffix = k.length <= 4 ? '(?:s|es)?' : '(?:s|es|d|ed)?'
  return new RegExp(`(?:^|[^a-z0-9])${escaped}${suffix}(?![a-z0-9])`).test(lower)
}

export function matchCategory(description, rules) {
  if (!description) return null
  const lower = description.toLowerCase()
  const hits = rules.filter((r) => keywordMatches(lower, r.keyword))
  if (hits.length === 0) return null
  hits.sort((a, b) => (b.priority ?? 0) - (a.priority ?? 0))
  return hits[0].category_id
}

// Seed keyword sets an onboarding step can insert as category_rules,
// keyed by default category name so IDs can be resolved after the
// default categories are fetched from Supabase.
export const DEFAULT_RULE_KEYWORDS = {
  Food: ['coffee', 'lunch', 'dinner', 'breakfast', 'snack', 'restaurant', 'zomato', 'swiggy', 'tea', 'canteen'],
  Transport: ['uber', 'ola', 'bus', 'metro', 'auto', 'taxi', 'train'],
  Fuel: ['petrol', 'diesel', 'fuel', 'gas station'],
  Entertainment: ['movie', 'netflix', 'spotify', 'game', 'party', 'outing'],
  'Bills & Utilities': ['recharge', 'electricity', 'rent', 'wifi', 'phone bill', 'subscription'],
  Education: ['book', 'course', 'certification', 'exam fee', 'tuition fee', 'stationery'],
  Shopping: ['amazon', 'flipkart', 'clothes', 'shoes'],
  Health: ['pharmacy', 'doctor', 'medicine', 'gym'],
  Salary: ['salary', 'stipend'],
  'Tuition/Freelance income': ['tuition', 'freelance', 'client payment'],
  Allowance: ['allowance', 'pocket money'],
}

// ---------------------------------------------------------------------
// Phase 3: Money Inbox multi-transaction parsing
// ---------------------------------------------------------------------

/**
 * Extract a monetary amount from text. Handles ₹500, 500 rs, 500 rupees,
 * and comma-grouped numbers (25,000). Returns a number or null.
 */
// --- Amount parsing helpers (G0) -------------------------------------------------
// A date's own numbers ("12 Sept", "Sept 12th", "3 days ago") are not amounts:
// "12 Sept coffee 80" must read 80, not 12.
const MONTH = '(?:jan(?:uary)?|feb(?:ruary)?|mar(?:ch)?|apr(?:il)?|may|june?|july?|aug(?:ust)?|sep(?:t(?:ember)?)?|oct(?:ober)?|nov(?:ember)?|dec(?:ember)?)'
const DATE_NUMBERS = [
  new RegExp(`\\b\\d{1,2}(?:st|nd|rd|th)?\\s+(?:of\\s+)?${MONTH}\\b\\.?`, 'g'),
  new RegExp(`\\b${MONTH}\\.?\\s+\\d{1,2}(?:st|nd|rd|th)?\\b`, 'g'),
  /\b\d+\s+days?\s+ago\b/g,
  /\b\d{4}-\d{2}-\d{2}\b/g, // 2026-09-28 (the ISO form the date parser understands)
  /\b\d{1,2}[/-]\d{1,2}(?:[/-]\d{2,4})?\b/g, // 28/09, 28-09-2026
]
// Quantities are not amounts either: "10 L", "5kg", "2pm", "10km", "2x", "50%".
const QUANTITY = /\d+(?:\.\d+)?\s*(?:kgs?|gms?|g|ml|l|ltrs?|litres?|liters?|kms?|cm|m|hrs?|hours?|mins?|minutes?|pm|am|x|%)(?![a-z0-9])/g
// Head-counts and durations are not amounts: "5 friends", "2 people", "3 months".
const COUNTS = /\d+\s*(?:people|persons?|pax|friends|guys|members|cups|plates|items?|pcs|pieces?|tickets?|days?|nights?|weeks?|months?|years?)(?![a-z0-9])/g
// A bare "L" is lakh only where large sums are plausible (a salary, a bonus, a loan, a
// car). Otherwise "4L paint" or "5L oil" is litres: reading it as lakh would turn an
// 800-rupee purchase into 400,000.
const BIG_MONEY = /\b(?:salary|ctc|bonus|package|income|loan|payout|deposit|advance|down\s*payment|emi|insurance|investment|savings|fees?|tuition|car|bike|flat|house|sip|fd)\b/
// "5L" is litres, not five lakh, whenever the sentence is about fuel or liquids.
const LITRE_CONTEXT = /\b(?:petrol|diesel|fuel|oil|milk|water|juice|cng|lpg|gas|litres?|liters?|ltrs?)\b/
const UNIT_VALUE = { k: 1e3, l: 1e5, lac: 1e5, lacs: 1e5, lakh: 1e5, lakhs: 1e5, crore: 1e7, crores: 1e7 }

/**
 * Read an amount from text. Priority: explicit currency (₹, rs, rupees), then
 * shorthand (25k, 1.5k, 2 lakh, 1.5L), then a plain number. Numbers that are
 * really part of a date ("12 Sept") or a quantity ("10 L", "2pm") are ignored,
 * and thousands separators are kept together ("₹8,000", "1,00,000").
 *
 * Deliberately NOT supported: "cr" (it means "credit" on bank statements, not
 * crore) and lookbehind regexes (older iPhones would fail to load the app).
 */
export function parseAmount(text) {
  let lower = text.toLowerCase()
  for (const re of DATE_NUMBERS) lower = lower.replace(re, ' ')

  const toNumber = (s) => Number(s.replace(/,/g, ''))
  const scale = (n, unit) => Math.round(n * (UNIT_VALUE[unit] ?? 1) * 100) / 100

  // 1. Explicit currency: ₹500, ₹2,000, ₹25k, ₹2 lakh, 500 rs, 500 rupees.
  const rupee = lower.match(/₹\s*([\d,]+(?:\.\d+)?)\s*(k|lakhs?|lacs?|crores?)?(?![a-z0-9])/)
  if (rupee) {
    const n = toNumber(rupee[1])
    if (!Number.isNaN(n)) return scale(n, rupee[2])
  }
  const rs = lower.match(/([\d,]+(?:\.\d+)?)\s*(?:rs\.?|rupees)\b/)
  if (rs) {
    const n = toNumber(rs[1])
    if (!Number.isNaN(n)) return n
  }

  // 2. Shorthand: 25k, 1.5k, 2 lakh, 1.5L (L only when the sentence isn't about litres).
  const litres = LITRE_CONTEXT.test(lower)
  for (const m of lower.matchAll(/(?:^|[^\w.,])(\d[\d,]*(?:\.\d+)?)\s*(k|lakhs?|lacs?|crores?|l)(?![a-z0-9])/g)) {
    if (m[2] === 'l' && (litres || !BIG_MONEY.test(lower))) continue
    const n = toNumber(m[1])
    if (!Number.isNaN(n)) return scale(n, m[2])
  }

  // 3. A plain number, ignoring quantities.
  const plain = lower.replace(QUANTITY, ' ').replace(COUNTS, ' ').match(/\b([\d,]+(?:\.\d+)?)\b/)
  if (plain) {
    const n = toNumber(plain[1])
    if (!Number.isNaN(n)) return n
  }
  return null
}

// Distinct plain numbers in a text once dates, quantities and head-counts are set aside.
function plainNumberTokens(lower) {
  let cleaned = lower
  for (const re of DATE_NUMBERS) cleaned = cleaned.replace(re, ' ')
  cleaned = cleaned.replace(QUANTITY, ' ').replace(COUNTS, ' ')
  const tokens = (cleaned.match(/\b[\d,]+(?:\.\d+)?\b/g) || []).map((t) => t.replace(/,/g, '')).filter(Boolean)
  return [...new Set(tokens)]
}

/**
 * True when the amount had to be GUESSED: no currency marker or shorthand, and two or
 * more different plain numbers left after setting aside dates, quantities and
 * head-counts ("got 2 coffees for 160": is it 2 or 160?). parseAmount still returns
 * its best reading; this lets the caller flag the row for review instead of trusting
 * that reading silently.
 */
export function hasAmbiguousAmount(text) {
  const lower = text.toLowerCase()
  if (/₹\s*[\d,]/.test(lower) || /[\d,]+(?:\.\d+)?\s*(?:rs\.?|rupees)\b/.test(lower)) return false
  if (/(?:^|[^\w.,])\d[\d,]*(?:\.\d+)?\s*(?:k|lakhs?|lacs?|crores?)(?![a-z0-9])/.test(lower)) return false
  return plainNumberTokens(lower).length >= 2
}

// Money that ARRIVES, judged by who did the giving (G0). "GF sent me 2000" and
// "dad sent 3000" are income; "sent 500 to dad" and "paid friend back" are not.
const PERSON = '(?:dad|mom|mum|papa|mummy|father|mother|brother|bro|sister|sis|gf|bf|girlfriend|boyfriend|friend|friends|uncle|aunt|grandpa|grandma|parents|client|boss|company|office|employer)'
const GIVE_VERBS = '(?:sent|gave|paid|transferred|credited|deposited|gifted|lent|returned|refunded)'
const INCOMING = [
  new RegExp(`\\b${GIVE_VERBS}\\s+(?:me|us)\\b`), // "GF sent me 2000", "friend paid me back"
  new RegExp(`\\b${PERSON}\\s+${GIVE_VERBS}\\b`), // "dad sent 3000", "client paid 5000"
  /\bgot\s+paid\b/,
]
// "got 5000 from tuition" is income; "got shoes for 2000" and "got 2 coffees for 160" are
// not. So "got <number>" counts only when that number is the sentence's only number.
const GOT_NUMBER = /\bgot\s+(?:my\s+)?(?:₹|rs\.?\s*)?\d/

/**
 * Detect transaction type from keywords. Never silently guesses income or
 * transfer — only expense gets a marked fallback, since it's the
 * overwhelmingly common no-verb case and the review step always shows it
 * before saving (see project decision log).
 *
 * @param {string} text
 * @param {{hasAmount?: boolean}} opts
 * @returns {{type: 'expense'|'income'|'transfer'|null, assumed: boolean}}
 */
export function detectType(text, { hasAmount = true } = {}) {
  const lower = text.toLowerCase()
  const transferKeywords = ['moved', 'transferred', 'transfer', 'withdrew', 'withdrawn', 'withdrawal', 'deposited']
  const expenseKeywords = ['spent', 'paid', 'bought', 'purchased', 'spend']
  // "got" is no longer a bare income keyword: "got shoes for 2000" is an expense.
  // It counts as income only in the INCOMING patterns above.
  // 'recieved'/'recieve': one of English's most common misspellings ("i
  // before e except after c"), added deliberately (G0.1) — not a general
  // spell-checker, just this one high-frequency case that would otherwise
  // silently produce a wrong financial record instead of an ugly one.
  // Deliberately NOT adding the correctly-spelled base form 'receive':
  // unlike 'received', it's a literal substring of unrelated words like
  // 'receiver'/'receivable', which would wrongly flip those to income.
  const incomeKeywords = ['received', 'recieved', 'recieve', 'earned', 'credited', 'salary', 'stipend', 'bonus', 'refund', 'cashback', 'reimburs', 'dividend', 'sold']

  // "mom paid for lunch": someone else paid FOR something. That is neither my income nor my
  // expense, so don't pick one: leave the type empty and the review row asks.
  if (new RegExp(`\\b${PERSON}\\s+(?:paid|gave|sent|treated)\\s+for\\b`).test(lower)) {
    return { type: null, assumed: false }
  }
  if (INCOMING.some((re) => re.test(lower)) || (GOT_NUMBER.test(lower) && plainNumberTokens(lower).length === 1)) {
    return { type: 'income', assumed: false }
  }
  if (transferKeywords.some((k) => lower.includes(k))) {
    return { type: 'transfer', assumed: false }
  }
  if (expenseKeywords.some((k) => lower.includes(k))) {
    return { type: 'expense', assumed: false }
  }
  if (incomeKeywords.some((k) => lower.includes(k))) {
    return { type: 'income', assumed: false }
  }
  if (hasAmount) {
    // No verb, but there's a number — overwhelmingly a bare expense entry
    // like "coffee 80". Pre-fill it, but flag it as assumed so the review
    // UI can show it as a suggestion rather than a confident parse.
    return { type: 'expense', assumed: true }
  }
  return { type: null, assumed: false }
}

/**
 * Match known accounts in text — by their literal name, or (G0.1) by a
 * generic payment-method word ("cash", "UPI") resolved via account TYPE
 * when no name is mentioned. For transfers, resolves direction via
 * "from X to Y" (name matching only — an alias inside a from/to clause is
 * not resolved, same as today).
 *
 * @param {string} text
 * @param {{name: string, type: 'wallet'|'bank'}[]} accounts the user's real accounts from Supabase
 * @returns {{fromAccount: string|null, toAccount: string|null, account: string|null}}
 */
const FROM_TO = /from\s+(.+?)\s+to\s+(.+?)(?:[.,]|$)/

// Generic payment-method words people use instead of their account's actual
// name ("paid in cash", "by UPI") — resolved by ACCOUNT TYPE, not by name
// (G0.1). A bare word, matched whole-word, so "cash" also covers "hand
// cash" / "by cash" / "in cash", and "card" also covers "debit card" /
// "credit card" without needing every phrase spelled out.
const ACCOUNT_TYPE_ALIAS_WORDS = {
  wallet: ['cash'],
  bank: ['upi', 'card', 'net banking', 'netbanking', 'online', 'gpay', 'google pay', 'phonepe', 'paytm'],
}

function typeAliasesMentioned(lower) {
  const types = []
  for (const [type, words] of Object.entries(ACCOUNT_TYPE_ALIAS_WORDS)) {
    const escaped = (w) => w.replace(/[.*+?^${}()|[\]\\]/g, '\\$&').replace(/\s+/g, '\\s+')
    if (words.some((w) => new RegExp(`\\b${escaped(w)}\\b`).test(lower))) types.push(type)
  }
  return types
}

// Every DISTINCT account the text resolves to, in the order the evidence
// for them appears (G0, extended G0.1). Two ways to resolve one:
//   1. the account's own NAME is mentioned literally ("coffee 80 wallet") —
//      tried first, and wins outright if it finds anything;
//   2. otherwise, a generic payment-method word implies an account TYPE
//      ("paid in cash" implies type='wallet'). This only ever fires when
//      no account was named literally, and only resolves to a specific
//      account when exactly one of the user's accounts has that type —
//      two wallets (or two bank accounts) makes the alias ambiguous, same
//      as naming two accounts literally: nothing is picked, and every
//      matching account is reported so the row can ask instead of guess.
// `accounts` is {name, type}[]; a name sitting inside a longer matched
// name ("SBI" inside "SBI Savings") is one mention, not two.
function accountMentions(lower, accounts) {
  const byName = accounts
    .map((a) => ({ name: a.name, start: lower.indexOf(a.name.toLowerCase()), len: a.name.length }))
    .filter((m) => m.start >= 0 && m.len > 0)
  const distinct = byName
    .filter((m) => !byName.some((o) => o !== m && o.len > m.len && m.start >= o.start && m.start + m.len <= o.start + o.len))
    .sort((a, b) => a.start - b.start)
  if (distinct.length > 0) return distinct

  const aliasTypes = typeAliasesMentioned(lower)
  if (aliasTypes.length === 0) return []
  // Every account whose type matches ANY mentioned alias type, in account-list
  // order — if the text implies both a wallet and a bank in one clause
  // ("cash and card"), that is a genuine conflict across every candidate.
  return accounts.filter((a) => aliasTypes.includes(a.type)).map((a) => ({ name: a.name }))
}

export function detectAccounts(text, accounts = []) {
  const lower = text.toLowerCase()
  const findAccount = (segment) => {
    const segLower = segment.toLowerCase()
    return accounts.find((a) => segLower.includes(a.name.toLowerCase()))?.name || null
  }

  const fromToMatch = lower.match(FROM_TO)
  if (fromToMatch) {
    return {
      fromAccount: findAccount(fromToMatch[1]),
      toAccount: findAccount(fromToMatch[2]),
      account: null,
    }
  }

  // Not a from/to transfer. Naming or implying TWO different accounts
  // ("coffee 80 bank wallet", or "cash and card" with two matching
  // accounts) is ambiguous, so none is picked: the row asks (G0). Before,
  // whichever came first in the user's account list was chosen silently.
  // (Return shape unchanged on purpose: the conflict itself is reported by
  // detectAccountConflict below.)
  const mentioned = accountMentions(lower, accounts)
  return { fromAccount: null, toAccount: null, account: mentioned.length === 1 ? mentioned[0].name : null }
}

/**
 * The accounts a NON-transfer clause resolves to (by literal name or by a
 * payment-method alias) when it resolves to more than one, in evidence
 * order — otherwise []. Lets the review row say "Bank and Wallet both
 * apply" instead of silently choosing one, whether the ambiguity came from
 * two names or an alias matching two same-type accounts.
 */
export function detectAccountConflict(text, accounts = []) {
  const lower = text.toLowerCase()
  if (FROM_TO.test(lower)) return []
  const mentioned = accountMentions(lower, accounts)
  return mentioned.length > 1 ? mentioned.map((m) => m.name) : []
}

/**
 * Split a Money Inbox entry into individual transaction clauses on commas
 * or "and". Each clause is parsed independently by parseClause().
 * @param {string} text
 * @returns {string[]}
 */
export function splitClauses(text) {
  // Thousands separators are part of a number, not a boundary: "₹8,000" and
  // "1,00,000" must not be cut at the comma (G0). Commas next to a letter or a
  // space still split ("coffee 80, bus 40" and "coffee 80,bus 40").
  const KEEP = '\u0001'
  // Separators: comma, semicolon, newline, "&", and the word "and".
  const parts = text.replace(/(\d),(?=\d)/g, `$1${KEEP}`).split(/(\s*[,;\n]\s*|\s*&\s*|\s+and\s+)/i)
  const restore = (s) => s.split(KEEP).join(',')

  // pieces keep the separator that preceded them, so a merged clause reads exactly as typed.
  const pieces = []
  let sep = ''
  for (let i = 0; i < parts.length; i++) {
    if (i % 2 === 1) {
      sep = restore(parts[i])
      continue
    }
    // "bus 40, auto 60, and lunch 200": drop the "and" left at the start of a piece.
    const seg = restore(parts[i]).trim().replace(/^(?:and|&)(?:\s+|$)/i, '')
    if (!seg) continue
    pieces.push({ text: seg, sep: pieces.length === 0 ? '' : sep || ' ' })
    sep = ''
  }

  // "and" and "," also join ONE event: "went to a movie with GF and spent 500 from bank".
  // A piece with no amount of its own is a FRAGMENT of the event around it, so it is
  // attached to a neighbour that has one. Two things stop that:
  //   - the fragment says the OPPOSITE kind of thing ("paid rent" vs "got salary 25000"),
  //     in which case it stays its own entry, exactly as before;
  //   - both neighbours already have their own amounts ("coffee 80, bus 40"): those are
  //     separate transactions and are never merged.
  const explicitType = (t) => detectType(t, { hasAmount: false }).type
  const conflicts = (a, b) => {
    const x = explicitType(a)
    const y = explicitType(b)
    return !!x && !!y && x !== y
  }
  const joined = (items) => items[0].text + items.slice(1).map((x) => x.sep + x.text).join('')
  // A fragment that just says HOW it was paid ("paid via wallet", "from bank") belongs to the event BEFORE it.
  const isPaymentFragment = (t) => /^(?:paid|paying|pay|payment|via|using|through|by|from)\b/i.test(t)

  const groups = [] // each: array of pieces forming one clause
  let pending = [] // amount-less fragments waiting for the piece that follows
  const standalone = (frags) => frags.forEach((f) => groups.push([f]))

  for (const piece of pieces) {
    if (parseAmount(piece.text) !== null) {
      const front = []
      for (const f of pending) (conflicts(f.text, piece.text) ? standalone([f]) : front.push(f))
      pending = []
      groups.push([...front, piece])
    } else if (isPaymentFragment(piece.text) && groups.length > 0 && !conflicts(piece.text, joined(groups[groups.length - 1]))) {
      groups[groups.length - 1].push(piece)
    } else {
      pending.push(piece)
    }
  }
  // Fragments with nothing after them ("spent 150 on tea and snacks") join the entry before,
  // unless the fragment is a purchase of its own that merely lacks an amount ("paid rent 8000
  // and bought groceries"): that stays a separate entry so the missing amount is asked for
  // instead of being swallowed into the rent.
  for (const f of pending) {
    const ownPurchase = !!explicitType(f.text) && !isPaymentFragment(f.text)
    if (groups.length > 0 && !ownPurchase && !conflicts(f.text, joined(groups[groups.length - 1]))) groups[groups.length - 1].push(f)
    else standalone([f])
  }

  return groups.map(joined)
}

/**
 * Orchestrate all Phase 3 parsing for a single clause into one structured
 * transaction candidate. needsReview is true whenever something couldn't
 * be confidently determined and requires the user's eyes before saving —
 * this is separate from `assumedType`, which flags a specific pre-filled
 * (but still reviewable) guess.
 *
 * @param {string} text
 * @param {{accounts?: {name: string, type: 'wallet'|'bank'}[], referenceDate?: Date}} opts
 */
export function parseClause(text, { accounts = [], referenceDate = new Date() } = {}) {
  const date = parseDate(text, referenceDate)
  const amount = parseAmount(text)
  const detected = detectType(text, { hasAmount: amount !== null })
  let type = detected.type
  let { fromAccount, toAccount, account } = detectAccounts(text, accounts)

  // A movement INTO a known account with no verb saying otherwise ("put 2000 into
  // wallet") is a transfer whose SOURCE is unknown: flagged for review, never guessed (G0).
  if (
    detected.assumed &&
    amount !== null &&
    account &&
    /\b(?:put|added|add|loaded|topped\s+up|top\s*up)\b/i.test(text) &&
    /\b(?:into|in|to)\b/i.test(text)
  ) {
    type = 'transfer'
    toAccount = account
    account = null
  }
  // "paid 500 from bank to Ravi" is an expense from Bank, not a transfer with a lost account.
  if (type !== 'transfer' && !account && fromAccount) account = fromAccount

  const needsReview =
    amount === null ||
    type === null ||
    (type === 'transfer' && (!fromAccount || !toAccount)) ||
    (amount !== null && hasAmbiguousAmount(text))

  return {
    raw: text,
    date,
    amount,
    type,
    assumedType: detected.assumed,
    account,
    accountConflict: detectAccountConflict(text, accounts),
    fromAccount,
    toAccount,
    needsReview,
  }
}
