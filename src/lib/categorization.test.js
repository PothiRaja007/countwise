// Plain Node test runner — no framework, no new dependency.
// Run with: node src/lib/categorization.test.js
import assert from 'node:assert'
import { parseAmount, detectType, detectAccounts, splitClauses, parseClause } from './categorization.js'

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
const ACCOUNTS = ['SBI', 'Wallet', 'Bank']

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
  const result = parseClause('coffee 80', { accountNames: ACCOUNTS, referenceDate: REF })
  assert.strictEqual(result.amount, 80)
  assert.strictEqual(result.type, 'expense')
  assert.strictEqual(result.assumedType, true)
  assert.strictEqual(result.date, '2026-08-25')
  assert.strictEqual(result.needsReview, false)
})

test('parseClause: "spent 500 on fuel and received 2500 tuition" — two clauses parsed independently', () => {
  const clauses = splitClauses('spent 500 on fuel and received 2500 tuition')
  const results = clauses.map((c) => parseClause(c, { accountNames: ACCOUNTS, referenceDate: REF }))

  assert.strictEqual(results[0].amount, 500)
  assert.strictEqual(results[0].type, 'expense')
  assert.strictEqual(results[0].assumedType, false)

  assert.strictEqual(results[1].amount, 2500)
  assert.strictEqual(results[1].type, 'income')
  assert.strictEqual(results[1].assumedType, false)
})

test('parseClause: "moved 2000 from SBI to wallet" — transfer with both accounts resolved', () => {
  const result = parseClause('moved 2000 from SBI to wallet', { accountNames: ACCOUNTS, referenceDate: REF })
  assert.strictEqual(result.amount, 2000)
  assert.strictEqual(result.type, 'transfer')
  assert.strictEqual(result.fromAccount, 'SBI')
  assert.strictEqual(result.toAccount, 'Wallet')
  assert.strictEqual(result.needsReview, false)
})

test('parseClause: "yesterday I spent 500 on fuel and today got 25000 salary" — dates resolved per clause', () => {
  const clauses = splitClauses('yesterday I spent 500 on fuel and today got 25000 salary')
  const results = clauses.map((c) => parseClause(c, { accountNames: ACCOUNTS, referenceDate: REF }))

  assert.strictEqual(results[0].date, '2026-08-24') // yesterday
  assert.strictEqual(results[0].amount, 500)
  assert.strictEqual(results[0].type, 'expense')

  assert.strictEqual(results[1].date, '2026-08-25') // today
  assert.strictEqual(results[1].amount, 25000)
  assert.strictEqual(results[1].type, 'income')
})

test('parseClause: a transfer with an unresolvable account is flagged needsReview', () => {
  const result = parseClause('moved 2000 from SBI to Zelle', { accountNames: ACCOUNTS, referenceDate: REF })
  assert.strictEqual(result.type, 'transfer')
  assert.strictEqual(result.toAccount, null) // "Zelle" isn't a known account
  assert.strictEqual(result.needsReview, true)
})

console.log(`\n${passed} passed, ${failed} failed`)
if (failed > 0) process.exit(1)
