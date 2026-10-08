// P7 (Money Inbox command layer) — WIRING TESTS FOR GOAL COMMANDS (T1–T10).
//
// There is no React test setup in this project, so these read the source as text and prove
// how a goal command travels and who is allowed to write:
//   T1  Money Inbox never writes; it prepares a handoff in exactly one place
//   T2  Continue = putHandoff, then the page table's route, in that order; nothing else opens Goals
//   T3  a goal command's buttons are decided before the generic ones; detail-less buttons only explain
//   T4  the extended panel is the one rendered, built from the base view
//   T5  Goals reads the handoff only through the hook, only after loading, once, and never over an open form
//   T6  the Goals page's own save, update, archive and reuse code is byte-for-byte what it was
//   T7  ContributeModal: today's defaults without the new props, and its save is byte-for-byte what it was
//   T8  memory is written only by Goals, only after a confirmed save from a command, and only when certain
//   T9  the transaction path is still byte-for-byte what it was before P4
//   T10 nobody else imports the new modules
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
const GOALS = 'pages/Goals.jsx'
const MODAL = 'components/goals/ContributeModal.jsx'
const input = read(INPUT)
const code = stripComments(input)
const goals = read(GOALS)
const goalsCode = stripComments(goals)
const modal = read(MODAL)
const modalCode = stripComments(modal)
const choice = between(code, 'const handleGuardChoice = async (choiceId) => {', '\n  }\n')

