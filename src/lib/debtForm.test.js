import assert from 'node:assert/strict'
import {
  validateDebtForm, rowToForm, openingFiguresChanged, totalOwedPaise, debtView, ordinal, dueDayText,
  isRealDate, todayISO, ACTIVE_DEBT_LIMIT, MAX_MONEY, EMPTY_FORM,
} from './debtForm.js'

let passed = 0, failed = 0
function test(name, fn) {
  try { fn(); passed++; console.log(`  PASS  ${name}`) } catch (e) { failed++; console.log(`  FAIL  ${name}\n        ${e.message}`) }
}
const TODAY = '2026-10-15'
const good = { name: 'Education loan', kind: 'term_loan', lender: 'SBI', asOfDate: '2026-10-01', principal: '250000', accruedInterest: '', ratePct: '9.5', monthlyPayment: '5000', remainingMonths: '60', dueDay: '5' }
const v = (o) => validateDebtForm({ ...good, ...o }, TODAY)
const err = (o, key) => { const r = v(o); assert.equal(r.ok, false); assert.ok(r.errors[key], `expected an error on ${key}, got ${JSON.stringify(r.errors)}`); return r.errors[key] }

test('F1: a complete form is valid and maps to the table columns', () => {
  const r = v({})
  assert.equal(r.ok, true)
  assert.deepEqual(r.values, {
    name: 'Education loan', kind: 'term_loan', lender: 'SBI', as_of_date: '2026-10-01', as_of_outstanding: 250000,
    as_of_accrued_interest: 0, annual_rate_pct: 9.5, monthly_payment: 5000, remaining_months: 60, due_day: 5,
  })
})
test('F2: optional fields left blank become null (unpaid interest becomes 0)', () => {
  const r = v({ lender: '  ', monthlyPayment: '', remainingMonths: '', dueDay: '', accruedInterest: '' })
  assert.equal(r.ok, true)
  assert.equal(r.values.lender, null); assert.equal(r.values.monthly_payment, null)
  assert.equal(r.values.remaining_months, null); assert.equal(r.values.due_day, null); assert.equal(r.values.as_of_accrued_interest, 0)
})
test('F3 (G5): name is trimmed, required, at most 80', () => {
  assert.equal(v({ name: '  Car  ' }).values.name, 'Car')
  err({ name: '   ' }, 'name'); err({ name: '' }, 'name')
  assert.equal(v({ name: 'x'.repeat(80) }).ok, true); err({ name: 'x'.repeat(81) }, 'name')
})
test('F4: lender at most 80', () => { assert.equal(v({ lender: 'x'.repeat(80) }).ok, true); err({ lender: 'x'.repeat(81) }, 'lender') })
test('F5: kind must be one of the three', () => { err({ kind: 'mortgage' }, 'kind'); err({ kind: '' }, 'kind') })
test('F6 (G3): the rate is required, with no default', () => {
  err({ ratePct: '' }, 'ratePct'); err({ ratePct: '   ' }, 'ratePct')
  assert.equal(validateDebtForm({ ...good, ratePct: undefined }, TODAY).ok, false)
  assert.equal(EMPTY_FORM.ratePct, '')
})
test('F7 (G3): rate boundaries 0, 0.01, 100 ok; 100.01, 3 decimals, negative, text rejected', () => {
  for (const r of ['0', '0.01', '100', '100.00', '9.5', '10.25']) assert.equal(v({ ratePct: r }).ok, true, r)
  for (const r of ['100.01', '101', '9.999', '9.5.1', '-1', '-0', 'abc', '1e1', '1,5', ' - ']) err({ ratePct: r }, 'ratePct')
})
test('F8 (G3): interest-free needs a rate of exactly 0', () => {
  assert.equal(v({ kind: 'interest_free', ratePct: '0' }).ok, true)
  err({ kind: 'interest_free', ratePct: '1' }, 'ratePct')
  assert.equal(v({ kind: 'term_loan', ratePct: '0' }).ok, true) // a 0% loan is allowed
})
test('F9 (G4): principal boundaries', () => {
  for (const p of ['0', '0.01', '1', '100000000000', '99999999999.99', '250000.50']) assert.equal(v({ principal: p }).ok, true, p)
  for (const p of ['', '-1', '-0.01', '1.005', '1.234', '100000000000.01', '100000000001', 'NaN', 'Infinity', '1e5', 'abc', '1 000']) err({ principal: p }, 'principal')
  assert.equal(MAX_MONEY, 100000000000)
})
test('F10 (G4): unpaid interest rules the same, blank is fine', () => {
  assert.equal(v({ accruedInterest: '12.34' }).values.as_of_accrued_interest, 12.34)
  assert.equal(v({ accruedInterest: '0' }).ok, true)
  for (const p of ['-1', '1.234', '100000000000.01', 'x']) err({ accruedInterest: p }, 'accruedInterest')
})
test('F11 (G4): monthly payment must be more than 0 when given', () => {
  err({ monthlyPayment: '0' }, 'monthlyPayment'); err({ monthlyPayment: '0.00' }, 'monthlyPayment'); err({ monthlyPayment: '-5' }, 'monthlyPayment'); err({ monthlyPayment: '5.555' }, 'monthlyPayment')
  assert.equal(v({ monthlyPayment: '0.01' }).ok, true)
})
test('F12 (G7): months remaining whole 1 to 600', () => {
  for (const m of ['1', '600', '60']) assert.equal(v({ remainingMonths: m }).ok, true, m)
  for (const m of ['0', '601', '1.5', '-3', 'x', '1e2']) err({ remainingMonths: m }, 'remainingMonths')
})
test('F13 (G7): due day whole 1 to 31', () => {
  for (const d of ['1', '28', '29', '31']) assert.equal(v({ dueDay: d }).ok, true, d)
  for (const d of ['0', '32', '5.5', '-1', 'x']) err({ dueDay: d }, 'dueDay')
})
test('F14 (G6): as-of date: required, real, not in the future', () => {
  err({ asOfDate: '' }, 'asOfDate')
  assert.equal(v({ asOfDate: TODAY }).ok, true) // today is allowed
  assert.equal(v({ asOfDate: '2026-10-14' }).ok, true)
  assert.match(err({ asOfDate: '2026-10-16' }, 'asOfDate'), /future/)
  assert.match(err({ asOfDate: '2027-01-01' }, 'asOfDate'), /future/)
  for (const d of ['2026-02-30', '2026-13-01', '2026-00-10', '10/10/2026', '2026-1-1', 'abc']) err({ asOfDate: d }, 'asOfDate')
})
test('F15: leap days', () => {
  assert.equal(isRealDate('2024-02-29'), true); assert.equal(isRealDate('2023-02-29'), false)
  assert.equal(isRealDate('2100-02-29'), false); assert.equal(isRealDate('2000-02-29'), true)
  assert.equal(isRealDate('2026-04-31'), false); assert.equal(isRealDate('2026-12-31'), true)
})
test('F16: several errors are reported together', () => {
  const r = validateDebtForm({ ...good, name: '', principal: '', ratePct: '' }, TODAY)
  assert.deepEqual(Object.keys(r.errors).sort(), ['name', 'principal', 'ratePct'])
})
test('F17: todayISO uses the local calendar date', () => {
  assert.equal(todayISO(new Date(2026, 0, 5, 23, 59)), '2026-01-05')
  assert.equal(todayISO(new Date(2026, 11, 31, 0, 0)), '2026-12-31')
})
test('F18: rowToForm / validate round trip', () => {
  const row = { name: 'A', kind: 'credit_card', lender: null, as_of_date: '2026-10-01', as_of_outstanding: 1000.5, as_of_accrued_interest: 0, annual_rate_pct: 36, monthly_payment: null, remaining_months: null, due_day: 12 }
  const r = validateDebtForm(rowToForm(row), TODAY)
  assert.equal(r.ok, true)
  assert.equal(r.values.as_of_outstanding, 1000.5); assert.equal(r.values.lender, null); assert.equal(r.values.due_day, 12)
})
test('F19 (G9): only opening figures need confirmation', () => {
  const row = { as_of_outstanding: '250000.00', as_of_accrued_interest: '0', annual_rate_pct: '9.50', as_of_date: '2026-10-01' }
  const base = { as_of_outstanding: 250000, as_of_accrued_interest: 0, annual_rate_pct: 9.5, as_of_date: '2026-10-01' }
  assert.equal(openingFiguresChanged(row, base), false) // numeric strings from the database compare equal
  assert.equal(openingFiguresChanged(row, { ...base, as_of_outstanding: 249999.99 }), true)
  assert.equal(openingFiguresChanged(row, { ...base, as_of_accrued_interest: 1 }), true)
  assert.equal(openingFiguresChanged(row, { ...base, annual_rate_pct: 9.51 }), true)
  assert.equal(openingFiguresChanged(row, { ...base, as_of_date: '2026-10-02' }), true)
  assert.equal(openingFiguresChanged({ ...row, as_of_date: '2026-10-01T00:00:00' }, base), false)
})
test('F20 (G1): total owed in paise; cleared only when both parts are zero', () => {
  assert.equal(totalOwedPaise({ as_of_outstanding: 0, as_of_accrued_interest: 0 }), 0)
  assert.equal(totalOwedPaise({ as_of_outstanding: 0.1, as_of_accrued_interest: 0.2 }), 30)
  assert.equal(totalOwedPaise({ as_of_outstanding: '0', as_of_accrued_interest: '0.00' }), 0)
  assert.equal(totalOwedPaise({ as_of_outstanding: 0, as_of_accrued_interest: null }), 0)
})
const loan = { kind: 'term_loan', as_of_outstanding: 120000, as_of_accrued_interest: 0, annual_rate_pct: 12, monthly_payment: 10000, remaining_months: 12 }
test('F21 (G1): a cleared debt gets no projection and never reaches the engine', () => {
  for (const kind of ['term_loan', 'interest_free', 'credit_card']) {
    const view = debtView({ ...loan, kind, as_of_outstanding: 0, as_of_accrued_interest: 0 })
    assert.deepEqual(view, { state: 'cleared' })
  }
})
test('F22 (G1): a cleared debt with an unusable payment/months still does not fail', () => {
  assert.deepEqual(debtView({ ...loan, as_of_outstanding: 0, monthly_payment: 0.01, remaining_months: 600 }), { state: 'cleared' })
})
test('F23 (G2): a credit card is always an estimate with no schedule', () => {
  assert.deepEqual(debtView({ ...loan, kind: 'credit_card' }), { state: 'estimate' })
})
test('F24: a loan with payment and months gets an EMI and a schedule summary', () => {
  const view = debtView(loan)
  assert.equal(view.state, 'projection')
  assert.ok(view.emi > 10000 && view.emi < 10700, `emi ${view.emi}`)
  assert.equal(view.schedule.paysOff, true); assert.ok(view.schedule.months >= 12 && view.schedule.months <= 13)
})
test('F25: a payment that does not cover interest is reported, not hidden', () => {
  const view = debtView({ ...loan, monthly_payment: 1000 })
  assert.equal(view.schedule.paysOff, false); assert.equal(view.schedule.reason, 'payment-not-above-interest')
})
test('F26: no payment and no months gives a projection with nothing to show', () => {
  assert.deepEqual(debtView({ ...loan, monthly_payment: null, remaining_months: null }), { state: 'projection' })
})
test('F27: only unpaid interest owed gives no projection (and no engine call on a zero principal)', () => {
  assert.deepEqual(debtView({ ...loan, as_of_outstanding: 0, as_of_accrued_interest: 50 }), { state: 'projection' })
})
test('F28: interest-free loan projects at 0%', () => {
  const view = debtView({ kind: 'interest_free', as_of_outstanding: 12000, as_of_accrued_interest: 0, annual_rate_pct: 0, monthly_payment: 1000, remaining_months: 12 })
  assert.equal(view.emi, 1000); assert.equal(view.schedule.months, 12); assert.equal(view.schedule.totalInterest, 0)
})
test('F29: debtView never mutates the row and never returns NaN', () => {
  const row = Object.freeze({ ...loan })
  const view = debtView(row)
  assert.ok(Number.isFinite(view.emi))
})
test('F30: ordinals and due-day wording', () => {
  assert.deepEqual([1, 2, 3, 4, 11, 12, 13, 21, 22, 23, 30, 31].map(ordinal), ['1st', '2nd', '3rd', '4th', '11th', '12th', '13th', '21st', '22nd', '23rd', '30th', '31st'])
  assert.equal(dueDayText(5), 'the 5th of each month')
  assert.match(dueDayText(31), /last day in shorter months/); assert.match(dueDayText(29), /last day/)
  assert.equal(dueDayText(28), 'the 28th of each month'); assert.equal(dueDayText(null), null)
})
test('F31: the limit is 20', () => assert.equal(ACTIVE_DEBT_LIMIT, 20))

console.log(`\n${passed} passed, ${failed} failed`)
if (failed > 0) process.exit(1)
