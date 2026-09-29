// Spending Context (Phase 32) — the shared vocabulary.
//
// An optional label on an EXPENSE saying why it was spent, from a closed
// set. A tag, not a journal: no free text. It records context only; it
// never changes a balance, an income figure or an expense total.
//
// Single source of truth for the UI (edit form, row tag) and the engine.
// The database enforces the same list with a CHECK constraint
// (supabase/phase32_1_spending_context.sql); spendingContext.test.js
// fails if the two ever drift apart, because a mismatch would otherwise
// only surface as a runtime error on save.
//
// Wording is descriptive, never judgmental — "Unplanned", not "impulse" or
// "craving" — matching the tone rules Financial Assist already follows.

export const SPENDING_CONTEXTS = [
  { value: 'planned', label: 'Planned', description: 'You meant to buy it: on a list, budgeted, or a known need.' },
  { value: 'routine', label: 'Routine', description: 'Regular or habitual: a commute, subscriptions, a daily coffee.' },
  { value: 'social', label: 'Social', description: 'Spent because of, or together with, other people.' },
  { value: 'unplanned', label: 'Unplanned', description: 'A spur-of-the-moment purchase.' },
]

export const SPENDING_CONTEXT_VALUES = SPENDING_CONTEXTS.map((c) => c.value)

export function isValidContext(value) {
  return SPENDING_CONTEXT_VALUES.includes(value)
}

export function contextLabel(value) {
  return SPENDING_CONTEXTS.find((c) => c.value === value)?.label ?? null
}

export function contextDescription(value) {
  return SPENDING_CONTEXTS.find((c) => c.value === value)?.description ?? null
}

/**
 * The value to WRITE to the database for a transaction of `type`.
 *
 * Two database rules make this function necessary rather than a nicety
 * (both confirmed against a real Postgres):
 *   - context is allowed ONLY on an expense, so editing an expense into
 *     income or a transfer must send null or the whole save is rejected;
 *   - an empty string is not null and is rejected too, so "no context"
 *     must always be sent as null, never "".
 * Anything not in the allowed set is dropped to null rather than sent.
 */
export function contextForType(type, value) {
  return type === 'expense' && isValidContext(value) ? value : null
}

// ---------------------------------------------------------------------
// Detecting a context in Money Inbox text (Phase 32.2)
// ---------------------------------------------------------------------
//
// People shouldn't have to learn the four labels: "dinner with friends
// for 500rs paid from bank" should come out Social, the same way "dinner"
// already comes out Food. This is deterministic phrase matching — the same
// idea as the category keywords — NOT AI. Money Inbox text never leaves the
// device for this (the AI & Data Processing Notice promises exactly that).
//
// Rules of the road, because a wrong tag is a small lie in the user's data:
//   - No cue, no suggestion. Nothing is ever guessed from the item itself
//     ("bus", "coffee", "rent"): whether a bus ride is routine depends on
//     the person, not the word.
//   - Cues that disagree produce NO suggestion, only a note that they
//     disagree, so the user picks. Exception: an explicit #tag is the
//     user's deliberate marker and wins over any phrase.
//   - The result is only ever a SUGGESTION shown in the review step. It is
//     never written without the user confirming.
//
// The patterns are deliberately conservative: a missed cue costs one tap
// in the review row; a wrong cue teaches people to distrust the feature.
// Ambiguous words were left out on purpose — "treat" (a treat for
// yourself isn't social), "regular" (a regular coffee is a size), and
// bare person names ("with Ravi" can't be told apart from "with cash").

const RELATION =
  'friends?|buddies|gang|family|colleagues?|coworkers?|co-workers?|team|teammates?|classmates?|batchmates?|' +
  'roommates?|flatmates?|cousins?|siblings?|parents|relatives|mom|dad|mother|father|brother|sister|' +
  'girlfriend|boyfriend|partner|wife|husband|' +
  // everyday shorthand (G0): "movie with my GF", "pizza with sis", "dinner with fam"
  'gf|bf|bro|bros|sis|bestie|besties|fam|squad|pals?|mates?|mum|papa|mummy'

