// Guard for a rule that was broken once already: an AI feature must not
// ship without telling the user, at the point of use, that it sends data
// to Google. This scans the source tree, so a future AI action added
// without a disclosure fails the test suite instead of quietly shipping.
import assert from 'node:assert'
import { readdirSync, readFileSync, statSync } from 'node:fs'
import { join, relative } from 'node:path'
import { fileURLToPath } from 'node:url'

const SRC = join(fileURLToPath(new URL('.', import.meta.url)), '..')

let passed = 0
let failed = 0

function test(name, fn) {
  try {
    fn()
    console.log(`  PASS  ${name}`)
    passed++
  } catch (err) {
    console.log(`  FAIL  ${name}`)
    console.log(`        ${err.message}`)
    failed++
  }
}

function walk(dir) {
  return readdirSync(dir).flatMap((name) => {
    const full = join(dir, name)
    return statSync(full).isDirectory() ? walk(full) : [full]
  })
}

const sourceFiles = walk(SRC).filter((f) => /\.(jsx|js)$/.test(f) && !/\.test\./.test(f))

// Comments are stripped first: several prompt-builder files MENTION the
// function in their documentation without calling it, and a mention is
// not a call.
function withoutComments(text) {
  return text.replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '')
}

// A "caller" is any file that actually invokes the Edge Function.
const callers = sourceFiles.filter((f) =>
  /functions\.invoke\(\s*['"]gemini-explain['"]/.test(withoutComments(readFileSync(f, 'utf8')))
)

console.log('aiDisclosure tests\n')

test('the scan finds the known AI callers (the guard is not vacuous)', () => {
  const names = callers.map((f) => relative(SRC, f).replace(/\\/g, '/')).sort()
  for (const expected of [
    'components/assist/FinancialAssistCard.jsx',
    'pages/CTCExplorer.jsx',
    'pages/PFPension.jsx',
    'pages/Salary.jsx',
  ]) {
    assert.ok(names.includes(expected), `expected caller not found: ${expected} (found: ${names.join(', ')})`)
  }
})

test('every file that calls gemini-explain imports and renders AiDisclosure', () => {
  for (const file of callers) {
    const text = readFileSync(file, 'utf8')
    const rel = relative(SRC, file).replace(/\\/g, '/')
    assert.ok(/import\s+AiDisclosure\s+from/.test(text), `${rel} calls gemini-explain but does not import AiDisclosure`)
    assert.ok(/<AiDisclosure[\s>]/.test(text), `${rel} imports AiDisclosure but never renders it`)
  }
})

test('the disclosure links to the AI & Data Processing Notice', () => {
  const text = readFileSync(join(SRC, 'components/ui/AiDisclosure.jsx'), 'utf8')
  assert.ok(text.includes('/ai-data-notice'))
})

console.log(`\n${passed} passed, ${failed} failed`)
if (failed > 0) process.exit(1)
