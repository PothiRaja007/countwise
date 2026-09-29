// Money Inbox evaluation corpus (Phase G0).
//
// PURPOSE: a controlled TEST set for the deterministic parser — not a
// training set. It exists so that "the parser got better" is a measured
// statement, and so that a regression in one kind of sentence can't hide
// behind an improvement in another.
//
// HONEST LIMITS — read before quoting any number from it:
//   - It was written by one author (with one idea of how people type), so
//     it measures "does the parser handle THESE sentences", not "how does it
//     do on real users". Treat the accuracy as a floor on rule quality, not a
//     forecast. The right way to grow it is from real failures, and from
//     sentences written by other people (which should be added as a
//     separate held-out slice, never mixed into what the rules were tuned on).
//   - Entries tagged 'ambiguous' have more than one defensible reading;
//     entries tagged 'gap' need a capability the parser deliberately does
//     not have yet. Both are reported, neither counts toward the headline.
//
// LABELLING POLICY (so expected values are consistent, not improvised):
//   - "entries" is the number of separate transactions a person would say
//     the sentence contains. "and" or a comma is NOT a boundary by itself:
//     "movie with GF and spent 500" is ONE event; "rent 8000 and salary
//     25000" is TWO.
//   - type: an entry with an amount and no verb ("coffee 80") is an expense.
//     Money arriving is income ("dad sent 3000"); money leaving to a person
//     is an expense; a transfer needs accounts. A one-sided account move
//     ("put 2000 into wallet") is a transfer flagged for review, never a
//     silent guess of the missing side.
//   - account: only an account the user actually names (Wallet, Bank, SBI).
//     Two different accounts named in one non-transfer item is ambiguous, so
//     the expected account is null and the conflict is surfaced.
//   - category: only asserted where a default keyword genuinely applies;
//     left unspecified (not evaluated) otherwise. Predicting categories for
//     unknown words is the ML question (G1), not a G0 parser question.
//   - context: expected null unless a phrase in the sentence clearly signals
//     one. The cue list is deliberately conservative (no guessing from the
//     item alone), so most entries expect null.
//
// Fixtures the evaluator uses: accounts SBI, Wallet, Bank; reference date
// 28 Sep 2026; category rules = the app's default keywords.
//
// To reproduce a "before" number: check out the commit prior to G0 and run
// `node src/lib/moneyInboxEval.test.js` against this same corpus.

export const CORPUS_ACCOUNTS = ['SBI', 'Wallet', 'Bank']
export const CORPUS_REFERENCE_DATE = new Date(2026, 8, 28)

// expected-entry builders. `cat` and `ctx` follow the policy above:
// undefined cat => not evaluated; ctx defaults to null (no context expected).
const ex = (amount, account = null, cat, ctx = null, more = {}) => ({ amount, type: 'expense', account, cat, ctx, ...more })
const inc = (amount, account = null, cat, ctx = null, more = {}) => ({ amount, type: 'income', account, cat, ctx, ...more })
const tr = (amount, from, to, more = {}) => ({ amount, type: 'transfer', from, to, ctx: null, ...more })

const FOOD = 'Food', TRANSPORT = 'Transport', FUEL = 'Fuel', FUN = 'Entertainment', BILLS = 'Bills & Utilities'
const EDU = 'Education', SHOP = 'Shopping', SAL = 'Salary', TUI = 'Tuition/Freelance income'
const YEST = '2026-09-27', TODAY = '2026-09-28'

const items = []
const add = (slice, text, entries, tag) => items.push({ slice, text, entries, tag })

