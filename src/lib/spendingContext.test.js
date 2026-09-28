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

console.log(`\n${passed} passed, ${failed} failed`)
if (failed > 0) process.exit(1)
