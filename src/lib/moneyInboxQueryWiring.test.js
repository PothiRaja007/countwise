// P5 (Money Inbox command layer) — WIRING TESTS FOR QUESTIONS (V1–V6).
//
// There is no React test setup in this project, so these read the source as text
// and prove how the read-only questions are connected to Money Inbox:
//   V1  the reads for a question happen only after the question was understood and complete
//   V2  every read behind a question is select-only, on a known table, for one user
//   V3  a read problem never falls through to the entry (expense) flow
//   V4  the answer view is shown in both modes and cannot save anything
//   V5  the transaction path is still byte-for-byte what it was before P4
//   V6  nothing but Money Inbox imports queries.js
import assert from 'node:assert'
import { readFileSync, readdirSync, statSync } from 'node:fs'
import { createHash } from 'node:crypto'
import { fileURLToPath } from 'node:url'
import { join, sep } from 'node:path'

let passed = 0, failed = 0
function test(name, fn) {
  try { fn(); passed++; console.log(`  PASS  ${name}`) }
  catch (e) { failed++; console.log(`  FAIL  ${name}\n        ${e.message}`) }
}

const SRC = fileURLToPath(new URL('..', import.meta.url))
const read = (p) => readFileSync(join(SRC, p), 'utf8').replace(/\r\n/g, '\n')
const stripComments = (s) => s.replace(/\/\*[\s\S]*?\*\//g, '').replace(/(^|[^:'"`])\/\/.*$/gm, '$1')

const INPUT = 'components/money-inbox/MoneyInboxInput.jsx'
const DIALOG = 'components/money-inbox/QueryResultDialog.jsx'
const input = read(INPUT)
const code = stripComments(input)

// The text between a function's first line and the next top-level closing line.
const slice = (src, startMarker) => {
  const a = src.indexOf(startMarker)
  assert.ok(a >= 0, `${startMarker} exists`)
  const b = src.indexOf('\n}\n', a)
  return src.slice(a, b + 2)
}
const reads = slice(code, 'async function readQueryData(')

test('V1: reads for a question happen only after interpret(), inside the answered branch', () => {
  assert.equal((code.match(/readQueryData\(/g) || []).length, 2, 'declared once, called once')
  const answerFor = code.indexOf('const answerFor = async')
  assert.ok(code.indexOf('await readQueryData(request, user.id)') > answerFor, 'the only call is inside answerFor')
  const i = code.indexOf('interpret(')
  const r = code.indexOf('requestFromResult(interpreted)')
  const a = code.indexOf('setAnswer(await answerFor(request))')
  assert.ok(i > 0 && r > i && a > r, 'interpret → requestFromResult → answerFor, in that order')
  // an ordinary entry never reaches a question read
  assert.ok(code.indexOf('buildReviewCandidates(text') > a, 'the entry flow comes after')
  assert.ok(/if \(request\) \{\s*setAnswer\(await answerFor\(request\)\)\s*return\s*\}/.test(code), 'a question ends there')
})

test('V2: every read behind a question is select-only, on a known table, for one user', () => {
  assert.ok(!/\.(insert|update|upsert|delete|rpc)\(/.test(code), 'no write or rpc anywhere in MoneyInboxInput')
  const tables = [...reads.matchAll(/\.from\('([a-z_]+)'\)/g)].map((m) => m[1])
  assert.ok(tables.length >= 6, `found ${tables.length} reads`)
  for (const t of new Set(tables)) assert.ok(['transactions', 'budgets', 'goals', 'goal_contributions', 'accounts'].includes(t), `unknown table ${t}`)
  const chains = [...reads.matchAll(/\.from\('[a-z_]+'\)\s*\n?\s*\.select\(/g)]
  assert.equal(chains.length, tables.length, 'each read goes straight from from() to select()')
  assert.equal((reads.match(/\.eq\('user_id', userId\)/g) || []).length, tables.length, 'each read is for one user')
})

test('V3: a read problem never falls through to the entry flow', () => {
  const start = code.indexOf('const answerFor = async')
  const answerFor = code.slice(start, code.indexOf('\n  }\n', start))
  assert.ok(/catch\s*\{\s*return dataProblemAnswer\(\)\s*\}/.test(answerFor), 'a failure becomes the data-problem answer')
  assert.ok(!/buildReviewCandidates|setReviewState|setError/.test(answerFor), 'answerFor never reaches the entry flow')
  assert.ok(/\.some\(mayBeTruncated\)/.test(reads), 'a result that may be cut off is flagged')
  assert.ok(/if \(res\.error\) throw res\.error/.test(code), 'a read error stops the answer')
})

test('V4: the answer view shows in both modes and cannot save anything', () => {
  assert.ok(/answer \? \(\s*<QueryResultDialog answer=\{answer\} onAskAgain=\{handleAskAgain\} onClose=\{handleAnswerClose\} \/>/.test(code), 'rendered when there is an answer')
  assert.ok(code.indexOf('const panel =') < code.indexOf('<QueryResultDialog'), 'inside the shared panel, used by both modes')
  assert.ok(code.includes('if (embedded)') && /return \(\s*<Modal/.test(code), 'both modes use the shared panel')
  const dialog = stripComments(read(DIALOG))
  assert.ok(!/supabase|\.insert\(|\.update\(|\.upsert\(|\.delete\(|\.from\(/.test(dialog), 'the view has no data call')
  assert.ok(!/>\s*(Save|Confirm|Submit)\s*</.test(dialog), 'the view has no Save or Confirm button')
  assert.ok(/handleAnswerClose = \(\) => \{\s*setAnswer\(null\)\s*setText\(''\)\s*onClose\?\.\(\)/.test(code), 'closing clears the answer and writes nothing')
})

test('V5: the transaction path is unchanged', () => {
  const START = 'const candidates = buildReviewCandidates(text, {'
  const END = 'setReviewState({ candidates, accounts, categories })'
  const a = input.indexOf(START)
  const e = input.indexOf(END)
  assert.ok(a > 0 && e > a, 'block found')
  const block = input.slice(a, e + END.length)
  assert.equal(block.length, 951)
  assert.equal(createHash('sha256').update(block).digest('hex').slice(0, 16), '2af2a73c071add86')
  assert.equal((code.match(/buildReviewCandidates\(/g) || []).length, 1, 'exactly one entry parser call')
})

test('V6: only Money Inbox imports queries.js', () => {
  const hits = []
  const walk = (dir) => {
    for (const name of readdirSync(dir)) {
      const full = join(dir, name)
      if (statSync(full).isDirectory()) { walk(full); continue }
      if (!/\.(js|jsx)$/.test(name) || /\.test\.js$/.test(name)) continue
      const rel = full.slice(SRC.length).split(sep).join('/')
      if (rel === 'lib/command/queries.js') continue
      if (/from\s*['"][^'"]*queries\.js['"]/.test(stripComments(readFileSync(full, 'utf8')))) hits.push(rel)
    }
  }
  walk(SRC)
  assert.deepEqual(hits, [INPUT])
})

console.log(`\n${passed} passed, ${failed} failed`)
if (failed) process.exit(1)
