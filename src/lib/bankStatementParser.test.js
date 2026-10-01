import assert from 'node:assert'
import { parseCsv, parseStatementDate, parseBankStatement } from './bankStatementParser.js'

let passed = 0, failed = 0
function test(name, fn) {
  try { fn(); passed++; console.log(`  PASS  ${name}`) }
  catch (err) { failed++; console.log(`  FAIL  ${name}\n        ${err.message}`) }
}

const RULES = [
  { keyword: 'swiggy', category_id: 'cat-food', priority: 0 },
  { keyword: 'uber', category_id: 'cat-transport', priority: 0 },
]

console.log('bankStatementParser tests\n')

// ---- CSV parsing ----------------------------------------------------------
test('parseCsv handles plain comma-separated rows', () => {
  assert.deepStrictEqual(parseCsv('a,b,c\n1,2,3'), [['a', 'b', 'c'], ['1', '2', '3']])
})

test('parseCsv handles quoted fields containing commas and escaped quotes', () => {
  assert.deepStrictEqual(parseCsv('Date,Description\n01/09/2026,"Paid to Ramesh, Shop"\n02/09/2026,"He said ""thanks"""'),
    [['Date', 'Description'], ['01/09/2026', 'Paid to Ramesh, Shop'], ['02/09/2026', 'He said "thanks"']])
})

test('parseCsv handles CRLF line endings', () => {
  assert.deepStrictEqual(parseCsv('a,b\r\n1,2\r\n'), [['a', 'b'], ['1', '2']])
})

// ---- Date parsing ----------------------------------------------------------
test('parseStatementDate reads DD/MM/YYYY, DD-MM-YYYY, and ISO', () => {
  assert.strictEqual(parseStatementDate('05/09/2026'), '2026-09-05')
  assert.strictEqual(parseStatementDate('05-09-2026'), '2026-09-05')
  assert.strictEqual(parseStatementDate('2026-09-05'), '2026-09-05')
})

test('parseStatementDate rejects an impossible DD/MM date rather than silently misreading it', () => {
  assert.strictEqual(parseStatementDate('15/09/2026'), '2026-09-15') // day 15, month 09: valid
  assert.strictEqual(parseStatementDate('09/15/2026'), null) // month 15 doesn't exist: reject, don't guess MM/DD
})

test('parseStatementDate returns null for garbage', () => {
  assert.strictEqual(parseStatementDate('not a date'), null)
  assert.strictEqual(parseStatementDate(''), null)
})

// ---- Structural errors (whole file) ---------------------------------------
test('a file with no date column is a structural error, not a silent skip', () => {
  const { candidates, error } = parseBankStatement('Description,Amount\ncoffee,80', { categoryRules: RULES })
  assert.deepStrictEqual(candidates, [])
  assert.ok(error.includes('date'))
})

test('a file with no amount/debit/credit column is a structural error', () => {
  const { error } = parseBankStatement('Date,Description\n05/09/2026,coffee', { categoryRules: RULES })
  assert.ok(error.includes('amount') || error.includes('Amount'))
})

test('a header-only file (no data rows) is a structural error', () => {
  const { error } = parseBankStatement('Date,Description,Amount', { categoryRules: RULES })
  assert.ok(error)
})

// ---- Debit/Credit format ---------------------------------------------------
test('Debit/Credit columns: a debit is an expense, a credit is income', () => {
  const csv = 'Date,Narration,Debit,Credit\n01/09/2026,Swiggy order,250,\n02/09/2026,Salary credited,,25000'
  const { candidates, error } = parseBankStatement(csv, { categoryRules: RULES })
  assert.strictEqual(error, null)
  assert.strictEqual(candidates.length, 2)
  assert.deepStrictEqual([candidates[0].type, candidates[0].amount, candidates[0].date], ['expense', 250, '2026-09-01'])
  assert.deepStrictEqual([candidates[1].type, candidates[1].amount, candidates[1].date], ['income', 25000, '2026-09-02'])
})

test('category is matched deterministically via the REAL matchCategory, reused not reimplemented', () => {
  const csv = 'Date,Description,Debit,Credit\n01/09/2026,Swiggy order payment,250,'
  const { candidates } = parseBankStatement(csv, { categoryRules: RULES })
  assert.strictEqual(candidates[0].categoryId, 'cat-food')
})

