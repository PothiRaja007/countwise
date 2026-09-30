// Plain Node test runner — no framework, no new dependency.
// Run with: node src/lib/categorization.test.js
import assert from 'node:assert'
import {
  parseAmount, detectType, detectAccounts, splitClauses, parseClause,
  detectAccountConflict, hasAmbiguousAmount, matchCategory, DEFAULT_RULE_KEYWORDS,
} from './categorization.js'

let passed = 0
let failed = 0

function test(name, fn) {
  try {
    fn()
    passed++
    console.log(`✓ ${name}`)
  } catch (err) {
    failed++
    console.log(`✗ ${name}`)
    console.log(`  ${err.message}`)
  }
}

const REF = new Date(2026, 7, 25) // 2026-08-25, a Tuesday
const ACCOUNTS = [
  { name: 'SBI', type: 'bank' },
  { name: 'Wallet', type: 'wallet' },
  { name: 'Bank', type: 'bank' },
]

// ---- parseAmount ----

test('parseAmount reads a bare number', () => {
  assert.strictEqual(parseAmount('coffee 80'), 80)
})

test('parseAmount reads ₹500', () => {
  assert.strictEqual(parseAmount('₹500 on groceries'), 500)
})

test('parseAmount reads "500 rs"', () => {
  assert.strictEqual(parseAmount('paid 500 rs for fuel'), 500)
})

test('parseAmount reads "500 rupees"', () => {
  assert.strictEqual(parseAmount('500 rupees for lunch'), 500)
})

test('parseAmount reads comma-grouped numbers', () => {
  assert.strictEqual(parseAmount('received 25,000 salary'), 25000)
})

test('parseAmount returns null when no number is present', () => {
  assert.strictEqual(parseAmount('lunch with friends'), null)
})

// ---- detectType ----

test('detectType finds "spent" as expense, not assumed', () => {
  const result = detectType('spent 500 on fuel', { hasAmount: true })
  assert.deepStrictEqual(result, { type: 'expense', assumed: false })
})

test('detectType finds "received" as income, not assumed', () => {
  const result = detectType('received 2500 tuition', { hasAmount: true })
  assert.deepStrictEqual(result, { type: 'income', assumed: false })
})

test('detectType finds "moved" as transfer, not assumed', () => {
  const result = detectType('moved 2000 from SBI to wallet', { hasAmount: true })
  assert.deepStrictEqual(result, { type: 'transfer', assumed: false })
})

test('detectType defaults a bare no-verb entry to expense, marked assumed', () => {
  const result = detectType('coffee 80', { hasAmount: true })
  assert.deepStrictEqual(result, { type: 'expense', assumed: true })
})

test('detectType returns null type when there is no verb and no amount', () => {
  const result = detectType('coffee', { hasAmount: false })
  assert.deepStrictEqual(result, { type: null, assumed: false })
})

// ---- detectAccounts ----

test('detectAccounts resolves "from X to Y" transfer direction', () => {
  const result = detectAccounts('moved 2000 from SBI to wallet', ACCOUNTS)
  assert.deepStrictEqual(result, { fromAccount: 'SBI', toAccount: 'Wallet', account: null })
})

test('detectAccounts finds a single mentioned account for non-transfers', () => {
  const result = detectAccounts('paid 500 rs for fuel from wallet', ACCOUNTS)
  assert.strictEqual(result.account, 'Wallet')
})

test('detectAccounts returns nulls when no known account is mentioned', () => {
  const result = detectAccounts('coffee 80', ACCOUNTS)
  assert.deepStrictEqual(result, { fromAccount: null, toAccount: null, account: null })
})

// ---- splitClauses ----

test('splitClauses splits on commas', () => {
  assert.deepStrictEqual(splitClauses('coffee 80, bus 40, salary received 25000'), [
    'coffee 80',
    'bus 40',
    'salary received 25000',
  ])
})

test('splitClauses splits on "and"', () => {
  assert.deepStrictEqual(splitClauses('spent 500 on fuel and received 2500 tuition'), [
    'spent 500 on fuel',
    'received 2500 tuition',
  ])
})

// ---- parseClause (full orchestration, the real spec examples) ----

