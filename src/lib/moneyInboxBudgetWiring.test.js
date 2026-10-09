// P9 (Money Inbox command layer) — WIRING TESTS FOR BUDGET COMMANDS (X1–X12).
//
// There is no React test setup in this project, so these read the source as text and prove
// how a budget command travels and who is allowed to write:
//   X1  Money Inbox never writes budgets; it prepares a handoff in three places only (goal, learning, budget)
//   X2  Continue = putHandoff, then the page table's route, then goTo, in that order
//   X3  the budget buttons are decided after the goal and learning ones and before the generic ones
//   X4  the budget view wraps the learning view; guardView.js knows nothing of budget commands
//   X5  the Budgets page reads the handoff only through the hook, after loading, once, never over a form or a recipe in progress
//   X6  the Budgets page's own save, delete and row code is byte-for-byte what it was
//   X7  the recipe: only two optional props were added; its parsing, suggestion and save code is byte-for-byte what it was
//   X8  without a command the recipe gets exactly today's month, exclusions and after-save behaviour
//   X9  the form: today's defaults without the new props; the new props only pre-fill and explain
//   X10 the Budgets page keeps no memory (decision 6) and imports only the hook and the dialog module
//   X11 the files that must not change did not change; ReviewDrawer and the transaction path are untouched
//   X12 the only writers of budgets are budgetSave.js and the Budgets page (delete)
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
const PAGE = 'pages/Budgets.jsx'
const RECIPE = 'components/budgets/BudgetRecipeFlow.jsx'
const input = read(INPUT)
const code = stripComments(input)
const page = read(PAGE)
const pageCode = stripComments(page)
const recipe = read(RECIPE)
const recipeCode = stripComments(recipe)
const choice = between(code, 'const handleGuardChoice = async (choiceId) => {', '\n  }\n')

