// P2 — tests for the period reader (periodParser.js).
//
// The promises under test: a month phrase is read EXACTLY (never as "today"),
// anything it assumes is flagged and explained, anything it does not support is
// reported rather than ignored, and nothing reads the real clock.
//
// R15 is a MEASUREMENT: it runs the reader over every sentence P0 froze and pins
// exactly which ones contain a period word. That tells P3 where period words show
// up inside ordinary transactions ("yesterday", "3 days ago", "12 Sept").
import assert from 'node:assert'
import * as PP from './periodParser.js'
import { readPeriod, currentMonthPeriod, monthPeriod, PeriodReaderError } from './periodParser.js'
import { createPendingAction } from './pendingAction.js'
import { EXPECTED_ROUTING } from './expectedRouting.js'
import { parseDate } from '../dateParser.js'
import { MONEY_INBOX_CORPUS, RED_TEAM_CORPUS } from '../moneyInboxCorpus.js'
import {
  BASELINE_INPUTS, COMMAND_SHAPED_INPUTS, BARE_WORD_INPUTS, MIXED_INPUTS, DATE_SENSITIVE_INPUTS, LIVE_RULE_INPUTS,
} from '../moneyInboxGoldenInputs.js'

let passed = 0, failed = 0
function test(name, fn) {
  try { fn(); passed++; console.log(`  PASS  ${name}`) }
  catch (err) { failed++; console.log(`  FAIL  ${name}\n${String(err.message).split('\n').map((l) => '        ' + l).join('\n')}`) }
}
const refusedWith = (code, fn) => assert.throws(fn, (e) => e instanceof PeriodReaderError && e.code === code, `expected a refusal with code "${code}"`)

const REF = new Date(2026, 8, 28) // 28 Sep 2026, built with the LOCAL constructor like every other fixture in the project
const pad = (n) => String(n).padStart(2, '0')
const ym = (y, m) => `${y}-${pad(m)}`
const FULL = ['january', 'february', 'march', 'april', 'may', 'june', 'july', 'august', 'september', 'october', 'november', 'december']
const ABBR = ['jan', 'feb', 'mar', 'apr', 'may', 'jun', 'jul', 'aug', 'sep', 'oct', 'nov', 'dec']
const CAP = (s) => s[0].toUpperCase() + s.slice(1)
const read = (text, prefer) => readPeriod(text, REF, prefer ? { prefer } : undefined)

console.log('periodParser tests\n')

test('R1: every relative phrase gives the right month, with every field filled in', () => {
  const cases = [
    ['this month', '2026-09'], ['current month', '2026-09'], ['present month', '2026-09'],
    ['last month', '2026-08'], ['previous month', '2026-08'], ['prior month', '2026-08'],
    ['next month', '2026-10'], ['following month', '2026-10'], ['coming month', '2026-10'],
  ]
  for (const [phrase, month] of cases) {
    const r = read(`how much did I spend ${phrase} please`)
    assert.strictEqual(r.status, 'found', phrase)
    assert.strictEqual(r.period.month, month, phrase)
    assert.strictEqual(r.period.how, 'relative')
    assert.strictEqual(r.period.assumed, false)
    assert.strictEqual(r.period.assumption, null)
    assert.strictEqual(r.period.matchedText, phrase)
  }
  assert.deepStrictEqual({ ...read('last month').period }, {
    kind: 'month', month: '2026-08', start: '2026-08-01', end: '2026-08-31', label: 'August 2026',
    how: 'relative', matchedText: 'last month', assumed: false, assumption: null,
  })
  assert.strictEqual(read("Create next month's budget").period.month, '2026-10') // possessive
  assert.strictEqual(read('THIS MONTH').period.matchedText, 'THIS MONTH') // as written
  assert.strictEqual(read('last    month').status, 'found') // extra spaces
})