// `label` is user-facing text for the "what CountWise understands" list.
// Every pattern is case-insensitive and non-global (no shared state).
export const CONTEXT_CUES = {
  planned: [
    { label: 'planned, as planned, budgeted', pattern: /\b(?:as\s+planned|planned|budgeted)\b/i },
    { label: 'pre-booked, booked in advance, scheduled', pattern: /\b(?:pre-?booked|booked\s+in\s+advance|scheduled)\b/i },
    { label: 'on my list', pattern: /\bon\s+my\s+list\b/i },
  ],
  routine: [
    { label: 'daily, weekly, monthly, every day / week / month', pattern: /\b(?:daily|weekly|monthly|every\s+(?:day|week|month|morning|evening))\b/i },
    { label: 'subscription, recurring', pattern: /\b(?:subscription|recurring)\b/i },
    { label: 'as usual, the usual, routine', pattern: /\b(?:as\s+usual|the\s+usual|routine)\b/i },
  ],
  social: [
    {
      label: 'with friends, family, colleagues, team…',
      pattern: new RegExp(`\\bwith\\s+(?:my\\s+|the\\s+|our\\s+|some\\s+|a\\s+few\\s+)?(?:${RELATION})\\b`, 'i'),
    },
    { label: 'birthday, party, outing, hangout, get-together, farewell', pattern: /\b(?:birthday|bday|party|outing|hang\s?out|get[- ]together|farewell)\b/i },
    { label: 'gift', pattern: /\bgifts?\b/i },
    { label: 'split the bill', pattern: /\b(?:split(?:ting)?\s+(?:the\s+)?bill|bill\s+split)\b/i },
    { label: 'social', pattern: /\bsocial\b/i },
  ],
  unplanned: [
    { label: 'on a whim, suddenly, spontaneous', pattern: /\b(?:on\s+a\s+whim|spur[- ]of[- ]the[- ]moment|spontaneous(?:ly)?|suddenly|randomly)\b/i },
    { label: "impulse, craving, couldn't resist", pattern: /\b(?:impulse|impulsive(?:ly)?|cravings?|craved|couldn'?t\s+resist|could\s+not\s+resist)\b/i },
    { label: 'unplanned', pattern: /\bunplanned\b/i },
  ],
}

const NO_CONTEXT = Object.freeze({ value: null, source: null, matched: null, conflict: [] })

const inVocabularyOrder = (values) => SPENDING_CONTEXT_VALUES.filter((v) => values.includes(v))

/**
 * Look for a spending context in one Money Inbox clause.
 *
 * @param {string} text
 * @returns {{
 *   value: string|null,      the suggested context, or null
 *   source: 'tag'|'cue'|null,  'tag' = an explicit #tag; 'cue' = inferred from a phrase
 *   matched: string|null,    the words that triggered it, as the user typed them
 *   conflict: string[],      contexts that disagreed (then value is null), else []
 * }}
 */
export function detectSpendingContext(text) {
  const source = typeof text === 'string' ? text : ''

  // 1. An explicit #tag is a deliberate marker and outranks any phrase.
  const tags = inVocabularyOrder([
    ...new Set([...source.matchAll(/#(planned|routine|social|unplanned)\b/gi)].map((m) => m[1].toLowerCase())),
  ])
  if (tags.length === 1) return { value: tags[0], source: 'tag', matched: `#${tags[0]}`, conflict: [] }
  if (tags.length > 1) return { value: null, source: null, matched: null, conflict: tags }

  // 2. Phrase cues.
  const found = []
  for (const context of SPENDING_CONTEXT_VALUES) {
    for (const cue of CONTEXT_CUES[context]) {
      const m = source.match(cue.pattern)
      if (m) found.push({ context, phrase: m[0].trim() })
    }
  }
  const contexts = inVocabularyOrder([...new Set(found.map((f) => f.context))])
  if (contexts.length === 0) return NO_CONTEXT
  if (contexts.length > 1) return { value: null, source: null, matched: null, conflict: contexts }
  return { value: contexts[0], source: 'cue', matched: found[0].phrase, conflict: [] }
}

/** The "what CountWise understands" list, generated from the same rules the parser uses. */
export function contextCueHints() {
  return SPENDING_CONTEXTS.map((c) => ({
    value: c.value,
    label: c.label,
    examples: CONTEXT_CUES[c.value].map((cue) => cue.label),
  }))
}
