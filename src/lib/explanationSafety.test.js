import assert from 'node:assert'
import { validateExplanation, EXPLANATION_FORBIDDEN_PHRASES } from './explanationSafety.js'

let passed = 0, failed = 0
function test(name, fn) {
  try { fn(); passed++; console.log(`  PASS  ${name}`) }
  catch (err) { failed++; console.log(`  FAIL  ${name}\n        ${err.message}`) }
}

console.log('explanationSafety tests\n')

test('a normal, safe PF/CTC/Salary-style explanation passes', () => {
  const ok = [
    'Starting from 1 Sept 2026, ₹4,800.00 will be saved for your retirement through Employee PF at 12%.',
    'Your estimated monthly take-home is ₹73,250.00, based on the components shown above.',
    'This CTC includes Basic Pay, HRA, and employer contributions that do not reach you as cash.',
  ]
  for (const t of ok) assert.strictEqual(validateExplanation(t).ok, true, t)
})

test('advice/judgment language (shared with Financial Assist) is rejected', () => {
  for (const t of ['You should contribute more to PF.', 'This spending was overspending.', 'You need to save more.']) {
    assert.strictEqual(validateExplanation(t).ok, false, t)
  }
})

test('certainty/guarantee language is rejected — the actual gap this phase found', () => {
  for (const t of [
    'This guarantees a comfortable retirement.',
    'CountWise promises this amount will grow steadily.',
    'You will definitely reach your target.',
    'This is a risk-free way to save.',
  ]) {
    assert.strictEqual(validateExplanation(t).ok, false, t)
  }
})

test('investment-specific language is rejected, even in an explanation context', () => {
  for (const t of ['Consider investing in a mutual fund with this amount.', 'You could allocate your extra PF toward stocks.', 'We recommend you buy more.']) {
    assert.strictEqual(validateExplanation(t).ok, false, t)
  }
})

test('empty, whitespace, non-string, and overlong text are all rejected', () => {
  assert.strictEqual(validateExplanation('').ok, false)
  assert.strictEqual(validateExplanation('   ').ok, false)
  assert.strictEqual(validateExplanation(null).ok, false)
  assert.strictEqual(validateExplanation(undefined).ok, false)
  assert.strictEqual(validateExplanation(42).ok, false)
  assert.strictEqual(validateExplanation('a'.repeat(1001)).ok, false)
  assert.strictEqual(validateExplanation('a'.repeat(1000)).ok, true)
})

test('matching is whole-word, not substring (e.g. "cellular" does not trigger "sell")', () => {
  assert.strictEqual(validateExplanation('Your cellular recharge was part of your bills.').ok, true)
})

test('the forbidden list genuinely includes both the Financial Assist set and new certainty/investment terms', () => {
  assert.ok(EXPLANATION_FORBIDDEN_PHRASES.includes('should'))
  assert.ok(EXPLANATION_FORBIDDEN_PHRASES.includes('guaranteed'))
  assert.ok(EXPLANATION_FORBIDDEN_PHRASES.includes('invest in'))
})

console.log(`\n${passed} passed, ${failed} failed`)
if (failed > 0) process.exit(1)
