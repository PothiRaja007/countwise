// P8 (Money Inbox command layer) — WIRING TESTS FOR LEARNING COMMANDS (W1–W10).
//
// There is no React test setup in this project, so these read the source as text and prove
// how a learning command travels and who is allowed to write:
//   W1  Money Inbox never writes learning items; it prepares a handoff in two places only (goal, learning)
//   W2  Continue = putHandoff, then the page table's route, in that order
//   W3  the learning buttons are decided right after the goal ones and before the generic ones
//   W4  the learning view wraps the goal view; guardView.js knows nothing of learning commands
//   W5  the Learning page reads the handoff only through the hook, after loading, once, never over an open form
//   W6  the Learning page's own save and delete code is byte-for-byte what it was
//   W7  the form: today's defaults without the new props; the new props only pre-fill and explain
//   W8  the Learning page keeps no memory (decision 6) and Money Inbox never reads or writes learning rows beyond a list
//   W9  ReviewDrawer and the transaction path are untouched (P8b is not part of P8)
//   W10 the only writer of learning_items is the Learning page
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
const PAGE = 'pages/LearningROI.jsx'
const input = read(INPUT)
const code = stripComments(input)
const page = read(PAGE)
const pageCode = stripComments(page)
const choice = between(code, 'const handleGuardChoice = async (choiceId) => {', '\n  }\n')

