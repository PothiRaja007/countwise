import assert from 'node:assert'
import { MONEY_INBOX_FALLBACK_SCHEMA, buildMoneyInboxFallbackPrompt, validateFallbackResult } from './moneyInboxFallback.js'

let passed = 0, failed = 0
function test(name, fn) {
  try { fn(); passed++; console.log(`  PASS  ${name}`) }
  catch (err) { failed++; console.log(`  FAIL  ${name}\n        ${err.message}`) }
}

const ACCOUNTS = ['Wallet', 'Bank']
const CATEGORIES = ['Food', 'Transport']

console.log('moneyInboxFallback tests\n')

test('schema requires amount and type only; account/category/note are optional', () => {
  assert.deepStrictEqual(MONEY_INBOX_FALLBACK_SCHEMA.required, ['amount', 'type'])
  assert.strictEqual(MONEY_INBOX_FALLBACK_SCHEMA.additionalProperties, false)
})

test('the prompt lists only the real account and category names as closed choices', () => {
  const p = buildMoneyInboxFallbackPrompt({ raw: 'xyz 500', accountNames: ACCOUNTS, categoryNames: CATEGORIES })
  assert.ok(p.includes('Wallet, Bank'))
  assert.ok(p.includes('Food, Transport'))
  assert.ok(p.includes('Never invent an account or category'))
})

test('the raw text is embedded verbatim, quoted', () => {
  const p = buildMoneyInboxFallbackPrompt({ raw: 'weird input 500', accountNames: [], categoryNames: [] })
  assert.ok(p.includes('"weird input 500"'))
})

test('a fully valid result is accepted as-is', () => {
  const r = validateFallbackResult({ amount: 500, type: 'expense', account: 'Wallet', category: 'Food', note: 'Treated as a cash expense.' },
    { accountNames: ACCOUNTS, categoryNames: CATEGORIES })
  assert.deepStrictEqual(r, { ok: true, amount: 500, type: 'expense', account: 'Wallet', category: 'Food', note: 'Treated as a cash expense.' })
})

test('an invented account name not in the list is dropped, but amount/type still stand', () => {
  const r = validateFallbackResult({ amount: 500, type: 'expense', account: 'SBI Savings', category: 'Food' },
    { accountNames: ACCOUNTS, categoryNames: CATEGORIES })
  assert.strictEqual(r.ok, true)
  assert.strictEqual(r.account, null)
  assert.strictEqual(r.category, 'Food')
})

test('an invented category name not in the list is dropped the same way', () => {
  const r = validateFallbackResult({ amount: 500, type: 'expense', category: 'Entertainment' },
    { accountNames: ACCOUNTS, categoryNames: CATEGORIES })
  assert.strictEqual(r.category, null)
  assert.strictEqual(r.ok, true)
})

test('a close-but-not-exact match is rejected, never fuzzy-matched to the nearest real one', () => {
  const r = validateFallbackResult({ amount: 500, type: 'expense', account: 'wallet', category: 'food' }, // wrong case
    { accountNames: ACCOUNTS, categoryNames: CATEGORIES })
  assert.strictEqual(r.account, null)
  assert.strictEqual(r.category, null)
})

test('a missing amount makes the whole suggestion not-ok, even with a valid type', () => {
  const r = validateFallbackResult({ type: 'expense', account: 'Wallet' }, { accountNames: ACCOUNTS, categoryNames: CATEGORIES })
  assert.strictEqual(r.ok, false)
  assert.strictEqual(r.amount, null)
})

test('a missing type makes the whole suggestion not-ok, even with a valid amount', () => {
  const r = validateFallbackResult({ amount: 500 }, { accountNames: ACCOUNTS, categoryNames: CATEGORIES })
  assert.strictEqual(r.ok, false)
})

test('a zero or negative amount is rejected, not treated as a valid number', () => {
  for (const bad of [0, -50, -0.01]) {
    const r = validateFallbackResult({ amount: bad, type: 'expense' }, { accountNames: ACCOUNTS, categoryNames: CATEGORIES })
    assert.strictEqual(r.amount, null, `amount=${bad}`)
    assert.strictEqual(r.ok, false)
  }
})

test('a non-finite or non-numeric amount is rejected (NaN, Infinity, a string)', () => {
  for (const bad of [NaN, Infinity, '500', null, undefined]) {
    const r = validateFallbackResult({ amount: bad, type: 'expense' }, { accountNames: ACCOUNTS, categoryNames: CATEGORIES })
    assert.strictEqual(r.amount, null, `amount=${bad}`)
  }
})

test('an invalid type string is rejected, including a near-miss like "Expense" (wrong case)', () => {
  for (const bad of ['Expense', 'spending', 'debit', '', null, 42]) {
    const r = validateFallbackResult({ amount: 500, type: bad }, { accountNames: ACCOUNTS, categoryNames: CATEGORIES })
    assert.strictEqual(r.type, null, `type=${bad}`)
  }
})

test('an empty note is treated as absent, not an empty string', () => {
  const r = validateFallbackResult({ amount: 500, type: 'expense', note: '   ' }, { accountNames: ACCOUNTS, categoryNames: CATEGORIES })
  assert.strictEqual(r.note, null)
})

test('a very long note is truncated rather than overflowing the UI unbounded', () => {
  const r = validateFallbackResult({ amount: 500, type: 'expense', note: 'x'.repeat(1000) }, { accountNames: ACCOUNTS, categoryNames: CATEGORIES })
  assert.strictEqual(r.note.length, 300)
})

test('null, undefined, and non-object input are all safe and not-ok, never throw', () => {
  for (const bad of [null, undefined, 'a string', 42, []]) {
    assert.doesNotThrow(() => validateFallbackResult(bad, { accountNames: ACCOUNTS, categoryNames: CATEGORIES }))
    assert.strictEqual(validateFallbackResult(bad, { accountNames: ACCOUNTS, categoryNames: CATEGORIES }).ok, false)
  }
})

test('no accounts or categories configured: everything still works, both just always resolve to null', () => {
  const r = validateFallbackResult({ amount: 500, type: 'expense', account: 'Wallet', category: 'Food' }, {})
  assert.strictEqual(r.account, null)
  assert.strictEqual(r.category, null)
  assert.strictEqual(r.ok, true)
})


test('the prompt never contains spending context, by construction - the actual guarantee behind the AI-boundary exception for ReviewDrawer.jsx', () => {
  const p = buildMoneyInboxFallbackPrompt({ raw: 'social dinner with friends 500', accountNames: ACCOUNTS, categoryNames: CATEGORIES })
  for (const word of ['spending context', 'spendingcontext', 'planned', 'routine', 'unplanned']) {
    assert.ok(!p.toLowerCase().includes(word), `prompt unexpectedly contains: ${word}`)
  }
})

console.log(`\n${passed} passed, ${failed} failed`)
if (failed > 0) process.exit(1)
