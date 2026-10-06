// P0 (Money Inbox command layer) — the SINGLE-WRITER GUARD.
//
// Money Inbox's command layer must never become a second way of writing
// transactions. This test reads the source as text and proves, today:
//   - exactly ONE place in the app inserts a transaction (ReviewDrawer.jsx),
//     with exactly ten fields;
//   - the only other writes to the table are one update and one delete, both in
//     pages/Transactions.jsx;
//   - MoneyInboxInput.jsx (the file the command guard will edit in P4) writes
//     nothing itself;
//   - the pure parser files import nothing from supabase or react;
//   - if a src/lib/command/ folder exists (P1 onwards), it contains no database
//     write and does not import the database client.
//
// HOW IT SCANS: comments are removed first (so a commented-out insert does not
// count), then each `.from('transactions')` is followed through its method chain
// (so a chain split over several lines is still seen). The scanner is itself
// tested (W6) so the guard cannot pass because the scanner is broken.
//
// KNOWN LIMIT: a call like `const q = supabase.from('transactions'); q.insert(x)`
// splits the chain across statements. W1b fails if anyone writes it that way,
// instead of letting it hide from the scan.
import assert from 'node:assert'
import { readFileSync, readdirSync, statSync, existsSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { join, relative, sep } from 'node:path'

let passed = 0, failed = 0
function test(name, fn) {
  try { fn(); passed++; console.log(`  PASS  ${name}`) }
  catch (err) { failed++; console.log(`  FAIL  ${name}\n${String(err.message).split('\n').map((l) => '        ' + l).join('\n')}`) }
}

const SRC = fileURLToPath(new URL('../', import.meta.url))
const WRITE_METHODS = ['insert', 'update', 'delete', 'upsert']

// ---------- the scanner ----------
export function stripComments(code) {
  return code
    .replace(/\/\*[\s\S]*?\*\//g, ' ')       // block comments (also {/* ... */} in JSX)
    .replace(/^[ \t]*\/\/.*$/gm, '')          // whole-line comments
    .replace(/[ \t]\/\/[ \t].*$/gm, '')       // trailing comments (needs spaces around //, so URLs survive)
}

/** Every `.from('<table>')` in the code, with the methods chained onto it. */
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

/** The top-level keys of the first object literal found after `marker` + '({'. */
export function objectKeysAfter(code, marker) {
  const start = code.indexOf(marker)
  if (start < 0) return null
  const open = code.indexOf('({', start)
  if (open < 0) return null
  const keys = []
  let depth = 0, i = open + 1, quote = null, expectKey = false
  for (; i < code.length; i++) {
    const c = code[i]
    if (quote) { if (c === '\\') i++; else if (c === quote) quote = null; continue }
    if (c === "'" || c === '"' || c === '`') { quote = c; continue }
    if (c === '{' || c === '(' || c === '[') { depth++; if (depth === 1 && c === '{') expectKey = true; continue }
    if (c === '}' || c === ')' || c === ']') { depth--; if (depth === 0) break; continue }
    if (depth === 1) {
      if (c === ',') { expectKey = true; continue }
      if (expectKey && /[A-Za-z_]/.test(c)) {
        const word = /^[A-Za-z_]\w*/.exec(code.slice(i))[0]
        if (/^\s*:/.test(code.slice(i + word.length))) keys.push(word)
        expectKey = false
        i += word.length - 1
      }
    }
  }
  return keys
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
const readCode = (full) => stripComments(readFileSync(full, 'utf8'))

const files = listSourceFiles(SRC).map((full) => ({ path: rel(full), full, code: readCode(full) }))
const chains = files.flatMap((f) => findTableChains(f.code, 'transactions').map((c) => ({ file: f.path, methods: c.methods })))

console.log('transactionWriteGuard tests\n')

test('W1: exactly one place in the app inserts a transaction — ReviewDrawer.jsx, exactly once; nothing upserts', () => {
  const inserts = chains.filter((c) => c.methods.includes('insert')).map((c) => c.file)
  assert.deepStrictEqual(inserts, ['components/money-inbox/ReviewDrawer.jsx'])
  assert.deepStrictEqual(chains.filter((c) => c.methods.includes('upsert')), [])
})

test('W1b: every use of from(\'transactions\') is a visible method chain (nothing hides in a variable)', () => {
  const hidden = chains.filter((c) => c.methods.length === 0).map((c) => c.file)
  assert.deepStrictEqual(hidden, [])
})

test('W2: the insert in ReviewDrawer.jsx writes exactly the ten known fields', () => {
  const drawer = files.find((f) => f.path === 'components/money-inbox/ReviewDrawer.jsx')
  assert.ok(/\.insert\(\s*payload\s*\)/.test(drawer.code), 'the insert no longer takes `payload`')
  assert.deepStrictEqual(objectKeysAfter(drawer.code, 'const payload = toInsert.map('), [
    'user_id', 'account_id', 'to_account_id', 'category_id', 'type',
    'amount', 'description', 'transaction_date', 'spending_context', 'original_input',
  ])
})

test('W3: updates and deletes on transactions happen only in pages/Transactions.jsx (one of each)', () => {
  const tally = {}
  for (const c of chains) for (const m of c.methods) if (m === 'update' || m === 'delete') {
    tally[c.file] ||= { update: 0, delete: 0 }
    tally[c.file][m]++
  }
  assert.deepStrictEqual(tally, { 'pages/Transactions.jsx': { update: 1, delete: 1 } })
})

test('W4: MoneyInboxInput.jsx contains no insert, update, delete, upsert or rpc call', () => {
  const input = files.find((f) => f.path === 'components/money-inbox/MoneyInboxInput.jsx')
  assert.ok(input, 'MoneyInboxInput.jsx not found')
  const writes = [...input.code.matchAll(/\.\s*(insert|update|delete|upsert|rpc)\s*\(/g)].map((m) => m[1])
  assert.deepStrictEqual(writes, [])
})

test('W5: the four parser files import nothing from supabase or react (relative imports only)', () => {
  for (const name of ['lib/moneyInbox.js', 'lib/categorization.js', 'lib/dateParser.js', 'lib/spendingContext.js']) {
    const f = files.find((x) => x.path === name)
    assert.ok(f, `${name} not found`)
    const specs = [...f.code.matchAll(/import\s[^;]*?from\s*['"]([^'"]+)['"]|import\s*['"]([^'"]+)['"]/g)].map((m) => m[1] || m[2])
    const bad = specs.filter((s) => !s.startsWith('.') || /supabase|react/i.test(s))
    assert.deepStrictEqual(bad, [], `${name} imports ${bad.join(', ')}`)
  }
})

test('W6: the scanner itself works (so the guard cannot pass because the scanner is broken)', () => {
  const one = (src) => findTableChains(stripComments(src), 'transactions').map((c) => c.methods)
  assert.deepStrictEqual(one("await supabase.from('transactions').insert(payload)"), [['insert']])
  assert.deepStrictEqual(one("supabase\n  .from('transactions')\n  .update({\n    a: 1,\n  })\n  .eq('id', x)"), [['update', 'eq']])
  assert.deepStrictEqual(one('supabase.from("transactions").select("a, b").eq("x", 1)'), [['select', 'eq']])
  assert.deepStrictEqual(one('supabase.from(`transactions`).delete().eq("id", id)'), [['delete', 'eq']])
  assert.deepStrictEqual(one("supabase.from('goals').insert(x)"), [], 'another table must be ignored')
  assert.deepStrictEqual(one("// supabase.from('transactions').insert(x)"), [], 'a whole-line comment must not count')
  assert.deepStrictEqual(one("run() // supabase.from('transactions').insert(x)"), [], 'a trailing comment must not count')
  assert.deepStrictEqual(one("/* old: supabase.from('transactions').insert(x) */"), [], 'a block comment must not count')
  assert.deepStrictEqual(one("const q = supabase.from('transactions')"), [[]], 'a hidden chain must be reported as empty')
  assert.ok(stripComments("const u = 'https://example.com/a'").includes('https://example.com/a'), 'a URL must survive comment stripping')
  assert.deepStrictEqual(objectKeysAfter('const p = rows.map((r) => ({ a: 1, b: fn(x, y), c: { d: 2 }, e: [1, 2], f: "x, y" }))', 'const p = rows.map('), ['a', 'b', 'c', 'e', 'f'])
})

test('W7: if src/lib/command/ exists, it contains no database write, no rpc, and does not import the database client', () => {
  const dir = join(SRC, 'lib', 'command')
  if (!existsSync(dir)) { console.log('        (src/lib/command/ is not created yet — this check activates when P1 creates it)'); return }
  const problems = []
  for (const full of listSourceFiles(dir)) {
    const code = readCode(full)
    for (const table of ['transactions', 'goals', 'goal_contributions', 'budgets', 'learning_items', 'accounts', 'categories', 'category_rules']) {
      for (const c of findTableChains(code, table)) for (const m of c.methods) if (WRITE_METHODS.includes(m)) problems.push(`${rel(full)}: ${m} on ${table}`)
    }
    if (/\.\s*rpc\s*\(/.test(code)) problems.push(`${rel(full)}: rpc call`)
    if (/supabaseClient/.test(code)) problems.push(`${rel(full)}: imports the database client`)
  }
  assert.deepStrictEqual(problems, [])
})

console.log(`\n${passed} passed, ${failed} failed`)
if (failed > 0) process.exit(1)
