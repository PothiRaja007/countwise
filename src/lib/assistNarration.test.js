import assert from 'node:assert'
import {
  NARRATION_SCHEMA,
  MAX_NARRATION_CHARS,
  buildNarrationPrompt,
  extractNumbers,
  allowedNumbers,
  validateNarration,
} from './assistNarration.js'
import { computeObservations } from './assistEngine.js'
import { describeObservation } from './assistCopy.js'

let passed = 0
let failed = 0

function test(name, fn) {
  try {
    fn()
    console.log(`  PASS  ${name}`)
    passed++
  } catch (err) {
    console.log(`  FAIL  ${name}`)
    console.log(`        ${err.message}`)
    failed++
  }
}

// A realistic month, produced by the real engine so these tests track it.
// Food: 82% of a Rs 5,000 budget, up Rs 1,700 (about 70.8%). Transport:
// down Rs 900 (50%). Fun: new, Rs 1,200.
const t = (date, amount, category_id) => ({ transaction_date: date, amount, category_id, type: 'expense' })
const OBS = computeObservations({
  today: new Date(2026, 8, 27),
  categories: [
    { id: 'food', name: 'Food', kind: 'expense' },
    { id: 'transport', name: 'Transport', kind: 'expense' },
    { id: 'fun', name: 'Fun', kind: 'expense' },
  ],
  transactions: [
    t('2026-08-05', 2400, 'food'), t('2026-09-04', 4100, 'food'),
    t('2026-08-09', 1800, 'transport'), t('2026-09-09', 900, 'transport'),
    t('2026-09-12', 1200, 'fun'),
  ],
  budgets: [{ id: 'b1', category_id: 'food', amount: 5000, period_start: '2026-09-01', period_end: '2026-09-30' }],
}).observations

const fmt = (n) => `₹${n.toLocaleString('en-IN', { minimumFractionDigits: 2 })}`

const FAITHFUL =
  'Food is at 82% of its ₹5,000.00 budget, with ₹4,100.00 spent and ₹900.00 remaining. ' +
  'Food spending is ₹1,700.00 higher than at this point last month, transport spending is ₹900.00 lower, ' +
  'and ₹1,200.00 has been recorded in Fun.'

const ok = (text, obs = OBS) => validateNarration(text, obs).ok
const why = (text, obs = OBS) => validateNarration(text, obs).reason

console.log('assistNarration tests\n')

// ---- Schema and prompt ---------------------------------------------------

test('schema is exactly one required string field, nothing else', () => {
  assert.deepStrictEqual(NARRATION_SCHEMA, {
    type: 'object',
    properties: { summary: { type: 'string' } },
    required: ['summary'],
    additionalProperties: false,
  })
})

test('the prompt contains every observation, verbatim and numbered', () => {
  const described = OBS.map((o) => describeObservation(o, fmt))
  const prompt = buildNarrationPrompt(described)
  described.forEach((d, i) => {
    assert.ok(prompt.includes(`${i + 1}. ${d.headline}: ${d.detail}`), `missing observation ${i + 1}`)
  })
})

test('the prompt states every rule the validator later enforces', () => {
  const prompt = buildNarrationPrompt([{ headline: 'H', detail: 'D' }])
  for (const rule of [
    'exactly as they appear above',
    'do not calculate, round or abbreviate',
    'Do not explain why',
    'Do not give advice',
    'Do not judge',
    'Do not mention dates or months',
  ]) {
    assert.ok(prompt.includes(rule), `missing rule: ${rule}`)
  }
})

// ---- Number handling -----------------------------------------------------

test('extractNumbers reads formatted amounts, plain numbers and sentence-final figures', () => {
  assert.deepStrictEqual(extractNumbers('₹1,700.00 and 71%'), [1700, 71])
  assert.deepStrictEqual(extractNumbers('It was ₹4,100.'), [4100])
  assert.deepStrictEqual(extractNumbers('about 4100 rupees'), [4100])
  assert.deepStrictEqual(extractNumbers('no figures here'), [])
})

test('allowedNumbers uses the size of a drop, not its sign', () => {
  const allowed = allowedNumbers(OBS)
  assert.ok(allowed.includes(900)) // transport change was -900
  assert.ok(allowed.includes(50)) // percentChange was -50
})

test('allowedNumbers accepts a percentage as rounded, floored, or to one decimal', () => {
  const allowed = allowedNumbers([{ figures: { percentUsed: 82.6 } }])
  assert.ok(allowed.includes(82))
  assert.ok(allowed.includes(83))
  assert.ok(allowed.includes(82.6))
  assert.ok(!allowed.includes(84))
})

