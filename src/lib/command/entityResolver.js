// P2 (Money Inbox command layer) — the NAME MATCHER.
//
// Given a short PHRASE someone else has already pulled out ("laptop", "my food
// budget", "that goal") and the user's OWN list of goals, categories, learning
// items or accounts, say which items match.
//
// THE RULE THAT MATTERS: it never picks one when two match. Two matches come back
// as two matches, and the caller asks. There is no fuzzy matching, no stemming, no
// substring matching ("sea" is not "Seafood"), and no promotion of an exact match
// over a partial one.
//
// WHAT IT IS NOT: it does not pull a phrase out of a sentence, does not fetch
// anything (the caller passes the list, already limited to the user's own active
// items), does not resolve "it" / "that goal" from memory (it only RECOGNISES such
// words and says 'reference'), and does not understand account TYPE words such as
// "cash" or "UPI" (the transaction parser handles those; names only here).
//
// PURE. No imports. No database, React or router. No clock, no randomness.
// Results are deeply frozen and the inputs are never changed.

export const ENTITY_KINDS = Object.freeze(['goal', 'category', 'learningItem', 'account'])

export class EntityResolverError extends Error {
  constructor(code, message) {
    super(message)
    this.name = 'EntityResolverError'
    this.code = code
  }
}
const fail = (code, message) => { throw new EntityResolverError(code, message) }

function freeze(value) {
  if (value && typeof value === 'object' && !Object.isFrozen(value)) {
    Object.freeze(value)
    for (const key of Object.keys(value)) freeze(value[key])
  }
  return value
}

// ---------- the word lists (exactly as approved) ----------
const FILLERS = new Set(['my', 'our', 'the', 'a', 'an'])
const KIND_WORDS = {
  goal: new Set(['goal', 'goals']),
  category: new Set(['budget', 'budgets', 'category', 'expense', 'expenses', 'spending']),
  learningItem: new Set(['course', 'courses', 'certification', 'certificate', 'learning', 'item']),
  // Deliberately NOT bank / wallet: the default accounts are literally named "Bank" and "Wallet".
  account: new Set(['account', 'accounts']),
}
// Words that mean "the one we just talked about". Recognised, never matched.
const REFERENCE_WORDS = new Set(['it', 'that', 'this', 'same', 'one', 'above', 'previous', 'last'])

// ---------- normalising ----------
/** Lower case, no punctuation, no possessive 's, single spaces. "Power-BI" becomes "power bi". */
export function normalizeName(text) {
  if (typeof text !== 'string') fail('invalid_phrase', 'A name or phrase must be text')
  return text
    .normalize('NFKC')
    .toLowerCase()
    .replace(/['’]s\b/g, '') // a possessive: "SBI's" becomes "sbi"
    .replace(/['’]/g, '') // any other apostrophe
    .replace(/[^\p{L}\p{N}]+/gu, ' ')
    .trim()
}

const tokensOf = (text) => normalizeName(text).split(' ').filter(Boolean)

/** A candidate's comparison words: without fillers and kind words; if that leaves nothing, without kind words; if still nothing, all of them. */
function candidateTokens(name, kindWords) {
  const all = tokensOf(name)
  const reduced = all.filter((t) => !FILLERS.has(t) && !kindWords.has(t))
  if (reduced.length) return reduced
  const withoutKind = all.filter((t) => !kindWords.has(t))
  return withoutKind.length ? withoutKind : all
}

function validateCandidates(candidates) {
  if (!Array.isArray(candidates)) fail('invalid_candidates', 'candidates must be a list')
  const ids = new Set()
  for (const c of candidates) {
    if (!c || typeof c !== 'object') fail('invalid_candidates', 'every candidate must be an object with an id and a name')
    if (typeof c.id !== 'string' || !c.id.trim()) fail('invalid_candidates', 'every candidate needs a non-empty text id')
    if (typeof c.name !== 'string' || !c.name.trim()) fail('invalid_candidates', 'every candidate needs a non-empty name')
    if (ids.has(c.id)) fail('invalid_candidates', `the candidate id "${c.id}" appears twice`)
    ids.add(c.id)
  }
}

// ---------- the matcher ----------
export function resolveName(phrase, candidates, options) {
  const kind = options ? options.kind : undefined
  if (!ENTITY_KINDS.includes(kind)) fail('invalid_kind', `options.kind must be one of ${ENTITY_KINDS.join(', ')}`)
  if (typeof phrase !== 'string') fail('invalid_phrase', 'The phrase must be text')
  validateCandidates(candidates)

  const kindWords = KIND_WORDS[kind]
  const normalized = normalizeName(phrase)
  const tokens = normalized.split(' ').filter((t) => t && !FILLERS.has(t) && !kindWords.has(t))
  const base = { phrase, normalized, tokens, matches: [], considered: candidates.length }

  // Nothing left but filler and kind words: a bare word ("goal", "my").
  if (tokens.length === 0) return freeze({ ...base, status: 'empty' })
  // "it", "that goal", "the same": recognised, not matched.
  if (tokens.every((t) => REFERENCE_WORDS.has(t))) return freeze({ ...base, status: 'reference' })

  const phraseSet = new Set(tokens)
  const matches = []
  for (const c of candidates) {
    const cTokens = candidateTokens(c.name, kindWords)
    const cSet = new Set(cTokens)
    if (![...phraseSet].every((t) => cSet.has(t))) continue
    const exact = phraseSet.size === cSet.size
    matches.push({ id: c.id, name: c.name, matchType: exact ? 'exact' : 'whole-words' })
  }

  const status = matches.length === 0 ? 'none' : matches.length === 1 ? 'single' : 'multiple'
  return freeze({ ...base, status, matches })
}

/** For a 'multiple' result only: the ambiguity object the pending action expects ({ field, options: [{ id, label }] }). */
export function ambiguityFromResolution(field, resolution) {
  if (typeof field !== 'string' || !field.trim()) fail('invalid_field', 'The field name must be text')
  if (!resolution || resolution.status !== 'multiple') fail('not_ambiguous', 'Only a result with several matches can be turned into an ambiguity')
  return freeze({ field, options: resolution.matches.map((m) => ({ id: m.id, label: m.name })) })
}
