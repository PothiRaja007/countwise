// Plain Node test runner — no framework, no new dependency.
// Run with: node src/lib/financialEngine.test.js
import assert from 'node:assert'
import {
  accountBalance,
  totalBalance,
  allocated,
  available,
  goalProgress,
  netCashFlow,
  totalIncome,
  totalExpenses,
} from './financialEngine.js'

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

console.log('financialEngine tests\n')

// ---- Transfer test, using the exact SBI/Wallet example from Correction 3 ----
test('transfer: SBI -> Wallet moves money without touching income/expense', () => {
  const accounts = [{ id: 'sbi' }, { id: 'wallet' }]
  const transactions = [
    { account_id: 'sbi', to_account_id: null, type: 'income', amount: 10000, transaction_date: '2026-08-01' },
    { account_id: 'wallet', to_account_id: null, type: 'income', amount: 2000, transaction_date: '2026-08-01' },
    { account_id: 'sbi', to_account_id: 'wallet', type: 'transfer', amount: 2000, transaction_date: '2026-08-02' },
  ]

  assert.strictEqual(accountBalance(transactions, 'sbi'), 8000, 'SBI should be 8,000')
  assert.strictEqual(accountBalance(transactions, 'wallet'), 4000, 'Wallet should be 4,000')
  assert.strictEqual(totalBalance(transactions, accounts), 12000, 'Total should be 12,000')
  assert.strictEqual(
    totalIncome(transactions, '2026-08-01', '2026-08-31'),
    12000,
    'Income should be unaffected by the transfer (only the two income rows count)'
  )
  assert.strictEqual(
    totalExpenses(transactions, '2026-08-01', '2026-08-31'),
    0,
    'Expenses should be unaffected by the transfer'
  )
  assert.strictEqual(
    netCashFlow(transactions, '2026-08-01', '2026-08-31'),
    12000,
    'Net cash flow should be unaffected by the transfer'
  )
})

// ---- Goal allocation test, using the exact Bank/₹20k/₹5k example from Correction 2 ----
test('goal contribution: allocating money does not reduce real account balance', () => {
  const transactions = [
    { account_id: 'bank', to_account_id: null, type: 'income', amount: 20000, transaction_date: '2026-08-01' },
  ]
  const goalContributions = [
    { account_id: 'bank', goal_id: 'emergency-fund', amount: 5000, type: 'contribution', contribution_date: '2026-08-05' },
  ]

  assert.strictEqual(accountBalance(transactions, 'bank'), 20000, 'Real balance stays 20,000 — contribution is not an expense')
  assert.strictEqual(allocated(goalContributions, 'bank'), 5000, 'Allocated should be 5,000')
  assert.strictEqual(available(transactions, goalContributions, 'bank'), 15000, 'Available should be 15,000')
  assert.strictEqual(goalProgress(goalContributions, 'emergency-fund'), 5000, 'Goal progress should be 5,000')
})

// ---- Goal withdrawal reverses the allocation ----
test('goal withdrawal: reverses a prior contribution', () => {
  const goalContributions = [
    { account_id: 'bank', goal_id: 'laptop', amount: 5000, type: 'contribution', contribution_date: '2026-08-05' },
    { account_id: 'bank', goal_id: 'laptop', amount: 2000, type: 'withdrawal', contribution_date: '2026-08-10' },
  ]
  assert.strictEqual(allocated(goalContributions, 'bank'), 3000, 'Allocated should net to 3,000 after withdrawal')
  assert.strictEqual(goalProgress(goalContributions, 'laptop'), 3000, 'Goal progress should net to 3,000')
})

// ---- Plain expense reduces balance ----
test('expense reduces account balance', () => {
  const transactions = [
    { account_id: 'wallet', to_account_id: null, type: 'income', amount: 1000, transaction_date: '2026-08-01' },
    { account_id: 'wallet', to_account_id: null, type: 'expense', amount: 80, transaction_date: '2026-08-02' },
  ]
  assert.strictEqual(accountBalance(transactions, 'wallet'), 920, 'Wallet should be 920 after the expense')
})

// ---- Transactions outside the period are excluded from net cash flow ----
test('netCashFlow only counts transactions within the given period', () => {
  const transactions = [
    { account_id: 'wallet', type: 'income', amount: 500, transaction_date: '2026-07-15' }, // outside
    { account_id: 'wallet', type: 'income', amount: 300, transaction_date: '2026-08-10' }, // inside
    { account_id: 'wallet', type: 'expense', amount: 100, transaction_date: '2026-08-20' }, // inside
  ]
  assert.strictEqual(netCashFlow(transactions, '2026-08-01', '2026-08-31'), 200, 'Only August transactions should count: 300 - 100 = 200')
})

console.log(`\n${passed} passed, ${failed} failed`)
if (failed > 0) process.exit(1)
