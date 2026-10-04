// Phase 36 content-safety tests, extended 4 Oct 2026 for the lighter layout.
// Grounded in a real check of SEBI's current Investment Advisers framework
// (Dec 2024 amendments) and its 2025 enforcement focus on unregistered return
// claims — see the header comment in MoneyOptions.jsx. The safety scan now
// covers EVERYTHING the page can show (short summaries, quick labels, the
// warning text, the footer), not just the long sentences, and new tests keep
// the page from growing back into a wall of text.
import assert from 'node:assert'
import {
  MONEY_OPTIONS, MONEY_OPTIONS_DIMENSIONS, MONEY_OPTIONS_INTRO, MONEY_OPTIONS_DISCLAIMER,
  MONEY_OPTIONS_FOOTER, QUICK_LABELS,
} from './moneyOptionsContent.js'

let passed = 0, failed = 0
function test(name, fn) {
  try { fn(); passed++; console.log(`  PASS  ${name}`) }
  catch (err) { failed++; console.log(`  FAIL  ${name}\n        ${err.message}`) }
}

const words = (t) => t.trim().split(/\s+/).filter(Boolean).length
const optionText = (o) =>
  [o.name, o.summary, ...Object.values(o.quick), o.liquidity, o.horizon, o.stability, o.note].join(' ')
const dimensionText = MONEY_OPTIONS_DIMENSIONS.map((d) => `${d.label} ${d.term}`).join(' ')
const ALL_TEXT = [
  ...MONEY_OPTIONS.map(optionText), dimensionText, MONEY_OPTIONS_INTRO,
  MONEY_OPTIONS_DISCLAIMER.headline, MONEY_OPTIONS_DISCLAIMER.moreLabel, ...MONEY_OPTIONS_DISCLAIMER.more,
  MONEY_OPTIONS_FOOTER,
].join(' ')

console.log('moneyOptionsContent tests\n')

test('there is real content: a non-trivial number of options, each with every field filled in', () => {
  assert.ok(MONEY_OPTIONS.length >= 5, `only ${MONEY_OPTIONS.length} options`)
  for (const o of MONEY_OPTIONS) {
    for (const key of ['name', 'summary', 'liquidity', 'horizon', 'stability', 'note']) {
      assert.ok(typeof o[key] === 'string' && o[key].trim().length > 0, `${o.name || '?'}: missing ${key}`)
    }
    for (const d of MONEY_OPTIONS_DIMENSIONS) {
      assert.ok(typeof o.quick?.[d.key] === 'string' && o.quick[d.key].length > 0, `${o.name}: missing quick.${d.key}`)
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

test('no words implying a return, a promise, or a guarantee — in ANY text the page shows', () => {
  const banned = ['return', 'returns', 'yield', 'yields', 'interest rate', 'guarantee', 'guaranteed', 'profit', 'gain', 'gains', 'historically', 'on average', 'cagr']
  const lower = ALL_TEXT.toLowerCase()
  for (const word of banned) {
    assert.ok(!new RegExp(`\\b${word}\\b`).test(lower), `banned word found: "${word}"`)
  }
})

// ---- No specific securities — only categories, per SEBI's own scope rule --
test('no specific fund, scheme, or company name — categories only', () => {
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

// ---- The warning must stay clear even though it is now shorter ------------
test('the always-visible warning says CountWise is not a SEBI-registered adviser and this is not advice', () => {
  const h = MONEY_OPTIONS_DISCLAIMER.headline.toLowerCase()
  assert.ok(h.includes('not a sebi-registered'), h)
  assert.ok(/not advice/.test(h), h)
})

test('the "more" warning lines still cover: no named funds, no money-made claims, no user data/AI, and who to ask', () => {
  const more = MONEY_OPTIONS_DISCLAIMER.more.join(' ').toLowerCase()
  assert.ok(more.includes('never names a fund'))
  assert.ok(more.includes('no claim'))
  assert.ok(more.includes('does not use your countwise data'))
  assert.ok(more.includes('no ai'))
  assert.ok(more.includes('sebi-registered investment adviser'))
})

// ---- Reading load: the page must not turn back into a wall of text --------
test('every card summary is one short sentence', () => {
  for (const o of MONEY_OPTIONS) {
    assert.ok(o.summary.length <= 60, `${o.name}: summary is ${o.summary.length} characters`)
    assert.strictEqual((o.summary.match(/[.!?]/g) || []).length, 1, `${o.name}: summary should be exactly one sentence`)
    assert.ok(o.summary.endsWith('.'), `${o.name}: summary should end with a full stop`)
  }
})

test('quick labels only use the shared short vocabulary (so cards read the same way)', () => {
  for (const o of MONEY_OPTIONS) {
    for (const d of MONEY_OPTIONS_DIMENSIONS) {
      const v = o.quick[d.key]
      assert.ok(QUICK_LABELS[d.key].includes(v), `${o.name}: "${v}" is not an allowed ${d.key} label`)
      assert.ok(words(v) <= 3, `${o.name}: "${v}" is more than 3 words`)
    }
  }
})

test('quick labels do not contradict the longer text (no card says "Very steady" where the detail says the value moves)', () => {
  for (const o of MONEY_OPTIONS) {
    const steady = o.quick.stability === 'Very steady'
    const detailSaysMoves = /go up or down|can change significantly|not stable/i.test(o.stability)
    assert.ok(!(steady && detailSaysMoves), `${o.name}: quick label and detail disagree`)
  }
})

test('words visible on a card before opening "More details" stay small', () => {
  for (const o of MONEY_OPTIONS) {
    const visible = [o.name, o.summary, ...MONEY_OPTIONS_DIMENSIONS.map((d) => d.label), ...Object.values(o.quick)].join(' ')
    assert.ok(words(visible) <= 32, `${o.name}: ${words(visible)} words visible by default`)
  }
})

test('the whole page shows under 250 words by default (it was about 500)', () => {
  const visible = [
    'Money options', MONEY_OPTIONS_INTRO, MONEY_OPTIONS_DISCLAIMER.headline, MONEY_OPTIONS_DISCLAIMER.moreLabel,
    ...MONEY_OPTIONS.flatMap((o) => [o.name, o.summary, ...MONEY_OPTIONS_DIMENSIONS.map((d) => d.label), ...Object.values(o.quick), 'More details']),
    MONEY_OPTIONS_FOOTER,
  ].join(' ')
  assert.ok(words(visible) < 250, `${words(visible)} words visible by default`)
})

console.log(`\n${passed} passed, ${failed} failed`)
if (failed > 0) process.exit(1)
