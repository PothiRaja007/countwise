// P6 (Money Inbox command layer) — WIRING TESTS FOR NAVIGATION, HANDOFF AND MEMORY (N1–N8).
//
// There is no React test setup in this project, so these read the source as text and
// prove how page requests, the remembered goal and the handoff store are connected:
//   N1  a page opens only after interpret(), and only for a complete request
//   N2  the route comes from the page table, never from the typed text
//   N3  opening a page reads and writes nothing, and does not claim anything was saved
//   N4  the remembered goal is applied after interpret() and before any question or command is used
//   N5  the transaction path is still byte-for-byte what it was before P4
//   N6  signing out clears the command session
//   N7  only the Goals (P7) and Learning (P8) pages use the handoff hook, and only Goals writes the memory; only the known files import the new modules
//   N8  a clarification button that opens a page is checked before the questions
//   N9  the handoff hook reads once, inside an effect, and survives React Strict Mode's second run
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

const INPUT = 'components/money-inbox/MoneyInboxInput.jsx'
const input = read(INPUT)
const code = stripComments(input)

const between = (src, startMarker, endMarker) => {
  const a = src.indexOf(startMarker)
  assert.ok(a >= 0, `${startMarker} exists`)
  const b = src.indexOf(endMarker, a + startMarker.length)
  assert.ok(b > a, `${endMarker} follows`)
  return src.slice(a, b + endMarker.length)
}
const goTo = between(code, 'const goTo = (destination) => {', '\n  }\n')