test('parseClause: "coffee 80" — assumed expense, today, needs review is false (amount+type both resolved)', () => {
  const result = parseClause('coffee 80', { accounts: ACCOUNTS, referenceDate: REF })
  assert.strictEqual(result.amount, 80)
  assert.strictEqual(result.type, 'expense')
  assert.strictEqual(result.assumedType, true)
  assert.strictEqual(result.date, '2026-08-25')
  assert.strictEqual(result.needsReview, false)
})

test('parseClause: "spent 500 on fuel and received 2500 tuition" — two clauses parsed independently', () => {
  const clauses = splitClauses('spent 500 on fuel and received 2500 tuition')
  const results = clauses.map((c) => parseClause(c, { accounts: ACCOUNTS, referenceDate: REF }))

  assert.strictEqual(results[0].amount, 500)
  assert.strictEqual(results[0].type, 'expense')
  assert.strictEqual(results[0].assumedType, false)

  assert.strictEqual(results[1].amount, 2500)
  assert.strictEqual(results[1].type, 'income')
  assert.strictEqual(results[1].assumedType, false)
})

test('parseClause: "moved 2000 from SBI to wallet" — transfer with both accounts resolved', () => {
  const result = parseClause('moved 2000 from SBI to wallet', { accounts: ACCOUNTS, referenceDate: REF })
  assert.strictEqual(result.amount, 2000)
  assert.strictEqual(result.type, 'transfer')
  assert.strictEqual(result.fromAccount, 'SBI')
  assert.strictEqual(result.toAccount, 'Wallet')
  assert.strictEqual(result.needsReview, false)
})

test('parseClause: "yesterday I spent 500 on fuel and today got 25000 salary" — dates resolved per clause', () => {
  const clauses = splitClauses('yesterday I spent 500 on fuel and today got 25000 salary')
  const results = clauses.map((c) => parseClause(c, { accounts: ACCOUNTS, referenceDate: REF }))

  assert.strictEqual(results[0].date, '2026-08-24') // yesterday
  assert.strictEqual(results[0].amount, 500)
  assert.strictEqual(results[0].type, 'expense')

  assert.strictEqual(results[1].date, '2026-08-25') // today
  assert.strictEqual(results[1].amount, 25000)
  assert.strictEqual(results[1].type, 'income')
})

test('parseClause: a transfer with an unresolvable account is flagged needsReview', () => {
  const result = parseClause('moved 2000 from SBI to Zelle', { accounts: ACCOUNTS, referenceDate: REF })
  assert.strictEqual(result.type, 'transfer')
  assert.strictEqual(result.toAccount, null) // "Zelle" isn't a known account
  assert.strictEqual(result.needsReview, true)
})


// =====================================================================
// Phase G0 — parser correctness fixes. Everything above is unchanged.
// =====================================================================

// ---- parseAmount: thousands separators, shorthand, and what is NOT an amount ----
test('G0 parseAmount keeps thousands separators together, including Indian grouping', () => {
  assert.strictEqual(parseAmount('rent ₹8,000 from bank'), 8000)
  assert.strictEqual(parseAmount('bonus ₹1,00,000'), 100000)
  assert.strictEqual(parseAmount('lunch 1,250.75'), 1250.75)
})

test('G0 parseAmount reads k / lakh / crore shorthand', () => {
  assert.strictEqual(parseAmount('salary came 25k'), 25000)
  assert.strictEqual(parseAmount('paid 1.5k for books'), 1500)
  assert.strictEqual(parseAmount('monitor 2K'), 2000)
  assert.strictEqual(parseAmount('monitor 2 K'), 2000)
  assert.strictEqual(parseAmount('salary 25k/month'), 25000)
  assert.strictEqual(parseAmount('₹25k'), 25000)
  assert.strictEqual(parseAmount('bonus 2 lakh'), 200000)
  assert.strictEqual(parseAmount('flat booking 5 lakhs'), 500000)
  assert.strictEqual(parseAmount('1 crore'), 10000000)
})

test('G0 parseAmount: a bare "L" is lakh only where big money is plausible, otherwise litres', () => {
  assert.strictEqual(parseAmount('bonus 1.5L'), 150000)
  assert.strictEqual(parseAmount('bonus 3L'), 300000)
  assert.strictEqual(parseAmount('car 8L'), 800000)
  assert.strictEqual(parseAmount('petrol 5L 500'), 500)
  assert.strictEqual(parseAmount('diesel 10 L 900'), 900)
  assert.strictEqual(parseAmount('paint 4L 800'), 800) // no fuel word, but no big-money word either
  assert.strictEqual(parseAmount('milk 1l 60'), 60)
})

