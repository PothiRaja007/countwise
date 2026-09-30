// G1 — source of truth for CountWise's category system (design-only until now;
// this file is the first line of actual G1 code, and it does nothing but
// describe reality — no model, no training, nothing that touches the app).
//
// Every value below was extracted directly from supabase/schema.sql's
// category_rules seed (18 inserts, 3 deletes — all read and accounted for)
// and src/lib/categorySeed.js. Nothing here is invented. If schema.sql or
// categorySeed.js ever changes, this file must be regenerated from them —
// categoryTruth.test.js checks that its counts and a sample of its keywords
// still line up with those two source files, so a drift shows up as a
// failing test rather than a silently stale corpus.
//
// GLOBAL_CATEGORIES — the 19 is_default=true categories. This IS the G1
// global ML output vocabulary, per the corrected v2 design (Section 2).
export const GLOBAL_CATEGORIES = [
  { name: 'Food', kind: 'expense' },
  { name: 'Transport', kind: 'expense' },
  { name: 'Fuel', kind: 'expense' },
  { name: 'Entertainment', kind: 'expense' },
  { name: 'Bills & Utilities', kind: 'expense' },
  { name: 'Education', kind: 'expense' },
  { name: 'Shopping', kind: 'expense' },
  { name: 'Health', kind: 'expense' },
  { name: 'Other', kind: 'expense' },
  { name: 'Rent', kind: 'expense' },
  { name: 'Mobile Recharge', kind: 'expense' },
  { name: 'Wi-Fi/Internet', kind: 'expense' },
  { name: 'Groceries', kind: 'expense' },
  { name: 'Juice/Refreshments', kind: 'expense' },
  { name: 'Subscriptions', kind: 'expense' },
  { name: 'Salary', kind: 'income' },
  { name: 'Tuition/Freelance income', kind: 'income' },
  { name: 'Allowance', kind: 'income' },
  { name: 'Other income', kind: 'income' },
]

export const GLOBAL_CATEGORY_NAMES = GLOBAL_CATEGORIES.map((c) => c.name)

// GLOBAL_KEYWORD_RULES — every (keyword, category, priority) pair that is
// LIVE today, i.e. after the Phase 17.1 moves are applied. This is what
// matchCategory() actually sees for a shared-default account. 'Other' and
// 'Other income' deliberately have no keywords (catch-alls, per schema.sql).
//
// Reconstructed by reading every insert AND every delete in schema.sql's
// category_rules seed, in file order, and applying them in order — a
// keyword's final category is whichever insert landed last after any
// delete that removed it from an earlier one. Example: 'rent' was
// originally seeded under Bills & Utilities, then deleted from there and
// re-inserted under the new Rent category — only the final state is kept
// here, matching what a fresh database actually ends up with.
export const GLOBAL_KEYWORD_RULES = [
  // Food
  { keyword: 'coffee', category: 'Food', priority: 0 },
  { keyword: 'lunch', category: 'Food', priority: 0 },
  { keyword: 'dinner', category: 'Food', priority: 0 },
  { keyword: 'breakfast', category: 'Food', priority: 0 },
  { keyword: 'snack', category: 'Food', priority: 0 },
  { keyword: 'restaurant', category: 'Food', priority: 0 },
  { keyword: 'zomato', category: 'Food', priority: 0 },
  { keyword: 'swiggy', category: 'Food', priority: 0 },
  { keyword: 'tea', category: 'Food', priority: 0 },
  { keyword: 'canteen', category: 'Food', priority: 0 },
  { keyword: 'eating out', category: 'Food', priority: 0 },
  // Transport
  { keyword: 'uber', category: 'Transport', priority: 0 },
  { keyword: 'ola', category: 'Transport', priority: 0 },
  { keyword: 'bus', category: 'Transport', priority: 0 },
  { keyword: 'metro', category: 'Transport', priority: 0 },
  { keyword: 'auto', category: 'Transport', priority: 0 },
  { keyword: 'taxi', category: 'Transport', priority: 0 },
  { keyword: 'train', category: 'Transport', priority: 0 },
  // Fuel
  { keyword: 'petrol', category: 'Fuel', priority: 0 },
  { keyword: 'diesel', category: 'Fuel', priority: 0 },
  { keyword: 'fuel', category: 'Fuel', priority: 0 },
  { keyword: 'gas station', category: 'Fuel', priority: 0 },
  // Entertainment (netflix/spotify moved away in Phase 17.1)
  { keyword: 'movie', category: 'Entertainment', priority: 0 },
  { keyword: 'game', category: 'Entertainment', priority: 0 },
  { keyword: 'party', category: 'Entertainment', priority: 0 },
  { keyword: 'outing', category: 'Entertainment', priority: 0 },
  // Bills & Utilities (rent/wifi/subscription moved away in Phase 17.1)
  { keyword: 'recharge', category: 'Bills & Utilities', priority: 0 },
  { keyword: 'electricity', category: 'Bills & Utilities', priority: 0 },
  { keyword: 'phone bill', category: 'Bills & Utilities', priority: 0 },
  // Education — 'tuition fee' outranks the bare 'tuition' income keyword
  { keyword: 'book', category: 'Education', priority: 0 },
  { keyword: 'course', category: 'Education', priority: 0 },
  { keyword: 'certification', category: 'Education', priority: 0 },
  { keyword: 'exam fee', category: 'Education', priority: 0 },
  { keyword: 'tuition fee', category: 'Education', priority: 1 },
  { keyword: 'stationery', category: 'Education', priority: 0 },
  // Shopping
  { keyword: 'amazon', category: 'Shopping', priority: 0 },
  { keyword: 'flipkart', category: 'Shopping', priority: 0 },
  { keyword: 'clothes', category: 'Shopping', priority: 0 },
  { keyword: 'shoes', category: 'Shopping', priority: 0 },
  // Health
  { keyword: 'pharmacy', category: 'Health', priority: 0 },
  { keyword: 'doctor', category: 'Health', priority: 0 },
  { keyword: 'medicine', category: 'Health', priority: 0 },
  { keyword: 'gym', category: 'Health', priority: 0 },
  // Rent (new in Phase 17.1)
  { keyword: 'rent', category: 'Rent', priority: 0 },
  { keyword: 'house rent', category: 'Rent', priority: 0 },
  { keyword: 'room rent', category: 'Rent', priority: 0 },
  // Mobile Recharge (new in Phase 17.1)
  { keyword: 'mobile recharge', category: 'Mobile Recharge', priority: 0 },
  { keyword: 'phone recharge', category: 'Mobile Recharge', priority: 0 },
  { keyword: 'mobile bill', category: 'Mobile Recharge', priority: 0 },
  { keyword: 'phone bill', category: 'Mobile Recharge', priority: 0 }, // also seeded here — see the deliberate-collision test below
  { keyword: 'recharge', category: 'Mobile Recharge', priority: 0 },
  { keyword: 'mobile', category: 'Mobile Recharge', priority: 0 },
  // Wi-Fi/Internet (new in Phase 17.1)
  { keyword: 'wifi', category: 'Wi-Fi/Internet', priority: 0 },
  { keyword: 'wi-fi', category: 'Wi-Fi/Internet', priority: 0 },
  { keyword: 'internet', category: 'Wi-Fi/Internet', priority: 0 },
  { keyword: 'broadband', category: 'Wi-Fi/Internet', priority: 0 },
  // Groceries (new in Phase 17.1)
  { keyword: 'grocery', category: 'Groceries', priority: 0 },
  { keyword: 'groceries', category: 'Groceries', priority: 0 },
  { keyword: 'supermarket', category: 'Groceries', priority: 0 },
  // Juice/Refreshments (new in Phase 17.1) — deliberately not 'snack' (Food's)
  { keyword: 'juice', category: 'Juice/Refreshments', priority: 0 },
  { keyword: 'refreshment', category: 'Juice/Refreshments', priority: 0 },
  { keyword: 'refreshments', category: 'Juice/Refreshments', priority: 0 },
  // Subscriptions (new in Phase 17.1) — absorbed netflix/spotify from Entertainment
  { keyword: 'subscription', category: 'Subscriptions', priority: 0 },
  { keyword: 'subscriptions', category: 'Subscriptions', priority: 0 },
  { keyword: 'netflix', category: 'Subscriptions', priority: 0 },
  { keyword: 'spotify', category: 'Subscriptions', priority: 0 },
  // Salary
  { keyword: 'salary', category: 'Salary', priority: 0 },
  { keyword: 'stipend', category: 'Salary', priority: 0 },
  // Tuition/Freelance income — bare 'tuition' loses to 'tuition fee' (Education)
  { keyword: 'tuition', category: 'Tuition/Freelance income', priority: 0 },
  { keyword: 'freelance', category: 'Tuition/Freelance income', priority: 0 },
  { keyword: 'client payment', category: 'Tuition/Freelance income', priority: 0 },
  // Allowance
  { keyword: 'allowance', category: 'Allowance', priority: 0 },
  { keyword: 'pocket money', category: 'Allowance', priority: 0 },
  // Other, Other income: deliberately no keywords — catch-alls by design.
]