test('X1: Money Inbox never writes; it prepares a handoff in exactly three places (goal, learning, budget), all inside the choice handler', () => {
  assert.ok(!/\.(insert|update|upsert|delete|rpc)\(/.test(code), 'no write or rpc in MoneyInboxInput')
  assert.equal((code.match(/putHandoff\(/g) || []).length, 4, 'P8b adds the offer hand-off outside the choice handler')
  assert.equal((choice.match(/putHandoff\(/g) || []).length, 3)
  assert.equal((code.match(/\.from\('/g) || []).length, 16, 'P10 adds the two salary reads (salary_structures, salary_components); P9 added none: spending categories come from the categories list it already reads')
  assert.ok(code.includes("c.kind === 'expense'"), 'spending categories are picked from the rows already read')
  assert.ok(!/\bremember\(|rememberGoal\(|takeHandoff\(|useHandoff|clearCommandSession\(/.test(code))
})

test('X2: Continue = putHandoff, then the route from the page table, then goTo — in that order, once', () => {
  const branch = between(choice, "if (budgetOutcome.action === 'hand_off') {", '\n    }\n')
  const p = branch.indexOf('putHandoff(budgetOutcome.pending, user.id, Date.now())')
  const n = branch.indexOf('navigationFromChoice(`open_${handoff.page}`)')
  const g = branch.indexOf('goTo(destination)')
  assert.ok(p > 0 && n > p && g > n, 'put, then route, then go')
  assert.equal((branch.match(/goTo\(/g) || []).length, 1)
  assert.equal((code.match(/\bgoTo\(/g) || []).length, 8, 'P8b adds the offer hand-off; P10 adds Open Salary and the pension Open buttons')
  assert.equal((code.match(/navigate\(/g) || []).length, 1, 'the router is still called in exactly one place (goTo)')
  assert.ok(!/'\/budgets'/.test(code), 'no route is written in Money Inbox: it comes from ALLOWED_PAGES')
  assert.ok(/catch \{\s*destination = null\s*\}/.test(branch) && /setNotice\(BUDGET_COMMAND_MESSAGES\.expired\)/.test(branch))
})

test('X3: goal buttons first, then learning, then budget, then the generic ones; unknown ones do nothing; detail-less ones only explain', () => {
  const g = choice.indexOf('resolveGoalCommandChoice(guard, choiceId, guardLists?.activeGoals, Date.now())')
  const l = choice.indexOf('resolveLearningCommandChoice(guard, choiceId, guardLists?.learningItems, Date.now())')
  const b = choice.indexOf('resolveBudgetCommandChoice(guard, choiceId, guardLists?.expenseCategories, Date.now())')
  const generic = choice.indexOf('resolveGuardChoice(guard, choiceId, Date.now())')
  assert.ok(g > 0 && l > g && b > l && generic > b)
  assert.ok(/if \(budgetOutcome\.action === 'pick_category'\) \{\s*setNotice\(null\)\s*setGuard\(budgetOutcome\.result\)\s*return\s*\}/.test(choice))
  assert.ok(/budgetOutcome\.action === 'expired' \|\| budgetOutcome\.action === 'unavailable'/.test(choice))
  assert.ok(/if \(budgetOutcome\.action === 'unknown'\) \{\s*setGuard\(null\)\s*return\s*\}/.test(choice))
  const start = between(choice, "} else if (outcome.action === 'start') {", "} else {\n      setNotice(outcome.message || null)")
  const goalNotice = start.indexOf('choiceNotice(outcome.choiceId')
  const learningNotice = start.indexOf('learningChoiceNotice(outcome.choiceId, guardLists?.learningItems)')
  const budgetNotice = start.indexOf('budgetChoiceNotice(outcome.choiceId)')
  const nav = start.indexOf("outcome.intent === 'NAVIGATE'")
  const query = start.indexOf('queryFromChoice(')
  assert.ok(goalNotice > 0 && learningNotice > goalNotice && budgetNotice > learningNotice && nav > budgetNotice && query > nav, 'explain first, then navigate, then question')
  assert.ok(/outcome\.intent === 'CREATE_BUDGET_MONTH' \|\| outcome\.intent === 'MODIFY_BUDGET_AMOUNT'/.test(start))
})

test('X4: one panel, built from the base view through the goal, learning and budget views; guardView.js knows nothing of budget commands', () => {
  assert.equal((code.match(/<CommandGuardPanel/g) || []).length, 1)
  assert.equal((code.match(/buildGuardView\(/g) || []).length, 1)
  assert.ok(code.includes('budgetCommandView(learningCommandView(goalCommandView(buildGuardView(guard), guard, guardLists?.activeGoals, Date.now()), guard, guardLists?.learningItems, Date.now()), guard, guardLists?.expenseCategories, Date.now())'))
  assert.ok(!/budgetCommands|continue_budgets|pick_budget/.test(read('lib/command/guardView.js')))
  assert.equal(sha(read('lib/command/guardView.js')), '227b98b090331a63', 'guardView.js is byte-for-byte what P4/P5 left')
})

test('X5: Budgets reads the handoff only through the hook, after loading, once, and never over a form, a delete or a recipe in progress', () => {
  assert.equal((pageCode.match(/useHandoff\('budgets'\)/g) || []).length, 1)
  assert.ok(!/takeHandoff\(|putHandoff\(|readHandoff\(|createHandoff\(/.test(pageCode))
  const effect = between(pageCode, 'useEffect(() => {\n    if (!handoff || loading) return', '}, [handoff, loading])')
  const once = effect.indexOf('if (handledHandoff.current === handoff.id) return')
  const mark = effect.indexOf('handledHandoff.current = handoff.id')
  const done = effect.indexOf('done()')
  const busy = effect.indexOf('if (formOpen || deletingBudget) {')
  const recipeBusy = effect.indexOf('if (recipeBusyRef.current) {')
  const decide = effect.indexOf('budgetDialogFromHandoff(handoff, { budgets, categories, currentMonth: currentMonthValueForInbox })')
  assert.ok(once > 0 && mark > once && done > mark && busy > done && recipeBusy > busy && decide > recipeBusy, 'once per id, consumed, form check, recipe check, then decide')
  assert.ok(/if \(formOpen \|\| deletingBudget\) \{\s*setCommandMessage\(BUDGET_DIALOG_MESSAGES\.formOpen\)\s*return\s*\}/.test(effect), 'an open form is never replaced')
  assert.ok(/if \(recipeBusyRef\.current\) \{\s*setCommandMessage\(BUDGET_DIALOG_MESSAGES\.recipeBusy\)\s*return\s*\}/.test(effect), 'a recipe in progress is never replaced')
  assert.ok(!/setCreating|setEditingBudget|setRecipe/.test(effect.slice(busy, decide)), 'nothing is opened or changed before the checks pass')
  assert.ok(/const formOpen = creating \|\| !!editingBudget/.test(pageCode))
  assert.ok(/\{ kind: 'edit'/.test(effect) && /\{ kind: 'create'/.test(effect))
  assert.ok(!/supabase|saveBudgetRow|\.insert\(|\.update\(|handleDelete\(/.test(effect), 'the effect only opens the recipe or a form; it does not save')
  assert.ok(/if \(commandDialog && !formOpen\) setCommandDialog\(null\)/.test(pageCode), 'the command flag lasts only while its form is open')
})

test('X6: the Budgets page\'s own delete, create-save and edit-save code, helpers and row display are byte-for-byte what they were', () => {
  const del = between(page, '  const handleDelete = async () => {', '  if (loading) {')
  const create = between(page, 'onSubmit={async ({ categoryId, amount, month }) => {', 'await load()\n            return null\n          }}')
  const edit = between(page, 'onSubmit={async ({ amount, month }) => {', 'await load()\n            return null\n          }}')
  assert.equal(sha(del), 'd0e7b70bb3fb001f')
  assert.equal(sha(create), '1fb0779f1663d7d5')
  assert.equal(sha(edit), '65a94872cf09e263')
  assert.equal(sha(between(page, 'function monthRange(monthValue) {', '\nexport default function Budgets()')), 'ba35f7d1ed35ab94')
  assert.equal(sha(between(page, 'function BudgetRow(', '\nfunction BudgetFormModal(')), '5fe262ff1b7e7941')
  assert.equal(sha(page.slice(page.indexOf('function ConfirmDeleteModal('))), '088a64aa43418d48')
  assert.equal((pageCode.match(/saveBudgetRow\(/g) || []).length, 2, 'the page still saves in exactly two places')
  assert.equal((pageCode.match(/supabase\.from\('budgets'\)\.delete\(\)/g) || []).length, 1)
})

test('X7: the recipe gained two optional props only; its parsing, suggestion and save code is byte-for-byte what it was', () => {
  assert.ok(recipe.includes('budgetedCategoryIdsThisMonth, targetMonth, onSaved, notice, onBusyChange }) {'))
  const logic = between(recipe, '  const startCooking = () => {', '  return (\n    <div className="bg-surface')
  assert.equal(sha(logic), '5ee381abad8bda59', 'start, build, save, add-missing and reset code unchanged')
  assert.equal((recipeCode.match(/saveBudgetRow\(/g) || []).length, 2)
  assert.ok(!/command\/|useHandoff|commandSession|budgetDialog|budgetCommands/.test(recipeCode), 'the recipe knows nothing of commands; it only reports "busy" and shows a notice')
  assert.ok(/const busy = step !== 'input' \|\| inputText\.trim\(\) !== ''/.test(recipeCode), 'busy = anything past the empty input box')
  assert.ok(/useEffect\(\(\) => \{\s*if \(busyRef\.current\) busyRef\.current\(busy\)\s*\}, \[busy\]\)/.test(recipeCode))
  assert.ok(!/busyRef\.current\(false\)/.test(recipeCode), 'only the busy flag is reported: on mount (a rebuilt recipe reports finished) and on every change')
  assert.ok(recipeCode.includes('{Array.isArray(notice) && notice.length > 0 && (') && recipeCode.includes('data-testid="command-notice"'))
})

test('X8: without a command the recipe gets today\'s month, today\'s exclusions and today\'s after-save jump', () => {
  assert.ok(pageCode.includes('const [recipeMonth, setRecipeMonth] = useState(currentMonthValue())'))
  assert.ok(pageCode.includes('const [viewMonth, setViewMonth] = useState(currentMonthValue())'), 'the first view is unchanged')
  assert.ok(/recipeMonth === currentMonthValueForInbox\s*\?\s*currentMonthBudgetedCategoryIds\s*:\s*budgets\.filter\(\(b\) => b\.period_start === recipeMonthStart\)\.map\(\(b\) => b\.category_id\)/.test(pageCode), 'the current month uses the very same exclusion list as before; another month excludes that month\'s own budgets')
  const el = between(pageCode, '<BudgetRecipeFlow', '/>')
  assert.ok(el.includes('budgetedCategoryIdsThisMonth={recipeBudgetedCategoryIds}') && el.includes('targetMonth={recipeMonth}'))
  assert.ok(/onSaved=\{async \(\) => \{\s*await load\(\)\s*setViewMonth\(recipeMonth\)\s*\}\}/.test(el), 'after a save the view goes to the month that was built (this month by default)')
  assert.ok(pageCode.includes('const currentMonthValueForInbox = useMemo(() => currentMonthValue(), [])'))
  // the month only changes by a command, and goes back to this month when the recipe is finished or by the user
  assert.equal((pageCode.match(/setRecipeMonth\(/g) || []).length, 3, 'command, finished recipe, and the "Use this month instead" button')
  assert.ok(/if \(wasBusy && !busy\) \{\s*setRecipeMonth\(currentMonthValueForInbox\)/.test(pageCode))
  assert.ok(pageCode.includes('Use this month instead') && /recipeMonth !== currentMonthValueForInbox && !recipeBusy/.test(pageCode), 'the button is shown only when the month was changed and the user is not mid-recipe')
})

test('X9: the form is the same without the new props; the new props only pre-fill and explain', () => {
  const sig = between(page, 'function BudgetFormModal({', '}) {')
  assert.ok(/lockCategory = false,\s*initialCategoryId = '',\s*initialAmount = '',\s*initialMonth,\s*notice = null,/.test(sig))
  assert.ok(page.includes('const canSave = !!categoryId && Number(amount) > 0 && !!month'), 'the form\'s own rule for saving')
  assert.ok(page.includes("{saving ? 'Saving...' : submitLabel}") && page.includes('submitLabel="Save"') && page.includes('submitLabel="Create budget"'), 'the button words the banners promise')
  assert.ok(pageCode.includes('{Array.isArray(notice) && notice.length > 0 && (') && pageCode.includes('data-testid="command-notice"'))
  const create = between(pageCode, 'title="New budget"', 'onClose={() => setCreating(false)}')
  assert.ok(create.includes("initialCategoryId={commandDialog?.kind === 'create' ? commandDialog.prefill.categoryId : undefined}") && create.includes("initialAmount={commandDialog?.kind === 'create' ? commandDialog.prefill.amount : undefined}"), 'undefined falls back to the form\'s own defaults')
  const edit = between(pageCode, 'title="Edit budget"', 'onClose={() => setEditingBudget(null)}')
  assert.ok(edit.includes('lockCategory') && edit.includes('initialCategoryId={editingBudget.category_id}') && edit.includes('initialMonth={editingBudget.period_start.slice(0, 7)}'))
  assert.ok(edit.includes("commandDialog.budgetId === editingBudget.id ? commandDialog.prefill.amount : editingBudget.amount"), 'only that row, only while the command is open')
  assert.ok(!/month:\s*commandDialog|setMonth\(commandDialog/.test(pageCode), 'the month field is the form\'s own')
})

test('X10: Budgets keeps no memory (decision 6) and imports only the hook and the dialog module', () => {
  assert.ok(!/commandSession|remember\(|memoryFor|commandContext/.test(pageCode))
  const imports = [...pageCode.matchAll(/from '([^']*)'/g)].map((m) => m[1]).filter((s) => /lib\/(useHandoff|command)/.test(s))
  assert.deepEqual(imports, ['../lib/useHandoff.js', '../lib/command/budgetDialog.js'])
  assert.ok(!/budgetMemory|rememberBudget/.test(code + pageCode + read('lib/command/budgetCommands.js')))
})

test('X11: locked files are byte-for-byte what they were; ReviewDrawer and the transaction path are untouched', () => {
  const pins = {
    'lib/budgetRecipe.js': 'cc273e25d97dad28', 'lib/budgetSave.js': 'e2499dfb17cba90d', 'lib/budgetEngine.js': '50142395b7358185',
    'lib/command/interpreter.js': 'ea8273109afea4f9', 'lib/command/handoff.js': '729b0d35a5a0d999', 'lib/commandSession.js': '41bd5a720a25ae56',
    'lib/useHandoff.js': 'a5771b309e68f7ac', 'components/money-inbox/ReviewDrawer.jsx': 'bf1359b4811e4307' /* P8b: one optional onSaved prop, called after a real save */,
  }
  for (const [file, expected] of Object.entries(pins)) assert.equal(sha(read(file)), expected, file)
  const START = 'const candidates = buildReviewCandidates(text, {'
  const END = 'setReviewState({ candidates, accounts, categories })'
  const a = input.indexOf(START), e = input.indexOf(END)
  assert.ok(a > 0 && e > a)
  const block = input.slice(a, e + END.length)
  assert.equal(block.length, 951)
  assert.equal(sha(block), '2af2a73c071add86')
})

test('X12: the only writers of budgets are budgetSave.js and the Budgets page (delete); nobody else imports the new modules', () => {
  const writers = []
  const importers = { 'budgetCommands.js': [], 'budgetDialog.js': [] }
  const walk = (dir) => {
    for (const name of readdirSync(dir)) {
      const full = join(dir, name)
      if (statSync(full).isDirectory()) { walk(full); continue }
      if (!/\.(js|jsx)$/.test(name) || /\.test\.js$/.test(name)) continue
      const rel = full.slice(SRC.length).split(sep).join('/')
      const text = stripComments(readFileSync(full, 'utf8'))
      if (/from\('budgets'\)\s*\.(insert|update|upsert|delete)\(/.test(text.replace(/\n\s*/g, ' ')) || /from\('budgets'\)\s*\?\s*\.(insert|update)/.test(text)) writers.push(rel)
      if (/\bfrom\('budgets'\)/.test(text) && /\.(insert|update|upsert|delete)\(/.test(text.slice(text.indexOf("from('budgets')"), text.indexOf("from('budgets')") + 160)) && !writers.includes(rel)) writers.push(rel)
      for (const target of Object.keys(importers)) {
        if (rel.endsWith(`/${target}`) || rel === target) continue
        if (new RegExp(`from\\s*['"][^'"]*/${target.replace('.', '\\.')}['"]`).test(text)) importers[target].push(rel)
      }
    }
  }
  walk(SRC)
  assert.deepEqual(writers.sort(), ['lib/budgetSave.js', PAGE].sort())
  assert.deepEqual(importers['budgetCommands.js'], [INPUT])
  assert.deepEqual(importers['budgetDialog.js'], [PAGE])
})

console.log(`\n${passed} passed, ${failed} failed`)
if (failed) process.exit(1)
