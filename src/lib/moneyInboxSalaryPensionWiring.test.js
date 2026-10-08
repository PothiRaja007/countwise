// P10 (Money Inbox command layer) — WIRING TESTS FOR THE SALARY SUGGESTION AND THE PENSION ESTIMATE (Z1–Z10).
//
// There is no React test setup in this project, so these read the source as text and prove how the two
// features are wired and who is allowed to write:
//   Z1  Money Inbox writes nothing; the two new reads are select-only, for this user only, in one helper
//   Z2  the transaction block (951 characters) is byte-for-byte what it was and holds no P10 code
//   Z3  the hooks sit inside the guard, after interpret(), before the transaction block, and only for a "transaction"
//   Z4  the salary buttons: Use fills the text box (nothing is reviewed or saved), type = old path, Open = page table, Cancel = reset
//   Z5  the pension answer is shown in its own panel; the three ways in (question, request, button) use one function
//   Z6  routes come from the page table, never from this file
//   Z7  the panel is cleared when a page opens and when the flow closes, and sits after the offer branch
//   Z8  only Money Inbox imports the two new modules; the contract table changed by the one build-marker line
//   Z9  the locked files are byte-for-byte what they were
//   Z10 the new modules ask nothing of the clock, the database or the screen
import assert from 'node:assert'
import { readFileSync, readdirSync } from 'node:fs'
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
const input = read(INPUT)
const code = stripComments(input)
const reader = between(code, 'async function readActiveSalary(userId) {', '\n}\n')
const parse = between(code, 'const handleParse = async (options) => {', '\n  }\n')
const salaryHandler = between(code, 'const handleSalaryChoice = (choiceId) => {', '\n  }\n')
const pensionAction = between(code, 'const handlePensionAction = (actionId) => {', '\n  }\n')
const choice = between(code, 'const handleGuardChoice = async (choiceId) => {', '\n  }\n')
const close = between(code, 'const handleFlowClose = () => {', '\n  }\n')
const goToFn = between(code, 'const goTo = (destination) => {', '\n  }\n')