test('G0 parseAmount: "cr" is NOT crore (it means credit on bank statements)', () => {
  assert.strictEqual(parseAmount('salary 500 cr'), 500)
})

test('G0 parseAmount ignores the numbers of a date', () => {
  assert.strictEqual(parseAmount('12 Sept coffee 80'), 80)
  assert.strictEqual(parseAmount('coffee 80 on 12 Sept'), 80)
  assert.strictEqual(parseAmount('sept 12th lunch 200'), 200)
  assert.strictEqual(parseAmount('28/09 coffee 80'), 80)
  assert.strictEqual(parseAmount('2026-09-28 coffee 80'), 80)
  assert.strictEqual(parseAmount('3 days ago fuel 500'), 500)
})

test('G0 parseAmount ignores quantities and head-counts', () => {
  assert.strictEqual(parseAmount('lunch 250 at 2pm'), 250)
  assert.strictEqual(parseAmount('10km auto ride 150'), 150)
  assert.strictEqual(parseAmount('dinner with 5 friends 500'), 500)
  assert.strictEqual(parseAmount('netflix 199 for 3 months'), 199)
  assert.strictEqual(parseAmount('coffee 80 (2 cups)'), 80)
})

test('G0 parseAmount: existing readings are unchanged', () => {
  for (const [text, want] of [['coffee 80', 80], ['spent ₹500', 500], ['paid 250 rupees', 250], ['spent Rs. 500', 500], ['coffee 80/-', 80], ['no number here', null]]) {
    assert.strictEqual(parseAmount(text), want, text)
  }
})

// ---- hasAmbiguousAmount: a guessed amount must be flagged, not trusted silently ----
test('G0 hasAmbiguousAmount flags two competing plain numbers', () => {
  assert.strictEqual(hasAmbiguousAmount('got 2 coffees for 160'), true)
  assert.strictEqual(hasAmbiguousAmount('bus 40 route 21'), true)
  assert.strictEqual(hasAmbiguousAmount('breakfast 60 lunch 120 dinner 200'), true)
})

test('G0 hasAmbiguousAmount stays quiet when the amount is clear', () => {
  for (const t of ['coffee 80', 'coffee 80 on 12 Sept', 'lunch 250 at 2pm', 'dinner with 5 friends 500', '₹80 coffee 2 cups', 'coffee 80 80', 'salary 25k bonus 2']) {
    assert.strictEqual(hasAmbiguousAmount(t), false, t)
  }
})

// ---- detectType: who gave whom ----
test('G0 detectType: money arriving from a person or employer is income', () => {
  for (const t of ['dad sent 3000', 'GF sent me ₹2,000', 'friend paid me back 300', 'client paid 5000', 'got paid 25000 today', 'got 5000 from tuition', 'stipend 8000', 'refund 500', 'cashback 50', 'sold old phone for 8000']) {
    assert.deepStrictEqual(detectType(t), { type: 'income', assumed: false }, t)
  }
})

test('G0 detectType: money leaving, or "got" + an item, is an expense (assumed when there is no verb)', () => {
  for (const t of ['sent 500 to dad', 'paid friend back 300', 'gave dad 2000', 'got shoes for 2000', 'got a haircut for 300', 'got 2 coffees for 160']) {
    assert.strictEqual(detectType(t).type, 'expense', t)
  }
  assert.strictEqual(detectType('got shoes for 2000').assumed, true)
  assert.strictEqual(detectType('paid friend back 300').assumed, false)
})

test('G0 detectType: someone else paid FOR something is neither income nor expense, so it asks', () => {
  assert.deepStrictEqual(detectType('mom paid for lunch 300'), { type: null, assumed: false })
})

test('G0 detectType: withdrawals and deposits are transfers', () => {
  assert.strictEqual(detectType('withdrew 1000 from bank').type, 'transfer')
  assert.strictEqual(detectType('deposited 2000 into wallet').type, 'transfer')
})

// ---- detectAccounts / detectAccountConflict ----
test('G0 detectAccounts keeps its original three-key shape', () => {
  assert.deepStrictEqual(Object.keys(detectAccounts('coffee 80 wallet', ACCOUNTS)).sort(), ['account', 'fromAccount', 'toAccount'])
})

