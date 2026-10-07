// P3 — tests for the amount reader (amountReader.js).
//
// The promises under test: it reads the same amounts the transaction parser reads
// (₹, rs, rupees, 25k, 2 lakh, grouped numbers), it sets dates, quantities and
// head-counts aside, and — the one deliberate difference — it NEVER quietly picks
// one of two different amounts.
import assert from 'node:assert'
import * as AR from './amountReader.js'
import { readAmount, AmountReaderError } from './amountReader.js'

let passed = 0, failed = 0
function test(name, fn) {
  try { fn(); passed++; console.log(`  PASS  ${name}`) }
  catch (err) { failed++; console.log(`  FAIL  ${name}\n${String(err.message).split('\n').map((l) => '        ' + l).join('\n')}`) }
}
const value = (text) => { const r = readAmount(text); return r.status === 'found' ? r.value : r.status }

console.log('amountReader tests\n')

test('A1: ₹, rs and rupees are read, with or without spaces', () => {
  assert.strictEqual(value('Create a goal for a laptop worth ₹50,000'), 50000)
  assert.strictEqual(value('add ₹ 500 to it'), 500)
  assert.strictEqual(value('set it to 500 rs'), 500)
  assert.strictEqual(value('set it to 500 rupees'), 500)
  assert.strictEqual(value('Rs. 750 for the goal'), 750, 'a leading "Rs." is read as a plain number, exactly as the transaction parser does')
  assert.strictEqual(value('₹25k'), 25000)
  assert.strictEqual(value('₹2 lakh'), 200000)
  assert.strictEqual(value('₹80.50'), 80.5)
})

test('A2: thousands commas, including Indian grouping, stay together', () => {
  assert.strictEqual(value('Add ₹2,000 to it'), 2000)
  assert.strictEqual(value('Add 2,000 to my laptop goal'), 2000)
  assert.strictEqual(value('target 1,00,000'), 100000)
  assert.strictEqual(value('Set my food budget to ₹5,000'), 5000)
})

test('A3: 25k, 1.5k, 2 lakh and 1.5L (L only where a large sum is plausible)', () => {
  assert.strictEqual(value('set food budget to 5k'), 5000)
  assert.strictEqual(value('add 1.5k to my goal'), 1500)
  assert.strictEqual(value('create a goal for 2 lakh'), 200000)
  assert.strictEqual(value('salary 1.5L'), 150000)
  assert.strictEqual(value('bonus 3L'), 300000)
  assert.strictEqual(value('add 1.5L to my goal'), 'none', 'a bare L is litres unless the sentence is about a large sum (same as the transaction parser)')
  assert.strictEqual(value('5L petrol'), 'none')
  assert.strictEqual(value('a 5 crore house'), 50000000)
})

test('A4: no number means none', () => {
  for (const t of ['', 'Open my goals', 'Mark my Power BI course as completed', "Create next month's budget", 'How much did I spend last month?']) {
    assert.deepStrictEqual(readAmount(t), { status: 'none' }, t)
  }
})

test('A5: two different amounts are ambiguous and both are listed — never "the last one" or "the first one"', () => {
  const r = readAmount('Add 2000 to goal 2')
  assert.strictEqual(r.status, 'ambiguous')
  assert.deepStrictEqual(r.candidates.map((c) => c.value), [2000, 2])
  assert.strictEqual(r.value, undefined)
  const t = readAmount('coffee 80, bus 40')
  assert.deepStrictEqual([t.status, t.candidates.map((c) => c.value)], ['ambiguous', [80, 40]])
  assert.strictEqual(readAmount('add ₹500 or 500 rs').status, 'found', 'the same amount said twice is one amount')
  // The higher level wins: an explicit currency amount beats a plain number next to it.
  assert.strictEqual(value('Add ₹2,000 to goal 2'), 2000)
  assert.strictEqual(value('add 25k to goal 2'), 25000)
})

test('A6: dates, quantities and head-counts are not amounts', () => {
  assert.strictEqual(value('Create a goal called Laptop for 50000 by December'), 50000)
  assert.strictEqual(value('Create a goal for 50000 by December 2026'), 50000)
  assert.strictEqual(value('goal 50000 by 15 Dec'), 50000)
  assert.strictEqual(value('goal 50000 by 2026-12'), 50000)
  assert.strictEqual(value('goal 50000 by 2026-12-31'), 50000)
  assert.strictEqual(value('2026-09-28 coffee 80'), 80)
  assert.strictEqual(value('save for 3 months'), 'none')
  assert.strictEqual(value('dinner with 5 friends 600'), 600)
  assert.strictEqual(value('meet at 2pm'), 'none')
  assert.strictEqual(value('0 to my goal'), 'none', 'zero is not an amount')
})

test('A7: results are frozen, bad input is refused, and the only exports are the reader and its error', () => {
  assert.deepStrictEqual(Object.keys(AR).sort(), ['AmountReaderError', 'readAmount'])
  for (const t of ['Add 2000 to my laptop goal', 'Add 2000 to goal 2', 'Open my goals']) {
    const r = readAmount(t)
    assert.ok(Object.isFrozen(r), t)
    if (r.candidates) assert.ok(Object.isFrozen(r.candidates) && Object.isFrozen(r.candidates[0]))
  }
  for (const bad of [undefined, null, 42, {}, ['80']]) {
    assert.throws(() => readAmount(bad), (e) => e instanceof AmountReaderError && e.code === 'text_required')
  }
  const RealDate = globalThis.Date
  globalThis.Date = class extends RealDate {
    constructor(...a) { if (a.length === 0) throw new Error('read the real clock'); super(...a) }
    static now() { throw new Error('read the real clock') }
  }
  try { readAmount('Add ₹2,000 to it'); readAmount('goal 50000 by December') } finally { globalThis.Date = RealDate }
})

console.log(`\n${passed} passed, ${failed} failed`)
if (failed > 0) process.exit(1)