// ---- short: the compact style the app already handles -------------------------
add('short', 'coffee 80', [ex(80, null, FOOD)])
add('short', 'coffee 80 wallet', [ex(80, 'Wallet', FOOD)])
add('short', 'bus 40 wallet', [ex(40, 'Wallet', TRANSPORT)])
add('short', 'lunch 250 from bank', [ex(250, 'Bank', FOOD)])
add('short', 'auto 60', [ex(60, null, TRANSPORT)])
add('short', 'petrol 500 wallet', [ex(500, 'Wallet', FUEL)])
add('short', 'netflix 199 bank', [ex(199, 'Bank', FUN)])
add('short', 'electricity bill 1200', [ex(1200, null, BILLS)])
add('short', 'zomato 320 wallet', [ex(320, 'Wallet', FOOD)])
add('short', 'salary 25000 bank', [inc(25000, 'Bank', SAL)])
add('short', 'canteen 80', [ex(80, null, FOOD)])
add('short', 'metro 30', [ex(30, null, TRANSPORT)])
add('short', 'tea 15', [ex(15, null, FOOD)])
add('short', 'Coffee 80 WALLET', [ex(80, 'Wallet', FOOD)])
add('short', 'dinner cost me 650', [ex(650, null, FOOD)])
add('short', 'spent 500', [ex(500)])
add('short', 'spent ₹500', [ex(500)])
add('short', 'paid 500', [ex(500)])
add('short', 'bought shoes for 2000', [ex(2000, null, SHOP)])
add('short', 'received salary 25000', [inc(25000, null, SAL)])

// ---- natural: one event described in a sentence -------------------------------
add('natural', 'Went to a movie with my GF and spent 500rs from bank', [ex(500, 'Bank', FUN, 'social')])
add('natural', 'Went to movie with GF and spent 500rs from bank', [ex(500, 'Bank', FUN, 'social')])
add('natural', 'Dinner with GF and spent ₹500', [ex(500, null, FOOD, 'social')])
add('natural', 'had dinner and spent 600', [ex(600, null, FOOD)])
add('natural', 'bought groceries for 450 and paid via wallet', [ex(450, 'Wallet')])
add('natural', 'Ordered biryani on Swiggy for 320 and paid from wallet', [ex(320, 'Wallet', FOOD)])
add('natural', 'went out with friends, spent 1200 from bank', [ex(1200, 'Bank', undefined, 'social')])
add('natural', 'recharged phone for 299 and paid from bank', [ex(299, 'Bank', BILLS)])
add('natural', 'movie with GF 500 bank', [ex(500, 'Bank', FUN, 'social')])
add('natural', 'lunch with team, 250 wallet', [ex(250, 'Wallet', FOOD, 'social')])
add('natural', 'bought a birthday gift for 1200 from bank', [ex(1200, 'Bank', undefined, 'social')])
add('natural', 'coffee with colleagues 120', [ex(120, null, FOOD, 'social')])
add('natural', 'pizza with roommates 700 wallet', [ex(700, 'Wallet', undefined, 'social')])
add('natural', 'dinner with mom 400 bank', [ex(400, 'Bank', FOOD, 'social')])
add('natural', 'Had lunch with bestie and paid 350 from wallet', [ex(350, 'Wallet', FOOD, 'social')])
add('natural', 'took an auto to college and paid 60', [ex(60, null, TRANSPORT)])
add('natural', 'paid 1200 for electricity bill from bank', [ex(1200, 'Bank', BILLS)])
add('natural', 'bought shoes for 2000 from wallet', [ex(2000, 'Wallet', SHOP)])
add('natural', 'spent 150 on tea and snacks', [ex(150, null, FOOD)])
add('natural', 'spent 300 on coffee and tea wallet', [ex(300, 'Wallet', FOOD)])
add('natural', 'watched a movie yesterday and spent 400', [ex(400, null, FUN, null, { date: YEST })])
add('natural', 'had breakfast this morning and paid 90 from wallet', [ex(90, 'Wallet', FOOD, null, { date: TODAY })])
add('natural', 'Zomato order 450 paid from bank', [ex(450, 'Bank', FOOD)])
add('natural', 'paid 500 to auto driver', [ex(500, null, TRANSPORT)])
add('natural', 'Rent paid 8000 from bank', [ex(8000, 'Bank', BILLS)])
add('natural', 'paid rent 8000 via bank', [ex(8000, 'Bank', BILLS)])
add('natural', 'spent about 500 on dinner', [ex(500, null, FOOD)])
add('natural', 'went to the gym and paid 1500 from wallet', [ex(1500, 'Wallet')])
add('natural', 'had a party with friends and spent 2000 from bank', [ex(2000, 'Bank', FUN, 'social')])
add('natural', 'bought a book for 350 and paid by wallet', [ex(350, 'Wallet', EDU)])