test('R2: "last month" and "next month" are NEVER the reference month — across every month of 2026 to 2028', () => {
  for (let y = 2026; y <= 2028; y++) {
    for (let m = 0; m < 12; m++) {
      const ref = new Date(y, m, 15)
      const here = ym(y, m + 1)
      const prev = new Date(y, m - 1, 1), next = new Date(y, m + 1, 1)
      const last = readPeriod('last month', ref).period.month, nxt = readPeriod('next month', ref).period.month
      assert.strictEqual(last, ym(prev.getFullYear(), prev.getMonth() + 1), `last month from ${here}`)
      assert.strictEqual(nxt, ym(next.getFullYear(), next.getMonth() + 1), `next month from ${here}`)
      assert.notStrictEqual(last, here)
      assert.notStrictEqual(nxt, here)
      assert.strictEqual(readPeriod('this month', ref).period.month, here)
    }
  }
  assert.strictEqual(readPeriod('last month', new Date(2027, 0, 15)).period.month, '2026-12') // January -> previous December
  assert.strictEqual(readPeriod('next month', new Date(2026, 11, 31)).period.month, '2027-01') // December -> next January
  assert.strictEqual(readPeriod('next month', new Date(2028, 0, 31)).period.end, '2028-02-29') // into a leap February
})

test('R3: month starts and ends are exact for every month of 2000 to 2100 (checked against the real calendar)', () => {
  for (let y = 2000; y <= 2100; y++) {
    for (let m = 1; m <= 12; m++) {
      const p = monthPeriod(y, m)
      assert.strictEqual(p.start, `${y}-${pad(m)}-01`)
      assert.strictEqual(p.end, `${y}-${pad(m)}-${pad(new Date(y, m, 0).getDate())}`, `${y}-${pad(m)}`)
      assert.strictEqual(p.month, ym(y, m))
    }
  }
  assert.deepStrictEqual([2000, 2027, 2028, 2100].map((y) => monthPeriod(y, 2).end.slice(-2)), ['29', '28', '29', '28'])
})

test('R4: the label is exactly the one the Budgets page shows (en-IN, "October 2026")', () => {
  for (let y = 2020; y <= 2030; y++) {
    for (let m = 1; m <= 12; m++) {
      assert.strictEqual(monthPeriod(y, m).label, new Date(y, m - 1, 1).toLocaleDateString('en-IN', { month: 'long', year: 'numeric' }))
    }
  }
})

test('R5: month names (full, abbreviated, "sept"), any case, with or without in/by/for/of; explicit years; ISO months', () => {
  for (let i = 0; i < 12; i++) {
    const words = new Set([FULL[i], ABBR[i], i === 8 ? 'sept' : FULL[i]])
    for (const w of words) {
      for (const variant of [w, w.toUpperCase(), CAP(w)]) {
        const r = read(`in ${variant}`, 'future')
        assert.strictEqual(r.status, 'found', `in ${variant}`)
        assert.strictEqual(r.period.month.slice(5), pad(i + 1), `in ${variant}`)
        assert.strictEqual(r.period.how, 'named')
      }
    }
  }
  for (const prep of ['in', 'by', 'for', 'of', 'during', 'until', 'till', 'from', 'since', 'to', '']) {
    const r = read(`${prep} october`, 'past')
    assert.strictEqual(r.period.month, '2025-10', `"${prep} october"`)
    assert.strictEqual(r.period.matchedText, 'october', 'the preposition is ignored, not part of the match')
  }
  for (const [text, matched] of [['October 2026', 'October 2026'], ['oct 2026', 'oct 2026'], ['in october 2026', 'october 2026'], ['rent 8000 on 3 oct 2026', 'oct 2026']]) {
    const r = read(text) // no `prefer` needed when the year is written
    assert.deepStrictEqual([r.status, r.period.month, r.period.how, r.period.assumed, r.period.assumption, r.period.matchedText], ['found', '2026-10', 'explicit', false, null, matched], text)
  }
  for (const text of ['2026-10', 'for 2026-10', 'in 2026-10, please']) {
    const r = read(text)
    assert.deepStrictEqual([r.status, r.period.month, r.period.how, r.period.assumed], ['found', '2026-10', 'explicit', false], text)
  }
  // "oct 26" is more likely a day than a year: the 26 is not read as a year.
  const day = read('oct 26', 'past')
  assert.deepStrictEqual([day.period.month, day.period.how, day.period.matchedText], ['2025-10', 'named', 'oct'])
  // A full date or an impossible month is not a month period.
  assert.strictEqual(read('2026-10-05').status, 'none')
  assert.strictEqual(read('2026-13').status, 'none')
  assert.strictEqual(read('2026-00').status, 'none')
})

