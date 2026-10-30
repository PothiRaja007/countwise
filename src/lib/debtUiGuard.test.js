// D10 - the Debt Module UI simplification is presentation only. These checks read the source of the redesigned debt
// components and pin what must not appear in them: no database call, no write, no network, no storage, no effect, no
// engine call. They also pin that the defensive handling of KL-2 / KL-13 is still what decides what the card shows.
import assert from 'node:assert'
import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import path from 'node:path'

let passed = 0, failed = 0
function test(name, fn) {
  try { fn(); passed++; console.log(`  PASS  ${name}`) } catch (err) { failed++; console.log(`  FAIL  ${name}\n${String(err.message).split('\n').map((l) => '        ' + l).join('\n')}`) }
}
const src = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const read = (f) => readFileSync(path.join(src, f), 'utf8')
const strip = (c) => c.replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '').replace(/\{\/\*[\s\S]*?\*\/\}/g, '')
const FILES = ['components/debts/Disclosure.jsx', 'components/debts/DebtCard.jsx', 'components/debts/IndicatorRow.jsx', 'components/debts/PlannerPanel.jsx']
const code = Object.fromEntries(FILES.map((f) => [f, strip(read(f))]))

const FORBIDDEN = [
  [/\.from\s*\(/, 'a database call'], [/\.(insert|update|upsert|delete|rpc)\s*\(/, 'a write'], [/\bfetch\s*\(/, 'a network call'], [/XMLHttpRequest|WebSocket|sendBeacon/, 'a network call'],
  [/localStorage|sessionStorage|indexedDB/, 'browser storage'], [/supabase/i, 'the database client'], [/useEffect\s*\(/, 'an effect'], [/<form\b/i, 'a form'], [/debtEngine|financialEngine/, 'a direct engine call'],
]

test('U1: the redesigned debt components contain no database call, write, network call, storage, effect, form or engine call', () => {
  for (const f of FILES) for (const [re, what] of FORBIDDEN) assert.ok(!re.test(code[f]), `${f} contains ${what} (${re})`)
})
test('U2: Disclosure is a plain presentational component: no imports at all, no state', () => {
  assert.deepStrictEqual([...code['components/debts/Disclosure.jsx'].matchAll(/^\s*import\s/gm)], [])
  assert.ok(!/useState|useReducer|useMemo/.test(code['components/debts/Disclosure.jsx']))
})
test('U3: the card still decides what to show from the KL-2 and KL-13 checks, and shows money only when the figures are valid', () => {
  const c = code['components/debts/DebtCard.jsx']
  assert.ok(/hasValidOpeningFigures\(debt\)/.test(c) && /savedFieldProblems\(debt\)/.test(c))
  assert.ok(/const invalid = !hasValidOpeningFigures\(debt\)/.test(c))
  assert.ok(/\{!invalid && \(<>/.test(c), 'the calculated part of the card must stay inside the !invalid branch')
  assert.ok(/data-testid="debt-invalid"/.test(c) && /The saved figures for this debt are not valid\. Edit this debt to correct them\./.test(c))
  for (const t of ['debt-rate-invalid', 'debt-payment-invalid', 'debt-months-invalid', 'debt-dueday-invalid']) assert.ok(c.includes(`data-testid="${t}"`), t)
  assert.ok(/const FIELD_BAD = 'not valid\. Edit this debt to correct it\.'/.test(c))
})
test('U4: the disclosures that must stay visible are not inside a Disclosure in the Planner and the indicators', () => {
  const p = code['components/debts/PlannerPanel.jsx']
  const i = code['components/debts/IndicatorRow.jsx']
  const inside = (c, testId) => { const at = c.indexOf(`data-testid="${testId}"`); if (at < 0) return false; const before = c.slice(0, at); return before.lastIndexOf('<Disclosure') > before.lastIndexOf('</Disclosure>') }
  for (const t of ['planner-principal-only', 'planner-snowball-order', 'planner-basis', 'snowball-warning', 'planner-summary']) assert.ok(!inside(p, t), `${t} must not be collapsed`)
  for (const t of ['indicators-basis', 'ind-total-note', 'ind-total-mixed', 'ind-total-opening-only', 'ind-total-nofigure', 'ind-total-estimate']) assert.ok(!inside(i, t), `${t} must not be collapsed`)
})

console.log(`\n${passed} passed, ${failed} failed`)
process.exit(failed ? 1 : 0)