// ---- multi: several transactions in one entry ----------------------------------
add('multi', 'coffee 80, bus 40, salary 25000', [ex(80, null, FOOD), ex(40, null, TRANSPORT), inc(25000, null, SAL)])
add('multi', 'coffee 80 wallet, lunch 250 bank', [ex(80, 'Wallet', FOOD), ex(250, 'Bank', FOOD)])
add('multi', 'coffee 80 and bus 40', [ex(80, null, FOOD), ex(40, null, TRANSPORT)])
add('multi', 'spent 500 on movie and 200 on snacks', [ex(500, null, FUN), ex(200, null, FOOD)])
add('multi', 'Received Salary 25k and paid rent 4k for this month', [inc(25000, null, SAL), ex(4000, null, BILLS)])
add('multi', 'paid rent 8000 and got salary 25000', [ex(8000, null, BILLS), inc(25000, null, SAL)])
add('multi', 'coffee 80, bus 40', [ex(80, null, FOOD), ex(40, null, TRANSPORT)])
add('multi', 'breakfast 60, lunch 120, dinner 200', [ex(60, null, FOOD), ex(120, null, FOOD), ex(200, null, FOOD)])
add('multi', 'yesterday coffee 80, today lunch 200', [ex(80, null, FOOD, null, { date: YEST }), ex(200, null, FOOD, null, { date: TODAY })])
add('multi', 'spent 500 on fuel and received 2500 tuition', [ex(500, null, FUEL), inc(2500, null, TUI)])
add('multi', 'bus 40 wallet, auto 60 wallet, metro 30 bank', [ex(40, 'Wallet', TRANSPORT), ex(60, 'Wallet', TRANSPORT), ex(30, 'Bank', TRANSPORT)])
add('multi', 'lunch 250 with friends, bus 40', [ex(250, null, FOOD, 'social'), ex(40, null, TRANSPORT)])
add('multi', 'coffee 80,bus 40', [ex(80, null, FOOD), ex(40, null, TRANSPORT)])
add('multi', 'salary 25,000, rent 8,000', [inc(25000, null, SAL), ex(8000, null, BILLS)])
add('multi', 'got 5000 from tuition, spent 200 on snacks', [inc(5000, null, TUI), ex(200, null, FOOD)])
add('multi', 'petrol 500, coffee 80 and lunch 200', [ex(500, null, FUEL), ex(80, null, FOOD), ex(200, null, FOOD)])
add('multi', 'netflix 199, spotify 119', [ex(199, null, FUN), ex(119, null, FUN)])
add('multi', 'moved 2000 from SBI to wallet, coffee 80', [tr(2000, 'SBI', 'Wallet', { review: false }), ex(80, null, FOOD)])
add('multi', 'lunch 250 wallet, dinner with friends 500 bank', [ex(250, 'Wallet', FOOD), ex(500, 'Bank', FOOD, 'social')])
add('multi', 'bought shoes for 2000 and a shirt for 800', [ex(2000, null, SHOP), ex(800)])
add('multi', 'received 25k and paid rent 4k', [inc(25000), ex(4000, null, BILLS)])
add('multi', 'salary came 25k, paid rent 8k', [inc(25000, null, SAL), ex(8000, null, BILLS)])
add('multi', 'spent 100 on tea, 50 on snacks', [ex(100, null, FOOD), ex(50, null, FOOD)])
add('multi', 'auto 60 and metro 30', [ex(60, null, TRANSPORT), ex(30, null, TRANSPORT)])

