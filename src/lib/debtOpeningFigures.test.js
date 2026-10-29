// KL-2 - hasValidOpeningFigures() decides whether the Debts card may show and calculate from a row's saved opening figures.
// It must agree with the D6 indicators ("Figures are not valid") on every row, so the card and the indicators never disagree.
import assert from 'node:assert'
import { hasValidOpeningFigures, debtView } from './debtForm.js'
import { computeIndicators, COPY } from './debtIndicators.js'

let passed = 0, failed = 0
function test(name, fn) {
  try { fn(); passed++; console.log(`  PASS  ${name}`) } catch (err) { failed++; console.log(`  FAIL  ${name}\n${String(err.message).split('\n').map((l) => '        ' + l).join('\n')}`) }
}
const row = (o = {}) => ({ id: 'x', name: 'Debt', kind: 'term_loan', status: 'active', as_of_date: '2026-10-01', as_of_outstanding: 100000, as_of_accrued_interest: 0, annual_rate_pct: 10, monthly_payment: 3000, remaining_months: 24, ...o })

const VALID = [
  row(), row({ as_of_outstanding: 0 }), row({ as_of_accrued_interest: 5000 }), row({ as_of_accrued_interest: null }), row({ as_of_accrued_interest: undefined }),
  row({ as_of_outstanding: '250000.50' }), row({ as_of_date: '2026-10-01T00:00:00Z' }), row({ kind: 'credit_card' }), row({ as_of_outstanding: 0, as_of_accrued_interest: 0 }),
]
const INVALID = [
  row({ as_of_outstanding: 'abc' }), row({ as_of_outstanding: undefined }), row({ as_of_outstanding: -5 }), row({ as_of_outstanding: Infinity }), row({ as_of_outstanding: NaN }),
  row({ as_of_accrued_interest: 'abc' }), row({ as_of_accrued_interest: -1 }), row({ as_of_accrued_interest: Infinity }),
  row({ as_of_date: null }), row({ as_of_date: 'not a date' }), row({ as_of_date: '2026-13-45' }),
  row({ as_of_outstanding: 1e300 }), row({ as_of_outstanding: 9e15 }),
  null, undefined, 'x', 5,
]

test('K1: valid rows are valid', () => { for (const r of VALID) assert.strictEqual(hasValidOpeningFigures(r), true, JSON.stringify(r)) })
test('K2: invalid principal, invalid or negative accrued interest, bad date, huge numbers and non-rows are all invalid', () => {
  for (const r of INVALID) assert.strictEqual(hasValidOpeningFigures(r), false, JSON.stringify(r))
})
test('K3: PARITY with the D6 indicators: a row is "Figures are not valid" there exactly when it is invalid here', () => {
  for (const r of [...VALID, ...INVALID.filter((x) => x && typeof x === 'object')]) {
    const { items } = computeIndicators({ debts: [r], infoByDebt: null, incomeRows: null, today: '2026-10-15' })
    assert.strictEqual(items.length, 1)
    const indicatorSaysInvalid = items[0].basis === 'none' && items[0].reason === COPY.reasonBadFigures
    assert.strictEqual(indicatorSaysInvalid, !hasValidOpeningFigures(r), JSON.stringify(r))
  }
})
// Disclosed residual (same as D6, kept on purpose so the two screens agree): JavaScript's Number(null) and Number('') are 0, so a
// null or empty principal reads as "nothing owed" on both screens. The column is NOT NULL in the database, so a saved row cannot hold it.
test('K3b: null/empty principal is treated the same on the card and in the indicators (both read it as 0)', () => {
  for (const v of [null, '']) {
    const r = row({ as_of_outstanding: v })
    const it = computeIndicators({ debts: [r], infoByDebt: null, incomeRows: null, today: '2026-10-15' }).items[0]
    assert.strictEqual(it.basis !== 'none', hasValidOpeningFigures(r))
  }
})
test('K4: for valid rows debtView is unchanged (the helper adds nothing to the display rules)', () => {
  assert.strictEqual(debtView(row()).state, 'projection')
  assert.strictEqual(debtView(row({ kind: 'credit_card' })).state, 'estimate')
  assert.strictEqual(debtView(row({ as_of_outstanding: 0 })).state, 'cleared')
})
test('K5: the helper reads the row only (no side effects, the row is not changed)', () => {
  const r = row({ as_of_outstanding: 'abc' }); const copy = JSON.stringify(r)
  hasValidOpeningFigures(r); assert.strictEqual(JSON.stringify(r), copy)
})

console.log(`\n${passed} passed, ${failed} failed`)
if (failed > 0) process.exit(1)