// ---- Accepting faithful text ---------------------------------------------

test('a faithful summary is accepted', () => {
  assert.strictEqual(validateNarration(FAITHFUL, OBS).ok, true)
})

test('the same amount in different formats is accepted', () => {
  assert.ok(ok('Food spending is ₹1,700 higher than at this point last month.'))
  assert.ok(ok('Food spending is 1700 higher than at this point last month.'))
  assert.ok(ok('Food spending is ₹1,700.00 higher than at this point last month.'))
})

test('a percentage rendered either way is accepted', () => {
  const obs = [{ figures: { percentUsed: 82.6, spent: 4130, budgetAmount: 5000 } }]
  assert.ok(ok('Food has used 82% of its budget.', obs))
  assert.ok(ok('Food has used 83% of its budget.', obs))
  assert.ok(!ok('Food has used 84% of its budget.', obs))
})

test("the app's own deterministic wording never trips the validator (no false positives)", () => {
  const ownText = OBS.map((o) => describeObservation(o, fmt).detail).join(' ')
  assert.ok(ownText.length <= MAX_NARRATION_CHARS)
  assert.strictEqual(validateNarration(ownText, OBS).ok, true, why(ownText))
})

test('text with no figures at all is accepted', () => {
  assert.ok(ok('Spending changed in a few categories compared with this point last month.'))
})

// ---- Rejecting invented or derived numbers -------------------------------

test('an invented number is rejected', () => {
  assert.strictEqual(why('Food spending is ₹5,500.00 so far this month.'), 'unlisted-number:5500')
})

test('a number the AI calculated itself is rejected, even if the arithmetic is right', () => {
  // 1,700 + 900 = 2,600 is not in the data.
  assert.ok(!ok('Overall, spending moved by ₹2,600.00 across these categories.'))
})

test('an abbreviated amount is rejected', () => {
  assert.ok(!ok('Food is at ₹4.1k so far.'))
})

test('a date or year is rejected', () => {
  assert.ok(!ok('In September 2026, food spending is ₹4,100.00.'))
})

test('a count the AI invented is rejected', () => {
  assert.ok(!ok('Food is ₹4,100.00 across 12 purchases.'))
})

// ---- Rejecting advice, judgment, praise, speculation ---------------------

test('advice is rejected', () => {
  assert.ok(/forbidden-phrase:should/.test(why('You should cut back on food.')))
  assert.ok(/forbidden-phrase:consider/.test(why('You may want to consider a smaller budget.')))
})

test('judgment, including inflected forms, is rejected', () => {
  assert.ok(!ok('Food shows overspending this month.'))
  assert.ok(!ok('This is a worrying change in food.'))
})

test('praise is rejected too, because it is also a judgment', () => {
  assert.ok(!ok('Great job keeping transport lower.'))
  assert.ok(!ok('Transport is in a healthy range.'))
})

test('guessed causes are rejected', () => {
  assert.ok(/forbidden-phrase:because/.test(why('Food is higher because of festival spending.')))
  assert.ok(!ok('Food is higher due to a holiday.'))
})

test('predictions and speculation are rejected', () => {
  assert.ok(!ok('Food will likely keep rising.'))
  assert.ok(!ok('Next month food could be higher.'))
  assert.ok(!ok('Food seems higher this month.'))
})

test('the check is case-insensitive', () => {
  assert.ok(!ok('YOU SHOULD look at food.'))
})

test('only whole words are matched: harmless words containing a forbidden one pass', () => {
  assert.ok(ok('Food is at 82% of its budget, and goodwill is not a category.'))
})

// ---- Malformed output ----------------------------------------------------

test('empty, whitespace-only and non-string output is rejected', () => {
  assert.strictEqual(why(''), 'empty')
  assert.strictEqual(why('   \n  '), 'empty')
  assert.strictEqual(why(null), 'not-a-string')
  assert.strictEqual(why(undefined), 'not-a-string')
  assert.strictEqual(why({ summary: 'x' }), 'not-a-string')
})

test('overlong output is rejected', () => {
  assert.strictEqual(why('a'.repeat(MAX_NARRATION_CHARS + 1)), 'too-long')
  assert.ok(ok('a'.repeat(MAX_NARRATION_CHARS)))
})

console.log(`\n${passed} passed, ${failed} failed`)
if (failed > 0) process.exit(1)
