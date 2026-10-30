// D6 - the INDICATORS WRITE GUARD.
// The indicators only READ what the pages already loaded (plus one new read-only income query on the Debts page and one
// read-only debts query on Overview). This test reads the source as text (comments removed first) and proves:
//   - the three new files (lib/debtIndicators.js, components/debts/IndicatorRow.jsx, components/debts/OverviewDebtCard.jsx)
//     never touch the database, network or browser storage, and have no effect, form or submit;
//   - their imports are limited, and they import neither the debt engine nor a database client directly;
//   - Debts.jsx gained exactly ONE database call (12 now, 11 before) and it is a select on `transactions` filtered to
//     income, with no write method chained on it; Debts.jsx's write sites are unchanged (debts: insert, 2 updates;
//     debt_payments: insert, delete) - the D4b guard keeps proving the debt_payments side;
//   - Overview.jsx gained exactly one call (7 now, 6 before): a select on `debts` for ACTIVE rows, no write anywhere;
//   - debtEngine.js and financialEngine.js are byte-for-byte what they were (line endings ignored).
// The scanners are themselves tested (G9) so the guard cannot pass because a scanner is broken.
import assert from 'node:assert'
import { readFileSync } from 'node:fs'
import { createHash } from 'node:crypto'
import { fileURLToPath } from 'node:url'
import { join } from 'node:path'

