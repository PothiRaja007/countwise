// P8b — tests for the optional learning-payment offer (learningOffer.js).
//
// What it must do: offer only for exactly one saved expense with a positive amount and a learning word with
// a name in front of it; offer nothing for income, transfers, several rows, or unclear text; take the name
// from the user's own words; carry the saved amount; build a ready CREATE_LEARNING_ITEM that the Learning
// page can open; change nothing it is given; and read no clock.
import assert from 'node:assert'
import * as O from './learningOffer.js'
import { PENDING_ACTION_TTL_MS, statusAt, markHandedOff } from './pendingAction.js'
import { learningDialogFromHandoff, LEARNING_DIALOG_MESSAGES } from './learningDialog.js'
import { isIntentAvailable } from './intents.js'

let passed = 0, failed = 0
function test(name, fn) {
  try { fn(); passed++; console.log(`  PASS  ${name}`) }
  catch (err) { failed++; console.log(`  FAIL  ${name}\n${String(err.message).split('\n').map((l) => '        ' + l).join('\n')}`) }
}

const NOW = 1_800_000_000_000
const row = (over = {}) => ({ type: 'expense', amount: 8000, description: 'x', original_input: 'Paid ₹8,000 for a Power BI certification', ...over })
const nameOf = (text) => { const r = O.detectLearningPayment([row({ original_input: text })]); return r && r.name }

test('O1: the approved single learning expense gets an offer with the name the user typed and the saved amount', () => {
  const offer = O.detectLearningPayment([row()])
  assert.deepStrictEqual({ ...offer }, { name: 'Power BI certification', amount: 8000, source: 'Paid ₹8,000 for a Power BI certification' })
  assert.ok(Object.isFrozen(offer))
})

test('O2: several phrasings find the name; the name stops at the learning word', () => {
  assert.equal(nameOf('paid 8000 for the SQL course from SBI'), 'SQL course')
  assert.equal(nameOf('paid 4500 for CFA exam fee'), 'CFA exam')
  assert.equal(nameOf('Paid 8000 for fees for the Python bootcamp via bank'), 'Python bootcamp')
  assert.equal(nameOf('spent 1200 for my Excel workshop'), 'Excel workshop')
  assert.equal(nameOf('paid 999 for an online Tableau masterclass using upi'), 'Tableau masterclass')
  assert.equal(nameOf('Paid 2500 for Google Data Analytics certificate'), 'Google Data Analytics certificate')
  assert.equal(nameOf('paid 700 for Python courses'), 'Python courses')
  assert.equal(nameOf('PAID 800 FOR A POWER BI TUTORIAL'), 'POWER BI TUTORIAL')
})

test('O3: it uses the amount that was SAVED (an amount edited in the review screen is what is carried)', () => {
  assert.equal(O.detectLearningPayment([row({ amount: 6500.5 })]).amount, 6500.5)
  assert.equal(O.detectLearningPayment([row({ amount: 12 })]).amount, 12)
})

test('O4: no offer for income, a transfer, or anything that is not an expense', () => {
  for (const type of ['income', 'transfer', undefined, null, 'Expense']) assert.equal(O.detectLearningPayment([row({ type })]), null)
})

test('O5: no offer unless EXACTLY one row was saved', () => {
  assert.equal(O.detectLearningPayment([]), null)
  assert.equal(O.detectLearningPayment([row(), row()]), null)
  assert.equal(O.detectLearningPayment([row(), row({ original_input: 'bus 40', amount: 40 })]), null)
})

test('O6: no offer for an amount that is not a positive number', () => {
  for (const amount of [0, -5, NaN, Infinity, '8000', null, undefined]) assert.equal(O.detectLearningPayment([row({ amount })]), null, String(amount))
})

test('O7: no offer without a learning word, or without a name in front of it', () => {
  assert.equal(nameOf('Paid 8000 for Power BI'), null)
  assert.equal(nameOf('paid 500 for groceries'), null)
  assert.equal(nameOf('Paid 8000 for a course'), null)
  assert.equal(nameOf('Paid 8000 for the course'), null)
  assert.equal(nameOf('course 8000'), null)
  assert.equal(nameOf('Power BI certification 8000'), null)
  assert.equal(nameOf('paid 8000 course fee for rent'), null)
})

test('O8: no offer when the words before the learning word are not a plain name (an amount or currency is in them)', () => {
  assert.equal(nameOf('paid for 2 courses 8000'), null)
  assert.equal(nameOf('paid for ₹8000 course'), null)
  assert.equal(nameOf('paid for rs 800 course'), null)
  assert.equal(nameOf('bought for $20 course'), null)
})

test('O9: the name must be 2 to 60 characters', () => {
  assert.equal(nameOf(`paid 100 for ${'x'.repeat(60)} course`), null)
  assert.ok(nameOf(`paid 100 for ${'x'.repeat(40)} course`))
  assert.equal(nameOf('paid 100 for x course').length, 8)
})

test('O10: bad input never throws and gives no offer', () => {
  for (const bad of [undefined, null, 'x', 5, {}, [null], [undefined], [{}], [{ type: 'expense', amount: 5 }], [{ type: 'expense', amount: 5, original_input: 7 }], [{ type: 'expense', amount: 5, original_input: '   ' }]]) {
    assert.equal(O.detectLearningPayment(bad), null)
  }
})

test('O11: nothing it is given is changed', () => {
  const rows = [row()]
  const before = JSON.stringify(rows)
  O.detectLearningPayment(rows)
  assert.equal(JSON.stringify(rows), before)
  assert.ok(!Object.isFrozen(rows[0]))
})