// ---- amounts: formats people actually type ------------------------------------
add('amounts', 'salary 25,000', [inc(25000, null, SAL)])
add('amounts', 'fuel 1,200', [ex(1200, null, FUEL)])
add('amounts', 'rent ₹8,000 from bank', [ex(8000, 'Bank', BILLS)])
add('amounts', 'bonus ₹1,00,000', [inc(100000)])
add('amounts', 'GF sent me ₹2,000', [inc(2000)])
add('amounts', 'salary came 25k', [inc(25000, null, SAL)])
add('amounts', 'Salary came 28k', [inc(28000, null, SAL)])
add('amounts', 'paid 1.5k for books', [ex(1500, null, EDU)])
add('amounts', 'bonus 1.5L', [inc(150000)])
add('amounts', 'bonus 2 lakh', [inc(200000)])
add('amounts', 'spent 2.5k on shoes', [ex(2500, null, SHOP)])
add('amounts', 'spent 500rs', [ex(500)])
add('amounts', 'spent Rs. 500', [ex(500)])
add('amounts', 'paid rs 250 for lunch', [ex(250, null, FOOD)])
add('amounts', 'paid 250 rupees for lunch', [ex(250, null, FOOD)])
add('amounts', 'coffee ₹80', [ex(80, null, FOOD)])
add('amounts', 'coffee 80.50', [ex(80.5, null, FOOD)])
add('amounts', 'lunch 1,250.75', [ex(1250.75, null, FOOD)])
add('amounts', 'bus 40 rs', [ex(40, null, TRANSPORT)])
add('amounts', 'petrol 5L 500', [ex(500, null, FUEL)]) // 5L is litres, not lakh
add('amounts', 'diesel 10 L 900', [ex(900, null, FUEL)])
add('amounts', '10km auto ride 150', [ex(150, null, TRANSPORT)])
add('amounts', 'coffee 80 on 12 Sept', [ex(80, null, FOOD, null, { date: '2026-09-12' })])
add('amounts', '12 Sept coffee 80', [ex(80, null, FOOD, null, { date: '2026-09-12' })])
add('amounts', 'lunch 250 at 2pm', [ex(250, null, FOOD)])
add('amounts', 'coffee 80 (2 cups)', [ex(80, null, FOOD)])
add('amounts', 'fuel 500 3 days ago', [ex(500, null, FUEL, null, { date: '2026-09-25' })])
add('amounts', '2026-09-28 coffee 80', [ex(80, null, FOOD, null, { date: TODAY })])
add('amounts', 'day before yesterday coffee 80', [ex(80, null, FOOD, null, { date: '2026-09-26' })])

// ---- direction: who the money moved between -----------------------------------
add('direction', 'salary credited 30000', [inc(30000, null, SAL)])
add('direction', 'got 5000 from tuition', [inc(5000, null, TUI)])
add('direction', 'dad sent 3000', [inc(3000)])
add('direction', 'mom sent me 1500 wallet', [inc(1500, 'Wallet')])
add('direction', 'sent 500 to dad', [ex(500)])
add('direction', 'gave friend 200 for lunch', [ex(200, null, FOOD)])
add('direction', 'client paid 5000', [inc(5000)])
add('direction', 'friend paid me back 300', [inc(300)])
add('direction', 'paid friend back 300', [ex(300)])
add('direction', 'got paid 25000 today', [inc(25000)])
add('direction', 'got shoes for 2000', [ex(2000, null, SHOP)])
add('direction', 'got a haircut for 300', [ex(300)])
add('direction', 'stipend 8000 bank', [inc(8000, 'Bank', SAL)])
add('direction', 'refund 500 from amazon', [inc(500)])
add('direction', 'cashback 50', [inc(50)])
add('direction', 'moved 2000 from SBI to wallet', [tr(2000, 'SBI', 'Wallet', { review: false })])
add('direction', 'transferred 5000 from bank to SBI', [tr(5000, 'Bank', 'SBI', { review: false })])
add('direction', 'moved 2000 to wallet', [tr(2000, undefined, undefined, { review: true })])
add('direction', 'put 2000 into wallet', [tr(2000, undefined, undefined, { review: true })])
add('direction', 'withdrew 1000 from bank', [tr(1000, undefined, undefined, { review: true })])
add('direction', 'spent 500 on dinner with GF', [ex(500, null, FOOD, 'social')])
add('direction', 'salary 25000', [inc(25000, null, SAL)])

