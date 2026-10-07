// P1 — tests for the 15 contracts (intents.js).
//
// Besides checking the data is well-formed, these tests pin the DISCIPLINE the
// design depends on: only the salary amount may be estimated, only the budget
// amounts may be suggested, nothing destructive exists, only six pages can be
// navigated to, and the contracts still match the owners' real forms (I6 reads
// the owners' source as text, so a changed form fails here until the contract is
// updated with it — that is the point).
import assert from 'node:assert'
import { readFileSync, readdirSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import * as I from './intents.js'

let passed = 0, failed = 0
function test(name, fn) {
  try { fn(); passed++; console.log(`  PASS  ${name}`) }
  catch (err) { failed++; console.log(`  FAIL  ${name}\n${String(err.message).split('\n').map((l) => '        ' + l).join('\n')}`) }
}

const HERE = new URL('./', import.meta.url)
const readSrc = (rel) => readFileSync(fileURLToPath(new URL(`../../${rel}`, import.meta.url)), 'utf8').replace(/\r\n/g, '\n')
const stripComments = (code) => code
  .replace(/\/\*[\s\S]*?\*\//g, ' ')
  .replace(/^[ \t]*\/\/.*$/gm, '')
  .replace(/[ \t]\/\/[ \t].*$/gm, '')
const contracts = Object.values(I.CONTRACTS)
const SIX_ROUTES = ['/transactions', '/goals', '/budgets', '/learning', '/salary', '/pf-pension']

console.log('intents tests\n')

test('I1: exactly the 15 intents — RECORD 3, CREATE 3, MODIFY 3, QUERY 5, NAVIGATE 1 — and each id starts with its class', () => {
  assert.deepStrictEqual([...I.INTENT_IDS].sort(), [
    'CREATE_BUDGET_MONTH', 'CREATE_GOAL', 'CREATE_LEARNING_ITEM', 'MODIFY_BUDGET_AMOUNT', 'MODIFY_GOAL_CONTRIBUTE',
    'MODIFY_LEARNING_STATUS', 'NAVIGATE', 'QUERY_BALANCE', 'QUERY_BUDGET_LEFT', 'QUERY_GOAL_PROGRESS',
    'QUERY_PENSION_ESTIMATE', 'QUERY_SPEND', 'RECORD_LEARNING_PAYMENT', 'RECORD_SALARY', 'RECORD_TRANSACTION',
  ].sort())
  const count = (cls) => contracts.filter((c) => c.class === cls).length
  assert.deepStrictEqual(['RECORD', 'CREATE', 'MODIFY', 'QUERY', 'NAVIGATE'].map(count), [3, 3, 3, 5, 1])
  for (const c of contracts) assert.ok(c.id === c.class || c.id.startsWith(`${c.class}_`), `${c.id} does not start with ${c.class}`)
  for (const [key, c] of Object.entries(I.CONTRACTS)) assert.strictEqual(key, c.id)
})

test('I2: every contract has every key, with the right type and an allowed value', () => {
  const arr = (v) => Array.isArray(v) && v.every((x) => typeof x === 'string')
  for (const c of contracts) {
    assert.deepStrictEqual(Object.keys(c).sort(), [...I.CONTRACT_KEYS].sort(), `${c.id}: keys differ`)
    assert.ok(I.INTENT_CLASSES.includes(c.class), `${c.id}: class`)
    assert.ok(I.OWNERS.includes(c.owner), `${c.id}: owner`)
    assert.ok(I.FLOWS.includes(c.flow), `${c.id}: flow`)
    assert.ok(I.BECOMES.includes(c.becomes), `${c.id}: becomes`)
    assert.ok(I.RISKS.includes(c.risk), `${c.id}: risk`)
    assert.ok(I.PHASE_ORDER.includes(c.availableFrom), `${c.id}: availableFrom`)
    assert.strictEqual(typeof c.needsConfirmation, 'boolean', `${c.id}: needsConfirmation`)
    assert.ok(c.route === null || typeof c.route === 'string', `${c.id}: route`)
    assert.ok(c.confirmedIn === null || typeof c.confirmedIn === 'string', `${c.id}: confirmedIn`)
    for (const key of ['required', 'optional', 'ownerRequires', 'askWhen', 'mayBeEstimated', 'mayBeSuggested', 'ownerRules', 'stateRules', 'examples']) {
      assert.ok(arr(c[key]), `${c.id}: ${key} must be a list of text`)
    }
    assert.ok(Array.isArray(c.requireOneOf) && c.requireOneOf.every(arr), `${c.id}: requireOneOf`)
    assert.ok(c.answerKind === null || I.ANSWER_KINDS.includes(c.answerKind), `${c.id}: answerKind`)
    assert.ok(c.notice === null || I.NOTICES.includes(c.notice), `${c.id}: notice`)
    assert.ok(c.seeMore === null || typeof c.seeMore === 'string', `${c.id}: seeMore`)
    assert.ok(c.followUp === null || (typeof c.followUp === 'object' && SIX_ROUTES.includes(c.followUp.route)), `${c.id}: followUp`)
    for (const a of c.askWhen) assert.ok(I.ASK_CONDITIONS.includes(a), `${c.id}: unknown ask condition ${a}`)
    assert.deepStrictEqual(c.required.filter((f) => c.optional.includes(f)), [], `${c.id}: a field is both required and optional`)
    assert.ok(c.examples.length > 0, `${c.id}: needs at least one example`)
    for (const f of [...c.mayBeEstimated, ...c.mayBeSuggested]) assert.ok(I.allowedFields(c).includes(f), `${c.id}: ${f} is not a field`)
  }
})

test('I3: risk, outcome and confirmation agree — every change is confirmed in the owner\'s own flow', () => {
  for (const c of contracts) {
    if (c.risk === 'read') {
      assert.strictEqual(c.becomes, 'none', `${c.id}: a read-only intent becomes nothing`)
      assert.strictEqual(c.needsConfirmation, false, `${c.id}: read-only needs no confirmation`)
      assert.strictEqual(c.confirmedIn, null)
      continue
    }
    assert.notStrictEqual(c.becomes, 'none', `${c.id}: a non-read intent must become something`)
    assert.strictEqual(c.needsConfirmation, true, `${c.id}: every non-read intent needs confirmation`)
    assert.strictEqual(c.confirmedIn, c.flow, `${c.id}: it must be confirmed inside its own flow (${c.flow})`)
    assert.ok(['review-drawer', 'owner-dialog', 'owner-page-flow'].includes(c.flow), `${c.id}: flow ${c.flow}`)
    if (c.risk === 'create') assert.strictEqual(c.becomes, 'planned', `${c.id}`)
    if (c.risk === 'financial-write') assert.strictEqual(c.becomes, 'actual', `${c.id}`)
    assert.ok(c.ownerRequires.length > 0, `${c.id}: must say what the owner's form requires`)
  }
})

test('I4: handed-off intents name one of the six routes; in-place intents name none; every route exists in App.jsx', () => {
  const app = readSrc('App.jsx')
  const routeExists = (route) => new RegExp(`path="${route.replace(/[/-]/g, '\\$&')}"`).test(app)
  for (const c of contracts) {
    if (['owner-dialog', 'owner-page-flow'].includes(c.flow)) {
      assert.ok(SIX_ROUTES.includes(c.route), `${c.id}: route ${c.route} is not one of the six`)
    } else {
      assert.strictEqual(c.route, null, `${c.id}: an in-place or router intent has no route`)
    }
    for (const r of [c.route, c.seeMore, c.followUp?.route].filter(Boolean)) {
      assert.ok(SIX_ROUTES.includes(r), `${c.id}: ${r} is not one of the six routes`)
      assert.ok(routeExists(r), `${c.id}: ${r} is not a route in App.jsx`)
    }
  }
})

test('I5: the four-state discipline — only the salary amount is estimated, only budget amounts are suggested, estimates carry a notice', () => {
  assert.deepStrictEqual(contracts.filter((c) => c.mayBeEstimated.length).map((c) => [c.id, c.mayBeEstimated]), [['RECORD_SALARY', ['amount']]])
  assert.deepStrictEqual(contracts.filter((c) => c.mayBeSuggested.length).map((c) => [c.id, c.mayBeSuggested]), [['CREATE_BUDGET_MONTH', ['amounts']]])
  for (const c of contracts) {
    if (c.class === 'QUERY') {
      assert.strictEqual(c.becomes, 'none', c.id)
      assert.ok(I.ANSWER_KINDS.includes(c.answerKind), `${c.id}: a query needs an answerKind`)
    } else {
      assert.strictEqual(c.answerKind, null, `${c.id}: only queries have an answerKind`)
    }
  }
  assert.deepStrictEqual(contracts.filter((c) => c.answerKind === 'estimated').map((c) => c.id), ['QUERY_PENSION_ESTIMATE'])
  assert.strictEqual(I.CONTRACTS.QUERY_PENSION_ESTIMATE.notice, 'ESTIMATE_NOT_PAYMENT_RECORD')
  // Every estimate (a field or an answer) must name a notice, and only estimates do.
  for (const c of contracts) {
    const hasEstimate = c.mayBeEstimated.length > 0 || c.answerKind === 'estimated'
    assert.strictEqual(c.notice !== null, hasEstimate, `${c.id}: a notice if and only if something is estimated`)
  }
  assert.deepStrictEqual(contracts.filter((c) => c.notice).map((c) => c.id).sort(), ['QUERY_PENSION_ESTIMATE', 'RECORD_SALARY'])
})

// What each owner's own form really insists on, read from the source as text.
// If an owner changes its rule, the matching contract must change with it.
function checkOwner({ file, expression, anchors, intents, rules = {} }) {
  const code = stripComments(readSrc(file))
  const matches = [...code.matchAll(expression)]
  assert.strictEqual(matches.length, 1, `${file}: expected exactly one rule expression, found ${matches.length}`)
  const rule = matches[0][1]
  for (const id of intents) {
    const required = I.CONTRACTS[id].ownerRequires
    for (const [field, token] of Object.entries(anchors)) {
      assert.strictEqual(rule.includes(token), required.includes(field),
        `${id}: ${file} ${rule.includes(token) ? 'now requires' : 'no longer requires'} "${field}", but the contract ${required.includes(field) ? 'lists' : 'does not list'} it`)
    }
    for (const [token, mustMention] of Object.entries(rules)) {
      assert.ok(rule.includes(token), `${file}: expected "${token}" in the rule`)
      assert.ok(I.CONTRACTS[id].ownerRules.join(' ').toLowerCase().includes(mustMention), `${id}: ownerRules should mention "${mustMention}"`)
    }
  }
}
test('I6: the contracts still match the owners\' real forms (drift detector)', () => {
  checkOwner({
    file: 'pages/Goals.jsx', expression: /const canSave = ([^\n]+)/g, intents: ['CREATE_GOAL'],
    anchors: { name: 'name.trim()', targetAmount: 'targetAmount', targetDate: 'targetDate' },
  })
  checkOwner({
    file: 'components/goals/ContributeModal.jsx', expression: /const canSave = ([^\n]+)/g, intents: ['MODIFY_GOAL_CONTRIBUTE'],
    anchors: { amount: 'numericAmount', account: 'accountId' }, rules: { overLimit: 'available balance' },
  })
  checkOwner({
    file: 'pages/Budgets.jsx', expression: /const canSave = ([^\n]+)/g, intents: ['MODIFY_BUDGET_AMOUNT'],
    anchors: { category: 'categoryId', amount: 'amount', month: 'month' },
  })
  // The review screen's rule is a function body, not one line.
  const review = stripComments(readSrc('components/money-inbox/ReviewDrawer.jsx')).match(/function canConfirmRow\(row\) \{([\s\S]*?)\n\}/)
  assert.ok(review, 'canConfirmRow not found in ReviewDrawer.jsx')
  const anchors = { amount: 'row.amount', type: 'row.type', account: 'row.accountId', toAccount: 'row.toAccountId', category: 'row.categoryId', date: 'row.date' }
  for (const id of ['RECORD_TRANSACTION', 'RECORD_SALARY', 'RECORD_LEARNING_PAYMENT']) {
    for (const [field, token] of Object.entries(anchors)) {
      assert.strictEqual(review[1].includes(token), I.CONTRACTS[id].ownerRequires.includes(field), `${id}: review screen vs contract disagree about "${field}"`)
    }
  }
  // The learning form refuses an empty name — and nothing else.
  assert.ok(/if \(!form\.name\.trim\(\)\)/.test(stripComments(readSrc('pages/LearningROI.jsx'))), 'the learning form no longer checks the name')
  for (const id of ['CREATE_LEARNING_ITEM', 'MODIFY_LEARNING_STATUS']) assert.deepStrictEqual(I.CONTRACTS[id].ownerRequires, ['name'])
})

test('I7: nothing destructive exists, and the change surface is exactly the three approved commands', () => {
  for (const id of I.INTENT_IDS) assert.ok(!/DELETE|ARCHIVE|REMOVE|CLEAR/.test(id), `${id} looks destructive`)
  assert.deepStrictEqual(contracts.filter((c) => c.class === 'MODIFY').map((c) => c.id).sort(),
    ['MODIFY_BUDGET_AMOUNT', 'MODIFY_GOAL_CONTRIBUTE', 'MODIFY_LEARNING_STATUS'])
})

test('I8: exactly six allowed pages, each a real route, and none of the excluded pages', () => {
  const app = readSrc('App.jsx')
  assert.deepStrictEqual(I.ALLOWED_PAGES.map((p) => [p.id, p.route]), [
    ['transactions', '/transactions'], ['goals', '/goals'], ['budgets', '/budgets'],
    ['learning', '/learning'], ['salary', '/salary'], ['pension', '/pf-pension'],
  ])
  for (const p of I.ALLOWED_PAGES) assert.ok(app.includes(`path="${p.route}"`), `${p.route} is not a route in App.jsx`)
  const excluded = ['/settings', '/charts', '/reports', '/insights', '/ctc-explorer', '/money-options']
  for (const p of I.ALLOWED_PAGES) {
    assert.ok(!excluded.includes(p.route) && !p.route.startsWith('/admin'), `${p.route} is an excluded page`)
  }
  assert.strictEqual(I.pageRoute('pension'), '/pf-pension')
  assert.throws(() => I.pageRoute('settings'))
})

test('I9: availability — with BUILT_THROUGH = P1 only today\'s path is available; unknown phases and intents throw', () => {
  assert.strictEqual(I.BUILT_THROUGH, 'P1')
  assert.deepStrictEqual(I.INTENT_IDS.filter((id) => I.isIntentAvailable(id)), ['RECORD_TRANSACTION'])
  assert.ok(I.phaseIndex('P0') < I.phaseIndex('P1') && I.phaseIndex('P9') < I.phaseIndex('P10'))
  assert.strictEqual(I.PHASE_ORDER.length, 14)
  assert.throws(() => I.phaseIndex('P99'))
  assert.throws(() => I.isIntentAvailable('NOT_AN_INTENT'))
})

test('I10: the folder is pure — only the three known modules, importing only each other, with no clock, randomness or database', () => {
  const files = readdirSync(HERE).filter((f) => f.endsWith('.js') && !f.endsWith('.test.js')).sort()
  assert.deepStrictEqual(files, ['amountReader.js', 'entityResolver.js', 'expectedRouting.js', 'intents.js', 'interpreter.js', 'pendingAction.js', 'periodParser.js'], 'a new module needs a deliberate review')
  for (const f of files) {
    const code = stripComments(readFileSync(fileURLToPath(new URL(f, HERE)), 'utf8'))
    const specs = [...code.matchAll(/import\s[^;]*?from\s*['"]([^'"]+)['"]|import\s*['"]([^'"]+)['"]/g)].map((m) => m[1] || m[2])
    for (const s of specs) assert.ok(/^\.\/[\w]+\.js$/.test(s) && files.includes(s.slice(2)), `${f} imports "${s}"`)
    assert.ok(!/\bimport\s*\(|\brequire\s*\(/.test(code), `${f}: dynamic import or require`)
    assert.ok(!/Date\.now|new\s+Date\s*\(\s*\)|performance\.now|Math\.random|crypto\./.test(code), `${f} reads the clock or uses randomness`)
    assert.ok(!/supabase|react|router/i.test(code.replace(/router/g, '')), `${f} mentions the database or React`)
  }
})

test('I11: the five clarification reasons are exactly those approved, and the contracts are deeply frozen', () => {
  assert.deepStrictEqual([...I.CLARIFY_REASONS], ['competing_meaning', 'bare_word', 'mixed_input', 'ambiguous_reference', 'missing_required'])
  assert.throws(() => { I.CONTRACTS.CREATE_GOAL.becomes = 'actual' }, TypeError)
  assert.throws(() => { I.CONTRACTS.CREATE_GOAL.required.push('x') }, TypeError)
  assert.throws(() => { I.CONTRACTS.NEW_INTENT = {} }, TypeError)
  assert.throws(() => { I.ALLOWED_PAGES.push({}) }, TypeError)
  assert.throws(() => { I.ALLOWED_PAGES[0].route = '/settings' }, TypeError)
  assert.ok(Object.isFrozen(I.CONTRACTS.MODIFY_BUDGET_AMOUNT.requireOneOf[0]))
})

console.log(`\n${passed} passed, ${failed} failed`)
if (failed > 0) process.exit(1)
