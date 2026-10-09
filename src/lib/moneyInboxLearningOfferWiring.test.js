// P8b (Money Inbox command layer) — WIRING TESTS FOR THE LEARNING-PAYMENT OFFER (Y1–Y10).
//
// There is no React test setup in this project, so these read the source as text and prove how the
// follow-up travels and who is allowed to write:
//   Y1  ReviewDrawer: the insert and its payload are byte-for-byte what they were; onSaved is optional,
//       is called only after the error check, inside try/catch, and every other line is unchanged
//   Y2  the transaction path in Money Inbox (the 951-character block) is byte-for-byte what it was
//   Y3  the offer is shown only from handleFlowClose, only for ONE entry, and never before a real save
//   Y4  the offer branch holds the panel open (no onClose) and still refreshes the parent; every other path is as before
//   Y5  "Open Learning ROI" = putHandoff, then the route from the page table, then goTo; "No thanks" writes nothing
//   Y6  Money Inbox still writes nothing and reads nothing new
//   Y7  saved rows are collected only from the review screen's report, and cleared on Back and on every close
//   Y8  the other ReviewDrawer user (statement import) and the Learning page are untouched
//   Y9  only Money Inbox imports learningOffer.js; the intent contract table is unchanged
//   Y10 the locked files are byte-for-byte what they were
import assert from 'node:assert'
import { readFileSync } from 'node:fs'
import { createHash } from 'node:crypto'
import { fileURLToPath } from 'node:url'
import { join } from 'node:path'

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
const DRAWER = 'components/money-inbox/ReviewDrawer.jsx'
const input = read(INPUT)
const code = stripComments(input)
const drawer = read(DRAWER)
const drawerCode = stripComments(drawer)
const close = between(code, 'const handleFlowClose = () => {', '\n  }\n')
const offerHandler = between(code, 'const handleOfferChoice = (choiceId) => {', '\n  }\n')

test('Y1: ReviewDrawer — the insert and its payload are untouched; onSaved is optional, comes after the error check, and cannot affect saving', () => {
  const payloadBlock = between(drawer, '    const payload = toInsert.map(', "await supabase.from('transactions').insert(payload)")
  assert.equal(payloadBlock.length, 743)
  assert.equal(sha(payloadBlock), '945798bdda48930e')
  assert.equal((drawerCode.match(/\.insert\(/g) || []).length, 1, 'still exactly one write')
  assert.ok(/export default function ReviewDrawer\(\{ candidates, accounts, categories, onBack, onClose, onSaved \}\)/.test(drawer))
  assert.equal((drawerCode.match(/onSaved/g) || []).length, 2, 'the prop and its one call')
  const afterInsert = drawerCode.slice(drawerCode.indexOf("await supabase.from('transactions').insert(payload)"))
  const errorCheck = afterInsert.indexOf('if (insertErr) {')
  const call = afterInsert.indexOf('onSaved?.(')
  const closeCall = afterInsert.indexOf('onClose()')
  assert.ok(errorCheck > 0 && call > errorCheck && closeCall > call, 'insert, then the error check (which returns), then onSaved, then the close')
  assert.ok(/try \{ onSaved\?\.\(payload\.map\(\(row\) => \(\{ \.\.\.row \}\)\)\) \} catch \{ \/\* the save already happened \*\/ \}/.test(drawer), 'optional call, copies of the rows, inside try/catch')
  assert.ok(/if \(insertErr\) \{\s*setError\([^)]*\)[^)]*\)\s*return\s*\}/.test(afterInsert), 'the error branch still returns before onSaved')
})

test('Y2: the transaction path in Money Inbox (the 951-character block) is byte-for-byte what it was', () => {
  const block = between(input, 'const candidates = buildReviewCandidates(text, {', 'setReviewState({ candidates, accounts, categories })')
  assert.equal(block.length, 951)
  assert.equal(sha(block), '2af2a73c071add86')
  assert.ok(!/savedRowsRef|detectLearningPayment|setOffer/.test(block), 'nothing of P8b is inside it')
})