test('W1: Money Inbox never writes; it prepares a handoff in exactly two places (goal and learning), both inside the choice handler', () => {
  assert.ok(!/\.(insert|update|upsert|delete|rpc)\(/.test(code), 'no write or rpc in MoneyInboxInput')
  assert.equal((code.match(/putHandoff\(/g) || []).length, 4, 'P9 adds the budget hand-off; P8b adds the learning-payment offer hand-off')
  assert.equal((choice.match(/putHandoff\(/g) || []).length, 3)
  assert.equal((code.match(/\.from\('/g) || []).length, 16, '14 reads through P9, plus the two select-only salary reads P10 adds')
  assert.ok(code.includes("supabase.from('learning_items').select('id, name, status').eq('user_id', user.id)"), 'a read-only list of this user\'s own items')
  assert.ok(!/\bremember\(|rememberGoal\(|takeHandoff\(|useHandoff|clearCommandSession\(/.test(code))
})

test('W2: Continue = putHandoff, then the route from the page table, then goTo — in that order, once', () => {
  const branch = between(choice, "if (learningOutcome.action === 'hand_off') {", '\n    }\n')
  const p = branch.indexOf('putHandoff(learningOutcome.pending, user.id, Date.now())')
  const n = branch.indexOf('navigationFromChoice(`open_${handoff.page}`)')
  const g = branch.indexOf('goTo(destination)')
  assert.ok(p > 0 && n > p && g > n)
  assert.equal((code.match(/\bgoTo\(/g) || []).length, 8, 'P9 adds the budget hand-off; P8b adds the offer hand-off; P10 adds Open Salary and the pension Open buttons')
  assert.equal((code.match(/navigate\(/g) || []).length, 1)
  assert.ok(!/'\/learning'/.test(code), 'no route is written in Money Inbox: it comes from ALLOWED_PAGES')
  assert.ok(/catch \{\s*destination = null\s*\}/.test(branch) && /setNotice\(LEARNING_COMMAND_MESSAGES\.expired\)/.test(branch))
})

test('W3: the goal buttons first, then the learning buttons, then the generic ones; unknown ones do nothing; detail-less ones only explain', () => {
  const g = choice.indexOf('resolveGoalCommandChoice(guard, choiceId, guardLists?.activeGoals, Date.now())')
  const l = choice.indexOf('resolveLearningCommandChoice(guard, choiceId, guardLists?.learningItems, Date.now())')
  const generic = choice.indexOf('resolveGuardChoice(guard, choiceId, Date.now())')
  assert.ok(g > 0 && l > g && generic > l)
  assert.ok(/if \(learningOutcome\.action === 'pick_item'\) \{\s*setNotice\(null\)\s*setGuard\(learningOutcome\.result\)\s*return\s*\}/.test(choice))
  assert.ok(/learningOutcome\.action === 'expired' \|\| learningOutcome\.action === 'unavailable'/.test(choice))
  assert.ok(/if \(learningOutcome\.action === 'unknown'\) \{\s*setGuard\(null\)\s*return\s*\}/.test(choice))
  const start = between(choice, "} else if (outcome.action === 'start') {", "} else {\n      setNotice(outcome.message || null)")
  const goalNotice = start.indexOf('choiceNotice(outcome.choiceId')
  const learningNotice = start.indexOf('learningChoiceNotice(outcome.choiceId, guardLists?.learningItems)')
  const nav = start.indexOf("outcome.intent === 'NAVIGATE'")
  const query = start.indexOf('queryFromChoice(')
  assert.ok(goalNotice > 0 && learningNotice > goalNotice && nav > learningNotice && query > nav, 'explain first, then navigate, then question')
  assert.ok(/outcome\.intent === 'CREATE_LEARNING_ITEM' \|\| outcome\.intent === 'MODIFY_LEARNING_STATUS'/.test(start))
})

test('W4: one panel, built from the base view through the goal view and then the learning view; guardView.js knows nothing of learning commands', () => {
  assert.equal((code.match(/<CommandGuardPanel/g) || []).length, 1)
  assert.equal((code.match(/buildGuardView\(/g) || []).length, 1)
  assert.ok(code.includes('learningCommandView(goalCommandView(buildGuardView(guard), guard, guardLists?.activeGoals, Date.now()), guard, guardLists?.learningItems, Date.now())'))
  assert.ok(!/learningCommands|continue_learning|pick_learning/.test(read('lib/command/guardView.js')))
  assert.equal(sha(read('lib/command/guardView.js')), '227b98b090331a63', 'guardView.js is byte-for-byte what P4/P5 left')
})

test('W5: Learning reads the handoff only through the hook, after loading, once, and never over an open form', () => {
  assert.equal((pageCode.match(/useHandoff\('learning'\)/g) || []).length, 1)
  assert.ok(!/takeHandoff\(|putHandoff\(|readHandoff\(|createHandoff\(/.test(pageCode))
  const effect = between(pageCode, 'useEffect(() => {\n    if (!handoff || loading) return', '}, [handoff, loading])')
  assert.ok(effect.startsWith('useEffect(() => {\n    if (!handoff || loading) return'), 'waits for the items to load')
  const once = effect.indexOf('if (handledHandoff.current === handoff.id) return')
  const mark = effect.indexOf('handledHandoff.current = handoff.id')
  const done = effect.indexOf('done()')
  const busy = effect.indexOf('if (formOpen || deletingItem) {')
  const decide = effect.indexOf('learningDialogFromHandoff(handoff, { items })')
  assert.ok(once > 0 && mark > once && done > mark && busy > done && decide > busy, 'once per id, then consumed, then busy check, then decide')
  assert.ok(/if \(formOpen \|\| deletingItem\) \{\s*setCommandMessage\(LEARNING_DIALOG_MESSAGES\.dialogOpen\)\s*return\s*\}/.test(effect), 'an open form is never replaced')
  assert.ok(!/setForm|setEditingItem\(null\)/.test(effect.slice(busy, busy + 140)), 'nothing touches the open form before returning')
  assert.ok(/\{ kind: 'create'/.test(effect) && /\{ kind: 'status'/.test(effect))
  assert.ok(!/supabase|\.insert\(|\.update\(|handleSave\(/.test(effect), 'the effect only opens the form; it does not save')
  assert.ok(/if \(commandDialog && !formOpen\) setCommandDialog\(null\)/.test(pageCode), 'the command flag lasts only while its form is open')
})

test('W6: the Learning page\'s own save (insert and update) and delete code is byte-for-byte what it was', () => {
  const save = between(page, '  const handleSave = async (form) => {', '  const handleDelete = async')
  const del = between(page, '  const handleDelete = async', '  if (loading) {')
  assert.equal(sha(save.slice(0, save.length - '  const handleDelete = async'.length)), 'f4ec119015c50272')
  assert.equal(sha(del.slice(0, del.length - '  if (loading) {'.length)), '5df4e14a9b5defb9')
})

test('W7: the form is the same without the new props; the new props only pre-fill and explain', () => {
  const modal = between(page, 'function LearningFormModal(', '  const [saving, setSaving]')
  assert.ok(modal.includes('function LearningFormModal({ item, onClose, onSave, initialValues = null, notice = null })'))
  assert.ok(modal.includes("status: item.status || 'planned',\n          ...(initialValues || {}),"))
  assert.ok(modal.includes(': { ...DEFAULT_FORM, ...(initialValues || {}) },'))
  const submit = between(page, 'const handleSubmit = async (event) => {', '\n  }\n')
  assert.ok(submit.includes('await onSave({ ...form, cost, progressPct: progress })'), 'what the form submits is unchanged')
  assert.ok(page.includes("{saving ? 'Saving...' : item ? 'Save changes' : 'Add item'}"), 'the button words the banner promises')
  assert.ok(!/progressPct/.test(read('lib/command/learningDialog.js')), 'a command never sets progress')
  assert.ok(pageCode.includes('{Array.isArray(notice) && notice.length > 0 && ('), 'the banner is shown whenever there is one')
  assert.ok(pageCode.includes('data-testid="command-notice"'))
  assert.ok(/initialValues=\{commandDialog\?\.prefill\}\s*notice=\{commandDialog\?\.notice\}/.test(pageCode))
})

test('W8: Learning keeps no memory (decision 6) and imports only the hook and the dialog module', () => {
  assert.ok(!/commandSession|remember\(|memoryFor|commandContext/.test(pageCode))
  const imports = [...pageCode.matchAll(/from '([^']*)'/g)].map((m) => m[1]).filter((s) => /lib\/(useHandoff|command)/.test(s))
  assert.deepEqual(imports, ['../lib/useHandoff.js', '../lib/command/learningDialog.js'])
})

test('W9: the transaction path is untouched; ReviewDrawer changed only by the P8b onSaved prop', () => {
  assert.equal(sha(read('components/money-inbox/ReviewDrawer.jsx')), 'bf1359b4811e4307')
  assert.ok(!/RECORD_LEARNING_PAYMENT/.test(code + pageCode), 'the declared-but-unrouted intent is still not used')
  assert.ok(!/learningOffer|detectLearningPayment/.test(pageCode), 'the Learning page knows nothing of the offer')
  const START = 'const candidates = buildReviewCandidates(text, {'
  const END = 'setReviewState({ candidates, accounts, categories })'
  const a = input.indexOf(START), e = input.indexOf(END)
  assert.ok(a > 0 && e > a)
  const block = input.slice(a, e + END.length)
  assert.equal(block.length, 951)
  assert.equal(sha(block), '2af2a73c071add86')
})

test('W10: the only writer of learning_items is the Learning page; nobody else imports the new modules', () => {
  const writers = []
  const importers = { 'learningCommands.js': [], 'learningDialog.js': [] }
  const walk = (dir) => {
    for (const name of readdirSync(dir)) {
      const full = join(dir, name)
      if (statSync(full).isDirectory()) { walk(full); continue }
      if (!/\.(js|jsx)$/.test(name) || /\.test\.js$/.test(name)) continue
      const rel = full.slice(SRC.length).split(sep).join('/')
      const text = stripComments(readFileSync(full, 'utf8'))
      if (/from\('learning_items'\)\s*\.(insert|update|upsert|delete)\(/.test(text.replace(/\n\s*/g, ' '))) writers.push(rel)
      for (const target of Object.keys(importers)) {
        if (rel.endsWith(`/${target}`) || rel === target) continue
        if (new RegExp(`from\\s*['"][^'"]*/${target.replace('.', '\\.')}['"]`).test(text)) importers[target].push(rel)
      }
    }
  }
  walk(SRC)
  assert.deepEqual(writers, [PAGE], 'the Learning page, and only it, writes learning items')
  assert.deepEqual(importers['learningCommands.js'], [INPUT])
  assert.deepEqual(importers['learningDialog.js'].sort(), [PAGE, 'lib/command/learningCommands.js'].sort())
})

console.log(`\n${passed} passed, ${failed} failed`)
if (failed) process.exit(1)
