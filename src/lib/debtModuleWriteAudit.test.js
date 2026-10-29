// D7 - STATIC WRITE-SITE AUDIT. Reads every product file under src/ as text (comments removed) and inventories every database
// mutation call: insert, update, delete, upsert and rpc. The full inventory is PINNED below: a new or moved write site anywhere
// in CountWise fails this test until it is reviewed on purpose. Debt-table writes are then compared with what D3 and D4b approved.
// Nothing here runs SQL or connects to a database.
import assert from 'node:assert'
import { readFileSync, readdirSync, statSync } from 'node:fs'
import { createHash } from 'node:crypto'
import { fileURLToPath } from 'node:url'
import { join } from 'node:path'
import { validateDebtForm } from './debtForm.js'

let passed = 0, failed = 0
function test(name, fn) {
  try { fn(); passed++; console.log(`  PASS  ${name}`) } catch (err) { failed++; console.log(`  FAIL  ${name}\n${String(err.message).split('\n').map((l) => '        ' + l).join('\n')}`) }
}
const SRC = fileURLToPath(new URL('../', import.meta.url))
const MUTATIONS = ['insert', 'update', 'delete', 'upsert', 'rpc']

// ---------- the scanner (tested in A9) ----------
export function stripComments(code) {
  return code.replace(/\/\*[\s\S]*?\*\//g, (m) => m.replace(/[^\n]/g, ' ')).replace(/(^|[^:'"`\\])\/\/[^\n]*/g, '$1')
}
function skipString(s, i) { const q = s[i]; i++; while (i < s.length) { if (s[i] === '\\') { i += 2; continue } if (s[i] === q) return i + 1; i++ } return i }
function balanced(s, i) { // s[i] === '('
  let depth = 0
  for (; i < s.length; i++) {
    const c = s[i]
    if (c === '"' || c === "'" || c === '`') { i = skipString(s, i) - 1; continue }
    if (c === '(') depth++
    else if (c === ')') { depth--; if (depth === 0) return i + 1 }
  }
  return -1
}
export function scanFile(raw) {
  const s = stripComments(raw)
  const out = []
  const re = /\.from\s*\(/g
  let m
  while ((m = re.exec(s))) {
    if (/Array$/.test(s.slice(Math.max(0, m.index - 5), m.index))) continue // Array.from is not a table
    const open = m.index + m[0].length - 1
    const end = balanced(s, open)
    const arg = s.slice(open + 1, end - 1).trim()
    const lit = /^(['"`])([A-Za-z0-9_]+)\1$/.exec(arg)
    const chain = []
    let i = end
    for (;;) {
      const mm = /^\s*\.\s*([A-Za-z_]\w*)\s*\(/.exec(s.slice(i, i + 80))
      if (!mm) break
      const p = i + mm[0].length - 1
      const e = balanced(s, p)
      chain.push(mm[1]); i = e
    }
    out.push({ table: lit ? lit[2] : null, dynamic: !lit, arg, chain, line: s.slice(0, m.index).split('\n').length })
  }
  return out
}
export function walk(dir, out = []) {
  for (const n of readdirSync(dir).sort()) { const p = join(dir, n); if (statSync(p).isDirectory()) walk(p, out); else if (/\.(js|jsx)$/.test(n)) out.push(p) }
  return out
}

/** Every mutation call that hangs off a supabase .from(...) chain. */
export function mutationSites(raw) {
  const out = []
  for (const c of scanFile(raw)) {
    const ops = c.chain.filter((x) => MUTATIONS.includes(x))
    for (const op of ops) out.push({ table: c.table, op, chain: c.chain, line: c.line })
  }
  return out
}
/** Every raw textual occurrence of a mutation method call, whatever it hangs off (to prove the scanner misses none). */
export function rawMutationCount(raw) {
  return (stripComments(raw).match(/\.(insert|update|delete|upsert|rpc)\s*\(/g) || []).length
}

const files = walk(SRC).filter((f) => !/\.test\.js$/.test(f)).map((f) => ({ rel: f.slice(SRC.length).replace(/\\/g, '/'), raw: readFileSync(f, 'utf8').replace(/\r\n/g, '\n') }))
const sites = files.flatMap((f) => mutationSites(f.raw).map((s) => ({ ...s, file: f.rel })))

// ---------- the pinned inventory: [file, table, operation, count] ----------
const INVENTORY = [
  ['App.jsx', 'profiles', 'update', 1],
  ['components/ReminderBanner.jsx', 'user_preferences', 'upsert', 2],
  ['components/goals/ContributeModal.jsx', 'goal_contributions', 'insert', 1],
  ['components/goals/ContributeModal.jsx', 'goals', 'update', 1],
  ['components/money-inbox/ReviewDrawer.jsx', 'transactions', 'insert', 1],
  ['components/settings/AccountsSection.jsx', 'accounts', 'insert', 1],
  ['components/settings/AccountsSection.jsx', 'accounts', 'update', 2],
  ['components/settings/AccountsSection.jsx', 'profiles', 'update', 1],
  ['components/settings/CategoriesSection.jsx', 'categories', 'delete', 1],
  ['components/settings/CategoriesSection.jsx', 'categories', 'insert', 1],
  ['components/settings/CategoriesSection.jsx', 'categories', 'update', 1],
  ['components/settings/CategoriesSection.jsx', 'category_rules', 'insert', 1],
  ['components/settings/NotificationsSection.jsx', 'user_preferences', 'upsert', 2],
  ['components/settings/ProfileSection.jsx', 'profiles', 'update', 3],
  ['components/settings/SecuritySection.jsx', 'user_preferences', 'upsert', 1],
  ['lib/accountSeed.js', 'accounts', 'insert', 1],
  ['lib/budgetSave.js', 'budgets', 'insert', 1],
  ['lib/budgetSave.js', 'budgets', 'update', 1],
  ['lib/categorySeed.js', 'categories', 'insert', 1],
  ['lib/categorySeed.js', 'category_rules', 'insert', 1],
  ['lib/useAccessStage.js', 'user_access', 'upsert', 1],
  ['pages/AdminRuleAssistant.jsx', 'financial_rules', 'insert', 1],
  ['pages/AdminRuleAssistant.jsx', 'financial_rules', 'update', 1],
  ['pages/Budgets.jsx', 'budgets', 'delete', 1],
  ['pages/CTCExplorer.jsx', 'ctc_components', 'insert', 1],
  ['pages/CTCExplorer.jsx', 'ctc_explorations', 'delete', 1],
  ['pages/CTCExplorer.jsx', 'ctc_explorations', 'insert', 1],
  ['pages/Debts.jsx', 'debt_payments', 'delete', 1],
  ['pages/Debts.jsx', 'debt_payments', 'insert', 1],
  ['pages/Debts.jsx', 'debts', 'insert', 1],
  ['pages/Debts.jsx', 'debts', 'update', 2],
  ['pages/Goals.jsx', 'goals', 'insert', 2],
  ['pages/Goals.jsx', 'goals', 'update', 2],
  ['pages/LearningROI.jsx', 'learning_items', 'delete', 1],
  ['pages/LearningROI.jsx', 'learning_items', 'insert', 1],
  ['pages/LearningROI.jsx', 'learning_items', 'update', 1],
  ['pages/Onboarding.jsx', 'profiles', 'upsert', 1],
  ['pages/Salary.jsx', 'salary_components', 'insert', 1],
  ['pages/Salary.jsx', 'salary_structures', 'delete', 1],
  ['pages/Salary.jsx', 'salary_structures', 'insert', 1],
  ['pages/Salary.jsx', 'salary_structures', 'update', 3],
  ['pages/Transactions.jsx', 'transactions', 'delete', 1],
  ['pages/Transactions.jsx', 'transactions', 'update', 1],
]
// Calls named like a mutation that are NOT database calls: Set.delete / listener cleanup. Pinned so they cannot hide a real one.
const NOT_DATABASE = [
  ['components/debts/LinkPaymentsModal.jsx', 1],
  ['lib/commandSession.js', 1],
  ['lib/freshSignIn.js', 1],
  ['lib/installPrompt.js', 1],
]

test('A1: the inventory of every database mutation in src/ equals the pinned list (a new write site fails here)', () => {
  const got = new Map()
  for (const s of sites) { const k = `${s.file}|${s.table}|${s.op}`; got.set(k, (got.get(k) || 0) + 1) }
  const want = new Map(INVENTORY.map(([f, t, o, n]) => [`${f}|${t}|${o}`, n]))
  assert.deepStrictEqual([...got].sort(), [...want].sort())
  assert.strictEqual(sites.length, 53)
})
test('A2: the scanner misses nothing: every textual mutation call is either in the inventory or a pinned non-database call', () => {
  for (const f of files) {
    const found = mutationSites(f.raw).length
    const raw = rawMutationCount(f.raw)
    const extra = (NOT_DATABASE.find(([n]) => n === f.rel) || [null, 0])[1]
    assert.strictEqual(raw, found + extra, `${f.rel}: ${raw} textual mutation calls, ${found} database sites + ${extra} pinned non-database`)
  }
})
test('A3: no rpc call and no dynamic-table WRITE anywhere; the only dynamic table read is the CSV export', () => {
  assert.strictEqual(sites.filter((s) => s.op === 'rpc').length, 0)
  assert.strictEqual(sites.filter((s) => s.table === null).length, 0, 'every write names its table as a literal')
  const real = files.flatMap((f) => scanFile(f.raw).filter((c) => c.dynamic).map((c) => ({ file: f.rel, arg: c.arg, chain: c.chain })))
  assert.deepStrictEqual(real.map((d) => d.file), ['components/settings/DataExportSection.jsx'])
  assert.ok(real[0].chain.every((m) => !MUTATIONS.includes(m)), 'the export only reads')
})
test('A4: debt tables are written ONLY from pages/Debts.jsx, with exactly the operations D3 and D4b approved', () => {
  const debtWrites = sites.filter((s) => s.table === 'debts' || s.table === 'debt_payments')
  assert.ok(debtWrites.every((s) => s.file === 'pages/Debts.jsx'), 'no other file writes a debt table')
  const sig = debtWrites.map((s) => `${s.table}:${s.op}`).sort()
  assert.deepStrictEqual(sig, ['debt_payments:delete', 'debt_payments:insert', 'debts:insert', 'debts:update', 'debts:update'])
  // approved shape: updates and deletes are scoped by id AND user_id; nothing is deleted from debts; no upsert
  for (const s of debtWrites) {
    if (s.op === 'update' || s.op === 'delete') assert.deepStrictEqual(s.chain.filter((m) => m !== 'select'), [s.op, 'eq', 'eq'], `${s.table}:${s.op} is scoped by id and user_id`)
    assert.ok(s.op !== 'upsert' && !(s.table === 'debts' && s.op === 'delete'))
  }
  const page = stripComments(files.find((f) => f.rel === 'pages/Debts.jsx').raw)
  assert.strictEqual((page.match(/\.eq\(\s*'user_id'\s*,\s*user\.id\s*\)/g) || []).length >= 4, true)
})
test('A5: nothing else writes a TRANSACTION, ACCOUNT or GOAL from the debt module (those writes live only in their own pages)', () => {
  const guarded = new Set(['transactions', 'accounts', 'goals', 'goal_contributions'])
  const writers = [...new Set(sites.filter((s) => guarded.has(s.table)).map((s) => s.file))].sort()
  assert.deepStrictEqual(writers, ['components/goals/ContributeModal.jsx', 'components/money-inbox/ReviewDrawer.jsx', 'components/settings/AccountsSection.jsx', 'lib/accountSeed.js', 'pages/Goals.jsx', 'pages/Transactions.jsx'])
  for (const f of files.filter((x) => x.rel.startsWith('components/debts/') || /^lib\/debt/.test(x.rel) || x.rel === 'lib/financialEngine.js')) {
    assert.strictEqual(mutationSites(f.raw).length, 0, `${f.rel} has no database write`)
    assert.ok(!/supabase/i.test(stripComments(f.raw)), `${f.rel} does not reach the database client`)
  }
})
test('A6: Overview and the Planner/indicator code read debts but never write them', () => {
  const overview = files.find((f) => f.rel === 'pages/Overview.jsx').raw
  assert.strictEqual(mutationSites(overview).length, 0)
  const reads = scanFile(overview).filter((c) => c.table === 'debts')
  assert.strictEqual(reads.length, 1); assert.ok(reads[0].chain.includes('select'))
})
test('A7: the fields Debts.jsx writes exist as columns in the migration; the link payload is exactly user_id, debt_id, transaction_id', () => {
  const sql = readFileSync(join(SRC, '../supabase/p16_debts.sql'), 'utf8')
  const body = sql.slice(sql.indexOf('create table debts ('), sql.indexOf('constraint debts_name_valid'))
  const cols = [...body.matchAll(/^\s{2}([a-z_]+)\s+(uuid|text|date|numeric|integer|timestamptz)/gm)].map((m) => m[1])
  assert.deepStrictEqual(cols.sort(), ['annual_rate_pct', 'as_of_accrued_interest', 'as_of_date', 'as_of_outstanding', 'created_at', 'due_day', 'id', 'kind', 'lender', 'monthly_payment', 'name', 'remaining_months', 'status', 'updated_at', 'user_id'])
  const r = validateDebtForm({ name: 'X', kind: 'term_loan', lender: '', asOfDate: '2026-10-01', principal: '1000', accruedInterest: '', ratePct: '10', monthlyPayment: '100', remainingMonths: '12', dueDay: '5' }, '2026-10-15')
  assert.ok(r.ok, JSON.stringify(r))
  for (const k of Object.keys(r.values)) assert.ok(cols.includes(k), `the form writes ${k}, which is a debts column`)
  for (const k of ['id', 'user_id', 'created_at', 'updated_at']) assert.ok(!(k in r.values), `the form never supplies ${k}`)
  const page = stripComments(files.find((f) => f.rel === 'pages/Debts.jsx').raw)
  assert.match(page, /transactionIds\.map\(\(id\) => \(\{ user_id: user\.id, debt_id: debt\.id, transaction_id: id \}\)\)/)
})
test('A8: the engines stay locked (byte-for-byte, line endings ignored)', () => {
  const h = (rel) => createHash('sha256').update(readFileSync(join(SRC, rel), 'utf8').replace(/\r\n/g, '\n')).digest('hex')
  assert.strictEqual(h('lib/debtEngine.js'), '9332303684766340332e1fc8bc774655e1d00e7f756e02d5b364dc34054b5209')
  assert.strictEqual(h('lib/financialEngine.js'), 'a7bd3c87eca213edf1ca46389fc5dc4d8bfa1ef73178d80c0990f677c116098b')
})
test('A9: the scanner itself works (chains over lines, nested parentheses, strings, comments, Array.from)', () => {
  const a = mutationSites("await supabase\n  .from('debts')\n  .update({ a: f(1, (2)) })\n  .eq('id', x).eq('user_id', u)")
  assert.deepStrictEqual(a.map((s) => [s.table, s.op, s.chain.join('>')]), [['debts', 'update', 'update>eq>eq']])
  assert.strictEqual(mutationSites("// supabase.from('debts').insert({})\nconst a = 1").length, 0)
  assert.strictEqual(mutationSites("/* supabase.from('debts').delete() */").length, 0)
  assert.strictEqual(mutationSites("supabase.from('x').select('a, (b)').order('c')").length, 0)
  assert.deepStrictEqual(mutationSites("supabase.from('x').insert([{ s: ')' }])").map((s) => s.op), ['insert'])
  assert.deepStrictEqual(mutationSites("supabase.from('x').insert(a); supabase.from('y').delete().eq('id', 1)").map((s) => s.table + s.op), ['xinsert', 'ydelete'])
  assert.strictEqual(rawMutationCount("set.delete(1); supabase.from('x').insert(a)"), 2)
  assert.strictEqual(scanFile("supabase.from(table).select()")[0].dynamic, true)
  assert.strictEqual(scanFile("Array.from(map.entries())").length, 0)
})

console.log(`\n${passed} passed, ${failed} failed`)
if (failed > 0) process.exit(1)
