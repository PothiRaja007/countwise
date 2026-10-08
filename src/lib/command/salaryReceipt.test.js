// P10 — tests for the salary-received suggestion (salaryReceipt.js).
//
// What it must do: recognise only a plain "I received my salary" sentence with no digit; suggest an
// amount only from a usable figure and always label it an estimate; say so plainly and suggest nothing
// when there is no structure, no usable figure, or the data could not be read; carry the estimate as an
// 'estimated' amount from the engine; keep the user's own words (and a date word) when adding the
// amount; leave every typed amount alone; change nothing it is given; and read no clock.
import assert from 'node:assert'
import * as S from './salaryReceipt.js'
import { interpret } from './interpreter.js'
import { PENDING_ACTION_TTL_MS, statusAt } from './pendingAction.js'
import { isIntentAvailable } from './intents.js'
import { buildReviewCandidates } from '../moneyInbox.js'

let passed = 0, failed = 0
function test(name, fn) {
  try { fn(); passed++; console.log(`  PASS  ${name}`) }
  catch (err) { failed++; console.log(`  FAIL  ${name}\n${String(err.message).split('\n').map((l) => '        ' + l).join('\n')}`) }
}

const NOW = 1_800_000_000_000
const REF = new Date(2026, 9, 8)
const ctx = { id: 'c', referenceDate: REF, goals: [], categories: [], learningItems: [], accounts: [] }
const SUPPORTED = [
  'Received my salary', 'received my salary today', 'I got my salary', 'got my salary', 'I have just received my salary',
  'recieved my salary', 'Received my salary yesterday', "received this month's salary", 'salary received', 'Salary received.',
  'salary credited yesterday', 'salary is received', 'My salary was credited', 'my salary came in', 'salary arrived',
  'the salary got credited today', 'Received my salary!',
]

test('S1: the supported plain sentences are recognised, with the punctuation dropped', () => {
  for (const t of SUPPORTED) assert.ok(S.detectSalaryReceipt(t), t)
  assert.equal(S.detectSalaryReceipt('Salary received.').text, 'Salary received')
  assert.equal(S.detectSalaryReceipt('  Received   my salary!  ').text, 'Received my salary')
  assert.ok(Object.isFrozen(S.detectSalaryReceipt('Received my salary')))
})

test('S2: anything with a digit, a comma, extra words or another meaning is NOT recognised', () => {
  for (const t of [
    'salary 25000', 'salary received 52000', 'salary received 52000 sbi', 'Received my salary of 52000', 'salary 25k received and rent 4k paid',
    'salary', 'pension', 'got paid', 'payday', 'received my salary slip', 'when will I receive my salary', 'I received my salary and bought a laptop',
    'received my salary, paid rent', 'received my salary in sbi', 'salary deposited', "I have just now received last month's monthly salary yesterday", 'when I received my salary', 'because I got my salary', 'not received my salary', 'did you get my salary', 'yesterday I got my salary', 'salary not received', 'xsalary received', 'increase my salary', 'my salary is low', 'salary hike received', 'how much salary did I receive',
    'Received my salary yesterday evening', 'received salary 1', '', '   ', 'a'.repeat(80),
  ]) assert.equal(S.detectSalaryReceipt(t), null, t)
  for (const bad of [undefined, null, 5, {}, ['x']]) assert.equal(S.detectSalaryReceipt(bad), null)
})

test('S3: every recognised sentence is a plain transaction to the interpreter, and the sentence + an amount parses back as that amount, income, dated right', () => {
  for (const t of SUPPORTED) {
    assert.equal(interpret(t, ctx, NOW).kind, 'transaction', `${t}: the interpreter still calls it a transaction`)
    const text = S.salaryReceiptText(S.detectSalaryReceipt(t).text, 52000)
    assert.equal(interpret(text, ctx, NOW).kind, 'transaction', `${text}: still a transaction`)
    assert.equal(S.detectSalaryReceipt(text), null, `${text}: not offered a second time`)
    const c = buildReviewCandidates(text, { accounts: [{ id: 'a1', name: 'SBI', type: 'bank' }], categoryRules: [{ keyword: 'salary', category_id: 'c4', priority: 1 }], referenceDate: REF })
    assert.equal(c.length, 1, text)
    assert.equal(c[0].amount, 52000, text)
    assert.equal(c[0].type, 'income', text)
    assert.equal(c[0].date, /yesterday/i.test(t) ? '2026-10-07' : '2026-10-08', text)
  }
})