test('G0 two accounts named in one non-transfer clause: none is picked, and the conflict is reported in typed order', () => {
  assert.strictEqual(detectAccounts('coffee 80 bank wallet', ACCOUNTS).account, null)
  assert.deepStrictEqual(detectAccountConflict('coffee 80 bank wallet', ACCOUNTS), ['Bank', 'Wallet'])
  assert.deepStrictEqual(detectAccountConflict('paid 500 using wallet not bank', ACCOUNTS), ['Wallet', 'Bank'])
})

test('G0 a single account, a from/to transfer, and nested names are not conflicts', () => {
  assert.deepStrictEqual(detectAccountConflict('coffee 80 wallet', ACCOUNTS), [])
  assert.deepStrictEqual(detectAccountConflict('moved 500 from wallet to bank', ACCOUNTS), [])
  const nestedNames = [{ name: 'SBI', type: 'bank' }, { name: 'SBI Savings', type: 'bank' }]
  assert.strictEqual(detectAccounts('paid from SBI Savings', nestedNames).account, 'SBI Savings')
  assert.deepStrictEqual(detectAccountConflict('paid from SBI Savings', nestedNames), [])
})

// ---- splitClauses ----
test('G0 splitClauses never cuts a number at its thousands separator', () => {
  assert.deepStrictEqual(splitClauses('salary 25,000, rent 8,000'), ['salary 25,000', 'rent 8,000'])
  assert.deepStrictEqual(splitClauses('rent ₹8,000 from bank'), ['rent ₹8,000 from bank'])
  assert.deepStrictEqual(splitClauses('bonus ₹1,00,000'), ['bonus ₹1,00,000'])
  assert.deepStrictEqual(splitClauses('coffee 80,bus 40'), ['coffee 80', 'bus 40'])
})

test('G0 splitClauses: "and" / comma inside ONE event does not split it', () => {
  for (const t of [
    'Went to a movie with my GF and spent 500rs from bank',
    'bought groceries for 450 and paid via wallet',
    'lunch with team, 250 wallet',
    'spent 150 on tea and snacks',
    'yesterday, coffee 80',
    'had dinner and spent 600',
    'went to the mall, bought shoes for 2000 and paid from wallet',
  ]) {
    assert.deepStrictEqual(splitClauses(t), [t], t) // merged text reads exactly as typed
  }
})

test('G0 splitClauses: separate transactions are still separate', () => {
  assert.deepStrictEqual(splitClauses('coffee 80 and bus 40'), ['coffee 80', 'bus 40'])
  assert.strictEqual(splitClauses('Received Salary 25k and paid rent 4k for this month').length, 2)
  assert.strictEqual(splitClauses('spent 500 on dinner and 200 on movie').length, 2)
  assert.strictEqual(splitClauses('bus 40, auto 60, and lunch 200').length, 3)
  assert.strictEqual(splitClauses('bus 40, auto 60, and lunch 200')[2], 'lunch 200') // the stray "and" is dropped
})

test('G0 splitClauses: a piece that says the OPPOSITE kind of thing is not merged', () => {
  assert.strictEqual(splitClauses('paid rent and got salary 25000').length, 2)
})

test('G0 splitClauses: a fragment that is a purchase of its own is not swallowed', () => {
  assert.deepStrictEqual(splitClauses('paid rent 8000 and bought groceries'), ['paid rent 8000', 'bought groceries'])
})

test('G0 splitClauses also splits on semicolons, newlines and "&"', () => {
  assert.strictEqual(splitClauses('coffee 80; bus 40').length, 2)
  assert.strictEqual(splitClauses('coffee 80\nbus 40').length, 2)
  assert.strictEqual(splitClauses('coffee 80 & bus 40').length, 2)
})

test('G0 splitClauses: backward compatible, since inputs where every piece has an amount split exactly as the old splitter did', () => {
  const legacy = (t) => t.split(/\s*,\s*|\s+and\s+/i).map((x) => x.trim()).filter(Boolean)
  for (const t of [
    'coffee 80, bus 40, salary received 25000', 'spent 500 on fuel and received 2500 tuition', 'coffee 80', 'coffee 80 wallet, lunch 250 bank',
    'yesterday I spent 500 on fuel and today got 25000 salary', 'petrol 500, coffee 80 and lunch 200', 'netflix 199, spotify 119',
  ]) {
    assert.deepStrictEqual(splitClauses(t), legacy(t), t)
  }
})