// ---- context: cues, slang, and the traps that must NOT trigger -----------------
add('context', 'dinner with friends 500 bank', [ex(500, 'Bank', FOOD, 'social')])
add('context', 'lunch with my GF 350', [ex(350, null, FOOD, 'social')])
add('context', 'movie with BF 400', [ex(400, null, FUN, 'social')])
add('context', 'hangout with bro 200', [ex(200, null, undefined, 'social')])
add('context', 'pizza with sis 300', [ex(300, null, undefined, 'social')])
add('context', 'dinner with fam 900', [ex(900, null, FOOD, 'social')])
add('context', 'coffee with bestie 150', [ex(150, null, FOOD, 'social')])
add('context', 'party with squad 1500', [ex(1500, null, FUN, 'social')])
add('context', 'birthday cake 600', [ex(600, null, undefined, 'social')])
add('context', 'gift for mom 1500', [ex(1500, null, undefined, 'social')])
add('context', 'netflix subscription 199', [ex(199, null, FUN, 'routine')])
add('context', 'gym monthly 1500', [ex(1500, null, undefined, 'routine')])
add('context', 'milk daily 30', [ex(30, null, undefined, 'routine')])
add('context', 'recharge as usual 299', [ex(299, null, BILLS, 'routine')])
add('context', 'suddenly bought headphones 2000', [ex(2000, null, undefined, 'unplanned')])
add('context', 'impulse buy 900', [ex(900, null, undefined, 'unplanned')])
add('context', 'craving pizza 400', [ex(400, null, undefined, 'unplanned')])
add('context', 'planned trip 5000', [ex(5000, null, undefined, 'planned')])
add('context', 'pre-booked tickets 2200', [ex(2200, null, undefined, 'planned')])
add('context', 'planned dinner with friends 800', [ex(800, null, FOOD, null)]) // two cues disagree: no suggestion
add('context', 'coffee 80 #routine', [ex(80, null, FOOD, 'routine')])
add('context', 'treat myself to ice cream 200', [ex(200, null, undefined, null)])
add('context', 'lunch with Ravi 250', [ex(250, null, FOOD, null)]) // a name is not a relationship word
add('context', 'paid with cash 200', [ex(200, null, undefined, null)])
add('context', 'social media subscription 199', [ex(199, null, BILLS, null)]) // "social" vs "subscription" disagree
add('context', 'GF sent me 2000', [inc(2000, null, undefined, null)])

// ---- accounts ------------------------------------------------------------------
add('accounts', 'coffee 80 bank wallet', [ex(80, null, FOOD, null, { conflict: ['Bank', 'Wallet'] })])
add('accounts', 'paid 500 from SBI', [ex(500, 'SBI')])
add('accounts', 'paid 500 using wallet not bank', [ex(500, null, undefined, null, { conflict: ['Wallet', 'Bank'] })])
add('accounts', 'lunch 250 bnak', [ex(250, null, FOOD)])
add('accounts', 'lunch 250 Wallet', [ex(250, 'Wallet', FOOD)])
add('accounts', 'moved 500 from wallet to bank', [tr(500, 'Wallet', 'Bank', { review: false })])
add('accounts', 'coffee 80 paid in cash', [ex(80, 'Wallet', FOOD)], 'gap') // needs user-specific aliases (cash -> Wallet)
add('accounts', 'coffee 80 paid by upi', [ex(80, 'Bank', FOOD)], 'gap') // needs user-specific aliases (upi -> Bank)

// ---- keyword traps: category words hiding inside other words -------------------
add('traps', 'team outing 500', [ex(500, null, FUN, 'social')])
add('traps', 'business trip 5000', [ex(5000, null, null)])
add('traps', 'cola 40', [ex(40, null, null)])
add('traps', 'current account fee 100', [ex(100, null, null)])
add('traps', 'teacher gift 300', [ex(300, null, null, 'social')])
add('traps', 'booking 500', [ex(500, null, null)])
add('traps', 'training fee 2000', [ex(2000, null, null)])
add('traps', 'recharged phone 299', [ex(299, null, BILLS)])
add('traps', 'movies 300', [ex(300, null, FUN)])
add('traps', 'snacks 60', [ex(60, null, FOOD)])

// ---- ambiguous: more than one defensible reading (reported, not headline) -----
add('ambiguous', 'coffee, tea 80', [ex(80, null, FOOD)], 'ambiguous') // one price for two items
add('ambiguous', 'paid rent and bought groceries 450', [ex(450)], 'ambiguous') // rent has no amount
add('ambiguous', 'dinner with 5 friends 500', [ex(500, null, FOOD, 'social')], 'ambiguous') // "5" is a head-count
add('ambiguous', 'sent 500', [ex(500)], 'ambiguous') // direction unknown
add('ambiguous', 'gave 200', [ex(200)], 'ambiguous')

export const MONEY_INBOX_CORPUS = items.map((item, i) => ({ id: i + 1, ...item }))