test('category is never guessed for income rows (same rule as Money Inbox: category only applies to expenses)', () => {
  const csv = 'Date,Description,Debit,Credit\n01/09/2026,Uber refund credited,,500'
  const { candidates } = parseBankStatement(csv, { categoryRules: RULES })
  assert.strictEqual(candidates[0].type, 'income')
  assert.strictEqual(candidates[0].categoryId, null)
})

// ---- Signed Amount + Type/Dr-Cr column format ------------------------------
test('a single Amount column with a Dr/Cr column resolves direction explicitly', () => {
  const csv = 'Date,Description,Amount,Type\n01/09/2026,Coffee,80,DR\n02/09/2026,Refund,80,CR'
  const { candidates } = parseBankStatement(csv, { categoryRules: RULES })
  assert.strictEqual(candidates[0].type, 'expense')
  assert.strictEqual(candidates[1].type, 'income')
})

test('a single signed Amount column with no type column infers direction from the sign', () => {
  const csv = 'Date,Description,Amount\n01/09/2026,Coffee,-80\n02/09/2026,Salary,25000'
  const { candidates } = parseBankStatement(csv, { categoryRules: RULES })
  assert.deepStrictEqual([candidates[0].type, candidates[0].amount], ['expense', 80])
  assert.deepStrictEqual([candidates[1].type, candidates[1].amount], ['income', 25000])
})

test('amounts with thousands separators and a rupee symbol are read correctly', () => {
  const csv = 'Date,Description,Debit,Credit\n01/09/2026,Rent,"₹8,000",'
  const { candidates } = parseBankStatement(csv, { categoryRules: RULES })
  assert.strictEqual(candidates[0].amount, 8000)
})

// ---- Per-row problems: flagged for review, never guessed -------------------
test('an unparseable date on one row flags that row for review without discarding it', () => {
  const csv = 'Date,Description,Debit,Credit\nbad-date,Coffee,80,'
  const { candidates } = parseBankStatement(csv, { categoryRules: RULES })
  assert.strictEqual(candidates.length, 1)
  assert.strictEqual(candidates[0].date, null)
  assert.strictEqual(candidates[0].needsReview, true)
})

test('a row with neither debit nor credit populated is flagged for review, not silently dropped', () => {
  const csv = 'Date,Description,Debit,Credit\n01/09/2026,Balance inquiry,,'
  const { candidates } = parseBankStatement(csv, { categoryRules: RULES })
  assert.strictEqual(candidates.length, 1)
  assert.strictEqual(candidates[0].amount, null)
  assert.strictEqual(candidates[0].needsReview, true)
})

test('a fully blank row is skipped entirely (not even a review row)', () => {
  const csv = 'Date,Description,Debit,Credit\n01/09/2026,Coffee,80,\n,,,\n'
  const { candidates } = parseBankStatement(csv, { categoryRules: RULES })
  assert.strictEqual(candidates.length, 1)
})

// ---- Never a guessed type/assumed flag -------------------------------------
test('assumedType is always false: a statement states direction, it is never a guess like Money Inbox\'s bare-number fallback', () => {
  const csv = 'Date,Description,Debit,Credit\n01/09/2026,Coffee,80,'
  const { candidates } = parseBankStatement(csv, { categoryRules: RULES })
  assert.strictEqual(candidates[0].assumedType, false)
})

// ---- Duplicate detection reuses the REAL checkDuplicate --------------------
test('a row matching an existing transaction is flagged as a likely duplicate, via the real checkDuplicate', () => {
  const existing = [{ amount: 250, description: 'Swiggy order' }]
  const csv = 'Date,Description,Debit,Credit\n01/09/2026,Swiggy order payment,250,'
  const { candidates } = parseBankStatement(csv, { categoryRules: RULES, existingTransactions: existing })
  assert.strictEqual(candidates[0].duplicate.isDuplicate, true)
})

test('header matching is case-insensitive and tolerant of common synonyms (Narration, Withdrawal, Deposit)', () => {
  const csv = 'Transaction Date,Narration,Withdrawal,Deposit\n01/09/2026,Coffee,80,'
  const { candidates, error } = parseBankStatement(csv, { categoryRules: RULES })
  assert.strictEqual(error, null)
  assert.strictEqual(candidates[0].amount, 80)
})

console.log(`\n${passed} passed, ${failed} failed`)
if (failed > 0) process.exit(1)
