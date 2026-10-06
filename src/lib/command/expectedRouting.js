// P1 (Money Inbox command layer) — the ANSWER KEY.
//
// How each of the 41 sentences frozen in P0 should be routed. This is the
// agreement P3 (the interpreter) and P4 (the command guard) are tested against, so
// the interpreter cannot quietly decide differently from what was approved.
//
// DATA ONLY. No imports, no logic beyond one lookup.
//
//   kind        transaction | command | query | navigate | clarify
//   intent      the contract id (for everything except clarify)
//   reason      the clarification reason (clarify only)
//   page        the allowed page (navigate only)
//   laterIntent a better intent that replaces RECORD_TRANSACTION in a later phase
//
// "transaction" means: continue down today's path, unchanged — the existing
// parser and the review screen. Every OTHER sentence frozen in P0 (the two
// corpora, the date-sensitive list and the live-rule list) is a transaction by
// default, which is what expectedRoutingFor returns for anything not listed here.

const T = (text, note) => ({ text, kind: 'transaction', intent: 'RECORD_TRANSACTION', ...(note ? { note } : {}) })
const TL = (text, laterIntent, note) => ({ text, kind: 'transaction', intent: 'RECORD_TRANSACTION', laterIntent, ...(note ? { note } : {}) })
const C = (text, intent, note) => ({ text, kind: 'command', intent, ...(note ? { note } : {}) })
const Q = (text, intent, note) => ({ text, kind: 'query', intent, ...(note ? { note } : {}) })
const N = (text, page) => ({ text, kind: 'navigate', intent: 'NAVIGATE', page })
const K = (text, reason, note) => ({ text, kind: 'clarify', reason, ...(note ? { note } : {}) })

const ENTRIES = [
  // ----- baseline (16) -----
  T('coffee 80'),
  T('salary 25000'),
  T('rent 8000'),
  T('moved 2000 from SBI to wallet'),
  T('salary 25k received and rent 4k paid', 'two events'),
  T('had dinner with friends and spent 600', 'one event'),
  TL('Paid ₹8,000 for a Power BI certification', 'RECORD_LEARNING_PAYMENT', 'becomes a learning payment at P8'),
  TL('Received my salary', 'RECORD_SALARY', 'becomes a salary record at P10'),
  C('Create a goal for a laptop worth ₹50,000', 'CREATE_GOAL', 'a ready 50,000 expense today'),
  K('I need 50000 for a laptop', 'competing_meaning', 'a ready 50,000 expense today'),
  C('Add ₹2,000 to that goal', 'MODIFY_GOAL_CONTRIBUTE', 'a ready 2,000 expense today; "that goal" needs memory or a question'),
  C('Create next month\'s budget', 'CREATE_BUDGET_MONTH'),
  Q('How much did I spend on food this month?', 'QUERY_SPEND'),
  Q('How much did I pay for my pension?', 'QUERY_PENSION_ESTIMATE', 'answered as an estimate, never as a payment'),
  K('Power BI', 'bare_word'),
  N('Open my goals', 'goals'),

  // ----- command-shaped (15) -----
  C('Add 2000 to my laptop goal', 'MODIFY_GOAL_CONTRIBUTE'),
  C('Add ₹2,000 to it', 'MODIFY_GOAL_CONTRIBUTE', '"it" needs memory or a question'),
  C('Create a goal called Laptop for 50000 by December', 'CREATE_GOAL'),
  C('Increase my food budget to 5000', 'MODIFY_BUDGET_AMOUNT'),
  C('Set my food budget to ₹5,000', 'MODIFY_BUDGET_AMOUNT'),
  C('Mark my Power BI course as completed', 'MODIFY_LEARNING_STATUS'),
  C('Add Power BI certification to my learning', 'CREATE_LEARNING_ITEM'),
  Q('How much is left in my food budget?', 'QUERY_BUDGET_LEFT'),
  Q('How much have I put into my laptop goal?', 'QUERY_GOAL_PROGRESS'),
  Q('How much is in my SBI account?', 'QUERY_BALANCE'),
  Q('What is my total balance?', 'QUERY_BALANCE'),
  Q('How much did I spend last month?', 'QUERY_SPEND', 'the period is last month'),
  N('Take me to budgets', 'budgets'),
  N('Show my learning', 'learning'),
  N('Go to salary', 'salary'),

  // ----- bare words (7): every one asks (decision 12) -----
  K('laptop', 'bare_word'),
  K('goal', 'bare_word'),
  K('budget', 'bare_word'),
  K('learning', 'bare_word'),
  K('pension', 'bare_word'),
  K('salary', 'bare_word', 'the arguable one: "salary 25000" is a transaction, "salary" alone asks'),
  K('food', 'bare_word'),

  // ----- mixed input (3): one thing at a time (decision 5) -----
  K('salary 25k received and create a goal for a laptop', 'mixed_input', 'today only the income is kept; the goal half is silently dropped'),
  K('Create a goal for a laptop and spent 600 on dinner', 'mixed_input', 'today only the expense is kept; the goal half is silently dropped'),
  K('coffee 80 and open my goals', 'mixed_input', 'today only the expense is kept; the navigation half is silently dropped'),
]

const freeze = (value) => {
  if (value && typeof value === 'object' && !Object.isFrozen(value)) {
    Object.freeze(value)
    for (const key of Object.keys(value)) freeze(value[key])
  }
  return value
}

export const EXPECTED_ROUTING = freeze(ENTRIES)

const DEFAULT_ENTRY = freeze({ kind: 'transaction', intent: 'RECORD_TRANSACTION', explicit: false })
const BY_TEXT = new Map(ENTRIES.map((e) => [e.text, e]))

/** The expected routing of a frozen sentence: its entry above, or "transaction" by default. */
export function expectedRoutingFor(text) {
  const entry = BY_TEXT.get(text)
  return entry ? { ...entry, explicit: true } : { ...DEFAULT_ENTRY }
}