test('Z1: Money Inbox writes nothing; the two new reads are select-only, for this user, in one helper', () => {
  assert.ok(!/\.(insert|update|upsert|delete|rpc)\(/.test(code), 'no write or rpc in MoneyInboxInput')
  assert.equal((reader.match(/\.from\('/g) || []).length, 2)
  assert.ok(reader.includes("supabase.from('salary_structures').select('id, label').eq('user_id', userId).eq('is_active', true).maybeSingle()"))
  assert.ok(reader.includes("supabase.from('salary_components').select('name, category, monthly_amount').eq('user_id', userId).eq('structure_id', found.data.id)"))
  assert.ok(/if \(found\.error\) throw found\.error/.test(reader) && /if \(parts\.error\) throw parts\.error/.test(reader), 'a failed read is an error, never an empty answer')
  assert.equal((code.match(/readActiveSalary\(/g) || []).length, 3, 'defined once, used by the salary suggestion and the pension estimate')
  assert.equal((code.match(/putHandoff\(/g) || []).length, 4, 'no new hand-off: the salary journey stays in Money Inbox')
  assert.ok(!/pending_actions|financial_rules|\.rpc\(/.test(code))
})

test('Z2: the transaction block is byte-for-byte what it was and holds no P10 code', () => {
  const block = between(input, 'const candidates = buildReviewCandidates(text, {', '      setReviewState({ candidates, accounts, categories })')
  assert.equal(block.length, 951)
  assert.equal(sha(block), '2af2a73c071add86')
  assert.ok(!/Salary|salary|pension|Pension|workPanel/.test(block))
})

test('Z3: the hooks sit inside the guard, after interpret(), before the transaction block, and only for a transaction', () => {
  const guardStart = parse.indexOf('if (!skipGuard) {')
  const interpretAt = parse.indexOf('interpreted = interpret(')
  const salaryAt = parse.indexOf('detectSalaryReceipt(text)')
  const pensionReqAt = parse.indexOf('looksLikePensionEstimateRequest(text)')
  const blockAt = parse.indexOf('const candidates = buildReviewCandidates(text')
  assert.ok(guardStart > 0 && interpretAt > guardStart && salaryAt > interpretAt && pensionReqAt > salaryAt && blockAt > pensionReqAt)
  const hook = between(parse, "if (interpreted && interpreted.kind === 'transaction') {", '\n        }\n')
  assert.ok(hook.includes('detectSalaryReceipt(text)') && hook.includes('looksLikePensionEstimateRequest(text)'))
  assert.equal((parse.match(/detectSalaryReceipt\(/g) || []).length, 1)
  assert.equal((code.match(/detectSalaryReceipt\(/g) || []).length, 1, 'used in one place only')
  // never when the guard was skipped: "I'll type the amount" and "record it as an expense" take the old path
  assert.ok(parse.slice(guardStart, salaryAt).includes('if (!skipGuard) {'))
  const afterSalary = parse.slice(salaryAt, blockAt)
  assert.ok(/^[\s\S]*\}\s*\}\s*$/.test(afterSalary.replace(/\s+/g, ' ').replace(/ /g, '')) || afterSalary.includes('return'), 'both hooks return')
  // a pension question the interpreter built is answered where a Money Inbox question would be, when none exists
  const nonTx = between(parse, "if (interpreted && interpreted.kind !== 'transaction') {", '\n          return\n        }\n')
  assert.ok(nonTx.indexOf('requestFromResult(interpreted)') < nonTx.indexOf('pensionQuestionFromResult(interpreted)') && nonTx.indexOf('pensionQuestionFromResult(interpreted)') < nonTx.indexOf('setGuard(interpreted)'))
  assert.ok(nonTx.indexOf('navigationFromResult(interpreted)') < nonTx.indexOf('pensionQuestionFromResult(interpreted)'))
})

test('Z4: the salary buttons — Use fills the text box only; type = the old path; Open = page table; Cancel resets', () => {
  const use = between(salaryHandler, 'if (outcome.action === SALARY_CHOICES.use) {', '\n    } else if (outcome.action === SALARY_CHOICES.type) {')
  assert.ok(/const pending = salaryReceiptPending\(panel\.state, /.test(use) && use.indexOf('const pending = salaryReceiptPending(') < use.indexOf('setText(salaryReceiptText('), 'the hand-over is validated first, and its amount is the one used')
  assert.ok(/setText\(salaryReceiptText\(panel\.text, pending\.fields\.amount\.value\)\)\n\s*setWorkPanel\(null\)\n\s*setNotice\(SALARY_MESSAGES\.fillNote\)\n/.test(use), 'fill the box, close the panel, say it is an estimate')
  assert.ok(!/handleParse|setReviewState|goTo|putHandoff/.test(use), 'Use does not review, save or navigate')
  const type = between(salaryHandler, 'else if (outcome.action === SALARY_CHOICES.type) {', "\n    } else if (outcome.action === SALARY_CHOICES.open) {")
  assert.ok(/setWorkPanel\(null\)[\s\S]*handleParse\(\{ skipGuard: true \}\)/.test(type), 'typing the amount yourself is the normal path, unchanged')
  const open = between(salaryHandler, 'else if (outcome.action === SALARY_CHOICES.open) {', "\n    } else if (outcome.action === SALARY_CHOICES.cancel) {")
  assert.ok(/navigationFromChoice\('open_salary'\)/.test(open) && /goTo\(destination\)/.test(open))
  const cancel = salaryHandler.slice(salaryHandler.indexOf('SALARY_CHOICES.cancel'))
  assert.ok(/setWorkPanel\(null\)/.test(cancel) && /setText\(''\)/.test(cancel) && !/goTo|handleParse/.test(cancel))
  assert.ok(/resolveSalaryChoice\(panel\.state, choiceId\)/.test(salaryHandler), 'a button the panel did not offer does nothing')
})

test('Z5: the pension answer has its own panel, labelled Estimated; every way in uses one function', () => {
  assert.equal((code.match(/pensionFor\(\)/g) || []).length, 3, 'one function, called by the question, the request and the button')
  assert.ok(/<p [^>]*>Estimated<\/p>/.test(code), 'the panel is labelled Estimated')
  assert.ok(!/QueryResultDialog[^\n]*workPanel|workPanel[^\n]*QueryResultDialog/.test(code), 'the shared answer dialog (which says "Calculated") is not used')
  const btn = between(choice, "if (outcome.intent === 'QUERY_PENSION_ESTIMATE' && pensionQuestionFromChoice(outcome.choiceId)) {", '\n      }\n')
  assert.ok(btn.includes('setWorkPanel({ kind: \'pension\', answer: await pensionFor() })'))
  assert.ok(choice.indexOf("outcome.intent === 'NAVIGATE'") < choice.indexOf("outcome.intent === 'QUERY_PENSION_ESTIMATE'") && choice.indexOf("outcome.intent === 'QUERY_PENSION_ESTIMATE'") < choice.indexOf('queryFromChoice('))
  const fn = between(code, 'const pensionFor = async () => {', '\n  }\n')
  assert.ok(/calculateRetirementBreakdown\(basic, calculationDate\)/.test(fn), 'the existing PF engine does the arithmetic')
  assert.ok(fn.includes('sumByCategory(found.components).totals.basic || 0'), 'only the confirmed Basic salary feeds the estimate, as on the PF page')
  assert.ok(/catch \{\s*return pensionDataProblem\(\)/.test(fn), 'a failure gives the plain no-number answer')
  assert.ok(!/\b(\d+(\.\d+)?)\s*\*\s*basic|basic\s*\*\s*\d|0\.12|0\.0833|0\.0367/.test(fn), 'no rate or arithmetic is written here')
})

test('Z6: routes come from the page table, never from this file', () => {
  assert.ok(!/'\/(salary|pf-pension)'/.test(code))
  assert.ok(/navigationFromChoice\(actionId\)/.test(pensionAction) && /PENSION_ACTIONS\.salary \|\| actionId === PENSION_ACTIONS\.pension/.test(pensionAction), 'only the two known actions are opened')
  assert.equal((code.match(/navigate\(/g) || []).length, 1, 'the router is still called in exactly one place (goTo)')
})

test('Z7: the panel is cleared when a page opens and when the flow closes, and sits after the offer branch', () => {
  assert.ok(/setOffer\(null\)\n    setWorkPanel\(null\)/.test(goToFn))
  assert.ok(/setOffer\(null\)\s*setWorkPanel\(null\)\s*setReviewState\(null\)/.test(close))
  assert.ok(/\) : offer \? \([\s\S]*?\) : workPanel \? \(/.test(code))
  assert.equal((code.match(/\) : workPanel \? \(/g) || []).length, 1)
  assert.equal((code.match(/\) : offer \? \(/g) || []).length, 1, 'the offer branch is as P8b left it')
  assert.ok(/workPanel\.kind === 'salary' \? \(\s*<SalaryReceiptPanel view=\{salaryReceiptView\(workPanel\.state\)\} onChoose=\{handleSalaryChoice\} \/>/.test(code))
})

test('Z8: only Money Inbox imports the new modules; the contract table changed by the one build-marker line', () => {
  const importers = { salary: [], pension: [] }
  const walk = (dir) => {
    for (const f of readdirSync(join(SRC, dir))) {
      if (f === 'node_modules') continue
      const rel = join(dir, f)
      if (/\.jsx?$/.test(f) && !/\.test\.js$/.test(f)) {
        const t = read(rel)
        if (/salaryReceipt\.js/.test(t)) importers.salary.push(rel.replace(/\\/g, '/'))
        if (/pensionEstimate\.js/.test(t)) importers.pension.push(rel.replace(/\\/g, '/'))
      } else if (!f.includes('.')) walk(rel)
    }
  }
  walk('')
  assert.deepStrictEqual(importers, { salary: [INPUT], pension: [INPUT] })
  const intents = read('lib/command/intents.js')
  assert.equal(sha(intents), '629a6efd6f40950f')
  assert.ok(/export const BUILT_THROUGH = 'P10'\n/.test(intents))
  assert.equal(intents.replace("BUILT_THROUGH = 'P10'", "BUILT_THROUGH = 'P9'").length, intents.length - 1)
})

test('Z9: the locked files are byte-for-byte what they were', () => {
  const pins = {
    'lib/command/interpreter.js': 'ea8273109afea4f9', 'lib/command/guardView.js': '227b98b090331a63', 'lib/command/handoff.js': '729b0d35a5a0d999',
    'lib/commandSession.js': '41bd5a720a25ae56', 'lib/useHandoff.js': 'a5771b309e68f7ac', 'lib/command/queries.js': 'bbcecab7991be354',
    'components/money-inbox/QueryResultDialog.jsx': '83e29d3898e22a6b', 'components/money-inbox/ReviewDrawer.jsx': 'bd2bb99ef98ea9c2',
    'pages/Salary.jsx': 'c9f577319c072f9b', 'pages/PFPension.jsx': 'eaabd6e8ae5708cc', 'lib/salaryEngine.js': '2befabe0339368b0',
    'lib/pfEngine.js': 'dba5c9883be3d1ce', 'lib/financialRules.js': '6fb0dcf6a6eb633e', 'lib/command/pendingAction.js': 'a75edc5305f97862',
    'lib/command/commandContext.js': 'efe5ddb22ad5c1f2', 'lib/command/budgetCommands.js': '99c5763aeef33cea', 'lib/command/goalCommands.js': '9715e0be9f299941',
    'lib/command/learningCommands.js': 'f820541dda3040c6', 'lib/command/learningOffer.js': '2cf2e0202d58c306',
  }
  for (const [p, h] of Object.entries(pins)) assert.equal(sha(read(p)), h, p)
})

test('Z10: the new modules ask nothing of the clock, the database or the screen', () => {
  for (const f of ['lib/command/salaryReceipt.js', 'lib/command/pensionEstimate.js']) {
    const c = stripComments(read(f))
    assert.ok(!/Date\.now|new\s+Date|Math\.random|crypto\.|supabase|react|fetch\(/i.test(c.replace(/router/g, '')), f)
    for (const s of [...c.matchAll(/from\s*['"]([^'"]+)['"]/g)].map((m) => m[1])) assert.ok(/^\.\/\w+\.js$/.test(s), `${f} imports ${s}`)
  }
})

console.log(`\n${passed} passed, ${failed} failed`)
if (failed > 0) process.exit(1)
