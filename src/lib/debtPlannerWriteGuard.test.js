// D5 - the PLANNER WRITE GUARD.
//
// The repayment planner only READS what the Debts page already loaded and shows calculated scenarios. This test reads
// the source as text (comments removed first) and proves:
//   - the planner files (lib/debtPlanner.js, components/debts/PlannerPanel.jsx) never touch the database, the network
//     or any browser storage: no .from(), no supabase import, no insert/update/delete/upsert/rpc, no fetch, no storage;
//   - the planner library imports only the engine and the money limit (no React, no other module), and the panel
//     imports no database client;
//   - Debts.jsx gained no database call in D5 (the same number of .from() calls as before) and the debt_payments writes
//     are still only the D4b ones (the D4b guard keeps proving that);
//   - debtEngine.js is byte-for-byte the D1 engine (the planner uses comparePlans as it is);
//   - the planner's own screen text contains no advice wording (the library's sentences are checked in debtPlanner.test.js);
//   - no service-role key is read anywhere in the planner files.
// The scanners are themselves tested (G8) so the guard cannot pass because a scanner is broken.
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
  return code
    .replace(/\/\*[\s\S]*?\*\//g, ' ')
    .replace(/^[ \t]*\/\/.*$/gm, '')
    .replace(/[ \t]\/\/[ \t].*$/gm, '')
}

const PLANNER_FILES = ['lib/debtPlanner.js', 'components/debts/PlannerPanel.jsx']
const code = Object.fromEntries(PLANNER_FILES.map((f) => [f, stripComments(read(f))]))

