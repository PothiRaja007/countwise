// P3 — cross-check: the command folder's amount reader against the transaction parser's.
//
// The command folder may not import categorization.js (rule I10), so it has its own
// reader. This test lives OUTSIDE the folder so it may import both, and proves that
// over every sentence P0 froze the two agree — except where a sentence holds several
// different amounts. There the transaction parser quietly picks one; the command
// reader refuses to ("ambiguous", both listed). Those sentences are pinned below,
// every one of them, with what each reader says.
import assert from 'node:assert'
import { readAmount } from './command/amountReader.js'
import { parseAmount } from './categorization.js'
import { MONEY_INBOX_CORPUS, RED_TEAM_CORPUS } from './moneyInboxCorpus.js'
import {
  BASELINE_INPUTS, COMMAND_SHAPED_INPUTS, BARE_WORD_INPUTS, MIXED_INPUTS, DATE_SENSITIVE_INPUTS, LIVE_RULE_INPUTS,
} from './moneyInboxGoldenInputs.js'

let passed = 0, failed = 0
function test(name, fn) {
  try { fn(); passed++; console.log(`  PASS  ${name}`) }
  catch (err) { failed++; console.log(`  FAIL  ${name}\n${String(err.message).split('\n').map((l) => '        ' + l).join('\n')}`) }
}

const UNIVERSE = [...new Set([
  ...MONEY_INBOX_CORPUS.map((i) => i.text), ...RED_TEAM_CORPUS.map((i) => i.text),
  ...BASELINE_INPUTS, ...COMMAND_SHAPED_INPUTS, ...BARE_WORD_INPUTS, ...MIXED_INPUTS, ...DATE_SENSITIVE_INPUTS, ...LIVE_RULE_INPUTS,
])]

// [sentence, the amounts the command reader lists, what the transaction parser returns]
const KNOWN_DIFFERENCES = [
  ["Received Salary 25k and paid rent 4k for this month",[25000,4000],25000],
  ["auto 60 and metro 30",[60,30],60],
  ["bought shoes for 2000 and a shirt for 800",[2000,800],2000],
  ["breakfast 60 lunch 120 dinner 200",[60,120,200],60],
  ["breakfast 60, lunch 120, dinner 200",[60,120,200],60],
  ["bus 40 wallet, auto 60 wallet, metro 30 bank",[40,60,30],40],
  ["bus 40, auto 60, and lunch 200",[40,60,200],40],
  ["coffee 80\nbus 40",[80,40],80],
  ["coffee 80 & bus 40",[80,40],80],
  ["coffee 80 and bus 40",[80,40],80],
  ["coffee 80 and bus 40 and lunch 200",[80,40,200],80],
  ["coffee 80 wallet, lunch 250 bank",[80,250],80],
  ["coffee 80, bus 40",[80,40],80],
  ["coffee 80, bus 40, salary 25000",[80,40,25000],80],
  ["coffee 80,bus 40",[80,40],80],
  ["coffee 80; bus 40",[80,40],80],
  ["got 2 coffees for 160",[2,160],2],
  ["got 5000 from tuition, spent 200 on snacks",[5000,200],5000],
  ["lunch 250 wallet and dinner 400 bank",[250,400],250],
  ["lunch 250 wallet, dinner with friends 500 bank",[250,500],250],
  ["lunch 250 with friends, bus 40",[250,40],250],
  ["moved 2000 from SBI to wallet, coffee 80",[2000,80],2000],
  ["netflix 199, spotify 119",[199,119],199],
  ["paid 500 for dinner and got 200 cashback",[500,200],500],
  ["paid rent 8000 and got salary 25000",[8000,25000],8000],
  ["petrol 500 wallet, and coffee 80",[500,80],500],
  ["petrol 500, coffee 80 and lunch 200",[500,80,200],500],
  ["received 25k and paid rent 4k",[25000,4000],25000],
  ["rent 8k, fuel 2k, groceries 2.5k, netflix 149",[8000,2000,2500],8000],
  ["salary 25,000, rent 8,000",[25000,8000],25000],
  ["salary 25000, rent 8000, wifi 700, netflix 199",[25000,8000,700,199],25000],
  ["salary 25k received and rent 4k paid",[25000,4000],25000],
  ["salary came 25k, paid rent 8k",[25000,8000],25000],
  ["sold old phone for 8000 and bought earphones for 1500",[8000,1500],8000],
  ["spent 100 on tea, 50 on snacks",[100,50],100],
  ["spent 500 on dinner and 200 on movie",[500,200],500],
  ["spent 500 on fuel and received 2500 tuition",[500,2500],500],
  ["spent 500 on movie and 200 on snacks",[500,200],500],
  ["yesterday coffee 80, today lunch 200",[80,200],80],
]

console.log('commandAmountCrossCheck tests\n')

test('X1: over all 329 frozen sentences the readers agree, except the pinned multi-amount sentences', () => {
  assert.strictEqual(UNIVERSE.length, 329, 'the P0 lists changed size')
  const differences = []
  for (const t of UNIVERSE) {
    const mine = readAmount(t)
    const theirs = parseAmount(t)
    if (mine.status === 'found') assert.strictEqual(mine.value, theirs, `"${t}": the readers disagree on a single amount`)
    else if (mine.status === 'none') assert.strictEqual(theirs, null, `"${t}": the command reader found nothing but the transaction parser found ${theirs}`)
    else {
      assert.ok(mine.candidates.some((c) => c.value === theirs), `"${t}": the transaction parser's ${theirs} is not among ${JSON.stringify(mine.candidates)}`)
      differences.push([t, mine.candidates.map((c) => c.value), theirs])
    }
  }
  const byText = (a, b) => (a[0] < b[0] ? -1 : a[0] > b[0] ? 1 : 0)
  differences.sort(byText)
  assert.deepStrictEqual(differences, [...KNOWN_DIFFERENCES].sort(byText))
  assert.strictEqual(differences.length, 39)
  console.log(`        ${UNIVERSE.length - differences.length} sentences agree exactly; ${differences.length} multi-amount sentences differ by design`)
})

test('X2: "add 1.5L to my goal" is pinned: neither reader treats a bare L as lakh there, so a command asks for the amount', () => {
  assert.strictEqual(parseAmount('add 1.5L to my goal'), null)
  assert.deepStrictEqual(readAmount('add 1.5L to my goal'), { status: 'none' })
  // ...while the same text with a large-sum word is read as lakh by both.
  assert.strictEqual(parseAmount('salary 1.5L'), 150000)
  assert.strictEqual(readAmount('salary 1.5L').value, 150000)
})

test('X3: the readers agree on every command-shaped sentence in the answer key', () => {
  for (const t of COMMAND_SHAPED_INPUTS) {
    const mine = readAmount(t)
    assert.strictEqual(mine.status === 'found' ? mine.value : null, parseAmount(t), t)
  }
})

console.log(`\n${passed} passed, ${failed} failed`)
if (failed > 0) process.exit(1)