test('S4: the state: an estimate only from a usable figure, whole rupees; otherwise a plain reason', () => {
  assert.deepStrictEqual({ ...S.salaryReceiptState({ hasStructure: true, takeHome: 52000.4 }) }, { status: 'estimate', amount: 52000 })
  assert.deepStrictEqual({ ...S.salaryReceiptState({ hasStructure: true, takeHome: 52000.5 }) }, { status: 'estimate', amount: 52001 })
  for (const takeHome of [0, -5, NaN, Infinity, null, undefined, '52000', 0.4]) assert.equal(S.salaryReceiptState({ hasStructure: true, takeHome }).status, 'no_figure', String(takeHome))
  assert.equal(S.salaryReceiptState({ hasStructure: false, takeHome: 52000 }).status, 'no_structure')
  assert.equal(S.salaryReceiptState({ readFailed: true, hasStructure: true, takeHome: 52000 }).status, 'unreadable')
  assert.equal(S.salaryReceiptState().status, 'no_structure')
  for (const st of [S.salaryReceiptState({ hasStructure: true, takeHome: 5 }), S.salaryReceiptState(), S.salaryReceiptState({ readFailed: true }), S.salaryReceiptState({ hasStructure: true, takeHome: 0 })]) assert.ok(Object.isFrozen(st), st.status)
})

test('S5: the estimate panel has the approved words and three buttons', () => {
  const v = S.salaryReceiptView(S.salaryReceiptState({ hasStructure: true, takeHome: 52000 }))
  assert.equal(v.title, 'Estimated take-home from your active salary structure: ₹52,000')
  assert.equal(v.message, 'This is an estimate, not money you have received.')
  assert.equal(v.footer, 'Nothing is saved until you press Confirm on the review screen.')
  assert.deepStrictEqual(v.choices.map((c) => [c.id, c.label]), [['use_estimate', 'Use ₹52,000'], ['type_amount', "I'll type the amount"], ['cancel', 'Cancel']])
  assert.ok(Object.isFrozen(v) && Object.isFrozen(v.choices))
})

test('S6: the other three panels suggest NO amount and offer typing it, opening Salary, or cancelling', () => {
  const words = { no_structure: "You have no active salary structure, so I can't suggest an amount.", no_figure: "Your active salary structure has no usable take-home figure, so I can't suggest an amount.", unreadable: "I couldn't read your salary structure, so I'm not suggesting an amount." }
  for (const [status, title] of Object.entries(words)) {
    const v = S.salaryReceiptView({ status })
    assert.equal(v.title, title)
    assert.equal(v.message, null)
    assert.deepStrictEqual(v.choices.map((c) => [c.id, c.label]), [['type_amount', "I'll type the amount"], ['open_salary', 'Open Salary'], ['cancel', 'Cancel']])
    assert.ok(!/\d/.test(JSON.stringify(v)), `${status}: no number anywhere`)
  }
})

test('S7: a button the panel did not offer is refused', () => {
  const est = S.salaryReceiptState({ hasStructure: true, takeHome: 52000 })
  for (const id of ['use_estimate', 'type_amount', 'cancel']) assert.equal(S.resolveSalaryChoice(est, id).action, id)
  assert.equal(S.resolveSalaryChoice(est, 'open_salary').action, 'unknown')
  const none = { status: 'no_structure' }
  assert.equal(S.resolveSalaryChoice(none, 'use_estimate').action, 'unknown')
  for (const id of ['type_amount', 'open_salary', 'cancel']) assert.equal(S.resolveSalaryChoice(none, id).action, id)
  for (const bad of [undefined, null, 'x', {}, { status: 'estimate' }, { status: 'estimate', amount: 0 }]) assert.equal(S.resolveSalaryChoice(bad, 'cancel').action, 'unknown')
  assert.equal(S.resolveSalaryChoice(est, 'edit').action, 'unknown')
})

