import assert from 'node:assert/strict'
import { buildDebtsCsv, DEBT_CSV_COLUMNS, buildDebtPaymentsCsv, DEBT_PAYMENT_CSV_COLUMNS } from './debtExport.js'

let passed = 0, failed = 0
function test(name, fn) {
  try { fn(); passed++; console.log(`  PASS  ${name}`) } catch (e) { failed++; console.log(`  FAIL  ${name}\n        ${e.message}`) }
}
const row = { name: 'Car', kind: 'term_loan', lender: null, status: 'active', as_of_date: '2026-10-01', as_of_outstanding: 1000.5, as_of_accrued_interest: 0, annual_rate_pct: 9.5, monthly_payment: null, remaining_months: 12, due_day: 5, created_at: 'a', updated_at: 'b' }

test('X1: header row has exactly the stored columns, in order', () => {
  assert.equal(buildDebtsCsv([]), DEBT_CSV_COLUMNS.join(',') + '\r\n')
  assert.deepEqual(DEBT_CSV_COLUMNS.slice(0, 4), ['name', 'kind', 'lender', 'status'])
})
test('X2: no calculated column is exported', () => {
  for (const c of DEBT_CSV_COLUMNS) assert.ok(!/emi|schedule|owed|balance|projection/i.test(c), c)
})
test('X3: one line per debt; null becomes empty; numbers are written as stored', () => {
  const lines = buildDebtsCsv([row]).trim().split('\r\n')
  assert.equal(lines.length, 2)
  assert.equal(lines[1], 'Car,term_loan,,active,2026-10-01,1000.5,0,9.5,,12,5,a,b')
})
test('X4: commas, quotes and line breaks are quoted', () => {
  const csv = buildDebtsCsv([{ ...row, name: 'A, "B"', lender: 'x\ny' }])
  assert.ok(csv.includes('"A, ""B"""')); assert.ok(csv.includes('"x\ny"'))
})
test('X5: text that a spreadsheet would run as a formula is neutralised', () => {
  for (const bad of ['=1+1', '+SUM(A1)', '-2', '@x', '\tx']) {
    const csv = buildDebtsCsv([{ ...row, name: bad }])
    assert.ok(csv.split('\r\n')[1].startsWith(`'${bad}`) || csv.split('\r\n')[1].startsWith(`"'${bad}`), bad)
  }
})
test('X6: a negative number in a number column is not altered', () => {
  assert.ok(buildDebtsCsv([{ ...row, as_of_outstanding: -5 }]).includes(',-5,'))
})
test('X7: no rows / undefined input gives only the header', () => {
  assert.equal(buildDebtsCsv(undefined), DEBT_CSV_COLUMNS.join(',') + '\r\n')
})

// ---------- D4b: the payments CSV ----------
const pay = { debt_name: 'Bike loan', debt_status: 'active', transaction_date: '2026-09-05', amount: 5000, description: 'EMI', account: 'SBI', transaction_type: 'expense', counted: 'yes', not_counted_reason: null, linked_on: '2026-10-10' }
test('X8: payments CSV: the header has exactly the approved columns, no ids; empty input gives only the header', () => {
  assert.deepEqual(DEBT_PAYMENT_CSV_COLUMNS, ['debt_name', 'debt_status', 'transaction_date', 'amount', 'description', 'account', 'transaction_type', 'counted', 'not_counted_reason', 'linked_on'])
  assert.ok(DEBT_PAYMENT_CSV_COLUMNS.every((c) => !/(^|_)id$/.test(c) && c !== 'user_id'))
  assert.equal(buildDebtPaymentsCsv([]), DEBT_PAYMENT_CSV_COLUMNS.join(',') + '\r\n')
  assert.equal(buildDebtPaymentsCsv(undefined), DEBT_PAYMENT_CSV_COLUMNS.join(',') + '\r\n')
})
test('X9: payments CSV: one line per payment; empty fields stay empty; amounts are written as stored', () => {
  const lines = buildDebtPaymentsCsv([pay, { ...pay, description: null, account: null, amount: 1250.5, counted: 'no', not_counted_reason: 'Not counted: this is no longer an expense' }]).trim().split('\r\n')
  assert.equal(lines.length, 3)
  assert.equal(lines[1], 'Bike loan,active,2026-09-05,5000,EMI,SBI,expense,yes,,2026-10-10')
  assert.equal(lines[2], 'Bike loan,active,2026-09-05,1250.5,,,expense,no,Not counted: this is no longer an expense,2026-10-10')
})
test('X10: payments CSV: commas, quotes and line breaks in a description are quoted', () => {
  const csv = buildDebtPaymentsCsv([{ ...pay, description: 'EMI, "Sep"\nbike' }])
  assert.ok(csv.includes('"EMI, ""Sep""\nbike"'))
})
test('X11: payments CSV: a description or account name that a spreadsheet would run as a formula is neutralised', () => {
  for (const bad of ['=HYPERLINK("http://evil","x")', '+1', '-2+3', '@SUM(1)', '\tx', '\rx']) {
    for (const col of ['description', 'account', 'debt_name']) {
      const line = buildDebtPaymentsCsv([{ ...pay, [col]: bad }]).split('\r\n').slice(1).join('\r\n')
      assert.ok(line.includes(`'${bad.replace(/"/g, '""')}`), `${col}: ${JSON.stringify(bad)} -> ${JSON.stringify(line)}`)
      assert.ok(!/^[=+\-@\t\r]/.test(line) && !/,[=+\-@\t]/.test(line.replace(/"[^"]*"/g, '"x"')), `${col}: a cell still starts with a formula character`)
    }
  }
})

console.log(`\n${passed} passed, ${failed} failed`)
if (failed > 0) process.exit(1)
