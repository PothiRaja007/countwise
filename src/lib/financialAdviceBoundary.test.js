// Phase 38 — Financial Advice Boundary Audit, permanent regression guard.
//
// The audit's concrete finding: three AI "Explain this" features
// (PF/Pension, CTC Explorer, Salary) displayed Gemini's returned text
// verbatim, with no content check — unlike Financial Assist's narration,
// which has always been validated before display. All three are now
// fixed (explanationSafety.js's validateExplanation()). This test is
// what stops a FOURTH one from shipping the same way: it scans every
// file that both calls gemini-explain AND sets some kind of
// "explanation"/"summary" state, and requires it to also reference one
// of the two legitimate output validators in this codebase.
//
// Deliberately NOT a broad word-scan across the whole UI for banned
// words — that was run once, by hand, as part of this audit (see the
// written report), and found zero real violations once triaged. It is
// not kept as an automated gate because it has a real, high false-
// positive rate on raw source text (e.g. "Promise.all(" matching
// "promise", or a protective disclaimer like "does not promise X"
// matching the same word it's negating) — a noisy gate erodes trust in
// every OTHER gate faster than it catches anything. This test is
// narrower and precise instead.
import assert from 'node:assert'
import { readdirSync, readFileSync, statSync } from 'node:fs'
import { join, relative } from 'node:path'
import { fileURLToPath } from 'node:url'

let passed = 0, failed = 0
function test(name, fn) {
  try { fn(); passed++; console.log(`  PASS  ${name}`) }
  catch (err) { failed++; console.log(`  FAIL  ${name}\n        ${err.message}`) }
}

const SRC = join(fileURLToPath(new URL('.', import.meta.url)), '..')
function walk(dir) {
  return readdirSync(dir).flatMap((name) => {
    const full = join(dir, name)
    return statSync(full).isDirectory() ? walk(full) : [full]
  })
}
const withoutComments = (t) => t.replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '')

const sourceFiles = walk(SRC).filter((f) => /\.(jsx|js)$/.test(f) && !/\.test\./.test(f))
const callers = sourceFiles.filter((f) =>
  /functions\.invoke\(\s*['"]gemini-explain['"]/.test(withoutComments(readFileSync(f, 'utf8')))
)

console.log('financialAdviceBoundary tests\n')

test('the known gemini-explain callers are all found (the guard is not vacuous)', () => {
  const names = callers.map((f) => relative(SRC, f).replace(/\\/g, '/'))
  for (const expected of [
    'pages/PFPension.jsx', 'pages/Salary.jsx', 'pages/CTCExplorer.jsx',
    'components/assist/FinancialAssistCard.jsx', 'components/money-inbox/ReviewDrawer.jsx',
  ]) {
    assert.ok(names.includes(expected), `missing ${expected}`)
  }
})

test('every gemini-explain caller that free-form-DISPLAYS text validates it first (validateExplanation or validateNarration)', () => {
  // ReviewDrawer.jsx and CTCExplorer.jsx's document-extraction path are
  // structured-data callers (amount/category/account fields, not free
  // prose) — already covered by their own field-level validators
  // (validateFallbackResult, validateExtractedComponents), not this one.
  // Narrowed by checking each caller for the pattern that actually
  // writes free text into state for display.
  for (const file of callers) {
    const text = withoutComments(readFileSync(file, 'utf8'))
    const rel = relative(SRC, file).replace(/\\/g, '/')
    const displaysFreeText = /set(Explanation|Summary)\(/.test(text)
    if (!displaysFreeText) continue // a structured-field caller, different rule applies
    assert.ok(
      /validateExplanation\(|validateNarration\(/.test(text),
      `${rel} displays free-form AI text via setExplanation/setSummary but never calls validateExplanation or validateNarration`
    )
  }
})

test('PFPension.jsx, Salary.jsx and CTCExplorer.jsx specifically use validateExplanation (the fix this audit made)', () => {
  for (const relPath of ['pages/PFPension.jsx', 'pages/Salary.jsx', 'pages/CTCExplorer.jsx']) {
    const file = sourceFiles.find((f) => relative(SRC, f).replace(/\\/g, '/') === relPath)
    assert.ok(file, `${relPath} not found`)
    const text = readFileSync(file, 'utf8')
    assert.ok(text.includes('validateExplanation'), `${relPath} does not import/use validateExplanation`)
  }
})

test('the three explanation prompt builders instruct Gemini against advice/certainty/investment language (defense in depth, not validation alone)', () => {
  for (const relPath of ['lib/explainPF.js', 'lib/explainCTC.js', 'lib/explainSalary.js']) {
    const file = sourceFiles.find((f) => relative(SRC, f).replace(/\\/g, '/') === relPath)
    assert.ok(file, `${relPath} not found`)
    const text = readFileSync(file, 'utf8')
    assert.ok(/Do not give advice/.test(text), `${relPath} missing the anti-advice prompt instruction`)
    assert.ok(/guarantee/.test(text), `${relPath} missing the anti-certainty prompt instruction`)
  }
})

console.log(`\n${passed} passed, ${failed} failed`)
if (failed > 0) process.exit(1)