test('Y3: the offer is decided only in handleFlowClose, only for one reviewed entry, from what was reported saved', () => {
  assert.equal((code.match(/detectLearningPayment\(/g) || []).length, 1, 'detection is called in one place')
  assert.ok(close.includes('detectLearningPayment(savedRows)'))
  assert.ok(/reviewState && reviewState\.candidates\.length === 1 \? detectLearningPayment\(savedRows\) : null/.test(close), 'one entry only; nothing without a review')
  assert.equal((code.match(/setOffer\((?!null\))/g) || []).length, 1, 'the offer is set to a value in one place (everything else clears it)')
  assert.ok(close.includes('setOffer(learningOffer)'))
  assert.ok(!/detectLearningPayment/.test(between(code, 'const handleParse = async', 'const handleFlowClose')), 'no detection at parse time')
})

test('Y4: the offer branch keeps the panel open and refreshes the parent; every other path is the old one', () => {
  const branch = between(close, 'if (learningOffer) {', '\n    }\n')
  assert.ok(!/onClose/.test(branch), 'the offer branch never closes the panel')
  assert.ok(/onSaved\?\.\(\)/.test(branch) && /return/.test(branch))
  assert.ok(/setReviewState\(null\)/.test(branch) && /setText\(''\)/.test(branch), 'the review is finished and reset')
  const rest = close.slice(close.indexOf('\n    }\n') + 7)
  assert.ok(/setOffer\(null\)\s*setWorkPanel\(null\)\s*setReviewState\(null\)\s*setGuard\(null\)\s*setGuardLists\(null\)\s*setAnswer\(null\)\s*setNotice\(null\)\s*setText\(''\)\s*onSaved\?\.\(\)\s*onClose\?\.\(\)/.test(rest), 'the old path, in the old order, with only the offer and the P10 work panel cleared first')
})

test('Y5: Open Learning ROI = putHandoff, then the route from the page table, then goTo; No thanks hands nothing over', () => {
  const open = between(offerHandler, 'if (choiceId === LEARNING_OFFER_CHOICES.open && offer) {', '\n    }\n')
  const p = open.indexOf('putHandoff(')
  const n = open.indexOf('navigationFromChoice(`open_${handoff.page}`)')
  const g = open.indexOf('goTo(destination)')
  assert.ok(p > 0 && n > p && g > n, 'handoff, then the table lookup, then navigation')
  assert.ok(/const handoff = putHandoff\(\s*learningOfferPending\(offer, \{ id: [^\n]*, now: Date\.now\(\) \}\),\s*user\.id,\s*Date\.now\(\),\s*\)/.test(open), 'the hand-over is built by the pure module, at click time, and given to the session')
  assert.ok(/catch \{\s*destination = null\s*\}/.test(open) && /setNotice\(LEARNING_OFFER_MESSAGES\.couldNotOpen\)/.test(open), 'a handoff that cannot be prepared says so and the payment stays saved')
  const skip = between(offerHandler, 'if (choiceId === LEARNING_OFFER_CHOICES.skip) {', '\n    }\n')
  assert.ok(!/putHandoff|goTo|navigate|supabase/.test(skip))
  assert.ok(/setOffer\(null\)/.test(skip) && /onClose\?\.\(\)/.test(skip))
  assert.ok(/const goTo = \(destination\) => \{\n    navigate\(destination\.route\)\n(?:    set\w+\([^)]*\)\n)*?    setOffer\(null\)\n(?:    set\w+\([^)]*\)\n)*    onClose\?\.\(\)\n  \}/.test(code), 'going to a page also clears the offer')
  assert.ok(!/'\/learning'/.test(code), 'no route is written in Money Inbox')
  assert.equal((code.match(/navigate\(/g) || []).length, 1, 'the router is still called in exactly one place (goTo)')
})