test('G0 splitClauses: empty and whitespace-only input yields nothing', () => {
  assert.deepStrictEqual(splitClauses(''), [])
  assert.deepStrictEqual(splitClauses('  ,  and  ; '), [])
})

// ---- matchCategory: whole words, not substrings ----
const RULES = Object.entries(DEFAULT_RULE_KEYWORDS).flatMap(([category, keywords]) => keywords.map((keyword) => ({ keyword, category_id: category })))

test('G0 matchCategory: a keyword hiding inside another word no longer matches', () => {
  for (const [text, want] of [
    ['team outing 500', 'Entertainment'], ['business trip 5000', null], ['cola 40', null], ['current account fee 100', null],
    ['teacher gift 300', null], ['booking 500', null], ['training fee 2000', null], ['gymkhana fee 500', null],
  ]) {
    assert.strictEqual(matchCategory(text, RULES), want, text)
  }
})

test('G0 matchCategory: plurals and past tenses still match', () => {
  for (const [text, want] of [
    ['coffees 160', 'Food'], ['snacks 60', 'Food'], ['movies 300', 'Entertainment'], ['recharged phone 299', 'Bills & Utilities'],
    ['tea shop 20', 'Food'], ['green tea 150', 'Food'], ['tea-time snacks 100', 'Food'], ['auto rickshaw 60', 'Transport'],
  ]) {
    assert.strictEqual(matchCategory(text, RULES), want, text)
  }
})

test('G0 matchCategory: user-defined rules, priorities and multi-word keywords still work', () => {
  const rules = [
    { keyword: 'zomato', category_id: 'food', priority: 0 },
    { keyword: 'gas station', category_id: 'fuel', priority: 0 },
    { keyword: 'zomato gold', category_id: 'sub', priority: 5 },
  ]
  assert.strictEqual(matchCategory('Zomato 320', rules), 'food')
  assert.strictEqual(matchCategory('filled at the gas station 900', rules), 'fuel')
  assert.strictEqual(matchCategory('zomato gold renewal 299', rules), 'sub') // higher priority wins
  assert.strictEqual(matchCategory('', rules), null)
})

// ---- parseClause ----
test('G0 parseClause: a one-sided top-up is a transfer with an unknown source, flagged for review', () => {
  const c = parseClause('put 2000 into wallet', { accounts: ACCOUNTS, referenceDate: REF })
  assert.strictEqual(c.type, 'transfer')
  assert.strictEqual(c.toAccount, 'Wallet')
  assert.strictEqual(c.fromAccount, null)
  assert.strictEqual(c.needsReview, true)
})

test('G0 parseClause: "paid 500 from bank to Ravi" is an expense from Bank, not a transfer with a lost account', () => {
  const c = parseClause('paid 500 from bank to Ravi', { accounts: ACCOUNTS, referenceDate: REF })
  assert.strictEqual(c.type, 'expense')
  assert.strictEqual(c.account, 'Bank')
})

test('G0 parseClause reports the account conflict and does not pick an account', () => {
  const c = parseClause('coffee 80 bank wallet', { accounts: ACCOUNTS, referenceDate: REF })
  assert.strictEqual(c.account, null)
  assert.deepStrictEqual(c.accountConflict, ['Bank', 'Wallet'])
})

test('G0 parseClause flags a guessed amount for review, but not a clear one', () => {
  assert.strictEqual(parseClause('got 2 coffees for 160', { referenceDate: REF }).needsReview, true)
  assert.strictEqual(parseClause('coffee 80', { referenceDate: REF }).needsReview, false)
  assert.strictEqual(parseClause('dinner with 5 friends 500', { referenceDate: REF }).needsReview, false)
  assert.strictEqual(parseClause('coffee 80', { referenceDate: REF }).accountConflict.length, 0)
})


// =====================================================================
// G0.1 — payment-method aliases resolve to an account by TYPE ("cash" ->
// the wallet-type account, "UPI"/"card" -> a bank-type account) when no
// account is named literally. Everything above is unchanged.
// =====================================================================

