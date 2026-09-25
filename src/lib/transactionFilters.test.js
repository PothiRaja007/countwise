// Plain Node test runner — no framework, no new dependency.
// Run with: node src/lib/transactionFilters.test.js
import assert from 'node:assert'
import { filterTransactions, sortTransactions, groupByDate, dateGroupLabel } from './transactionFilters.js'

let passed = 0
let failed = 0

function test(name, fn) {
  try {
    fn()
    console.log(`  PASS  ${name}`)
    passed++
  } catch (err) {
    console.log(`  FAIL  ${name}`)
    console.log(`        ${err.message}`)
    failed++
  }
}

console.log('transactionFilters tests\n')

const sample = [
  { id: '1', description: 'Coffee', original_input: 'coffee 80', account_id: 'wallet', to_account_id: null, category_id: 'food', type: 'expense', amount: 80, transaction_date: '2026-08-25', created_at: '2026-08-25T09:00:00Z' },
  { id: '2', description: 'Bus fare', original_input: 'bus 40', account_id: 'wallet', to_account_id: null, category_id: 'transport', type: 'expense', amount: 40, transaction_date: '2026-08-25', created_at: '2026-08-25T09:01:00Z' },
  { id: '3', description: 'Salary', original_input: 'salary received 25000', account_id: 'bank', to_account_id: null, category_id: 'salary', type: 'income', amount: 25000, transaction_date: '2026-08-01', created_at: '2026-08-01T10:00:00Z' },
  { id: '4', description: null, original_input: 'moved 2000 from bank to wallet', account_id: 'bank', to_account_id: 'wallet', category_id: null, type: 'transfer', amount: 2000, transaction_date: '2026-08-10', created_at: '2026-08-10T08:00:00Z' },
]

// ---- Search matches description OR original_input, case-insensitive ----
test('filterTransactions: search matches description text', () => {
  const result = filterTransactions(sample, { search: 'coffee' })
  assert.strictEqual(result.length, 1)
  assert.strictEqual(result[0].id, '1')
})

test('filterTransactions: search falls back to original_input when description is null', () => {
  const result = filterTransactions(sample, { search: 'moved' })
  assert.strictEqual(result.length, 1)
  assert.strictEqual(result[0].id, '4')
})

// ---- Date range is inclusive on both ends ----
test('filterTransactions: date range includes both boundary dates', () => {
  const result = filterTransactions(sample, { dateFrom: '2026-08-10', dateTo: '2026-08-25' })
  assert.deepStrictEqual(result.map((t) => t.id).sort(), ['1', '2', '4'])
})

// ---- Account filter matches either side of a transfer ----
test('filterTransactions: account filter matches transfer destination too', () => {
  const result = filterTransactions(sample, { accountId: 'wallet' })
  // Coffee, bus (source=wallet) and the transfer (destination=wallet)
  assert.deepStrictEqual(result.map((t) => t.id).sort(), ['1', '2', '4'])
})

// ---- Type filter ----
test('filterTransactions: type filter isolates transfers', () => {
  const result = filterTransactions(sample, { type: 'transfer' })
  assert.strictEqual(result.length, 1)
  assert.strictEqual(result[0].id, '4')
})

// ---- Combined filters narrow further ----
test('filterTransactions: filters combine with AND, not OR', () => {
  const result = filterTransactions(sample, { accountId: 'wallet', type: 'expense' })
  assert.deepStrictEqual(result.map((t) => t.id).sort(), ['1', '2'])
})

// ---- Sorting by amount, ascending ----
test('sortTransactions: amount ascending', () => {
  const result = sortTransactions(sample, 'amount', 'asc')
  assert.deepStrictEqual(result.map((t) => t.id), ['2', '1', '4', '3'])
})

// ---- Sorting by date, descending (default), with created_at as tiebreaker ----
test('sortTransactions: date descending, same-day rows ordered by created_at', () => {
  const result = sortTransactions(sample, 'date', 'desc')
  // 25 Aug rows first (bus after coffee since it was created later, but
  // desc order puts the later created_at first), then 10 Aug, then 1 Aug.
  assert.deepStrictEqual(result.map((t) => t.id), ['2', '1', '4', '3'])
})

// ---- Grouping assumes date-sorted input, groups consecutive same-date rows ----
test('groupByDate: groups consecutive same-date transactions', () => {
  const sorted = sortTransactions(sample, 'date', 'desc')
  const groups = groupByDate(sorted)
  assert.strictEqual(groups.length, 3)
  assert.strictEqual(groups[0].date, '2026-08-25')
  assert.strictEqual(groups[0].transactions.length, 2)
  assert.strictEqual(groups[1].date, '2026-08-10')
  assert.strictEqual(groups[2].date, '2026-08-01')
})

// ---- Date label convention matches Overview's Today/Yesterday/formatted rule ----
test('dateGroupLabel: today and yesterday are labeled, other dates are formatted', () => {
  assert.strictEqual(dateGroupLabel('2026-08-30', '2026-08-30', '2026-08-29'), 'Today')
  assert.strictEqual(dateGroupLabel('2026-08-29', '2026-08-30', '2026-08-29'), 'Yesterday')
  assert.strictEqual(dateGroupLabel('2026-08-01', '2026-08-30', '2026-08-29'), '1 Aug 2026')
})

console.log(`\n${passed} passed, ${failed} failed`)
if (failed > 0) process.exit(1)