test('T1: Money Inbox never writes anything; it prepares a handoff in exactly one place', () => {
  assert.ok(!/\.(insert|update|upsert|delete|rpc)\(/.test(code), 'no write or rpc in MoneyInboxInput')
  assert.equal((code.match(/putHandoff\(/g) || []).length, 3, 'P9: one for a goal command, one for a learning command, one for a budget command')
  assert.ok(choice.includes('putHandoff('), 'and both are inside the choice handler')
  assert.equal((code.match(/\.from\('/g) || []).length, 14, 'P7 adds no read to Money Inbox: the count is what P5 and P6 left')
  assert.deepEqual([...new Set([...code.matchAll(/\.from\('(\w+)'\)/g)].map((m) => m[1]))].sort(), ['accounts', 'budgets', 'categories', 'category_rules', 'goal_contributions', 'goals', 'learning_items', 'transactions'])
  assert.ok(!/\bremember\(|rememberGoal\(|takeHandoff\(|useHandoff|clearCommandSession\(/.test(code), 'it neither writes the memory nor reads handoffs')
  const imports = [...code.matchAll(/from '([^']*commandSession\.js)'/g)].map((m) => m[1])
  assert.deepEqual(imports, ['../../lib/commandSession.js'])
})

test('T2: Continue = putHandoff, then the route from the page table, then goTo — in that order, once', () => {
  const branch = between(choice, "if (goalOutcome.action === 'hand_off') {", '\n    }\n')
  const p = branch.indexOf('putHandoff(goalOutcome.pending, user.id, Date.now())')
  const n = branch.indexOf('navigationFromChoice(`open_${handoff.page}`)')
  const g = branch.indexOf('goTo(destination)')
  assert.ok(p > 0 && n > p && g > n, 'handoff, then the table lookup, then navigation')
  assert.equal((code.match(/\bgoTo\(/g) || []).length, 5, 'goTo: typed page request, page choice, goal, learning and budget hand-offs (P9)')
  assert.equal((code.match(/navigate\(/g) || []).length, 1, 'the router is still called in exactly one place (goTo)')
  assert.ok(!/navigate\(`|navigate\('\/goals'\)|'\/goals'/.test(code), 'no route is written in Money Inbox: it comes from ALLOWED_PAGES')
  assert.ok(/catch \{\s*destination = null\s*\}/.test(branch) && /setNotice\(GOAL_COMMAND_MESSAGES\.expired\)/.test(branch), 'a handoff that cannot be prepared says so and leaves the text alone')
})

test('T3: the goal buttons are decided first; unknown ones do nothing; the detail-less buttons only explain', () => {
  const first = choice.indexOf('resolveGoalCommandChoice(guard, choiceId, guardLists?.activeGoals, Date.now())')
  const generic = choice.indexOf('resolveGuardChoice(guard, choiceId, Date.now())')
  assert.ok(first > 0 && generic > first, 'the goal command is asked before the generic resolver')
  assert.ok(/if \(goalOutcome\.action === 'pick_goal'\) \{\s*setNotice\(null\)\s*setGuard\(goalOutcome\.result\)\s*return\s*\}/.test(choice), 'a pick shows the updated panel; nothing is handed over')
  assert.ok(/goalOutcome\.action === 'expired' \|\| goalOutcome\.action === 'unavailable'/.test(choice))
  assert.ok(/if \(goalOutcome\.action === 'unknown'\) \{\s*setGuard\(null\)\s*return\s*\}/.test(choice), 'a choice that was not offered does nothing')
  const start = between(choice, "} else if (outcome.action === 'start') {", "} else {\n      setNotice(outcome.message || null)")
  const note = start.indexOf('choiceNotice(outcome.choiceId, guardLists?.goals)')
  assert.ok(note > 0 && note < start.indexOf('navigationFromChoice(') && note < start.indexOf('queryFromChoice('), 'the explanation comes before the page and question lookups')
  assert.ok(/outcome\.intent === 'CREATE_GOAL' \|\| outcome\.intent === 'MODIFY_GOAL_CONTRIBUTE'/.test(start))
  assert.ok(/active = |activeGoals/.test(code) && /lists = \{ goals, activeGoals,/.test(code), 'the panel is given the active goals')
  assert.ok(/\.filter\(\(g\) => g\.status === 'active'\)/.test(code))
})

test('T4: the extended panel is the one rendered, and it is built from the base view', () => {
  assert.equal((code.match(/<CommandGuardPanel/g) || []).length, 1)
  assert.ok(/<CommandGuardPanel view=\{budgetCommandView\(learningCommandView\(goalCommandView\(buildGuardView\(guard\), guard, guardLists\?\.activeGoals, Date\.now\(\)\), guard, guardLists\?\.learningItems, Date\.now\(\)\), guard, guardLists\?\.expenseCategories, Date\.now\(\)\)\}/.test(code), 'P9: the budget view wraps the learning view, which wraps the goal view, which wraps the base view')
  assert.equal((code.match(/buildGuardView\(/g) || []).length, 1)
  const guardView = read('lib/command/guardView.js')
  assert.ok(!/goalCommands|goal_commands|continue_goals/.test(guardView), 'guardView.js knows nothing of goal commands (it stays as P4 and P5 left it)')
})

test('T5: Goals reads the handoff only through the hook, after loading, once, and never over an open form', () => {
  assert.equal((goalsCode.match(/useHandoff\('goals'\)/g) || []).length, 1)
  assert.ok(!/takeHandoff\(|putHandoff\(|readHandoff\(|createHandoff\(/.test(goalsCode), 'the page does not touch the store directly')
  const effect = between(goalsCode, 'useEffect(() => {\n    if (!handoff || loading) return', '}, [handoff, loading])')
  assert.ok(effect.indexOf('if (!handoff || loading) return') === effect.indexOf('if (!handoff'), 'it waits for the goals to load')
  const once = effect.indexOf('if (handledHandoff.current === handoff.id) return')
  const mark = effect.indexOf('handledHandoff.current = handoff.id')
  const dialogs = effect.indexOf('goalDialogFromHandoff(handoff, { goals, accounts, activeCount: activeGoalCount, activeLimit: MAX_ACTIVE_GOALS })')
  assert.ok(once > 0 && mark > once && dialogs > mark, 'idempotent by handoff id before anything opens (React Strict Mode runs effects twice)')
  assert.ok(effect.indexOf('done()') > mark && effect.indexOf('done()') < dialogs, 'the handoff is finished with before a dialog opens')
  // an open form is never replaced: the check comes first and the branch opens nothing
  const busy = between(effect, 'if (creating || editingGoal || actionGoal || archivingGoal) {', '\n    }\n')
  assert.ok(effect.indexOf(busy) < dialogs, 'the open-form check is before the new dialog is decided')
  assert.ok(/setActionError\(GOAL_DIALOG_MESSAGES\.dialogOpen\)/.test(busy) && /return/.test(busy))
  assert.ok(!/setCreating|setActionGoal|setEditingGoal|setArchivingGoal|setCommandDialog/.test(busy), 'a dialog the user has open (and what they typed in it) is left exactly as it is')
  assert.ok(/if \(error\) return/.test(effect), 'a page that failed to load opens nothing')
  assert.ok(!/\.insert\(|\.update\(|\.delete\(|\.upsert\(|\.rpc\(/.test(effect), 'the effect only opens dialogs; it writes nothing')
  assert.ok(/setCreating\(true\)/.test(effect) && /setActionGoal\(\{ goal, mode: 'contribution' \}\)/.test(effect), 'it opens the existing dialogs, in contribution mode')
  const hookCall = goalsCode.indexOf("useHandoff('goals')")
  assert.ok(hookCall > 0 && hookCall < goalsCode.indexOf('if (loading) {'), 'all hooks are above the early "Loading" return')
})

test('T6: the Goals page\'s own save, update, archive and reuse code is byte-for-byte what it was', () => {
  const create = between(goals, "async ({ name, targetAmount, targetDate }) => {\n            if (atMaxActiveGoals) {", '            return null\n          }')
  assert.equal(sha(create), '141262c37f70e7d0')
  assert.equal(create.length, 743)
  const edit = between(goals, 'title="Edit goal"', '            return null\n          }')
  assert.equal(sha(edit), '328fdc3d6fa20b1e')
  const archive = between(goals, 'const handleArchive = async () => {', '\n  }\n')
  assert.equal(sha(archive), '4c75361fd50b828e')
  const reuse = between(goals, 'const handleReuse = async (goal) => {', '\n  }\n')
  assert.equal(sha(reuse), '27325f44da2f892c')
  assert.equal((goalsCode.match(/\.insert\(/g) || []).length, 2, 'the same two inserts: create and reuse')
  assert.equal((goalsCode.match(/\.update\(/g) || []).length, 2, 'the same two updates: edit and archive')
  assert.equal((goalsCode.match(/\.delete\(|\.upsert\(|\.rpc\(/g) || []).length, 0)
  assert.equal((goalsCode.match(/from\('goal_contributions'\)\.(insert|update)/g) || []).length, 0, 'Goals writes no contribution itself')
  assert.ok(!/from\('transactions'\)\.(insert|update)/.test(goalsCode))
  // the load is untouched: the same four reads, and the only new read is the select-only read-back of a created goal
  assert.equal((goalsCode.match(/supabase\.from\('goals'\)\.select\(/g) || []).length, 1 + 1, 'the page load + the one read-back')
})

test('T7: ContributeModal gives today\'s defaults without the new props, and its save is byte-for-byte what it was', () => {
  assert.ok(/initialAccountId !== undefined \? initialAccountId : \(accounts\[0\]\?\.id \|\| ''\)/.test(modalCode), 'without the prop the first account is pre-selected, as today')
  assert.ok(/initialAmount !== undefined \? String\(initialAmount\) : ''/.test(modalCode), 'without the prop the amount is empty, as today')
  assert.ok(/onError, initialAmount, initialAccountId, notice \}\) \{/.test(modalCode), 'exactly the three optional props')
  const save = between(modal, 'const handleSave = async () => {', '    onSaved()\n  }')
  assert.equal(sha(save), '3bbf1b5d1b6965a4')
  assert.equal(save.length, 1207)
  assert.equal((modalCode.match(/\.insert\(/g) || []).length, 1, 'one insert')
  assert.ok(/supabase\.from\('goal_contributions'\)\.insert\(/.test(modalCode))
  assert.equal((modalCode.match(/\.update\(/g) || []).length, 1, 'one update: the goal\'s status at the target')
  assert.ok(!/from\('transactions'\)/.test(modalCode) && (modalCode.match(/supabase\.from\(/g) || []).length === 2, 'a contribution is an allocation, never a transaction: the modal touches only goal_contributions and goals')
  assert.ok(!/useHandoff|commandSession|goalDialog|goalCommands/.test(modalCode), 'the dialog knows nothing of commands; the page passes it values')
  assert.ok(/const canSave = numericAmount > 0 && !!accountId && !overLimit/.test(modalCode), 'the dialog\'s own rules still decide')
})

test('T8: memory is written only by Goals, only after a confirmed save from a command, and only when certain', () => {
  assert.equal((goalsCode.match(/\bremember\(/g) || []).length, 2, 'two places: a created goal and a contributed goal')
  const created = between(goalsCode, 'const rememberCreated = (submit) => async (values) => {', '\n  }\n')
  assert.ok(/const fromCommand = commandDialog\?\.kind === 'create'/.test(created), 'whether the dialog came from a command is decided by the command flag')
  assert.ok(created.indexOf("commandDialog?.kind === 'create'") >= 0 && created.indexOf("commandDialog?.kind === 'create'") < created.indexOf('await submit(values)'), 'and it is read before the save')
  assert.ok(/if \(!failure && fromCommand\) \{/.test(created), 'only after a save that did not fail, and only from a command')
  assert.ok(/const created = readErr \? null : pickCreatedGoal\(data, beforeIds, values\)\s*if \(created\) remember\(created, user\.id, Date\.now\(\)\)/.test(created), 'only if exactly one new goal matched (otherwise nothing is remembered)')
  assert.ok(!/\.insert\(|\.update\(|\.delete\(|\.upsert\(/.test(created), 'the read-back is select-only')
  assert.ok(/\.select\('id, name, target_amount, status'\)\.eq\('user_id', user\.id\)\.eq\('name', values\.name\)/.test(created), 'for this user and this name only')
  assert.ok(/catch \{[^}]*\}/.test(created), 'a failed read-back remembers nothing and breaks nothing')
  const contributed = between(goalsCode, 'const rememberContributed = (goal, saved) => async () => {', '\n  }\n')
  assert.ok(/commandDialog\?\.kind === 'contribute' && String\(commandDialog\.goalId\) === String\(goal\.id\)/.test(contributed), 'only a contribution that came from a command, for that goal')
  assert.ok(contributed.indexOf('remember(') < contributed.indexOf('await saved()') && !/\.insert\(|\.update\(/.test(contributed))
  assert.ok(/onSaved=\{rememberContributed\(actionGoal\.goal, async \(\) => \{\s*setActionGoal\(null\)\s*await load\(\)\s*\}\)\}/.test(goalsCode), 'it wraps the existing handler; onSaved runs only after ContributeModal\'s save succeeded')
  assert.ok(/onSubmit=\{rememberCreated\(async \(\{ name, targetAmount, targetDate \}\) => \{/.test(goalsCode))
  assert.ok(!/remember\(/.test(read('components/goals/ContributeModal.jsx')), 'the dialog never writes the memory')
  // the flag lasts only while its dialog is open
  assert.ok(/if \(commandDialog && !creating && !actionGoal\) setCommandDialog\(null\)/.test(goalsCode))
})

test('T9: the transaction path in Money Inbox is still byte-for-byte what it was before P4', () => {
  const START = 'const candidates = buildReviewCandidates(text, {'
  const END = 'setReviewState({ candidates, accounts, categories })'
  const a = input.indexOf(START)
  const e = input.indexOf(END)
  assert.ok(a > 0 && e > a)
  const block = input.slice(a, e + END.length)
  assert.equal(block.length, 951)
  assert.equal(sha(block), '2af2a73c071add86')
  assert.equal((code.match(/buildReviewCandidates\(/g) || []).length, 1)
  assert.ok(!/from\('transactions'\)\.insert|\.insert\(/.test(code), 'the only transaction write is still in ReviewDrawer')
})

test('T10: nobody but the known files imports the new modules', () => {
  const importers = { 'goalCommands.js': [], 'goalDialog.js': [], 'useHandoff.js': [] }
  const walk = (dir) => {
    for (const name of readdirSync(dir)) {
      const full = join(dir, name)
      if (statSync(full).isDirectory()) { walk(full); continue }
      if (!/\.(js|jsx)$/.test(name) || /\.test\.js$/.test(name)) continue
      const rel = full.slice(SRC.length).split(sep).join('/')
      const text = stripComments(readFileSync(full, 'utf8'))
      for (const target of Object.keys(importers)) {
        if (rel.endsWith(`/${target}`) || rel === target) continue
        if (new RegExp(`from\\s*['"][^'"]*/${target.replace('.', '\\.')}['"]`).test(text)) importers[target].push(rel)
      }
    }
  }
  walk(SRC)
  assert.deepEqual(importers['goalCommands.js'], [INPUT])
  assert.deepEqual(importers['goalDialog.js'], [GOALS])
  assert.deepEqual(importers['useHandoff.js'].sort(), [GOALS, 'pages/Budgets.jsx', 'pages/LearningROI.jsx'].sort(), 'P9: Goals, Budgets and Learning')
})

console.log(`\n${passed} passed, ${failed} failed`)
if (failed) process.exit(1)