// ---------------------------------------------------------------------------------
// RED-TEAM SET (written AFTER the first round of parser fixes, to probe them).
//
// This is ADVERSARIAL by construction: it targets the risks the fixes themselves
// introduced (false merges, "L" meaning litres, "got 2 coffees", separators the
// parser never split on) plus formats the main corpus doesn't cover. So it is not a
// random sample and its accuracy is not a forecast — it answers "where does the new
// logic break?".
//
// Its FIRST-RUN result, taken before any refinement, is the honest generalisation
// figure (recorded in the G0 report). After that the failures it exposed were
// fixed, which means it is now part of what the rules were tuned on: a fresh
// held-out set (ideally written by someone else) is needed for any future estimate.
// ---------------------------------------------------------------------------------
const redItems = []
const red = (slice, text, entries, tag) => redItems.push({ slice, text, entries, tag })

// formatting, typos, spacing
red('format', 'cofee 80', [ex(80)])
red('format', 'LUNCH 250 FROM BANK', [ex(250, 'Bank', FOOD)])
red('format', 'lunch    250   wallet', [ex(250, 'Wallet', FOOD)])
red('format', 'coffee 80.', [ex(80, null, FOOD)])
red('format', 'coffee - 80', [ex(80, null, FOOD)])
red('format', 'coffee: 80', [ex(80, null, FOOD)])
red('format', 'coffee @ 80', [ex(80, null, FOOD)])
red('format', 'paid ₹80 for coffee', [ex(80, null, FOOD)])
red('format', 'coffee for Rs 80', [ex(80, null, FOOD)])
red('format', 'Rs.80 coffee', [ex(80, null, FOOD)])
red('format', 'coffee 80/-', [ex(80, null, FOOD)])
red('format', 'INR 500 dinner', [ex(500, null, FOOD)])
red('format', 'dinner 500 inr from bank', [ex(500, 'Bank', FOOD)])
red('format', 'coffee80', [ex(80, null, FOOD)], 'gap') // no space: the amount has no boundary to be read from

// amounts, including the shorthand's own false-positive risks
red('amounts', '₹ 1,200 groceries', [ex(1200)])
red('amounts', 'laptop 55,000 from bank', [ex(55000, 'Bank')])
red('amounts', '1.2k for shoes', [ex(1200, null, SHOP)])
red('amounts', 'monitor 2K', [ex(2000)])
red('amounts', 'monitor 2 K', [ex(2000)])
red('amounts', 'bought a bike for 1 lakh', [ex(100000)])
red('amounts', 'flat booking 5 lakhs', [ex(500000)])
red('amounts', '80k salary', [inc(80000, null, SAL)])
red('amounts', 'salary 25k/month', [inc(25000, null, SAL, null)])
red('amounts', 'paint 4L 800', [ex(800)]) // 4L of paint, not four lakh
red('amounts', 'milk 1l 60', [ex(60)])
red('amounts', 'cooking oil 5L 600', [ex(600)])
red('amounts', 'bonus 3L', [inc(300000)])
red('amounts', 'lunch 250 for 2 people', [ex(250, null, FOOD)])
red('amounts', 'netflix 199 for 3 months', [ex(199, null, FUN)])
red('amounts', 'got 2 coffees for 160', [ex(160, null, FOOD)], 'ambiguous') // "2" or "160"?
red('amounts', '28/09 coffee 80', [ex(80, null, FOOD)])

// direction
red('direction', 'Ravi sent me 500', [inc(500)])
red('direction', 'Ravi paid me 500 for lunch', [inc(500)])
red('direction', 'I paid Ravi 500', [ex(500)])
red('direction', 'dad gave me 2000', [inc(2000)])
red('direction', 'gave dad 2000', [ex(2000)])
red('direction', 'received 500 from Ravi', [inc(500)])
red('direction', 'got 500 back from Ravi', [inc(500)])
red('direction', 'got my phone repaired for 1500', [ex(1500)])
red('direction', 'lent Ravi 500', [ex(500)])
red('direction', 'Ravi returned 500', [inc(500)], 'ambiguous') // a bare name can't be told from an item
red('direction', 'mom paid for lunch 300', [{ amount: 300, type: null, account: null, ctx: null, review: true }]) // someone else paid: neither income nor expense, so ask
red('direction', 'salary credited to bank 30000', [inc(30000, 'Bank', SAL)])
red('direction', 'sold old phone for 8000', [inc(8000)])

