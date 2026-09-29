import assert from 'node:assert'
import { readdirSync, readFileSync, statSync } from 'node:fs'
import { join, relative } from 'node:path'
import { fileURLToPath } from 'node:url'
import {
  SPENDING_CONTEXTS,
  SPENDING_CONTEXT_VALUES,
  isValidContext,
  contextLabel,
  contextDescription,
  contextForType,
  detectSpendingContext,
  contextCueHints,
  CONTEXT_CUES,
} from './spendingContext.js'
import { FORBIDDEN_PHRASES } from './assistCopy.js'

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

const SRC = join(fileURLToPath(new URL('.', import.meta.url)), '..')
const SUPABASE = join(SRC, '..', 'supabase')

function walk(dir) {
  return readdirSync(dir).flatMap((name) => {
    const full = join(dir, name)
    return statSync(full).isDirectory() ? walk(full) : [full]
  })
}
const withoutComments = (t) => t.replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '')

console.log('spendingContext tests\n')

// ---- The vocabulary ------------------------------------------------------

test('the vocabulary is exactly the four agreed values, in order', () => {
  assert.deepStrictEqual(SPENDING_CONTEXT_VALUES, ['planned', 'routine', 'social', 'unplanned'])
})

test('values are unique lowercase words; every entry has a label and a description', () => {
  assert.strictEqual(new Set(SPENDING_CONTEXT_VALUES).size, SPENDING_CONTEXT_VALUES.length)
  for (const c of SPENDING_CONTEXTS) {
    assert.match(c.value, /^[a-z]+$/)
    assert.ok(c.label.length > 0 && c.description.length > 0, `incomplete entry: ${c.value}`)
  }
})

test('labels and descriptions are descriptive, never judgmental', () => {
  const banned = [...FORBIDDEN_PHRASES, 'impulse', 'impulsive', 'craving', 'splurge', 'binge', 'indulgent']
  for (const c of SPENDING_CONTEXTS) {
    const text = `${c.label} ${c.description}`
    for (const word of banned) {
      assert.ok(!new RegExp(`\\b${word}\\b`, 'i').test(text), `"${word}" found in: ${text}`)
    }
  }
})

test('isValidContext accepts only the four values', () => {
  for (const v of SPENDING_CONTEXT_VALUES) assert.strictEqual(isValidContext(v), true)
  for (const v of ['', 'Planned', 'impulse', null, undefined, 3]) assert.strictEqual(isValidContext(v), false)
})

test('label and description lookups return null for anything unknown, never throw', () => {
  assert.strictEqual(contextLabel('social'), 'Social')
  assert.strictEqual(contextLabel('nope'), null)
  assert.strictEqual(contextLabel(null), null)
  assert.strictEqual(contextDescription('routine').length > 0, true)
  assert.strictEqual(contextDescription(undefined), null)
})

// ---- contextForType: the two database rules ------------------------------

test('an expense keeps a valid context', () => {
  assert.strictEqual(contextForType('expense', 'social'), 'social')
})

test('"no context" is sent as null, never as an empty string (the database rejects "")', () => {
  assert.strictEqual(contextForType('expense', ''), null)
  assert.strictEqual(contextForType('expense', null), null)
  assert.strictEqual(contextForType('expense', undefined), null)
})

test('editing an expense into income or a transfer clears the context (the database rejects it otherwise)', () => {
  assert.strictEqual(contextForType('income', 'planned'), null)
  assert.strictEqual(contextForType('transfer', 'routine'), null)
})

test('a value outside the allowed set is dropped rather than sent', () => {
  assert.strictEqual(contextForType('expense', 'impulse'), null)
  assert.strictEqual(contextForType('expense', 'Planned'), null)
})

// ---- The app and the database must agree ---------------------------------

function sqlValues(file) {
  const text = readFileSync(join(SUPABASE, file), 'utf8')
  const m = text.match(/check\s*\(\s*spending_context\s+in\s*\(([^)]*)\)\s*\)/i)
  assert.ok(m, `no spending_context CHECK found in ${file}`)
  return [...m[1].matchAll(/'([^']+)'/g)].map((x) => x[1])
}