let passed = 0, failed = 0
function test(name, fn) {
  try { fn(); passed++; console.log(`  PASS  ${name}`) } catch (err) { failed++; console.log(`  FAIL  ${name}\n${String(err.message).split('\n').map((l) => '        ' + l).join('\n')}`) }
}
const SRC = fileURLToPath(new URL('../', import.meta.url))
const read = (rel) => readFileSync(join(SRC, rel), 'utf8').replace(/\r\n/g, '\n')
export function stripComments(code) {
  return code.replace(/\/\*[\s\S]*?\*\//g, ' ').replace(/^[ \t]*\/\/.*$/gm, '').replace(/[ \t]\/\/[ \t].*$/gm, '')
}
const NEW_FILES = ['lib/debtIndicators.js', 'components/debts/IndicatorRow.jsx', 'components/debts/OverviewDebtCard.jsx']
const code = Object.fromEntries(NEW_FILES.map((f) => [f, stripComments(read(f))]))

export const FORBIDDEN = [
  [/\.from\s*\(/, 'a database table call'], [/\bsupabase/i, 'the database client'], [/\.(insert|update|delete|upsert)\s*\(/, 'a write call'],
  [/\.rpc\s*\(/, 'an rpc call'], [/\bfetch\s*\(/, 'a network call'], [/\bXMLHttpRequest\b/, 'a network call'],
  [/\b(localStorage|sessionStorage|indexedDB)\b/, 'browser storage'], [/document\.cookie/, 'a cookie'], [/service[_-]?role/i, 'a service-role key'], [/import\.meta\.env/, 'an environment variable'],
]
/** Every `.from('<table>')` with the methods chained after it, in call order. */
export function chains(src, table) {
  const out = []
  const re = new RegExp(`\\.from\\(\\s*(['"\`])${table}\\1\\s*\\)((?:\\s*\\.\\s*\\w+\\s*\\([^)]*\\))*)`, 'g')
  for (const m of src.matchAll(re)) out.push([...m[2].matchAll(/\.\s*(\w+)\s*\(/g)].map((x) => x[1]))
  return out
}
const WRITES = ['insert', 'update', 'delete', 'upsert', 'rpc']

test('G1: the three new files contain no database call, write, network call or storage', () => {
  for (const f of NEW_FILES) for (const [re, what] of FORBIDDEN) assert.ok(!re.test(code[f]), `${f} contains ${what} (${re})`)
})
test('G2: imports are limited; no effect, form or submit in the components', () => {
  const imports = (c) => [...c.matchAll(/^\s*import\s[^'"]*['"]([^'"]+)['"]/gm)].map((m) => m[1]).sort()
  assert.deepStrictEqual(imports(code['lib/debtIndicators.js']), ['./debtForm.js', './financialEngine.js'])
  assert.deepStrictEqual(imports(code['components/debts/IndicatorRow.jsx']), ['../../lib/debtIndicators.js', '../../lib/format.js', '../../lib/isoDate.js', './Disclosure.jsx', 'react'])
  assert.deepStrictEqual(imports(code['components/debts/OverviewDebtCard.jsx']), ['../../lib/debtIndicators.js', '../../lib/format.js', 'react', 'react-router-dom'])
  for (const f of NEW_FILES.slice(1)) {
    assert.ok(!/useEffect\s*\(/.test(code[f]), `${f} has an effect`)
    assert.ok(!/<form\b/i.test(code[f]) && !/onSubmit/.test(code[f]) && !/type="submit"/.test(code[f]), `${f} has a form`)
    assert.ok(!/debtEngine/.test(code[f]), `${f} reaches for the engine directly`)
  }
  assert.ok(!/debtEngine/.test(code['lib/debtIndicators.js']), 'the indicator library must not import or call the engine: it adds up the page figures')
})
test('G3: Debts.jsx gained exactly one database call: a read-only select of income transactions', () => {
  const page = stripComments(read('pages/Debts.jsx'))
  assert.strictEqual((page.match(/\.from\s*\(/g) || []).length, 12)
  const tx = chains(page, 'transactions')
  const incomeReads = tx.filter((c) => c.includes('select') && c.includes('gte') && c.includes('lte'))
  assert.strictEqual(incomeReads.length, 1, 'one income read')
  assert.ok(/\.eq\(\s*'type'\s*,\s*'income'\s*\)/.test(page), 'filtered to income')
  for (const c of tx) for (const w of WRITES) assert.ok(!c.includes(w), `transactions is read-only here, found ${w}`)
  // the write sites of Debts.jsx are exactly those of D4b
  assert.deepStrictEqual(chains(page, 'debts').map((c) => c[0]).sort(), ['insert', 'select', 'update', 'update'])
  assert.deepStrictEqual(chains(page, 'debt_payments').map((c) => c[0]).sort(), ['delete', 'insert', 'select'])
  assert.ok(/<IndicatorRow\b/.test(page))
})
test('G4: Overview.jsx gained exactly one database call: a read-only select of ACTIVE debts; it has no write call at all', () => {
  const page = stripComments(read('pages/Overview.jsx'))
  assert.strictEqual((page.match(/\.from\s*\(/g) || []).length, 7)
  const d = chains(page, 'debts')
  assert.strictEqual(d.length, 1); assert.ok(d[0].includes('select') && d[0].includes('eq') && !WRITES.some((w) => d[0].includes(w)))
  assert.ok(/\.eq\(\s*'status'\s*,\s*'active'\s*\)/.test(page))
  assert.ok(!/\.(insert|update|delete|upsert|rpc)\s*\(/.test(page), 'Overview has no write call')
  assert.ok(/<OverviewDebtCard\b/.test(page))
  // a failed debts read must not turn into the page-level error: the page error list is unchanged
  assert.ok(!/debtsRes/.test(page))
})
test('G5: debtEngine.js and financialEngine.js are byte-for-byte unchanged (line endings ignored)', () => {
  const h = (f) => createHash('sha256').update(read(f)).digest('hex')
  assert.strictEqual(h('lib/debtEngine.js'), '9332303684766340332e1fc8bc774655e1d00e7f756e02d5b364dc34054b5209')
  assert.strictEqual(h('lib/financialEngine.js'), 'a7bd3c87eca213edf1ca46389fc5dc4d8bfa1ef73178d80c0990f677c116098b')
})
export const BANNED = [/\bshould\b/i, /\brecommend/i, /\badvis(e|ed|es|ing)\b/i, /\bsuggest/i, /\bbest\b/i, /\bbetter\b/i, /\bideal/i, /\boptimal/i, /\bmust\b/i, /\bought\b/i, /\byou need\b/i, /\bsmart/i, /\bwise/i, /\bguarantee/i, /\bsafe\b/i, /\bfastest\b/i, /\bcheapest\b/i, /\bavoid\b/i, /\bdon'?t\b/i, /\b(high|low|healthy|unhealthy|risky|dangerous|good|bad|heavy|manageable|comfortable|worrying)\b/i]
export function visibleText(src) {
  const out = []
  for (const m of src.matchAll(/>([^<>{}=]+)</g)) out.push(m[1])
  for (const m of src.matchAll(/(['"`])((?:\\.|(?!\1)[^\\\n])+)\1/g)) out.push(m[2])
  return out.map((t) => t.trim()).filter((t) => /[A-Za-z]{3,}/.test(t))
}
test('G6: the components contain no advice wording and show the required statements', () => {
  for (const f of NEW_FILES.slice(1)) {
    const texts = visibleText(code[f])
    assert.ok(texts.length > 10, `${f}: only ${texts.length} texts`)
    for (const t of texts) for (const re of BANNED) assert.ok(!re.test(t), `${f}: ${re} in: ${t}`)
  }
  const row = code['components/debts/IndicatorRow.jsx']
  for (const k of ['COPY.basis', 'COPY.mixedWarning', 'COPY.openingOnly', 'COPY.notVerified', 'COPY.estimateNote', 'COPY.paymentsUnavailable', 'COPY.burdenDefinition', 'COPY.interestDefinition', 'COPY.progressDefinition', 'COPY.totalComponents', 'COPY.calculatedMeaning', 'COPY.openingMeaning', 'COPY.totalLabelMixed', 'COPY.totalLabelOpening']) assert.ok(row.includes(k), `IndicatorRow shows ${k}`)
  assert.ok(code['components/debts/OverviewDebtCard.jsx'].includes('COPY.basis'))
  assert.match(code['components/debts/OverviewDebtCard.jsx'], /CARD_COPY\.differ/); assert.match(code['components/debts/OverviewDebtCard.jsx'], /not replayed on Overview/)
})
test('G7: the indicator library has no clock and no randomness (the caller passes today)', () => {
  assert.ok(!/new Date\s*\(\s*\)|Date\.now|Math\.random/.test(code['lib/debtIndicators.js']))
})
test('G8: the Overview card shows no debt balance: no total-owed, interest-paid or progress wording', () => {
  const card = code['components/debts/OverviewDebtCard.jsx']
  assert.ok(!/totalLabel|interestLabel|progressLabel|owedPaise|\.total\b|\.interest\b|\.progress\b/.test(card))
})
test('G9: the scanners themselves work', () => {
  const hit = (s) => FORBIDDEN.filter(([re]) => re.test(stripComments(s))).length
  assert.ok(hit("await supabase.from('x').insert({})") >= 2); assert.strictEqual(hit("fetch('/a')"), 1); assert.strictEqual(hit("localStorage.setItem('a','b')"), 1)
  assert.strictEqual(hit("// supabase.from('x').insert({})\nconst a = 1"), 0)
  assert.deepStrictEqual(chains("supabase.from('transactions').select('a').eq('type','income').gte('d',1)", 'transactions'), [['select', 'eq', 'gte']])
  assert.deepStrictEqual(chains("supabase.from('debts').update({a:1}).eq('id',1)", 'debts'), [['update', 'eq']])
  assert.deepStrictEqual(chains("// supabase.from('debts').insert(x)", 'debts').length, 1, 'chains() itself does not strip comments; callers do')
  assert.deepStrictEqual(chains(stripComments("// supabase.from('debts').insert(x)"), 'debts'), [])
  assert.ok(BANNED.some((re) => re.test('This is a healthy ratio'))); assert.ok(!BANNED.some((re) => re.test('Monthly required payments')))
})

console.log(`\n${passed} passed, ${failed} failed`)
if (failed > 0) process.exit(1)
