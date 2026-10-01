// Phase 35 — Optional Gemini Money Inbox fallback.
//
// The deterministic parser stays primary, always. This is called ONLY for
// a row where the parser found genuinely NOTHING — no type, no amount
// (the "Needs attention" rows that are otherwise completely blank). It is
// never automatic: the user clicks a button per row, same as every other
// AI feature in this app, and the result is a SUGGESTION dropped into the
// same editable review row — never written to the database directly.
//
// The one rule that matters most here, more than anywhere else Gemini is
// used: Gemini must never be able to invent an account or category that
// doesn't exist. Both lists are given to it as closed choices, and
// validateFallbackResult() re-checks the response against those same
// lists before anything touches the review row — an account or category
// name that doesn't match exactly is dropped, never guessed into the
// nearest real one.

export const MONEY_INBOX_FALLBACK_SCHEMA = {
  type: 'object',
  properties: {
    amount: { type: 'number' },
    type: { type: 'string', enum: ['expense', 'income', 'transfer'] },
    account: { type: 'string' },
    category: { type: 'string' },
    note: { type: 'string' },
  },
  required: ['amount', 'type'],
  additionalProperties: false,
}

/**
 * @param {{ raw: string, accountNames: string[], categoryNames: string[] }} args
 */
export function buildMoneyInboxFallbackPrompt({ raw, accountNames, categoryNames }) {
  return [
    'A user typed the following into a personal finance app\'s quick-entry box, and the app\'s own rule-based parser could not understand it at all:',
    '',
    `"${raw}"`,
    '',
    'Read it as a single financial transaction and answer with:',
    '- amount: the numeric amount, with no currency symbol (required)',
    '- type: exactly one of "expense", "income", or "transfer" (required)',
    `- account: ONLY if the text clearly names one of these exact accounts, otherwise omit it entirely: ${accountNames.join(', ') || '(none available)'}`,
    `- category: ONLY if the text clearly matches one of these exact categories, otherwise omit it entirely: ${categoryNames.join(', ') || '(none available)'}`,
    '- note: one short plain sentence on how you read it',
    '',
    'Rules:',
    '- Never invent an account or category name that is not exactly one of the ones listed above.',
    '- If you cannot confidently determine the amount AND the type, do not guess — still return your best amount and type, but keep the note honest about the uncertainty.',
    '- Do not explain currency conventions or add any commentary beyond the note.',
  ].join('\n')
}

/**
 * Re-validates Gemini's response against the SAME closed lists given in the
 * prompt — the prompt asking nicely is not a guarantee. Returns null
 * fields for anything that doesn't check out, rather than discarding the
 * whole result, since a valid amount/type with an invalid account is still
 * useful (the row just asks for the account, as it would anyway).
 *
 * @returns {{ ok: boolean, amount: number|null, type: string|null, account: string|null, category: string|null, note: string|null }}
 */
export function validateFallbackResult(result, { accountNames = [], categoryNames = [] } = {}) {
  const fallback = { ok: false, amount: null, type: null, account: null, category: null, note: null }
  if (!result || typeof result !== 'object') return fallback

  const amount = typeof result.amount === 'number' && Number.isFinite(result.amount) && result.amount > 0 ? result.amount : null
  const type = ['expense', 'income', 'transfer'].includes(result.type) ? result.type : null
  const account = typeof result.account === 'string' && accountNames.includes(result.account) ? result.account : null
  const category = typeof result.category === 'string' && categoryNames.includes(result.category) ? result.category : null
  const note = typeof result.note === 'string' && result.note.trim() ? result.note.trim().slice(0, 300) : null

  return { ok: amount !== null && type !== null, amount, type, account, category, note }
}