test('Y6: Money Inbox still writes nothing and reads nothing new', () => {
  assert.ok(!/\.(insert|update|upsert|delete|rpc)\(/.test(code))
  assert.equal((code.match(/\.from\('/g) || []).length, 16, 'the reads P9 left (14) plus the two select-only salary reads P10 adds')
  assert.ok(!/learning_items/.test(offerHandler + close))
})

test('Y7: saved rows come only from the review screen, are cleared on Back and on every close, and the panel is built from the offer module', () => {
  assert.ok(/onSaved=\{\(rows\) => \{ savedRowsRef\.current = \[\.\.\.savedRowsRef\.current, \.\.\.rows\] \}\}/.test(code))
  assert.ok(/onBack=\{\(\) => \{ savedRowsRef\.current = \[\]; setReviewState\(null\) \}\}/.test(code))
  assert.ok(/savedRowsRef\.current = \[\]/.test(close))
  assert.equal((code.match(/savedRowsRef\.current = /g) || []).length, 3, 'collect, clear on Back, clear on close')
  assert.ok(/<LearningOfferPanel view=\{learningOfferView\(offer\)\} onChoose=\{handleOfferChoice\} \/>/.test(code))
  assert.ok(/\) : guard \? \([\s\S]*?\) : offer \? \(/.test(code), 'the offer panel sits after the guard panel and before the text box')
  assert.equal((code.match(/\) : offer \? \(/g) || []).length, 1, 'one offer branch')
})

test('Y8: statement import and the Learning page are untouched', () => {
  assert.equal(sha(read('components/statement/StatementImportModal.jsx')), '67f4d6bd8c8524d0')
  assert.ok(!/onSaved/.test(stripComments(read('components/statement/StatementImportModal.jsx'))))
  assert.equal(sha(read('pages/LearningROI.jsx')), 'dfacd724cc39c9a2')
  assert.equal(sha(read('lib/command/learningDialog.js')), '46b520b5612f2a22')
  assert.equal(sha(read('lib/command/learningCommands.js')), 'f820541dda3040c6')
})

test('Y9: only Money Inbox imports learningOffer.js; the contract table and the build marker are unchanged', () => {
  const importers = []
  const walk = (dir) => {
    for (const f of readdirSyncSafe(dir)) {
      const full = join(dir, f)
      if (f === 'node_modules') continue
      if (/\.jsx?$/.test(f) && !/\.test\.js$/.test(f)) { if (/learningOffer\.js/.test(readFileSync(full, 'utf8'))) importers.push(full.slice(SRC.length).replace(/\\/g, '/')) } else if (!f.includes('.')) walk(full)
    }
  }
  walk(SRC)
  assert.deepStrictEqual(importers, [INPUT])
  assert.equal(sha(read('lib/command/intents.js')), '629a6efd6f40950f') // P10: only the BUILT_THROUGH line changed (P8b was 8e86d0de49d05949)
  assert.ok(/BUILT_THROUGH = 'P10'/.test(read('lib/command/intents.js')))
})

test('Y10: the locked files are byte-for-byte what they were', () => {
  const pins = {
    'lib/command/interpreter.js': 'ea8273109afea4f9', 'lib/command/guardView.js': '227b98b090331a63', 'lib/command/handoff.js': '729b0d35a5a0d999',
    'lib/commandSession.js': '41bd5a720a25ae56', 'lib/useHandoff.js': 'a5771b309e68f7ac', 'lib/budgetRecipe.js': 'cc273e25d97dad28',
    'lib/budgetSave.js': 'e2499dfb17cba90d', 'lib/budgetEngine.js': '50142395b7358185', 'pages/Budgets.jsx': '140aa62c8e126b15',
    'components/budgets/BudgetRecipeFlow.jsx': '2083d5d76e8156d9',
  }
  for (const [file, expected] of Object.entries(pins)) assert.equal(sha(read(file)), expected, file)
})

import { readdirSync } from 'node:fs'
function readdirSyncSafe(dir) { try { return readdirSync(dir) } catch { return [] } }

console.log(`\n${passed} passed, ${failed} failed`)
if (failed > 0) process.exit(1)