test('O12: the panel has the approved words and exactly two buttons', () => {
  const offer = O.detectLearningPayment([row()])
  const view = O.learningOfferView(offer)
  assert.equal(view.title, 'Your payment is saved. Track “Power BI certification” in Learning ROI?')
  assert.equal(view.footer, 'Nothing else is saved until you press Add item in Learning ROI.')
  assert.deepStrictEqual(view.choices.map((c) => [c.id, c.label]), [['track_learning', 'Open Learning ROI'], ['skip_learning', 'No thanks']])
  assert.ok(Object.isFrozen(view) && Object.isFrozen(view.choices))
})

test('O13: the panel and the hand-over refuse anything that is not an offer', () => {
  for (const bad of [null, undefined, {}, { name: 'x' }, { name: '', amount: 5, source: 's' }, { name: 'a b', amount: 0, source: 's' }, { name: 'a b', amount: 5, source: '' }]) {
    assert.throws(() => O.learningOfferView(bad), TypeError)
    assert.throws(() => O.learningOfferPending(bad, { id: 'p', now: NOW }), TypeError)
  }
})

test('O14: the hand-over is a READY, available CREATE_LEARNING_ITEM with the name and the cost, each with its note', () => {
  const offer = O.detectLearningPayment([row()])
  const p = O.learningOfferPending(offer, { id: 'offer-1', now: NOW })
  assert.equal(p.intent, 'CREATE_LEARNING_ITEM')
  assert.equal(p.status, 'ready')
  assert.equal(p.id, 'offer-1')
  assert.equal(p.source, offer.source)
  assert.deepStrictEqual(p.missing, [])
  assert.deepStrictEqual(p.ambiguities, [])
  assert.equal(p.expiresAt, NOW + PENDING_ACTION_TTL_MS)
  assert.deepStrictEqual({ ...p.fields.name }, { value: 'Power BI certification', kind: 'planned', origin: 'typed', note: 'Name taken from your payment. Change it if you like.' })
  assert.deepStrictEqual({ ...p.fields.cost }, { value: 8000, kind: 'planned', origin: 'typed', note: 'Cost taken from the payment you just saved (₹8,000). It is information only and is not added to your balances.' })
  assert.deepStrictEqual(Object.keys(p.fields).sort(), ['cost', 'name'])
  assert.ok(isIntentAvailable('CREATE_LEARNING_ITEM'))
  assert.ok(Object.isFrozen(p))
})

test('O14b: the cost carried is exactly the saved amount, whatever it is', () => {
  for (const amount of [8123, 6500.5, 49, 1234567.89]) {
    const p = O.learningOfferPending(O.detectLearningPayment([row({ amount })]), { id: 'p', now: NOW })
    assert.equal(p.fields.cost.value, amount)
  }
})

test('O15: the amount in the cost note uses Indian grouping and shows decimals only when there are some', () => {
  const note = (amount) => O.learningOfferPending(O.detectLearningPayment([row({ amount })]), { id: 'p', now: NOW }).fields.cost.note
  assert.ok(note(8000).includes('(₹8,000)'))
  assert.ok(note(100).includes('(₹100)'))
  assert.ok(note(123456).includes('(₹1,23,456)'))
  assert.ok(note(12345678).includes('(₹1,23,45,678)'))
  assert.ok(note(1234.5).includes('(₹1,234.50)'))
  assert.ok(note(99999.99).includes('(₹99,999.99)'))
})

test('O16: the Learning page opens its existing form from this hand-over: name and cost pre-filled, banner and both notes shown', () => {
  const offer = O.detectLearningPayment([row()])
  const handed = markHandedOff(O.learningOfferPending(offer, { id: 'o', now: NOW }), NOW)
  const d = learningDialogFromHandoff(handed, { items: [] })
  assert.equal(d.ok, true)
  assert.equal(d.dialog, 'create_item')
  assert.deepStrictEqual({ ...d.prefill }, { name: 'Power BI certification', cost: 8000, targetDate: '' })
  assert.equal(d.notice[0], LEARNING_DIALOG_MESSAGES.createBanner)
  assert.equal(d.notice.length, 3)
  assert.ok(d.notice[1].startsWith('Name taken from your payment'))
  assert.ok(d.notice[2].startsWith('Cost taken from the payment you just saved'))
})

test('O17: the hand-over expires like every other pending action', () => {
  const p = O.learningOfferPending(O.detectLearningPayment([row()]), { id: 'o', now: NOW })
  assert.equal(statusAt(p, NOW + PENDING_ACTION_TTL_MS - 1), 'ready')
  assert.equal(statusAt(p, NOW + PENDING_ACTION_TTL_MS), 'expired')
  assert.throws(() => O.learningOfferPending(O.detectLearningPayment([row()]), { id: 'o' }), /now/i)
  assert.throws(() => O.learningOfferPending(O.detectLearningPayment([row()]), { now: NOW }))
})

test('O18: the learning word list and the choices are exactly those approved, and deeply frozen', () => {
  assert.deepStrictEqual([...O.LEARNING_WORDS], ['course', 'certification', 'certificate', 'bootcamp', 'tutorial', 'masterclass', 'workshop', 'exam'])
  assert.deepStrictEqual({ ...O.LEARNING_OFFER_CHOICES }, { open: 'track_learning', skip: 'skip_learning' })
  assert.throws(() => { O.LEARNING_WORDS.push('x') }, TypeError)
  assert.throws(() => { O.LEARNING_OFFER_CHOICES.open = 'x' }, TypeError)
  assert.throws(() => { O.LEARNING_OFFER_MESSAGES.footer = 'x' }, TypeError)
})

console.log(`\n${passed} passed, ${failed} failed`)
if (failed > 0) process.exit(1)
