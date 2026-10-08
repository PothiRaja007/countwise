// P10 — tests for the pension estimate answer (pensionEstimate.js).
//
// What it must do: answer only a ready pension question (or the button / a plain "pension estimate" request
// with no digit); always call the answer an estimate and say CountWise does not record PF payments; never say
// the user paid anything; mark employer parts "Not part of your balance"; show "Rate unavailable" with NO number
// when a rule is missing; explain plainly when there is no structure, no Basic salary or no data; change nothing.
import assert from 'node:assert'
import * as P from './pensionEstimate.js'
import { interpret } from './interpreter.js'
import { FORBIDDEN_PHRASES } from '../assistCopy.js'
import { EXPLANATION_FORBIDDEN_PHRASES } from '../explanationSafety.js'

let passed = 0, failed = 0
function test(name, fn) {
  try { fn(); passed++; console.log(`  PASS  ${name}`) }
  catch (err) { failed++; console.log(`  FAIL  ${name}\n${String(err.message).split('\n').map((l) => '        ' + l).join('\n')}`) }
}

const NOW = 1_800_000_000_000
const ctx = { id: 'c', referenceDate: new Date(2026, 9, 8), goals: [], categories: [], learningItems: [], accounts: [] }
const fm = (n) => `₹${Number(n).toLocaleString('en-IN')}`
const ok = (amount, rateUsed) => ({ status: 'ok', amount, rateUsed, ratePeriod: 'x', source: 's' })
const gone = (reason) => ({ status: 'unavailable', amount: null, rateUsed: null, reason })
const full = { status: 'ok', structureLabel: 'FY26', basicMonthly: 20000, calculationDate: '2026-10-08', breakdown: { retirementBenefits: { employeePF: ok(2400, 12), employerEPF: ok(1249, 3.67), eps: ok(1250, 8.33) } } }

test('E1: a ready pension question from the interpreter is answered; other results are not', () => {
  for (const t of ['How much is my PF?', 'what is my EPF contribution', 'how much PF is deducted']) {
    const r = interpret(t, ctx, NOW)
    assert.equal(P.pensionQuestionFromResult(r), true, t)
  }
  for (const t of ['pension', 'Received my salary', 'show me my pension', 'How much did I spend on food?', 'hello']) assert.equal(P.pensionQuestionFromResult(interpret(t, ctx, NOW)), false, t)
  for (const bad of [null, undefined, {}, { kind: 'query' }, { kind: 'query', pending: { intent: 'QUERY_SPEND' } }]) assert.equal(P.pensionQuestionFromResult(bad), false)
  // a result that is not complete is never answered
  const good = interpret('How much is my PF?', ctx, NOW)
  assert.equal(P.pensionQuestionFromResult(good), true)
  const variant = (patch, pendingPatch = {}) => ({ ...good, ...patch, pending: { ...good.pending, ...pendingPatch } })
  assert.equal(P.pensionQuestionFromResult(variant({}, { status: 'needs_clarification' })), false, 'not ready')
  assert.equal(P.pensionQuestionFromResult(variant({ asks: ['which?'] })), false, 'still asking')
  assert.equal(P.pensionQuestionFromResult(variant({}, { ambiguities: [{ field: 'x' }] })), false, 'ambiguous')
  assert.equal(P.pensionQuestionFromResult(variant({}, { missing: ['amount'] })), false, 'something missing')
  assert.equal(P.pensionQuestionFromResult(variant({ kind: 'transaction' })), false)
})

test('E2: the "Show my pension estimate" button is the only choice that answers', () => {
  assert.equal(P.pensionQuestionFromChoice('pension_estimate'), true)
  for (const c of ['record_salary', 'cancel', '', undefined, null, 'open_pension']) assert.equal(P.pensionQuestionFromChoice(c), false)
})

test('E3: a plain pension estimate request is recognised; digits or other words are not', () => {
  for (const t of ['pension estimate', 'Show my pension estimate', 'show my PF contribution', 'my EPF breakdown', 'give me the provident fund breakdown', 'Tell me my pf contribution!', 'pf contributions'])
    assert.equal(P.looksLikePensionEstimateRequest(t), true, t)
  for (const t of ['pension 5000', 'pension estimate 2000', 'paid pf 1800', 'pension', 'pf', 'show me my pension', 'pension estimate for my brother and what else', '', '   ', 'a'.repeat(80)])
    assert.equal(P.looksLikePensionEstimateRequest(t), false, t)
  for (const bad of [undefined, null, 5, {}]) assert.equal(P.looksLikePensionEstimateRequest(bad), false)
})

test('E4: the interpreter calls those requests a transaction, so the screen must intercept them', () => {
  for (const t of ['pension estimate', 'show my PF contribution']) assert.equal(interpret(t, ctx, NOW).kind, 'transaction', t)
})

