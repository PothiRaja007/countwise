// P11 (Money Inbox command layer) — WIRING TESTS FOR THE HIDDEN-MIX GUARD (V1–V7).
//
// There is no React test setup in this project, so these read the source as text and prove how the guard is wired
// and who is allowed to write:
//   V1  Money Inbox still writes nothing and reads nothing new
//   V2  the transaction block (951 characters) is byte-for-byte what it was and holds no P11 code
//   V3  the guard runs inside the guard section, after interpret(), before a page opens, a question is answered, a
//       salary or pension panel is shown, or an entry is built; never when the guard is skipped
//   V4  it never replaces an interpreter clarification, cannot break the normal path, and only shows the panel
//   V5  only Money Inbox imports mixedInput.js; the module is pure
//   V6  the locked files are byte-for-byte what they were
//   V7  no new file writes a transaction; the review screen is still the only writer
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
const sha = (s) => createHash('sha256').update(s).digest('hex').slice(0, 16)
const between = (src, a, b) => {
  const i = src.indexOf(a)
  assert.ok(i >= 0, `${a.slice(0, 50)} exists`)
  const j = src.indexOf(b, i + a.length)
  assert.ok(j > i, `${b.slice(0, 50)} follows`)
  return src.slice(i, j + b.length)
}

const INPUT = 'components/money-inbox/MoneyInboxInput.jsx'
const input = read(INPUT)
const code = stripComments(input)
const parse = between(code, 'const handleParse = async (options) => {', '\n  }\n')
const hook = between(parse, "if (interpreted && interpreted.kind !== 'clarify' && lists) {", '\n        }\n')