// splitting and merging, including the merge's own false-positive risk
red('split', 'paid rent 8000 and bought groceries', [ex(8000, null, BILLS), ex(null)]) // second item has no amount: must NOT be swallowed
red('split', 'coffee 80; bus 40', [ex(80, null, FOOD), ex(40, null, TRANSPORT)])
red('split', 'coffee 80\nbus 40', [ex(80, null, FOOD), ex(40, null, TRANSPORT)])
red('split', 'coffee 80 & bus 40', [ex(80, null, FOOD), ex(40, null, TRANSPORT)])
red('split', 'coffee 80 and bus 40 and lunch 200', [ex(80, null, FOOD), ex(40, null, TRANSPORT), ex(200, null, FOOD)])
red('split', 'bought a shirt, paid 500 from bank', [ex(500, 'Bank')])
red('split', 'went to the mall, bought shoes for 2000 and paid from wallet', [ex(2000, 'Wallet', SHOP)])
red('split', 'coffee, tea and snacks 150', [ex(150, null, FOOD)])
red('split', 'lunch 250 wallet and dinner 400 bank', [ex(250, 'Wallet', FOOD), ex(400, 'Bank', FOOD)])
red('split', 'spent 500 on dinner and 200 on movie', [ex(500, null, FOOD), ex(200, null, FUN)])
red('split', 'paid 500 for dinner and got 200 cashback', [ex(500, null, FOOD), inc(200)])
red('split', 'sold old phone for 8000 and bought earphones for 1500', [inc(8000), ex(1500)])
red('split', 'bus 40, auto 60, and lunch 200', [ex(40, null, TRANSPORT), ex(60, null, TRANSPORT), ex(200, null, FOOD)])
red('split', 'petrol 500 wallet, and coffee 80', [ex(500, 'Wallet', FUEL), ex(80, null, FOOD)])
red('split', 'salary 25000, rent 8000, wifi 700, netflix 199', [inc(25000, null, SAL), ex(8000, null, BILLS), ex(700, null, BILLS), ex(199, null, FUN)])
red('split', 'rent 8k, fuel 2k, groceries 2.5k, netflix 149', [ex(8000, null, BILLS), ex(2000, null, FUEL), ex(2500), ex(149, null, FUN)]) // the Budgets page's own example text
red('split', 'breakfast 60 lunch 120 dinner 200', [ex(60, null, FOOD), ex(120, null, FOOD), ex(200, null, FOOD)], 'gap') // no separator at all

// categories
red('category', 'coffees 160', [ex(160, null, FOOD)])
red('category', 'auto rickshaw 60', [ex(60, null, TRANSPORT)])
red('category', 'tea shop 20', [ex(20, null, FOOD)])
red('category', 'green tea 150', [ex(150, null, FOOD)])
red('category', 'tea-time snacks 100', [ex(100, null, FOOD)])
red('category', 'gym membership 3000', [ex(3000, null, 'Health')])
red('category', 'gymkhana fee 500', [ex(500, null, null)])
red('category', 'doctor consultation 500', [ex(500, null, 'Health')])
red('category', 'exam fees 1200', [ex(1200, null, EDU)])
red('category', 'petrol pump 500', [ex(500, null, FUEL)])

// context
red('context', 'dinner with my besties 1200', [ex(1200, null, FOOD, 'social')])
red('context', 'outing with cousins 900', [ex(900, null, FUN, 'social')])
red('context', 'lunch with sister 300', [ex(300, null, FOOD, 'social')])
red('context', 'lunch with my boss 500', [ex(500, null, FOOD, null)]) // "boss" is not a relationship word (limit, not a bug)
red('context', 'coffee every morning 40', [ex(40, null, FOOD, 'routine')])
red('context', 'recharge monthly 299', [ex(299, null, BILLS, 'routine')])
red('context', 'gift for teacher 500', [ex(500, null, null, 'social')])
red('context', 'unplanned expense 300', [ex(300, null, undefined, 'unplanned')])

// dates and unsupported capabilities
red('dates', 'coffee 80 last night', [ex(80, null, FOOD, null, { date: YEST })])
red('dates', 'coffee 80 on monday', [ex(80, null, FOOD, null, { date: TODAY })])
red('dates', 'coffee 80 2 days ago', [ex(80, null, FOOD, null, { date: '2026-09-26' })])
red('dates', 'paisa mila 500', [inc(500)], 'gap') // Hinglish: outside the parser's vocabulary

export const RED_TEAM_CORPUS = redItems.map((item, i) => ({ id: 1000 + i + 1, ...item }))
