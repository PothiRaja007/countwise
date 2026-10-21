import assert from 'node:assert/strict'
import { buildDebtsCsv, DEBT_CSV_COLUMNS } from './debtExport.js'

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

console.log(`\n${passed} passed, ${failed} failed`)
if (failed > 0) process.exit(1)