test('N1: a page opens only after interpret(), only for a complete request, and only through one door', () => {
  const i = code.indexOf('interpret(')
  const m = code.indexOf('applyReferenceMemory(interpreted')
  const n = code.indexOf('navigationFromResult(interpreted)')
  const r = code.indexOf('requestFromResult(interpreted)')
  const e = code.indexOf('buildReviewCandidates(text')
  assert.ok(i > 0 && m > i && n > m && r > n && e > r, 'interpret → reference memory → navigation → question → entry flow, in that order')
  assert.equal((code.match(/navigate\(/g) || []).length, 1, 'the router is called in exactly one place (goTo)')
  assert.equal((code.match(/\bgoTo\(/g) || []).length, 8, 'goTo is called from the typed request, from a page choice, from a goal hand-off (P7), a learning hand-off (P8), a budget hand-off (P9), the learning-payment offer (P8b), Open Salary and the pension Open button (P10), nowhere else')
  assert.ok(/const destination = navigationFromResult\(interpreted\)\s*if \(destination\) \{\s*goTo\(destination\)\s*return\s*\}/.test(code), 'a page request ends there')
  assert.ok(/useNavigate\(\)/.test(code), 'the router hook is used')
  assert.equal((code.match(/navigationFromResult\(/g) || []).length, 1)
})

test('N2: the route comes from the page table, never from the typed text', () => {
  assert.ok(/navigate\(destination\.route\)/.test(goTo), 'goTo goes to the table\'s route')
  assert.ok(!/navigate\([^)]*(text|interpreted|source|page)/.test(code.replace('navigate(destination.route)', '')), 'no other navigate call')
  assert.ok(!/window\.location|location\.href|location\.assign|history\./.test(code), 'no other way to leave the page')
  assert.ok(!/navigate\(`/.test(code) && !/navigate\([^)]*\+/.test(code), 'no route is built from pieces')
  const handoff = stripComments(read('lib/command/handoff.js'))
  assert.ok(/ALLOWED_PAGES\.find/.test(handoff) && /route: page\.route/.test(handoff), 'the destination is looked up in ALLOWED_PAGES')
})

test('N3: opening a page reads and writes nothing, and does not claim anything was saved', () => {
  assert.ok(!/supabase|\.from\(|\.insert\(|\.update\(|\.upsert\(|\.delete\(|\.rpc\(/.test(goTo), 'goTo has no data call')
  assert.ok(!/onSaved/.test(goTo), 'goTo does not say anything was saved')
  assert.ok(!/\.(insert|update|upsert|delete|rpc)\(/.test(code), 'no write or rpc anywhere in MoneyInboxInput')
  const branch = between(code, 'const destination = navigationFromResult(interpreted)', 'return\n          }')
  assert.ok(!/supabase|await |\.from\(/.test(branch), 'the typed-request branch reads nothing')
  assert.ok(/setText\(''\)/.test(goTo) && /onClose\?\.\(\)/.test(goTo), 'Money Inbox is reset and the floating panel closes')
  // P6 adds no read at all: the count is exactly what P5 left (the entry and guard reads, plus the question reads).
  assert.equal((code.match(/\.from\('/g) || []).length, 16) // 14 through P9, plus the two select-only salary reads of P10
})

test('N4: the remembered goal is applied after interpret() and before a question or command is used; Money Inbox never writes the memory', () => {
  assert.ok(/interpreted = applyReferenceMemory\(interpreted, memoryFor\(user\.id\), activeGoals, user\.id, Date\.now\(\)\)/.test(code), 'P7: only ACTIVE goals can be "it"')
  assert.ok(code.indexOf('applyReferenceMemory(') > code.indexOf('interpreted = interpret(') && code.indexOf('applyReferenceMemory(') < code.indexOf('lists = {'), 'applied inside the guard\'s own try, right after interpret')
  assert.ok(!/\bremember\(|rememberGoal\(|takeHandoff\(|clearCommandSession\(/.test(code), 'Money Inbox only reads the memory; owner pages write it (P7: the Goals page)')
  assert.equal((code.match(/putHandoff\(/g) || []).length, 4, 'P9: three places (the goal, learning and budget commands\' Continue buttons); P8b: the learning-payment offer')
  assert.ok(!/useHandoff/.test(code), 'Money Inbox does not read handoffs')
  assert.equal((code.match(/commandSession\.js/g) || []).length, 1)
  assert.ok(/import \{ memoryFor, putHandoff \} from '\.\.\/\.\.\/lib\/commandSession\.js'/.test(code), 'it imports exactly memoryFor and putHandoff')
})

test('N5: the transaction path is unchanged', () => {
  const START = 'const candidates = buildReviewCandidates(text, {'
  const END = 'setReviewState({ candidates, accounts, categories })'
  const a = input.indexOf(START)
  const e = input.indexOf(END)
  assert.ok(a > 0 && e > a, 'block found')
  const block = input.slice(a, e + END.length)
  assert.equal(block.length, 951)
  assert.equal(createHash('sha256').update(block).digest('hex').slice(0, 16), '2af2a73c071add86')
  assert.equal((code.match(/buildReviewCandidates\(/g) || []).length, 1, 'exactly one entry parser call')
})

test('N6: signing out clears the command session, before the sign-out call', () => {
  const auth = stripComments(read('lib/AuthContext.jsx'))
  assert.ok(/import \{ clearCommandSession \} from '\.\/commandSession\.js'/.test(auth))
  const signOut = between(auth, 'const signOut = async () => {', '\n  }\n')
  assert.ok(/clearCommandSession\(\)/.test(signOut), 'signOut clears the session')
  assert.ok(signOut.indexOf('clearCommandSession()') < signOut.indexOf('supabase.auth.signOut()'), 'cleared first, so it is cleared even if the sign-out call fails')
  assert.equal((auth.match(/clearCommandSession/g) || []).length, 2, 'one import and one call, nothing more')
})

test('N7: only the Goals (P7), Learning (P8) and Budgets (P9) pages use the handoff hook, and only Goals writes the memory; only the known files import the new modules', () => {
  const importers = { 'commandSession.js': [], 'useHandoff.js': [], 'handoff.js': [], 'commandContext.js': [] }
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
  assert.deepEqual(importers['commandSession.js'].sort(), [INPUT, 'lib/AuthContext.jsx', 'lib/useHandoff.js', 'pages/Goals.jsx'].sort())
  assert.deepEqual(importers['useHandoff.js'].sort(), ['pages/Budgets.jsx', 'pages/Goals.jsx', 'pages/LearningROI.jsx'], 'only the Goals (P7), Learning (P8) and Budgets (P9) pages use the hook')
  assert.deepEqual(importers['handoff.js'].sort(), [INPUT, 'lib/commandSession.js'].sort())
  assert.deepEqual(importers['commandContext.js'].sort(), [INPUT, 'lib/commandSession.js', 'lib/command/goalCommands.js'].sort(), 'goalCommands.js reads the one reference note')
  for (const rel of [...importers['commandSession.js'], ...importers['useHandoff.js']]) assert.ok(!rel.startsWith('pages/') || ['pages/Goals.jsx', 'pages/LearningROI.jsx', 'pages/Budgets.jsx'].includes(rel), `${rel} is not a page that owns a command`)
})

test('N8: a clarification button that opens a page is checked before the questions, and anything else is still "no longer available"', () => {
  const start = between(code, "} else if (outcome.action === 'start') {", "} else {\n      setNotice(outcome.message || null)")
  const nav = start.indexOf("outcome.intent === 'NAVIGATE' ? navigationFromChoice(outcome.choiceId) : null")
  const goto = start.indexOf('goTo(destination)')
  const query = start.indexOf('queryFromChoice(')
  assert.ok(nav > 0 && goto > nav && query > goto, 'navigation first, then the question lookup')
  assert.ok(/QUERY_MESSAGES\.choiceGone/.test(start), 'an unknown choice still says it is gone')
  assert.ok(/const handleGuardChoice = async/.test(code))
})

test('N9: the handoff hook reads on mount once (Strict Mode runs effects twice) and again only when told a handoff arrived for its page (P7)', () => {
  const hook = stripComments(read('lib/useHandoff.js'))
  assert.equal((hook.match(/takeHandoff\(/g) || []).length, 2, 'two reads: the mount read and the arrival read')
  const effects = [...hook.matchAll(/useEffect\(\(\) => \{[\s\S]*?\}, \[page, userId\]\)/g)].map((m) => m[0])
  assert.equal(effects.length, 2, 'two effects')
  const [mount, arrival] = effects
  assert.ok(mount.includes('takeHandoff(') && arrival.includes('takeHandoff('), 'both reads are inside effects, never in the render')
  assert.ok(!/takeHandoff\(/.test(hook.replace(mount, '').replace(arrival, '')), 'nothing reads outside the effects')
  assert.ok(/useRef\(null\)/.test(hook) && /if \(asked\.current === key\) return\s*asked\.current = key/.test(mount), 'a ref remembers that this page already asked, so the second run does nothing')
  assert.ok(mount.indexOf('asked.current === key') < mount.indexOf('takeHandoff('), 'the guard comes before the read')
  assert.ok(/useState\(null\)/.test(hook) && /setHandoff\(result\.ok \? result\.pending : null\)/.test(mount), 'what was taken is kept in state, and a refusal on mount is just nothing')
  assert.ok(/onHandoff\(/.test(arrival) && /if \(arrivedFor !== page\) return/.test(arrival), 'the arrival read only happens for this page')
  assert.ok(/if \(result\.ok\) setHandoff\(result\.pending\)/.test(arrival) && !/setHandoff\(null\)/.test(arrival), 'a read that finds nothing never clears a handoff the page already holds')
  assert.ok(/return onHandoff\(/.test(arrival), 'the listener is removed when the page goes away')
  assert.ok(!/toast|alert|console\.|setError|navigate\(/.test(hook), 'an ignored handoff is silent')
  assert.ok(/return \{ handoff, done \}/.test(hook))
})

console.log(`\n${passed} passed, ${failed} failed`)
if (failed) process.exit(1)