test('R6: a month name without a year needs a direction, flags the assumption, and the current month counts both ways', () => {
  const at = (word, prefer) => read(`in ${word}`, prefer)
  const expect = [
    ['december', 'past', '2025-12'], ['december', 'future', '2026-12'],
    ['january', 'past', '2026-01'], ['january', 'future', '2027-01'],
    ['september', 'past', '2026-09'], ['september', 'future', '2026-09'],
    ['october', 'past', '2025-10'], ['october', 'future', '2026-10'],
  ]
  for (const [word, prefer, month] of expect) {
    const p = at(word, prefer).period
    assert.strictEqual(p.month, month, `${word} ${prefer}`)
    assert.strictEqual(p.assumed, true)
    const name = CAP(word)
    const label = `${name} ${month.slice(0, 4)}`
    assert.strictEqual(p.assumption, prefer === 'past' ? `No year given, so using the most recent ${name}: ${label}` : `No year given, so using the upcoming ${name}: ${label}`)
    assert.strictEqual(p.label, label)
  }
  refusedWith('prefer_required', () => read('in december')) // never silently defaulted
  refusedWith('prefer_required', () => read('from october to december'))
  refusedWith('invalid_prefer', () => read('in december', 'sometime'))
  // Not needed when nothing is being inferred.
  assert.strictEqual(read('this month').status, 'found')
  assert.strictEqual(read('december 2026').status, 'found')
  assert.strictEqual(read('2026-12').status, 'found')
  assert.strictEqual(read('may I add 500 to my laptop goal').status, 'none') // an ignored "may" needs no direction
})

test('R7: the word "may" is a month only after a cue word, before a 4-digit year, or on its own', () => {
  for (const text of ['may I add 500 to my laptop goal', 'it may be 500', 'I may spend more', 'coffee may 80']) {
    assert.strictEqual(read(text, 'future').status, 'none', text)
  }
  for (const text of ['in may', 'by may', 'for may', 'of may', 'during may', 'since may', 'to may', 'may', 'May', '  may  ']) {
    const r = read(text, 'future')
    assert.strictEqual(r.status, 'found', text)
    assert.strictEqual(r.period.month, '2027-05', text)
  }
  const withYear = read('may 2027')
  assert.deepStrictEqual([withYear.status, withYear.period.month, withYear.period.how, withYear.period.assumed], ['found', '2027-05', 'explicit', false])
  assert.strictEqual(read('i may spend 500 in march', 'future').period.month, '2027-03') // the verb is ignored, the month is not
})

test('R8: two different months are ambiguous (oldest first); the same month said twice is one month', () => {
  const a = read('from october to december', 'future')
  assert.strictEqual(a.status, 'ambiguous')
  assert.deepStrictEqual(a.candidates.map((c) => c.month), ['2026-10', '2026-12'])
  const b = read('this month and last month')
  assert.strictEqual(b.status, 'ambiguous')
  assert.deepStrictEqual(b.candidates.map((c) => c.month), ['2026-08', '2026-09'])
  const c = read('december and october and november', 'future')
  assert.deepStrictEqual(c.candidates.map((x) => x.month), ['2026-10', '2026-11', '2026-12'])
  for (const text of ['october and oct', 'this month (september)', 'last month, i.e. august']) {
    const r = read(text, 'past')
    assert.strictEqual(r.status, 'found', text)
  }
  assert.strictEqual(read('this month (september)', 'past').period.how, 'relative', 'the first one written wins')
})

test('R9: day, week, year and quarter periods are reported as unsupported — never ignored, never turned into this month', () => {
  const cases = [
    ['How much did I spend this year?', ['year']], ['last week', ['week']], ['yesterday', ['yesterday']], ['today', ['today']],
    ['tomorrow', ['tomorrow']], ['tonight', ['tonight']], ['last 30 days', ['30 days']], ['past 7 days', ['7 days']],
    ['q3', ['q3']], ['Q4 spending', ['q4']], ['this quarter', ['quarter']], ['weekly budget', ['weekly']],
    ['this fortnight', ['fortnight']], ['annual summary', ['annual']], ['years', ['years']], ['coffee 80 3 days ago', ['3 days']],
    ['yesterday coffee 80, today lunch 200', ['yesterday', 'today']], ['day before yesterday', ['yesterday']],
  ]
  for (const [text, words] of cases) {
    const r = read(text, 'past')
    assert.strictEqual(r.status, 'unsupported', text)
    assert.deepStrictEqual([...r.unsupported], words, text)
    assert.strictEqual(r.period, undefined)
  }
  // Unsupported wins, even when a month phrase is also present.
  assert.deepStrictEqual([...read('this month and this year').unsupported], ['year'])
  assert.strictEqual(read('last month vs last week').status, 'unsupported')
  // Words that merely contain these letters are not period words.
  for (const text of ['weekend trip 500', 'yearbook 300', 'todays special 40', 'daylight 30']) assert.strictEqual(read(text).status, 'none', text)
})