test('V1: Money Inbox still writes nothing and reads nothing new', () => {
  assert.ok(!/\.(insert|update|upsert|delete|rpc)\(/.test(code))
  assert.equal((code.match(/\.from\('/g) || []).length, 16, 'the 16 reads P10 left; the guard reads nothing')
  assert.equal((code.match(/putHandoff\(/g) || []).length, 4)
  assert.equal((code.match(/\bgoTo\(/g) || []).length, 8)
  assert.ok(!/supabase|goTo|putHandoff|navigate|setAnswer|setReviewState|setWorkPanel/.test(hook), 'the guard code touches none of them')
})

test('V2: the transaction block (951 characters) is byte-for-byte what it was and holds no P11 code', () => {
  const block = between(input, 'const candidates = buildReviewCandidates(text, {', 'setReviewState({ candidates, accounts, categories })')
  assert.equal(block.length, 951)
  assert.equal(sha(block), '2af2a73c071add86')
  assert.ok(!/Mix|mixed|hidden/i.test(block))
})

test('V3: the guard runs inside the guard section, after interpret(), before anything else acts, and never when skipped', () => {
  const guardStart = parse.indexOf('if (!skipGuard) {')
  const at = (s) => parse.indexOf(s)
  const order = [guardStart, at('interpreted = interpret('), at('applyReferenceMemory('), at('detectHiddenMix('), at('navigationFromResult('), at('requestFromResult('), at('pensionQuestionFromResult('), at('detectSalaryReceipt('), at('looksLikePensionEstimateRequest('), at('const candidates = buildReviewCandidates(text')]
  assert.ok(order.every((n) => n > 0), JSON.stringify(order))
  assert.deepStrictEqual([...order].sort((a, b) => a - b), order, 'in this order')
  assert.equal((code.match(/detectHiddenMix\(/g) || []).length, 1, 'called in one place')
  // the guard section is the only place it can run: "Record it as an expense" and "I'll type the amount" skip it
  const afterGuardEnd = parse.slice(parse.indexOf('const candidates = buildReviewCandidates(text'))
  assert.ok(!/detectHiddenMix/.test(afterGuardEnd))
  assert.ok(/const skipGuard = options\?\.skipGuard === true/.test(parse))
})

test('V4: it never replaces an interpreter clarification, cannot break the normal path, and only shows the panel', () => {
  assert.ok(/interpreted\.kind !== 'clarify'/.test(hook))
  assert.ok(/try \{\s*hiddenMix = detectHiddenMix\(/.test(hook) && /catch \{\s*hiddenMix = null\s*\}/.test(hook), 'a failure falls back to the normal path')
  assert.ok(/if \(hiddenMix\) \{\s*setGuard\(hiddenMix\)\s*setGuardLists\(lists\)\s*return\s*\}/.test(hook), 'show the panel, nothing else, and stop')
  assert.ok(/Date\.now\(\)/.test(hook), 'the time is passed in by the screen')
  assert.ok(/goals: lists\.goals, categories: lists\.categories, learningItems: lists\.learningItems, accounts: lists\.accounts/.test(hook), 'the lists the screen already read')
})

test('V5: only Money Inbox imports mixedInput.js; the module is pure', () => {
  const importers = []
  const walk = (dir) => {
    for (const name of readdirSync(dir)) {
      if (name === 'node_modules') continue
      const full = join(dir, name)
      if (statSync(full).isDirectory()) { walk(full); continue }
      if (!/\.(js|jsx)$/.test(name) || /\.test\.js$/.test(name)) continue
      if (/mixedInput\.js/.test(readFileSync(full, 'utf8'))) importers.push(full.slice(SRC.length).split(sep).join('/'))
    }
  }
  walk(SRC)
  assert.deepStrictEqual(importers, [INPUT])
  const c = stripComments(read('lib/command/mixedInput.js'))
  assert.ok(!/Date\.now|new\s+Date|Math\.random|crypto\.|supabase|react|fetch\(/i.test(c.replace(/router/g, '')))
  for (const s of [...c.matchAll(/from\s*['"]([^'"]+)['"]/g)].map((m) => m[1])) assert.ok(/^\.\/\w+\.js$/.test(s), `imports ${s}`)
  assert.ok(!/\.(insert|update|upsert|delete|rpc)\(/.test(c))
})

test('V6: the locked files are byte-for-byte what they were', () => {
  const pins = {
    'lib/moneyInbox.js': 'd4b7ec5baba67a7d', 'lib/command/interpreter.js': 'ea8273109afea4f9', 'lib/command/guardView.js': '227b98b090331a63',
    'lib/command/handoff.js': '729b0d35a5a0d999', 'lib/commandSession.js': '41bd5a720a25ae56', 'lib/useHandoff.js': 'a5771b309e68f7ac',
    'lib/command/queries.js': 'bbcecab7991be354', 'components/money-inbox/QueryResultDialog.jsx': '83e29d3898e22a6b', 'components/money-inbox/ReviewDrawer.jsx': 'bd2bb99ef98ea9c2',
    'pages/Salary.jsx': 'c9f577319c072f9b', 'pages/PFPension.jsx': 'eaabd6e8ae5708cc', 'lib/salaryEngine.js': '2befabe0339368b0', 'lib/pfEngine.js': 'dba5c9883be3d1ce',
    'lib/financialRules.js': '6fb0dcf6a6eb633e', 'lib/command/pendingAction.js': 'a75edc5305f97862', 'lib/command/commandContext.js': 'efe5ddb22ad5c1f2',
    'lib/command/budgetCommands.js': '99c5763aeef33cea', 'lib/command/goalCommands.js': '9715e0be9f299941', 'lib/command/learningCommands.js': 'f820541dda3040c6',
    'lib/command/learningOffer.js': '2cf2e0202d58c306', 'lib/command/salaryReceipt.js': 'b2dbf8d5971f12a5', 'lib/command/pensionEstimate.js': '8afd5eb3b945ea13',
    'lib/command/intents.js': '629a6efd6f40950f', 'lib/moneyInboxGolden.snapshot.json': '74fbe8bbfa06e8ad', 'lib/moneyInboxGoldenInputs.js': '80033b0bfaa41892',
  }
  for (const [p, h] of Object.entries(pins)) assert.equal(sha(read(p)), h, p)
  assert.ok(/export const BUILT_THROUGH = 'P10'\n/.test(read('lib/command/intents.js')), 'no new intent: the build marker stays P10')
})

test('V8: the guard is given the whole typed text and all four of the user\'s lists, plus the reference date and the clock', () => {
  assert.ok(/detectHiddenMix\(\s*text,/.test(hook), 'first argument is the typed text, unchanged')
  for (const k of ['goals: lists.goals', 'categories: lists.categories', 'learningItems: lists.learningItems', 'accounts: lists.accounts', 'referenceDate: initialDate ? new Date(initialDate) : new Date()', 'Date.now()']) assert.ok(hook.includes(k), k)
})

test('V7: no new file writes a transaction; the review screen is still the only writer', () => {
  const writers = []
  const walk = (dir) => {
    for (const name of readdirSync(dir)) {
      if (name === 'node_modules') continue
      const full = join(dir, name)
      if (statSync(full).isDirectory()) { walk(full); continue }
      if (!/\.(js|jsx)$/.test(name) || /\.test\.js$/.test(name)) continue
      const t = stripComments(readFileSync(full, 'utf8'))
      const i = t.indexOf("from('transactions')")
      if (i >= 0 && /\.(insert|upsert)\(/.test(t.slice(i, i + 200))) writers.push(full.slice(SRC.length).split(sep).join('/'))
    }
  }
  walk(SRC)
  assert.ok(writers.includes('components/money-inbox/ReviewDrawer.jsx'))
  for (const w of writers) assert.ok(!/mixedInput|salaryReceipt|pensionEstimate|MoneyInboxInput/.test(w), w)
})

console.log(`\n${passed} passed, ${failed} failed`)
if (failed > 0) process.exit(1)