test('S8: the hand-over is a READY, available RECORD_SALARY whose amount is ESTIMATED, from the engine, with a plain note', () => {
  const p = S.salaryReceiptPending(S.salaryReceiptState({ hasStructure: true, takeHome: 52000 }), { id: 'sal-1', source: 'Received my salary', now: NOW })
  assert.equal(p.intent, 'RECORD_SALARY')
  assert.equal(p.status, 'ready')
  assert.equal(p.becomes, 'actual')
  assert.equal(p.source, 'Received my salary')
  assert.deepStrictEqual({ ...p.fields.amount }, { value: 52000, kind: 'estimated', origin: 'engine', note: 'Estimated from your active salary structure (₹52,000). It is an estimate, not money received.' })
  assert.deepStrictEqual(Object.keys(p.fields), ['amount'])
  assert.equal(p.expiresAt, NOW + PENDING_ACTION_TTL_MS)
  assert.equal(statusAt(p, NOW + PENDING_ACTION_TTL_MS), 'expired')
  assert.ok(isIntentAvailable('RECORD_SALARY'))
  assert.ok(Object.isFrozen(p))
})

test('S9: the hand-over refuses anything that is not an estimate', () => {
  for (const bad of [{ status: 'no_structure' }, { status: 'no_figure' }, { status: 'unreadable' }, null, undefined, { status: 'estimate', amount: 1.5 }]) {
    assert.throws(() => S.salaryReceiptPending(bad, { id: 'x', source: 's', now: NOW }), TypeError)
  }
  assert.throws(() => S.salaryReceiptPending({ status: 'estimate', amount: 5 }, { source: 's', now: NOW }))
  assert.throws(() => S.salaryReceiptPending({ status: 'estimate', amount: 5 }, { id: 'x', source: 's' }), /now/i)
})

test('S10: the text keeps the user\'s own words and adds the whole-rupee amount; bad input throws', () => {
  assert.equal(S.salaryReceiptText('Received my salary', 52000), 'Received my salary 52000')
  assert.equal(S.salaryReceiptText('Received my salary yesterday.', 52000), 'Received my salary yesterday 52000')
  assert.equal(S.salaryReceiptText('salary received  ', 1), 'salary received 1')
  for (const [t, a] of [['', 5], ['  ', 5], [null, 5], ['x', 0], ['x', -1], ['x', 1.5], ['x', NaN], ['x', '5']]) assert.throws(() => S.salaryReceiptText(t, a), TypeError)
})

test('S11: amounts use Indian digit grouping', () => {
  const t = (n) => S.salaryReceiptView(S.salaryReceiptState({ hasStructure: true, takeHome: n })).title
  assert.ok(t(100).endsWith('₹100'))
  assert.ok(t(1234).endsWith('₹1,234'))
  assert.ok(t(123456).endsWith('₹1,23,456'))
  assert.ok(t(12345678).endsWith('₹1,23,45,678'))
})

test('S12: the view refuses anything that is not a state', () => {
  for (const bad of [null, undefined, {}, { status: 'x' }, { status: 'estimate' }, { status: 'estimate', amount: -3 }]) assert.throws(() => S.salaryReceiptView(bad), TypeError)
})

test('S13: the words are pinned, and the lists are deeply frozen', () => {
  assert.equal(S.SALARY_MESSAGES.fillNote, 'The amount is an estimate from your salary structure, not money received. Change it if it differs, then press Review.')
  assert.equal(S.SALARY_MESSAGES.noSuggestion, "I couldn't prepare a suggestion. Type the amount yourself and press Review.")
  assert.deepStrictEqual({ ...S.SALARY_CHOICES }, { use: 'use_estimate', type: 'type_amount', open: 'open_salary', cancel: 'cancel' })
  assert.throws(() => { S.SALARY_MESSAGES.footer = 'x' }, TypeError)
  assert.throws(() => { S.SALARY_CHOICES.use = 'x' }, TypeError)
})

console.log(`\n${passed} passed, ${failed} failed`)
if (failed > 0) process.exit(1)