test('E5: a full answer is an estimate, says CountWise does not record PF, and shows the three rows', () => {
  const a = P.pensionAnswer(full, { formatMoney: fm })
  assert.equal(a.ok, true); assert.equal(a.answerKind, 'estimated'); assert.equal(a.intent, 'QUERY_PENSION_ESTIMATE')
  assert.equal(a.headline, P.PENSION_MESSAGES.headline)
  assert.match(a.headline, /estimate/i); assert.match(a.headline, /doesn't record PF payments/)
  assert.deepStrictEqual(a.rows.map((r) => [r.label, r.value]), [['Employee PF (monthly)', '₹2,400'], ['Employer EPF (monthly)', '₹1,249'], ['EPS (monthly)', '₹1,250']])
  assert.match(a.basis, /₹20,000/); assert.match(a.basis, /FY26/); assert.match(a.basis, /8 Oct 2026/)
  assert.equal(a.partial, false); assert.deepStrictEqual({ ...a.action }, { id: 'open_pension', label: 'Open PF / Pension' })
  assert.equal(a.note, 'This is only an estimate. Nothing was changed.')
})

test('E6: employer rows are always marked "Not part of your balance", even without a number', () => {
  for (const input of [full, { ...full, breakdown: { retirementBenefits: { employeePF: ok(2400, 12), employerEPF: gone('no rule'), eps: gone('no rule') } } }]) {
    const a = P.pensionAnswer(input, { formatMoney: fm })
    for (const r of a.rows.filter((x) => /Employer|EPS/.test(x.label))) assert.match(r.note || '', /Not part of your balance/, r.label)
  }
})

test('E7: an unavailable rule shows "Rate unavailable" and no number; all unavailable explains and shows no rows', () => {
  const part = P.pensionAnswer({ ...full, breakdown: { retirementBenefits: { employeePF: ok(2400, 12), employerEPF: gone('No verified rule'), eps: { status: 'invalid_input', amount: 0 } } } }, { formatMoney: fm })
  assert.equal(part.ok, true); assert.equal(part.partial, true)
  for (const r of part.rows.slice(1)) { assert.equal(r.value, 'Rate unavailable'); assert.ok(!/\d/.test(r.value)) }
  assert.match(part.rows[1].note, /No verified rule/)
  const none = P.pensionAnswer({ ...full, breakdown: { retirementBenefits: { employeePF: gone('x'), employerEPF: gone('x'), eps: gone('x') } } }, { formatMoney: fm })
  assert.equal(none.ok, false); assert.deepStrictEqual([...none.rows], []); assert.match(none.headline, /No verified rule is available for 8 Oct 2026/)
  assert.equal(none.action.id, 'open_pension')
})

test('E8: no structure, no Basic salary, and a failed read each say so plainly and show no number', () => {
  const a = P.pensionAnswer({ status: 'no_structure' }, { formatMoney: fm })
  assert.equal(a.ok, false); assert.equal(a.headline, P.PENSION_MESSAGES.noStructure); assert.equal(a.action.id, 'open_salary'); assert.deepStrictEqual([...a.rows], [])
  const b = P.pensionAnswer({ status: 'no_basic' }, { formatMoney: fm })
  assert.equal(b.headline, P.PENSION_MESSAGES.noBasic); assert.equal(b.action.id, 'open_salary')
  for (const c of [P.pensionAnswer({ status: 'unreadable' }, { formatMoney: fm }), P.pensionDataProblem(), P.pensionAnswer({ ...full, breakdown: null }, { formatMoney: fm }), P.pensionAnswer({ ...full, basicMonthly: NaN }, { formatMoney: fm })]) {
    assert.equal(c.ok, false); assert.equal(c.headline, P.PENSION_MESSAGES.dataProblem); assert.equal(c.action, null); assert.deepStrictEqual([...c.rows], [])
  }
})

test('E9: bad input throws', () => {
  for (const bad of [null, undefined, 5, 'x']) assert.throws(() => P.pensionAnswer(bad, { formatMoney: fm }), TypeError)
  assert.throws(() => P.pensionAnswer({ status: 'weird' }, { formatMoney: fm }), TypeError)
  assert.throws(() => P.pensionAnswer(full), TypeError)
})

test('E10: no wording says the user paid or contributed; no forbidden phrase appears anywhere', () => {
  const answers = [
    P.pensionAnswer(full, { formatMoney: fm }), P.pensionAnswer({ status: 'no_structure' }, { formatMoney: fm }), P.pensionAnswer({ status: 'no_basic' }, { formatMoney: fm }),
    P.pensionDataProblem(), P.pensionAnswer({ ...full, breakdown: { retirementBenefits: { employeePF: ok(1, 12), employerEPF: gone('r'), eps: gone('r') } } }, { formatMoney: fm }),
    P.pensionAnswer({ ...full, breakdown: { retirementBenefits: { employeePF: gone('r'), employerEPF: gone('r'), eps: gone('r') } } }, { formatMoney: fm }),
  ]
  for (const a of answers) {
    const text = JSON.stringify(a).replace(P.PENSION_MESSAGES.headline, '')
    assert.ok(!/you (have )?(paid|contributed|deposited|saved)|your (pf )?balance is|you('ve| have) (paid|contributed)/i.test(text), text)
    for (const f of [...FORBIDDEN_PHRASES, ...EXPLANATION_FORBIDDEN_PHRASES]) assert.ok(!text.toLowerCase().includes(String(f).toLowerCase()), `${f} in ${text}`)
  }
})

test('E11: inputs are not changed, results are deeply frozen, and the words are pinned', () => {
  const input = JSON.parse(JSON.stringify(full)); const before = JSON.stringify(input)
  const a = P.pensionAnswer(input, { formatMoney: fm })
  assert.equal(JSON.stringify(input), before)
  assert.ok(Object.isFrozen(a) && Object.isFrozen(a.rows) && Object.isFrozen(a.rows[0]) && Object.isFrozen(a.action))
  assert.ok(Object.isFrozen(P.PENSION_MESSAGES) && Object.isFrozen(P.PENSION_ACTIONS))
  assert.equal(P.PENSION_MESSAGES.unavailable, 'Rate unavailable'); assert.equal(P.PENSION_MESSAGES.notYourBalance, 'Not part of your balance')
  assert.deepStrictEqual({ ...P.PENSION_ACTIONS }, { salary: 'open_salary', pension: 'open_pension' })
})

console.log(`\n${passed} passed, ${failed} failed`)
process.exit(failed ? 1 : 0)
