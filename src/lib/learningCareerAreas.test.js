import assert from 'node:assert'
import {
  CAREER_AREA_CATALOGUE, CAREER_AREAS_LABEL, CAREER_AREAS_NOTE, careerAreasFor, normalizeForMatch,
} from './learningCareerAreas.js'

let passed = 0, failed = 0
function test(name, fn) {
  try { fn(); passed++; console.log(`  PASS  ${name}`) }
  catch (err) { failed++; console.log(`  FAIL  ${name}\n        ${err.message}`) }
}
const idOf = (name, tag) => careerAreasFor({ name, relevance_tag: tag })?.id ?? null

console.log('learningCareerAreas tests\n')

test('normalizeForMatch lower-cases and turns punctuation into single spaces', () => {
  assert.strictEqual(normalizeForMatch('  PL-300 (Power BI) '), 'pl 300 power bi')
  assert.strictEqual(normalizeForMatch('NISM V-A'), 'nism v a')
  assert.strictEqual(normalizeForMatch(null), '')
})

test('the certificates in the plan are recognised from realistic names', () => {
  assert.strictEqual(idOf('Google Data Analytics Certificate'), 'google-data-analytics')
  assert.strictEqual(idOf('Google Data Analytics (Coursera)'), 'google-data-analytics')
  assert.strictEqual(idOf('NISM V-A'), 'nism-v-a')
  assert.strictEqual(idOf('NISM Series V-A: Mutual Fund Distributors'), 'nism-v-a')
  assert.strictEqual(idOf('NISM VA exam'), 'nism-v-a')
  assert.strictEqual(idOf('Microsoft PL-300'), 'microsoft-pl-300')
  assert.strictEqual(idOf('PL300 prep'), 'microsoft-pl-300')
  assert.strictEqual(idOf('HackerRank SQL Intermediate'), 'hackerrank-sql')
})

test('specific certificates win over generic skills (first match, specific listed first)', () => {
  assert.strictEqual(idOf('HackerRank SQL Advanced'), 'hackerrank-sql') // not plain "sql"
  assert.strictEqual(idOf('Microsoft PL-300 Power BI Data Analyst'), 'microsoft-pl-300') // not plain "power bi"
  assert.strictEqual(idOf('SQL basics'), 'sql')
  assert.strictEqual(idOf('Power BI dashboards course'), 'power-bi')
})

test('matching is whole-word: look-alike words do not match', () => {
  assert.strictEqual(idOf('Excellent communication workshop'), null) // not "excel"
  assert.strictEqual(idOf('MySQL administration'), null) // not "sql"
  assert.strictEqual(idOf('Platform engineering'), null) // not "frm"
  assert.strictEqual(idOf('Pythonic habits'), null) // not "python"
})

test('the tag is searched too, and an unknown or empty item matches nothing (never a guess)', () => {
  assert.strictEqual(idOf('Weekend course', 'Tableau'), 'tableau')
  assert.strictEqual(careerAreasFor(null), null)
  assert.strictEqual(careerAreasFor({}), null)
  assert.strictEqual(careerAreasFor({ name: '   ' }), null)
  assert.strictEqual(idOf('Guitar lessons'), null)
})

test('the result carries a copy of the right areas for that entry', () => {
  const m = careerAreasFor({ name: 'Google Data Analytics' })
  assert.ok(m.areas.includes('Financial data analysis'))
  assert.ok(m.areas.length >= 3)
})

test('changing the returned list cannot change the catalogue', () => {
  const m = careerAreasFor({ name: 'Google Data Analytics' })
  m.areas.push('Something else')
  assert.ok(!careerAreasFor({ name: 'Google Data Analytics' }).areas.includes('Something else'))
})

// ---- catalogue integrity -------------------------------------------------
test('every entry has a unique id, usable keywords and 3 to 6 distinct areas', () => {
  const ids = CAREER_AREA_CATALOGUE.map((e) => e.id)
  assert.strictEqual(new Set(ids).size, ids.length, 'duplicate id')
  for (const e of CAREER_AREA_CATALOGUE) {
    assert.ok(e.keywords.length > 0, `${e.id}: no keywords`)
    for (const k of e.keywords) assert.ok(normalizeForMatch(k).length > 0, `${e.id}: empty keyword`)
    assert.ok(e.areas.length >= 3 && e.areas.length <= 6, `${e.id}: ${e.areas.length} areas`)
    assert.strictEqual(new Set(e.areas).size, e.areas.length, `${e.id}: repeated area`)
  }
})

test('no keyword is claimed by two entries (otherwise one silently hides the other)', () => {
  const seen = new Map()
  for (const e of CAREER_AREA_CATALOGUE) {
    for (const k of e.keywords.map(normalizeForMatch)) {
      assert.ok(!seen.has(k), `"${k}" is in both ${seen.get(k)} and ${e.id}`)
      seen.set(k, e.id)
    }
  }
})

test('order guard: any entry whose keyword contains another entry\'s keyword comes first', () => {
  const idx = new Map(CAREER_AREA_CATALOGUE.map((e, i) => [e.id, i]))
  for (const specific of CAREER_AREA_CATALOGUE) {
    for (const other of CAREER_AREA_CATALOGUE) {
      if (specific.id === other.id) continue
      const containsOther = specific.keywords.some((sk) =>
        other.keywords.some((ok) => ` ${normalizeForMatch(sk)} `.includes(` ${normalizeForMatch(ok)} `))
      )
      if (containsOther) assert.ok(idx.get(specific.id) < idx.get(other.id), `${specific.id} must be listed before ${other.id}`)
    }
  }
})

// ---- wording: possibilities, never promises -------------------------------
const ALL_TEXT = [CAREER_AREAS_LABEL, CAREER_AREAS_NOTE, ...CAREER_AREA_CATALOGUE.flatMap((e) => e.areas)].join(' | ')

test('no guarantee, qualification, pay or hiring language anywhere in the shown text', () => {
  const banned = [/guarantee/i, /\bqualif/i, /\bwill (get|earn|land|become)\b/i, /\bhired?\b/i, /placement/i, /salary/i, /\blpa\b/i, /job offer/i, /assured/i, /definitely/i, /[%₹]/]
  for (const re of banned) assert.ok(!re.test(ALL_TEXT), `banned wording matched: ${re}`)
})

test('the label says "possible" and the note says it is not a promise', () => {
  assert.ok(/possible/i.test(CAREER_AREAS_LABEL))
  assert.ok(/not a promise/i.test(CAREER_AREAS_NOTE))
})

test('no company or brand names are used as job areas', () => {
  const brands = /(google|microsoft|tcs|infosys|hdfc|icici|deloitte|kpmg|amazon)/i
  const areasOnly = CAREER_AREA_CATALOGUE.flatMap((e) => e.areas).join(' | ')
  assert.ok(!brands.test(areasOnly))
})

console.log(`\n${passed} passed, ${failed} failed`)
if (failed > 0) process.exit(1)