// One real, live quirk worth naming: 'phone bill' is seeded under BOTH
// Bills & Utilities and Mobile Recharge, at equal priority. matchCategory()
// resolves that by taking the first rule the caller's array happens to
// list first, since a priority tie isn't broken by anything else — so
// "phone bill" is a genuine ambiguous case in the live app today, not a
// bug introduced here. The G1 generator must never build a training
// example around the bare phrase "phone bill" expecting one specific
// label, since the real system's own answer for it isn't deterministic
// across callers. See categoryTruth.test.js.

// ACCOUNT_SCOPED_CATEGORIES — seeded per-account at onboarding (student /
// employed / mixed), NOT global. Personalization-only, per the corrected
// v2 design (Section 2, Section 7). Reproduced verbatim from categorySeed.js.
export const ACCOUNT_SCOPED_CATEGORIES = [
  { name: 'Tuition Fees', kind: 'expense', track: 'student',
    keywords: ['tuition', 'semester fee', 'college fee'] },
  { name: 'Hostel/Mess', kind: 'expense', track: 'student',
    keywords: ['hostel', 'mess', 'pg rent'] },
  { name: 'Course Fees', kind: 'expense', track: 'student',
    keywords: ['course fee', 'certification', 'exam fee', 'nism', 'coursera', 'udemy'] },
  { name: 'EMI/Loan', kind: 'expense', track: 'employed',
    keywords: ['emi', 'loan', 'installment'] },
  { name: 'Investments', kind: 'expense', track: 'employed',
    keywords: ['sip', 'mutual fund', 'stocks', 'investment'] },
]

export const ACCOUNT_SCOPED_CATEGORY_NAMES = ACCOUNT_SCOPED_CATEGORIES.map((c) => c.name)

// SPENDING_CONTEXT_VALUES is imported live from spendingContext.js rather
// than copied — this is exactly the mistake the corrected Section 15 fixed
// (ChatGPT's first pass invented values that don't exist). Importing the
// real module means this file cannot drift from it the way a copy could.
export { SPENDING_CONTEXT_VALUES } from '../spendingContext.js'