test('the standalone migration allows exactly the values the app offers', () => {
  assert.deepStrictEqual([...sqlValues('phase32_1_spending_context.sql')].sort(), [...SPENDING_CONTEXT_VALUES].sort())
})

test('schema.sql allows exactly the values the app offers', () => {
  assert.deepStrictEqual([...sqlValues('schema.sql')].sort(), [...SPENDING_CONTEXT_VALUES].sort())
})

test('both SQL files define both constraints (valid values, and expense-only)', () => {
  for (const file of ['phase32_1_spending_context.sql', 'schema.sql']) {
    const text = readFileSync(join(SUPABASE, file), 'utf8')
    assert.ok(text.includes('transactions_spending_context_valid'), `${file}: missing valid-values constraint`)
    assert.ok(text.includes('transactions_context_only_expense'), `${file}: missing expense-only constraint`)
  }
})

// ---- The AI boundary -----------------------------------------------------
// Spending context is behavioural data about the user. It must never reach
// an AI prompt, and the AI & Data Processing Notice says so. This scan makes
// that a rule the tests enforce instead of a promise in prose.

const sourceFiles = walk(SRC).filter((f) => /\.(jsx|js)$/.test(f) && !/\.test\./.test(f))
const callers = sourceFiles.filter((f) =>
  /functions\.invoke\(\s*['"]gemini-explain['"]/.test(withoutComments(readFileSync(f, 'utf8')))
)
const promptBuilders = sourceFiles.filter((f) => /[\\/]lib[\\/](explain|assistNarration|ctcExtraction)/.test(f))
const aiFacing = [...new Set([...callers, ...promptBuilders])]

test('the AI-facing file set is found (the guard is not vacuous)', () => {
  const names = aiFacing.map((f) => relative(SRC, f).replace(/\\/g, '/'))
  for (const expected of ['components/assist/FinancialAssistCard.jsx', 'pages/CTCExplorer.jsx', 'lib/assistNarration.js', 'lib/explainPF.js']) {
    assert.ok(names.includes(expected), `missing ${expected}`)
  }
})

test('no file that builds or sends an AI prompt references spending context', () => {
  for (const file of aiFacing) {
    const text = withoutComments(readFileSync(file, 'utf8'))
    assert.ok(
      !/spending_?context|SPENDING_CONTEXT|spendingContext/i.test(text),
      `${relative(SRC, file)} references spending context, which must never reach an AI prompt`
    )
  }
})


// ---- Detecting a context in Money Inbox text (Phase 32.2) ----------------

const ctx = (text) => detectSpendingContext(text).value
const detected = (context, texts) => {
  for (const t of texts) assert.strictEqual(ctx(t), context, `expected ${context} for: ${t}`)
}

test('the target sentence: "dinner with friends for 500rs paid from bank" is Social, from "with friends"', () => {
  assert.deepStrictEqual(detectSpendingContext('dinner with friends for 500rs paid from bank'), {
    value: 'social', source: 'cue', matched: 'with friends', conflict: [],
  })
})

test('people: relationship words after "with" suggest Social', () => {
  detected('social', [
    'lunch with my family 300', 'chai with colleagues 60', 'movie with the team 900', 'dinner with mom 400',
    'trip snacks with a few classmates 250', 'pizza with roommates 700', 'coffee with my girlfriend 200',
  ])
})

test('occasions suggest Social', () => {
  detected('social', ['birthday cake 600', 'party snacks 450', 'farewell dinner 1200', 'gift for sister 1500', 'hangout cafe 350', 'split the bill 800'])
})

test('recurrence suggests Routine', () => {
  detected('routine', ['netflix subscription 199', 'gym monthly 1500', 'milk daily 30', 'paper every week 20', 'recharge as usual 299', 'the usual coffee 80', 'recurring 500'])
})

test('spontaneity suggests Unplanned', () => {
  detected('unplanned', ['suddenly bought headphones 2000', 'on a whim 300', 'spontaneous trip 1500', 'impulse buy 900', 'craving pizza 400', "couldn't resist 250", 'unplanned 500'])
})

test('intent suggests Planned', () => {
  detected('planned', ['planned trip 5000', 'as planned 300', 'budgeted 1000', 'pre-booked tickets 2200', 'scheduled service 800', 'on my list 450'])
})

test('matching is case-insensitive and reports the words as the user typed them', () => {
  assert.strictEqual(detectSpendingContext('Dinner WITH Friends 500').value, 'social')
  assert.strictEqual(detectSpendingContext('Dinner WITH Friends 500').matched, 'WITH Friends')
})

test('"unplanned" is not misread as "planned" (no false conflict)', () => {
  assert.deepStrictEqual(detectSpendingContext('it was unplanned'), { value: 'unplanned', source: 'cue', matched: 'unplanned', conflict: [] })
})

test('only whole words count: near-misses do not trigger', () => {
  for (const t of ['socially awkward 100', 'routines book 200', 'partying 300', 'gifted 400', 'teamwork book 250', 'weeklys 10']) {
    assert.strictEqual(ctx(t), null, `should not trigger: ${t}`)
  }
})

test('no cue, no suggestion: items are never treated as cues (bus, coffee, rent depend on the person)', () => {
  for (const t of ['coffee 80', 'bus 40', 'rent 8000', 'dinner 500', 'fuel 1200 bank', '', '   ']) {
    assert.deepStrictEqual(detectSpendingContext(t), { value: null, source: null, matched: null, conflict: [] }, t)
  }
})

test('ambiguous phrases were left out on purpose and do not trigger', () => {
  for (const t of ['treat myself to ice cream 200', 'regular coffee 80', 'with Ravi 500', 'paid with cash 200', 'with card 300', 'with offer 100']) {
    assert.strictEqual(ctx(t), null, `should not trigger: ${t}`)
  }
})

test('several cues that AGREE are a single suggestion', () => {
  const r = detectSpendingContext('birthday party with friends 2000')
  assert.strictEqual(r.value, 'social')
  assert.deepStrictEqual(r.conflict, [])
})

test('cues that DISAGREE produce no suggestion, only a conflict, listed in vocabulary order', () => {
  assert.deepStrictEqual(detectSpendingContext('planned dinner with friends 800'), { value: null, source: null, matched: null, conflict: ['planned', 'social'] })
  assert.deepStrictEqual(detectSpendingContext('social media subscription 199').conflict, ['routine', 'social'])
  assert.deepStrictEqual(detectSpendingContext('birthday gift monthly suddenly').conflict, ['routine', 'social', 'unplanned'])
})

test('an explicit #tag wins over every phrase and is marked as the user\'s own', () => {
  assert.deepStrictEqual(detectSpendingContext('dinner with friends 500 #routine'), { value: 'routine', source: 'tag', matched: '#routine', conflict: [] })
  assert.strictEqual(detectSpendingContext('coffee #SOCIAL').value, 'social')
})

test('two different #tags conflict; the same #tag twice is one', () => {
  assert.deepStrictEqual(detectSpendingContext('coffee #routine #social').conflict, ['routine', 'social'])
  assert.strictEqual(detectSpendingContext('coffee #routine #routine').value, 'routine')
})

test('an unknown #tag is ignored', () => {
  assert.strictEqual(ctx('coffee #treat'), null)
})

test('non-string input is safe', () => {
  for (const v of [null, undefined, 42, {}]) assert.strictEqual(ctx(v), null)
})

test('every context has at least one cue, every cue is complete, and none uses the g flag (shared state)', () => {
  for (const value of SPENDING_CONTEXT_VALUES) {
    assert.ok(CONTEXT_CUES[value]?.length > 0, `no cues for ${value}`)
    for (const cue of CONTEXT_CUES[value]) {
      assert.ok(cue.label.length > 0)
      assert.ok(cue.pattern instanceof RegExp && cue.pattern.flags.includes('i') && !cue.pattern.flags.includes('g'), `bad pattern: ${cue.label}`)
    }
  }
})

test('the "what CountWise understands" list is generated from the same rules the parser uses', () => {
  const hints = contextCueHints()
  assert.deepStrictEqual(hints.map((h) => h.value), SPENDING_CONTEXT_VALUES)
  for (const h of hints) {
    assert.deepStrictEqual(h.examples, CONTEXT_CUES[h.value].map((c) => c.label))
    assert.strictEqual(h.label, contextLabel(h.value))
  }
})

console.log(`\n${passed} passed, ${failed} failed`)
if (failed > 0) process.exit(1)
