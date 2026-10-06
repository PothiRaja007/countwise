// P0 (Money Inbox command layer) — the named input lists the baseline freeze
// runs through the parser. DATA ONLY: no logic, no imports.
//
// Why these exist as their own file: P3 (the interpreter) and P4 (the command
// guard) will import these SAME lists, so "every frozen transaction must still
// be treated as a transaction" is tested against exactly what P0 froze, not a
// retyped copy that can drift.
//
// What each list is for:
//   BASELINE_INPUTS        the 16 sentences from the planning document (section A3)
//   COMMAND_SHAPED_INPUTS  sentences that are commands/questions/navigation, not
//                          transactions. TODAY the parser has no concept of these,
//                          so P0 records what the parser makes of them; P3/P4 must
//                          stop them being treated as transactions.
//   BARE_WORD_INPUTS       single words ("laptop", "goal") that should lead to a
//                          clarifying question (decision 12). "Power BI" is already
//                          in BASELINE_INPUTS.
//   MIXED_INPUTS           a command and a transaction in one message (decision 5:
//                          version 1 asks the user to do one at a time).
//   DATE_SENSITIVE_INPUTS  sentences whose result depends on the reference date
//                          (the Calendar entry point passes one).
//   LIVE_RULE_INPUTS       category-sensitive sentences, run against the LIVE rule
//                          table (configuration B) rather than the older default
//                          keyword constant the corpus scorer uses.
//
// The two evaluation corpora (moneyInboxCorpus.js) are imported by the tests,
// not copied here.

export const BASELINE_INPUTS = [
  'coffee 80',
  'salary 25000',
  'rent 8000',
  'moved 2000 from SBI to wallet',
  'salary 25k received and rent 4k paid',
  'had dinner with friends and spent 600',
  'Paid ₹8,000 for a Power BI certification',
  'Received my salary',
  'Create a goal for a laptop worth ₹50,000',
  'I need 50000 for a laptop',
  'Add ₹2,000 to that goal',
  "Create next month's budget",
  'How much did I spend on food this month?',
  'How much did I pay for my pension?',
  'Power BI',
  'Open my goals',
]

export const COMMAND_SHAPED_INPUTS = [
  'Add 2000 to my laptop goal',
  'Add ₹2,000 to it',
  'Create a goal called Laptop for 50000 by December',
  'Increase my food budget to 5000',
  'Set my food budget to ₹5,000',
  'Mark my Power BI course as completed',
  'Add Power BI certification to my learning',
  'How much is left in my food budget?',
  'How much have I put into my laptop goal?',
  'How much is in my SBI account?',
  'What is my total balance?',
  'How much did I spend last month?',
  'Take me to budgets',
  'Show my learning',
  'Go to salary',
]

export const BARE_WORD_INPUTS = [
  'laptop',
  'goal',
  'budget',
  'learning',
  'pension',
  'salary',
  'food',
]

export const MIXED_INPUTS = [
  'salary 25k received and create a goal for a laptop',
  'Create a goal for a laptop and spent 600 on dinner',
  'coffee 80 and open my goals',
]

export const DATE_SENSITIVE_INPUTS = [
  'coffee 80 yesterday',
  'coffee 80 today',
  'coffee 80 2 days ago',
  'coffee 80 3 days ago',
  'coffee 80 day before yesterday',
  'coffee 80 last night',
  'coffee 80 on monday',
  'rent 8000 on 3 oct',
]

export const LIVE_RULE_INPUTS = [
  'tuition fee 5000',
  'tuition 3000',
  'rent 8000',
  'wifi bill 700',
  'netflix 199',
  'spotify 119',
  'subscription 299',
  'mobile recharge 299',
  'jio recharge 299',
  'groceries 450',
  'juice 60',
  'coffee 80',
  'bus 40',
  'auto 120',
  'petrol 500',
  'fuel 1000',
  'electricity bill 1200',
  'medicine 300',
  'doctor 500',
  'pharmacy 250',
  'book 350',
  'course fee 8000',
  'exam fee 1200',
  'movie 300',
  'dinner 600',
  'lunch 120',
  'snacks 50',
  'salary 25000',
  'stipend 5000',
  'freelance 3000',
  'dad sent 3000',
  'pocket money 2000',
]

// The extra reference dates the date check runs under, on top of the corpus's
// own 28 Sep 2026. Chosen to cross a month end, a year end, and a leap day.
// Local-time constructors on purpose: the app builds its reference date the
// same way (new Date(y, m, d)), so results do not depend on the machine's
// timezone offset.
export const EXTRA_REFERENCE_DATES = [
  { label: '2026-03-01', y: 2026, m: 2, d: 1 },
  { label: '2027-01-01', y: 2027, m: 0, d: 1 },
  { label: '2028-03-01', y: 2028, m: 2, d: 1 },
]
