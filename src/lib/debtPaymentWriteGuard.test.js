// D4b - the DEBT PAYMENT WRITE GUARD.
//
// A debt payment is an ordinary expense transaction that the user LINKS to a debt. Linking must never become a way
// of writing money records. This test reads the source as text (comments removed first) and proves:
//   - the only writes to `debt_payments` are ONE insert and ONE delete, both in pages/Debts.jsx; no update, no upsert;
//   - the insert writes exactly three fields (user_id, debt_id, transaction_id): no amount, no date, no balance;
//   - the delete removes one link by its id and the user's id, and nothing else;
//   - the debt files write only `debts` and `debt_payments`: no insert/update/delete/upsert on transactions, accounts,
//     goals, goal_contributions or any other table, and no rpc call;
//   - transactions are only READ by the debt files;
//   - the pure libraries and the dialogs import no database client, and no service-role key exists in src.
// The existing transactionWriteGuard.test.js (one insert in ReviewDrawer, one update and one delete in Transactions)
// is untouched and keeps proving that nothing else writes transactions.
// The scanner is itself tested (G9) so the guard cannot pass because the scanner is broken.
import assert from 'node:assert'
import { readFileSync, readdirSync, statSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { join, relative, sep } from 'node:path'

let passed = 0, failed = 0
function test(name, fn) {
  try { fn(); passed++; console.log(`  PASS  ${name}`) } catch (err) { failed++; console.log(`  FAIL  ${name}\n${String(err.message).split('\n').map((l) => '        ' + l).join('\n')}`) }
}

const SRC = fileURLToPath(new URL('../', import.meta.url))
const WRITE_METHODS = ['insert', 'update', 'delete', 'upsert']

export function stripComments(code) {
  return code
    .replace(/\/\*[\s\S]*?\*\//g, ' ')
    .replace(/^[ \t]*\/\/.*$/gm, '')
    .replace(/[ \t]\/\/[ \t].*$/gm, '')
}

/** Every `.from('<table>')` with the methods chained onto it. */
export function findTableChains(code, table) {
  const found = []
  const re = new RegExp(`\\.from\\(\\s*(['"\`])${table}\\1\\s*\\)`, 'g')
  let m
  while ((m = re.exec(code))) {
    let i = re.lastIndex
    const methods = []
    for (;;) {
      const mm = /^\s*\.\s*([A-Za-z_]\w*)\s*\(/.exec(code.slice(i))
      if (!mm) break
      methods.push(mm[1])
      let depth = 1, j = i + mm[0].length
      while (j < code.length && depth > 0) { const c = code[j]; if (c === '(') depth++; else if (c === ')') depth--; j++ }
      i = j
    }
    found.push({ methods })
  }
  return found
}

/** Every table name used in .from('...') in the code. */
export function tablesUsed(code) {
  return [...code.matchAll(/\.from\(\s*['"`]([A-Za-z_]\w*)['"`]\s*\)/g)].map((m) => m[1])
}

function listSourceFiles(dir) {
  const out = []
  for (const name of readdirSync(dir)) {
    const full = join(dir, name)
    if (statSync(full).isDirectory()) { if (name !== 'node_modules') out.push(...listSourceFiles(full)); continue }
    if (/\.(js|jsx)$/.test(name) && !/\.test\.js$/.test(name)) out.push(full)
  }
  return out
}
const rel = (full) => relative(SRC, full).split(sep).join('/')
const files = listSourceFiles(SRC).map((full) => ({ path: rel(full), code: stripComments(readFileSync(full, 'utf8')) }))
const file = (path) => { const f = files.find((x) => x.path === path); assert.ok(f, `${path} not found`); return f }
const debtFiles = files.filter((f) => f.path === 'pages/Debts.jsx' || f.path.startsWith('components/debts/') || /^lib\/debt[A-Z]\w*\.js$/.test(f.path))

console.log('debtPaymentWriteGuard tests\n')

test('G1: the only writes to debt_payments in the whole app are one insert and one delete, both in pages/Debts.jsx', () => {
  const tally = {}
  for (const f of files) for (const c of findTableChains(f.code, 'debt_payments')) for (const m of c.methods) if (WRITE_METHODS.includes(m)) {
    tally[f.path] ||= {}
    tally[f.path][m] = (tally[f.path][m] || 0) + 1
  }
  assert.deepStrictEqual(tally, { 'pages/Debts.jsx': { insert: 1, delete: 1 } })
})

test('G2: the insert writes exactly user_id, debt_id and transaction_id (no amount, no date, no balance)', () => {
  const code = file('pages/Debts.jsx').code
  const m = /from\('debt_payments'\)\.insert\(\s*transactionIds\.map\(\(id\) => \(\{([^}]*)\}\)\)\s*\)/.exec(code)
  assert.ok(m, 'the insert no longer has the expected shape: .insert(transactionIds.map((id) => ({ ... })))')
  const keys = m[1].split(',').map((s) => s.split(':')[0].trim()).filter(Boolean)
  assert.deepStrictEqual(keys, ['user_id', 'debt_id', 'transaction_id'])
})

test('G3: the delete removes one link by its id AND the user id, nothing broader', () => {
  const code = file('pages/Debts.jsx').code
  const chains = findTableChains(code, 'debt_payments').filter((c) => c.methods.includes('delete'))
  assert.equal(chains.length, 1)
  assert.deepStrictEqual(chains[0].methods, ['delete', 'eq', 'eq'])
  assert.ok(/\.delete\(\)\s*\.eq\('id',\s*row\.linkId\)\s*\.eq\('user_id',\s*user\.id\)/.test(code), 'the delete is not filtered by link id and user id')
})

test('G4: the debt files write only `debts` and `debt_payments`; no transaction, account, goal or other table; no rpc', () => {
  const tally = {}
  for (const f of debtFiles) {
    for (const table of new Set(tablesUsed(f.code))) {
      for (const c of findTableChains(f.code, table)) for (const m of c.methods) if (WRITE_METHODS.includes(m)) {
        tally[table] ||= {}
        tally[table][m] = (tally[table][m] || 0) + 1
      }
    }
    assert.ok(!/\.\s*rpc\s*\(/.test(f.code), `${f.path} calls rpc`)
  }
  assert.deepStrictEqual(tally, { debts: { insert: 1, update: 2 }, debt_payments: { insert: 1, delete: 1 } })
})

test('G5: transactions are only READ by the debt files (every chain starts with select), and they are read', () => {
  let reads = 0
  for (const f of debtFiles) for (const c of findTableChains(f.code, 'transactions')) {
    assert.deepStrictEqual(c.methods.filter((m) => WRITE_METHODS.includes(m)), [], `${f.path} writes transactions`)
    assert.equal(c.methods[0], 'select', `${f.path}: a transactions chain does not start with select`)
    reads++
  }
  assert.ok(reads >= 2, 'expected the picker and the linked-payment reads')
})

test('G6: the debt libraries import nothing from supabase or react (relative imports only)', () => {
  for (const name of ['lib/debtPayments.js', 'lib/debtEngine.js', 'lib/debtForm.js', 'lib/debtExport.js', 'lib/isoDate.js']) {
    const f = file(name)
    const specs = [...f.code.matchAll(/import\s[^;]*?from\s*['"]([^'"]+)['"]|import\s*['"]([^'"]+)['"]/g)].map((m) => m[1] || m[2])
    const bad = specs.filter((s) => !s.startsWith('.') || /supabase|react/i.test(s))
    assert.deepStrictEqual(bad, [], `${name} imports ${bad.join(', ')}`)
  }
})

test('G7: the debt dialogs and the card never touch the database: no client import, no .from(), no write call', () => {
  const dialogs = files.filter((f) => f.path.startsWith('components/debts/'))
  assert.ok(dialogs.length >= 4)
  for (const f of dialogs) {
    assert.ok(!/supabaseClient/.test(f.code), `${f.path} imports the database client`)
    assert.ok(!/\.from\(/.test(f.code), `${f.path} calls .from()`)
  }
})

test('G8: no service-role key in the debt files, and no env variable for one anywhere in src (privacy text may mention it)', () => {
  for (const f of debtFiles) assert.ok(!/service[_-]?role/i.test(f.code), `${f.path} mentions a service-role key`)
  for (const f of files) assert.ok(!/import\.meta\.env\.\w*service/i.test(f.code), `${f.path} reads a service-role env variable`)
})

test('G9: the scanner itself works (so the guard cannot pass because the scanner is broken)', () => {
  const one = (src, t = 'debt_payments') => findTableChains(stripComments(src), t).map((c) => c.methods)
  assert.deepStrictEqual(one("await supabase.from('debt_payments').insert(rows)"), [['insert']])
  assert.deepStrictEqual(one("supabase\n  .from('debt_payments')\n  .delete()\n  .eq('id', x)\n  .eq('user_id', u)"), [['delete', 'eq', 'eq']])
  assert.deepStrictEqual(one('supabase.from("debt_payments").select("a, b").eq("x", 1)'), [['select', 'eq']])
  assert.deepStrictEqual(one("supabase.from('debts').update({ a: 1 })"), [], 'another table must be ignored')
  assert.deepStrictEqual(one("// supabase.from('debt_payments').insert(x)"), [], 'a comment must not count')
  assert.deepStrictEqual(one("/* supabase.from('debt_payments').upsert(x) */"), [], 'a block comment must not count')
  assert.deepStrictEqual(one("const q = supabase.from('debt_payments')"), [[]], 'a hidden chain is reported as empty')
  assert.deepStrictEqual(tablesUsed("a.from('x').select(); b.from(\"y\").insert(z)"), ['x', 'y'])
  assert.deepStrictEqual(one("supabase.from('transactions').update({ amount: 1 }).eq('id', 1)", 'transactions'), [['update', 'eq']])
})

test('G10: the guard sees the real files (the debt files exist and the page really writes debt_payments)', () => {
  assert.ok(debtFiles.length >= 8, `only ${debtFiles.length} debt files found`)
  assert.ok(findTableChains(file('pages/Debts.jsx').code, 'debt_payments').length >= 3)
})

test('G11: the Debts page reloads only when the user id changes, so a tab refocus cannot close the dialogs and lose a selection', () => {
  const page = file('pages/Debts.jsx').code
  assert.ok(/useEffect\(\(\) => \{ load\(\) \}, \[user\?\.id\]\)/.test(page), 'the load effect must depend on user?.id')
  assert.ok(!/useEffect\(\(\) => \{ load\(\) \}, \[user\]\)/.test(page), 'the load effect must not depend on the user object')
})

console.log(`\n${passed} passed, ${failed} failed`)
if (failed > 0) process.exit(1)
