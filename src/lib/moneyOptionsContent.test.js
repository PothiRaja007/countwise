// Phase 36 content-safety tests. Grounded in a real check of SEBI's
// current Investment Advisers framework (Dec 2024 amendments) and its
// 2025 enforcement focus on unregistered return claims — see the header
// comment in MoneyOptions.jsx for the sources and reasoning. These tests
// enforce the resulting constraints as checkable facts about the
// content, not just as something written carefully once and trusted.
import assert from 'node:assert'
import { MONEY_OPTIONS, MONEY_OPTIONS_DIMENSIONS } from './moneyOptionsContent.js'

let passed = 0, failed = 0
function test(name, fn) {
  try { fn(); passed++; console.log(`  PASS  ${name}`) }
  catch (err) { failed++; console.log(`  FAIL  ${name}\n        ${err.message}`) }
}

const ALL_TEXT = MONEY_OPTIONS.map((o) => `${o.name} ${o.liquidity} ${o.horizon} ${o.stability} ${o.note}`).join(' ')

console.log('moneyOptionsContent tests\n')

test('there is real content: a non-trivial number of options, each with every dimension filled in', () => {
  assert.ok(MONEY_OPTIONS.length >= 5, `only ${MONEY_OPTIONS.length} options`)
  for (const o of MONEY_OPTIONS) {
    for (const key of ['name', 'liquidity', 'horizon', 'stability', 'note']) {
      assert.ok(typeof o[key] === 'string' && o[key].trim().length > 0, `${o.name || '?'}: missing ${key}`)
    }
  }
})

// ---- No return claims, in any form — the core SEBI-enforcement risk ----
test('no percentage sign anywhere (a return figure, even a range, is a return claim)', () => {
  assert.ok(!ALL_TEXT.includes('%'), 'a "%" character was found in the content')
})

test('no rupee amount anywhere (a projected rupee outcome is a return claim in a different unit)', () => {
  assert.ok(!/₹/.test(ALL_TEXT) && !/\brs\.?\s*\d/i.test(ALL_TEXT), 'a currency figure was found')
})

test('no words implying a return, a promise, or a guarantee', () => {
  const banned = ['return', 'returns', 'yield', 'yields', 'interest rate', 'guarantee', 'guaranteed', 'profit', 'gain', 'gains', 'historically', 'on average', 'cagr']
  const lower = ALL_TEXT.toLowerCase()
  for (const word of banned) {
    assert.ok(!new RegExp(`\\b${word}\\b`).test(lower), `banned word found: "${word}"`)
  }
})

// ---- No specific securities — only categories, per SEBI's own scope rule --
test('no specific fund, scheme, or company name — categories only', () => {
  // A conservative denylist of well-known Indian fund-house / index / company
  // names that would turn a category description into a specific recommendation.
  const banned = ['nifty', 'sensex', 'hdfc', 'icici', 'sbi mutual', 'axis bluechip', 'reliance', 'tata', 'adani', 'infosys', 'tcs']
  const lower = ALL_TEXT.toLowerCase()
  for (const name of banned) assert.ok(!lower.includes(name), `specific name found: "${name}"`)
})

// ---- No personalized or recommending language -----------------------------
test('nothing is phrased as a personal recommendation ("you should", "best for you", "we recommend")', () => {
  const banned = ['you should', 'we recommend', 'best for you', 'best option', 'ideal for you', 'perfect for', 'must invest', 'should invest']
  const lower = ALL_TEXT.toLowerCase()
  for (const phrase of banned) assert.ok(!lower.includes(phrase), `recommending phrase found: "${phrase}"`)
})

test('every option is described along the same fixed set of dimensions, nothing added ad hoc', () => {
  const keys = MONEY_OPTIONS_DIMENSIONS.map((d) => d.key)
  assert.deepStrictEqual(keys, ['liquidity', 'horizon', 'stability'])
  for (const o of MONEY_OPTIONS) {
    for (const k of keys) assert.ok(k in o, `${o.name} is missing the "${k}" dimension`)
  }
})

test('no two options have identical names (no accidental duplicate entry)', () => {
  const names = MONEY_OPTIONS.map((o) => o.name)
  assert.strictEqual(new Set(names).size, names.length)
})

console.log(`\n${passed} passed, ${failed} failed`)
if (failed > 0) process.exit(1)
