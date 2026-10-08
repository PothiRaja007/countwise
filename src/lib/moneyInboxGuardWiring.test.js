// P4 (Money Inbox command layer) — WIRING TESTS (U1–U6).
//
// There is no React test setup in this project, so these read the source as text
// and prove how the command guard is connected to Money Inbox:
//   U1  interpret() is called before buildReviewCandidates()
//   U2  the transaction path (candidate building) is byte-for-byte what it was
//   U3  the two new reads are select-only, and a failure there never shows an error
//   U4  interpret() is wrapped so any failure falls back to the transaction path
//   U5  the panel is shown in both modes and has no save/insert/write of its own
//   U6  no other file calls interpret()
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
const PANEL = 'components/money-inbox/CommandGuardPanel.jsx'
const input = read(INPUT)
const code = stripComments(input)

// The transaction block as it was before P4 (from "const candidates" to setReviewState).
const START = 'const candidates = buildReviewCandidates(text, {'
const END = 'setReviewState({ candidates, accounts, categories })'
const PINNED_BLOCK_SHA16 = '2af2a73c071add86'
const PINNED_BLOCK_LENGTH = 951

test('U1: interpret() is called before buildReviewCandidates()', () => {
  const i = code.indexOf('interpret(')
  const b = code.indexOf('buildReviewCandidates(text')
  assert.ok(i > 0 && b > 0, 'both calls must exist')
  assert.ok(i < b, 'interpret must come first')
  assert.equal((code.match(/\binterpret\(/g) || []).length, 1, 'exactly one interpret call')
  assert.equal((code.match(/buildReviewCandidates\(/g) || []).length, 1, 'exactly one buildReviewCandidates call')
})

test('U2: the transaction path is unchanged', () => {
  const a = input.indexOf(START)
  const e = input.indexOf(END)
  assert.ok(a > 0 && e > a, 'block found')
  const block = input.slice(a, e + END.length)
  assert.equal(block.length, PINNED_BLOCK_LENGTH)
  assert.equal(createHash('sha256').update(block).digest('hex').slice(0, 16), PINNED_BLOCK_SHA16)
  // and it is only reachable through the guard's "not a command" gate
  assert.ok(code.includes("interpreted.kind !== 'transaction'"), 'only non-transactions stop at the guard')
})

test('U3: the new reads are select-only and their failure shows no error', () => {
  for (const table of ['goals', 'learning_items']) {
    const m = new RegExp(`supabase\\.from\\('${table}'\\)([^\\n]*)`).exec(code)
    assert.ok(m, `${table} read exists`)
    assert.ok(/^\.select\(/.test(m[1]), `${table}: starts with select`)
    assert.ok(!/\.(insert|update|upsert|delete)\(/.test(m[1]), `${table}: no write`)
  }
  assert.ok(!/goalsRes\.error\s*\)\s*throw/.test(code) && !/learningRes\.error\s*\)\s*throw/.test(code), 'errors are not thrown')
  assert.ok(!/setError\([^)]*(goalsRes|learningRes)/.test(code), 'errors are not shown')
})

test('U4: interpret() failure falls back to the transaction path', () => {
  const i = code.indexOf('interpret(')
  const before = code.slice(0, i)
  assert.ok(before.lastIndexOf('try {') > before.lastIndexOf('if (!skipGuard)'), 'interpret is inside its own try')
  const after = code.slice(i, code.indexOf('buildReviewCandidates(text'))
  assert.ok(/catch\s*\{\s*interpreted\s*=\s*null/.test(after), 'catch sets interpreted to null')
  assert.ok(/if \(interpreted && interpreted\.kind !== 'transaction'\)/.test(after), 'null continues as a transaction')
})

test('U5: the panel is shown in both modes and cannot write', () => {
  assert.ok(/guard \? \(\s*<CommandGuardPanel view=\{budgetCommandView\(learningCommandView\(goalCommandView\(buildGuardView\(guard\), guard, guardLists\?\.activeGoals, Date\.now\(\)\), guard, guardLists\?\.learningItems, Date\.now\(\)\), guard, guardLists\?\.expenseCategories, Date\.now\(\)\)\} onChoose=\{handleGuardChoice\} \/>/.test(code), 'panel rendered when guard is set (P9: through the goal, learning and budget command views)')
  // `panel` is the shared content used by both the embedded and modal returns
  assert.ok(code.indexOf('const panel =') < code.indexOf('<CommandGuardPanel'), 'inside the shared panel')
  assert.ok(code.includes('if (embedded)') && /return \(\s*<Modal/.test(code), 'both modes use the shared panel')
  const panelCode = stripComments(read(PANEL))
  assert.ok(!/supabase|\.insert\(|\.update\(|\.upsert\(|\.delete\(|\.from\(/.test(panelCode), 'panel has no data call')
  assert.ok(!/>\s*(Save|Confirm)\s*</.test(panelCode), 'panel has no Save/Confirm button')
  assert.ok(!/\.(insert|update|upsert|delete)\(/.test(code), 'MoneyInboxInput has no write')
})

test('U6: only MoneyInboxInput calls interpret()', () => {
  const hits = []
  const walk = (dir) => {
    for (const name of readdirSync(dir)) {
      const full = join(dir, name)
      if (statSync(full).isDirectory()) { walk(full); continue }
      if (!/\.(js|jsx)$/.test(name) || /\.test\.js$/.test(name)) continue
      const rel = full.slice(SRC.length).split(sep).join('/')
      if (rel === 'lib/command/interpreter.js') continue
      if (/\binterpret\(/.test(stripComments(readFileSync(full, 'utf8')))) hits.push(rel)
    }
  }
  walk(SRC)
  assert.deepEqual(hits, [INPUT])
})

console.log(`\n${passed} passed, ${failed} failed`)
if (failed) process.exit(1)