export const FORBIDDEN_CALLS = [
  [/\.from\s*\(/, 'a database table call'],
  [/\bsupabase/i, 'the database client'],
  [/\.(insert|update|delete|upsert)\s*\(/, 'a write call'],
  [/\.rpc\s*\(/, 'an rpc call'],
  [/\bfetch\s*\(/, 'a network call'],
  [/\bXMLHttpRequest\b/, 'a network call'],
  [/\b(localStorage|sessionStorage|indexedDB)\b/, 'browser storage'],
  [/document\.cookie/, 'a cookie'],
  [/service[_-]?role/i, 'a service-role key'],
  [/import\.meta\.env/, 'an environment variable'],
]

test('G1: the planner files contain no database call, no write, no network call, no storage', () => {
  for (const f of PLANNER_FILES) {
    for (const [re, what] of FORBIDDEN_CALLS) assert.ok(!re.test(code[f]), `${f} contains ${what} (${re})`)
  }
})

test('G2: the planner library imports only the engine and the money limit; the panel imports no database client', () => {
  const imports = (c) => [...c.matchAll(/^\s*import\s[^'"]*['"]([^'"]+)['"]/gm)].map((m) => m[1])
  assert.deepStrictEqual(imports(code['lib/debtPlanner.js']).sort(), ['./debtEngine.js', './debtForm.js'])
  const panel = imports(code['components/debts/PlannerPanel.jsx'])
  for (const p of panel) assert.ok(!/supabase|AuthContext/i.test(p), `the panel imports ${p}`)
  assert.deepStrictEqual(panel.slice().sort(), ['../../lib/debtPlanner.js', '../../lib/format.js', '../../lib/isoDate.js', '../ui/Input.jsx', 'react'])
})

test('G3: Debts.jsx gained no database call in D5 (11 .from() calls, as at the end of D4b); the planner tab renders the panel', () => {
  const page = stripComments(read('pages/Debts.jsx'))
  assert.strictEqual((page.match(/\.from\s*\(/g) || []).length, 11)
  assert.ok(/<PlannerPanel\b/.test(page))
  assert.ok(/key: 'planner'/.test(page))
})

test('G4: debtEngine.js is byte-for-byte the D1 engine (line endings ignored)', () => {
  const hash = createHash('sha256').update(read('lib/debtEngine.js')).digest('hex')
  assert.strictEqual(hash, '9332303684766340332e1fc8bc774655e1d00e7f756e02d5b364dc34054b5209')
})

export const BANNED = [/\bshould\b/i, /\brecommend/i, /\badvis(e|ed|es|ing)\b/i, /\bsuggest/i, /\bbest\b/i, /\bbetter\b/i, /\bideal/i, /\boptimal/i, /\bmust\b/i, /\bought\b/i, /\byou need\b/i, /\bwe (think|believe)\b/i, /\bsmart/i, /\bwise/i, /\bguarantee/i, /\bsafe\b/i, /\bfastest\b/i, /\bcheapest\b/i, /\bavoid\b/i, /\bdon'?t\b/i]
/** The visible words of a JSX file: text between tags, and string and template literals. Attribute names and code are ignored. */
export function visibleText(src) {
  const out = []
  for (const m of src.matchAll(/>([^<>{}=]+)</g)) out.push(m[1])
  for (const m of src.matchAll(/(['"`])((?:\\.|(?!\1)[^\\\n])+)\1/g)) out.push(m[2])
  return out.map((t) => t.trim()).filter((t) => /[A-Za-z]{3,}/.test(t))
}

test('G5: the planner panel text contains no advice wording', () => {
  const texts = visibleText(code['components/debts/PlannerPanel.jsx'])
  assert.ok(texts.length > 25, `only ${texts.length} texts found`)
  for (const t of texts) for (const re of BANNED) assert.ok(!re.test(t), `advice wording ${re} in: ${t}`)
})

test('G6: the panel states the required things on screen (library copy is checked separately)', () => {
  const text = visibleText(code['components/debts/PlannerPanel.jsx']).join(' | ')
  assert.match(text, /Debts in the plan/)
  assert.match(text, /Not in the plan/)
  assert.match(text, /Interest compared with required payments only/)
  assert.ok(/COPY\.basis/.test(code['components/debts/PlannerPanel.jsx']))
  assert.ok(/COPY\.principalOnly/.test(code['components/debts/PlannerPanel.jsx']))
  assert.ok(/COPY\.estimateNote/.test(code['components/debts/PlannerPanel.jsx']))
  assert.ok(/COPY\.cannotLoadPayments/.test(code['components/debts/PlannerPanel.jsx']))
  assert.ok(/COPY\.snowballOrderNote/.test(code['components/debts/PlannerPanel.jsx']), 'the snowball order explanation is shown')
  assert.ok(/snowballWarnings/.test(code['components/debts/PlannerPanel.jsx']), 'the calculated warning is shown')
})

test('G7: the planner has no way to save: no persistent state call and no form submit in the panel', () => {
  const c = code['components/debts/PlannerPanel.jsx']
  assert.ok(!/<form\b/i.test(c) && !/onSubmit/.test(c) && !/type="submit"/.test(c))
  assert.ok(!/useEffect\s*\(/.test(c), 'the panel has no effect that could write or fetch')
})

test('G8: the scanners themselves work (so the guard cannot pass because a scanner is broken)', () => {
  const hit = (s) => FORBIDDEN_CALLS.filter(([re]) => re.test(stripComments(s))).length
  assert.ok(hit("await supabase.from('x').insert({})") >= 2)
  assert.ok(hit("fetch('/api')") === 1)
  assert.ok(hit("localStorage.setItem('a', 'b')") === 1)
  assert.ok(hit("const k = import.meta.env.VITE_X") === 1)
  assert.strictEqual(hit("// supabase.from('x').insert({})\nconst a = 1"), 0, 'a comment must not count')
  assert.strictEqual(hit('const total = a + b'), 0)
  assert.deepStrictEqual(visibleText('<p>Hello world here</p> const a = "Some long text"'), ['Hello world here', 'Some long text'])
  assert.ok(BANNED.some((re) => re.test('You should pay the card first')))
  assert.ok(!BANNED.some((re) => re.test('Interest compared with required payments only')))
})

console.log(`\n${passed} passed, ${failed} failed`)
if (failed > 0) process.exit(1)