test('R10: text with no period words is "none" — and readPeriod never applies a default', () => {
  for (const text of ['coffee 80', 'rent 8000', 'Open my goals', 'salary', '', '   ', 'How much is in my SBI account?']) {
    const r = read(text)
    assert.deepStrictEqual({ ...r }, { status: 'none' }, JSON.stringify(text))
  }
})

test('R11: the explicit default says so, and fits P1\'s rule for a defaulted field (origin "default" needs a note)', () => {
  const d = currentMonthPeriod(REF)
  assert.deepStrictEqual({ ...d }, {
    kind: 'month', month: '2026-09', start: '2026-09-01', end: '2026-09-30', label: 'September 2026',
    how: 'default', matchedText: null, assumed: true, assumption: 'Using the current calendar month',
  })
  const action = createPendingAction({
    id: 'r11', intent: 'QUERY_SPEND', source: 'How much did I spend on food?',
    fields: { period: { value: d.month, kind: 'actual', origin: 'default', note: d.assumption } },
  }, 1_800_000_000_000)
  assert.strictEqual(action.status, 'ready')
  assert.strictEqual(action.fields.period.note, 'Using the current calendar month')
  assert.strictEqual(currentMonthPeriod(new Date(2028, 1, 29)).end, '2028-02-29')
})

test('R12: the 41 answer-key sentences — three period sentences read correctly, one goal date is assumed, the other 37 have no period', () => {
  const expected = {
    'How much did I spend on food this month?': ['found', '2026-09', 'relative'],
    'How much did I spend last month?': ['found', '2026-08', 'relative'],
    "Create next month's budget": ['found', '2026-10', 'relative'],
    'Create a goal called Laptop for 50000 by December': ['found', '2026-12', 'named'],
  }
  assert.strictEqual(EXPECTED_ROUTING.length, 41)
  for (const e of EXPECTED_ROUTING) {
    const r = read(e.text, e.text.includes('by December') ? 'future' : 'past')
    if (expected[e.text]) {
      assert.deepStrictEqual([r.status, r.period.month, r.period.how], expected[e.text], e.text)
    } else {
      assert.strictEqual(r.status, 'none', `${e.text} should contain no period`)
    }
  }
  const goalDate = read('Create a goal called Laptop for 50000 by December', 'future').period
  assert.deepStrictEqual([goalDate.assumed, goalDate.end], [true, '2026-12-31'])
})

test('R13: no hidden clock; bad inputs are refused; exactly four exports; results are deeply frozen', () => {
  assert.deepStrictEqual(Object.keys(PP).sort(), ['PeriodReaderError', 'currentMonthPeriod', 'monthPeriod', 'readPeriod'])
  const notDates = ['2026-09-28', undefined, null, 1_790_000_000_000, {}, new Date('not a date')]
  const RealDate = globalThis.Date
  class NoClockDate extends RealDate {
    constructor(...args) {
      if (args.length === 0) throw new Error('code read the real clock: new Date() with no argument')
      super(...args)
    }
    static now() { throw new Error('code read the real clock: Date.now()') }
    static [Symbol.hasInstance](x) { return x instanceof RealDate }
  }
  globalThis.Date = NoClockDate
  try {
    readPeriod("Create next month's budget", REF)
    readPeriod('in december', REF, { prefer: 'future' })
    readPeriod('from october to december', REF, { prefer: 'past' })
    readPeriod('this year', REF)
    currentMonthPeriod(REF)
    monthPeriod(2026, 9)
  } finally { globalThis.Date = RealDate }
  for (const bad of notDates) {
    refusedWith('reference_date_required', () => readPeriod('this month', bad))
    refusedWith('reference_date_required', () => currentMonthPeriod(bad))
  }
  refusedWith('text_required', () => readPeriod(undefined, REF))
  refusedWith('text_required', () => readPeriod(42, REF))
  for (const [y, m] of [[2026, 0], [2026, 13], [2026, 1.5], [0, 1], [10000, 1], ['2026', 1]]) refusedWith('invalid_month', () => monthPeriod(y, m))
  const options = Object.freeze({ prefer: 'past' })
  const r = readPeriod('from october to december', REF, options)
  assert.ok(Object.isFrozen(r) && Object.isFrozen(r.candidates) && Object.isFrozen(r.candidates[0]))
  assert.ok(Object.isFrozen(readPeriod('this month', REF).period))
  assert.ok(Object.isFrozen(readPeriod('this year', REF).unsupported))
  assert.throws(() => { readPeriod('this month', REF).period.month = '2000-01' }, TypeError)
  assert.ok(Object.isFrozen(currentMonthPeriod(REF)) && Object.isFrozen(monthPeriod(2026, 9)))
})

