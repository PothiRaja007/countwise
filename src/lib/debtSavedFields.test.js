// KL-13 - savedFieldProblems() says which SAVED non-opening fields (rate, monthly payment, months left, due day) are not valid.
// The limits are the database constraints (supabase/p16_debts.sql) and the engine rules. Empty optional fields are not problems.
import assert from 'node:assert'
import { savedFieldProblems, MAX_MONEY } from './debtForm.js'
import { computeIndicators, COPY } from './debtIndicators.js'

let passed = 0, failed = 0
function test(name, fn) {
  try { fn(); passed++; console.log(`  PASS  ${name}`) } catch (err) { failed++; console.log(`  FAIL  ${name}\n${String(err.message).split('\n').map((l) => '        ' + l).join('\n')}`) }
}
const row = (o = {}) => ({ id: 'x', name: 'Debt', kind: 'term_loan', status: 'active', as_of_date: '2026-10-01', as_of_outstanding: 100000, as_of_accrued_interest: 0, annual_rate_pct: 10, monthly_payment: 3000, remaining_months: 24, due_day: 10, ...o })
const p = (o) => savedFieldProblems(row(o))
const NONE = { rate: false, payment: false, months: false, dueDay: false }

test('L1: a normal row has no problem; empty optional fields are not problems', () => {
  assert.deepStrictEqual(p({}), NONE)
  assert.deepStrictEqual(p({ monthly_payment: null, remaining_months: null, due_day: null }), NONE)
  assert.deepStrictEqual(p({ monthly_payment: undefined, remaining_months: undefined, due_day: undefined }), NONE)
})
test('L2: rate: 0 and 100 and 2 decimals are valid; negative, over 100, 3 decimals, text, empty, missing, infinite are not', () => {
  for (const v of [0, 100, 9.5, 11.55, 0.01, '12.5']) assert.strictEqual(p({ annual_rate_pct: v }).rate, false, String(v))
  for (const v of [-0.01, 100.01, 9.555, 'abc', '', null, undefined, NaN, Infinity, true, []]) assert.strictEqual(p({ annual_rate_pct: v }).rate, true, String(v))
})
test('L3: monthly payment: above 0, up to the maximum, 2 decimals; zero, negative, too big, 3 decimals, text, empty text, infinite are not', () => {
  for (const v of [0.01, 1, 3000, 1234.56, MAX_MONEY, '5000']) assert.strictEqual(p({ monthly_payment: v }).payment, false, String(v))
  for (const v of [0, -1, MAX_MONEY + 1, 10.005, 'abc', '', NaN, Infinity, true]) assert.strictEqual(p({ monthly_payment: v }).payment, true, String(v))
})
test('L4: months left: whole number 1 to 600; 0, 601, fractions, text, empty text are not', () => {
  for (const v of [1, 24, 600, '36']) assert.strictEqual(p({ remaining_months: v }).months, false, String(v))
  for (const v of [0, 601, -1, 12.5, 'abc', '', NaN, Infinity]) assert.strictEqual(p({ remaining_months: v }).months, true, String(v))
})
test('L5: due day: whole number 1 to 31; 0, 32, fractions, text are not', () => {
  for (const v of [1, 5, 28, 31, '10']) assert.strictEqual(p({ due_day: v }).dueDay, false, String(v))
  for (const v of [0, 32, -3, 4.5, 'abc', '', NaN]) assert.strictEqual(p({ due_day: v }).dueDay, true, String(v))
})
test('L6: each field is judged alone (one bad field does not mark the others)', () => {
  assert.deepStrictEqual(p({ monthly_payment: 'abc' }), { ...NONE, payment: true })
  assert.deepStrictEqual(p({ annual_rate_pct: 'abc' }), { ...NONE, rate: true })
  assert.deepStrictEqual(p({ remaining_months: 0 }), { ...NONE, months: true })
  assert.deepStrictEqual(p({ due_day: 99 }), { ...NONE, dueDay: true })
})
test('L7: PARITY: whatever the D6 indicators call "Monthly payment is not valid" is also a problem here (this is at least as strict)', () => {
  for (const v of [0, -5, 'abc', '', NaN, Infinity, 3000, 0.01, '5000', 1234.56]) {
    const r = row({ monthly_payment: v })
    const { monthly } = computeIndicators({ debts: [r], infoByDebt: null, incomeRows: null, today: '2026-10-15' })
    const d6Bad = (monthly.skipped || []).some((s) => s.reason === COPY.reasonBadPayment)
    if (d6Bad) assert.strictEqual(savedFieldProblems(r).payment, true, String(v))
    if (!savedFieldProblems(r).payment) assert.strictEqual(d6Bad, false, String(v))
  }
})
test('L8: a non-row gives rate problem only (nothing is assumed), and the row is not changed', () => {
  assert.strictEqual(savedFieldProblems(null).rate, true)
  const r = row({ monthly_payment: 'abc' }); const copy = JSON.stringify(r)
  savedFieldProblems(r); assert.strictEqual(JSON.stringify(r), copy)
})

console.log(`\n${passed} passed, ${failed} failed`)
if (failed > 0) process.exit(1)