test('G0.1 "cash" resolves to the one wallet-type account', () => {
  assert.strictEqual(detectAccounts('coffee 80 paid in cash', ACCOUNTS).account, 'Wallet')
  assert.strictEqual(detectAccounts('coffee 80 hand cash', ACCOUNTS).account, 'Wallet')
  assert.strictEqual(detectAccounts('coffee 80 by cash', ACCOUNTS).account, 'Wallet')
})

test('G0.1 UPI/card/net banking/online/gpay/phonepe/paytm all imply a bank-type account', () => {
  const oneBank = [{ name: 'Wallet', type: 'wallet' }, { name: 'Bank', type: 'bank' }]
  for (const t of [
    'coffee 80 via upi', 'coffee 80 by card', 'coffee 80 debit card', 'coffee 80 credit card',
    'coffee 80 net banking', 'coffee 80 netbanking', 'coffee 80 paid online',
    'coffee 80 via gpay', 'coffee 80 via google pay', 'coffee 80 via phonepe', 'coffee 80 via paytm',
  ]) {
    assert.strictEqual(detectAccounts(t, oneBank).account, 'Bank', t)
  }
})

test('G0.1 a literal account name still wins outright over an alias in the same text', () => {
  // ACCOUNTS has both SBI (bank) and Wallet — "cash" would imply Wallet, but
  // "SBI" is named literally, so the literal name is used, not the alias.
  assert.strictEqual(detectAccounts('coffee 80 paid via SBI in cash', ACCOUNTS).account, 'SBI')
})

test('G0.1 an alias matching TWO accounts of the same type is a conflict, not a guess', () => {
  // ACCOUNTS = SBI (bank), Wallet (wallet), Bank (bank) — two bank-type accounts.
  assert.strictEqual(detectAccounts('coffee 80 by card', ACCOUNTS).account, null)
  assert.deepStrictEqual(detectAccountConflict('coffee 80 by card', ACCOUNTS), ['SBI', 'Bank'])
  assert.strictEqual(detectAccounts('coffee 80 via upi', ACCOUNTS).account, null)
})

test('G0.1 no matching account type: no alias fires, same as today', () => {
  const walletOnly = [{ name: 'Wallet', type: 'wallet' }]
  assert.strictEqual(detectAccounts('coffee 80 via upi', walletOnly).account, null)
  assert.deepStrictEqual(detectAccountConflict('coffee 80 via upi', walletOnly), [])
})

test('G0.1 mentioning both a wallet alias and a bank alias in one clause is a genuine conflict', () => {
  const oneEach = [{ name: 'Wallet', type: 'wallet' }, { name: 'Bank', type: 'bank' }]
  assert.strictEqual(detectAccounts('cash and card both used 80', oneEach).account, null)
  assert.deepStrictEqual(detectAccountConflict('cash and card both used 80', oneEach), ['Wallet', 'Bank'])
})

test('G0.1 an alias inside a from/to transfer is not resolved (unchanged scope, same as a bare unmatched name)', () => {
  const c = detectAccounts('moved 500 from cash to Bank', ACCOUNTS)
  assert.strictEqual(c.fromAccount, null)
  assert.strictEqual(c.toAccount, 'Bank')
})

test('G0.1 near-miss words do not accidentally trigger an alias (whole-word matching)', () => {
  const oneEach = [{ name: 'Wallet', type: 'wallet' }, { name: 'Bank', type: 'bank' }]
  for (const t of ['cashew nuts 80', 'discarded old cards 80', 'onliner joke 80']) {
    assert.strictEqual(detectAccounts(t, oneEach).account, null, t)
  }
})


// ---- G0.1: the "recieved" typo (i-before-e) is a real, high-frequency ----
// ---- case worth a targeted fix, without opening the door to fuzzy match --
test('G0.1 "recieved"/"recieve" (the common typo) are recognized as income, same as the correct spelling', () => {
  for (const t of ['recieved from mom', 'recieve money from mom', 'mom recieved my payment']) {
    assert.strictEqual(detectType(t).type, 'income', t)
  }
})

test('G0.1 the correctly-spelled base form "receive" is deliberately NOT added: it would wrongly flip unrelated words', () => {
  for (const t of ['the receiver was busy', 'receivable amount 500', 'receiving guests 500']) {
    assert.strictEqual(detectType(t).type, 'expense', t)
  }
})

console.log(`\n${passed} passed, ${failed} failed`)
if (failed > 0) process.exit(1)