test('R14: P2\'s month table agrees with dateParser.js on every month word they share', () => {
  for (let i = 0; i < 12; i++) {
    const words = [FULL[i], ABBR[i], ...(i === 8 ? ['sept'] : [])].filter((w) => w !== 'may')
    for (const word of new Set(words)) {
      const theirs = parseDate(`1 ${word}`, REF)
      assert.strictEqual(typeof theirs, 'string', `dateParser did not read "${word}"`)
      const ours = read(`in ${word}`, 'past').period.month
      assert.strictEqual(theirs.slice(5, 7), ours.slice(5), `"${word}": dateParser says month ${theirs.slice(5, 7)}, P2 says ${ours.slice(5)}`)
    }
  }
})

// ---- R15: the measurement. Generated once from the reader, reviewed by the owner, and pinned. ----
// Each row: [sentence, status, detail]. Read with prefer "past". Everything NOT listed here has no period.
const R15_NON_NONE = [
  ["12 Sept coffee 80","found","2026-09 named"],
  ["Create a goal called Laptop for 50000 by December","found","2025-12 named"],
  ["Create next month's budget","found","2026-10 relative"],
  ["How much did I spend last month?","found","2026-08 relative"],
  ["How much did I spend on food this month?","found","2026-09 relative"],
  ["Received Salary 25k and paid rent 4k for this month","found","2026-09 relative"],
  ["coffee 80 2 days ago","unsupported","2 days"],
  ["coffee 80 3 days ago","unsupported","3 days"],
  ["coffee 80 day before yesterday","unsupported","yesterday"],
  ["coffee 80 on 12 Sept","found","2026-09 named"],
  ["coffee 80 today","unsupported","today"],
  ["coffee 80 yesterday","unsupported","yesterday"],
  ["day before yesterday coffee 80","unsupported","yesterday"],
  ["fuel 500 3 days ago","unsupported","3 days"],
  ["got paid 25000 today","unsupported","today"],
  ["rent 8000 on 3 oct","found","2025-10 named"],
  ["watched a movie yesterday and spent 400","unsupported","yesterday"],
  ["yesterday coffee 80, today lunch 200","unsupported","yesterday, today"],
]

test('R15: the exact set of frozen sentences that contain a period word is pinned (the measurement for P3)', () => {
  const universe = [...new Set([
    ...MONEY_INBOX_CORPUS.map((i) => i.text), ...RED_TEAM_CORPUS.map((i) => i.text),
    ...BASELINE_INPUTS, ...COMMAND_SHAPED_INPUTS, ...BARE_WORD_INPUTS, ...MIXED_INPUTS, ...DATE_SENSITIVE_INPUTS, ...LIVE_RULE_INPUTS,
  ])]
  assert.strictEqual(universe.length, 329, 'the P0 lists changed size')
  const detail = (r) => r.status === 'found' ? `${r.period.month} ${r.period.how}` : r.status === 'unsupported' ? r.unsupported.join(', ') : r.candidates.map((c) => c.month).join(' + ')
  const measured = universe.map((t) => [t, readPeriod(t, REF, { prefer: 'past' })])
    .filter(([, r]) => r.status !== 'none')
    .map(([t, r]) => [t, r.status, detail(r)])
    .sort((a, b) => (a[0] < b[0] ? -1 : a[0] > b[0] ? 1 : 0))
  const pinned = [...R15_NON_NONE].sort((a, b) => (a[0] < b[0] ? -1 : a[0] > b[0] ? 1 : 0))
  assert.deepStrictEqual(measured, pinned)
  const counts = (rows) => rows.reduce((o, r) => ({ ...o, [r[1]]: (o[r[1]] || 0) + 1 }), {})
  assert.deepStrictEqual(counts(measured), counts(pinned))
})

console.log(`\n${passed} passed, ${failed} failed`)
if (failed > 0) process.exit(1)
