// Proves categoryTruth.js matches the real source files, by RE-PARSING them
// fresh — not by re-checking my own transcription. If schema.sql or
// categorySeed.js changes and categoryTruth.js isn't updated to match,
// this file fails, which is the whole point: a stale source-of-truth file
// would otherwise poison every downstream corpus generation silently.
import assert from 'node:assert'
import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { join } from 'node:path'
import {
  GLOBAL_CATEGORIES, GLOBAL_CATEGORY_NAMES, GLOBAL_KEYWORD_RULES,
  ACCOUNT_SCOPED_CATEGORIES, SPENDING_CONTEXT_VALUES,
} from './categoryTruth.js'
import { matchCategory } from '../categorization.js'

let passed = 0, failed = 0
function test(name, fn) {
  try { fn(); passed++; console.log(`  PASS  ${name}`) }
  catch (err) { failed++; console.log(`  FAIL  ${name}\n        ${err.message}`) }
}

const ROOT = join(fileURLToPath(new URL('.', import.meta.url)), '..', '..', '..')
const schemaSql = readFileSync(join(ROOT, 'supabase', 'schema.sql'), 'utf8')
const categorySeedJs = readFileSync(join(ROOT, 'src', 'lib', 'categorySeed.js'), 'utf8')

console.log('categoryTruth tests\n')

// ---- Re-parse the 19 default categories straight from schema.sql --------
test('GLOBAL_CATEGORIES matches every is_default=true row in schema.sql, freshly parsed', () => {
  const region = schemaSql.slice(schemaSql.indexOf('-- Seed default categories'), schemaSql.indexOf('-- CountWise — default category_rules seed'))
    + schemaSql.slice(schemaSql.indexOf('-- PHASE 17.1'), schemaSql.indexOf('-- Food: add the literal phrase'))
  const rows = [...region.matchAll(/\(\s*'([^']+)',\s*'(expense|income)',\s*'[^']*'(?:,\s*true)?\s*\)/g)]
    .map((m) => ({ name: m[1], kind: m[2] }))
  assert.strictEqual(rows.length, 19, `expected 19 category rows in schema.sql, found ${rows.length}`)
  // Order-independent: schema.sql's insertion order is chronological (Phase
  // 17.1's six categories were added after the original nine expense + four
  // income), while GLOBAL_CATEGORIES groups by kind to match the design
  // doc's own numbering (1-15 expense, 16-19 income). The SET must match
  // exactly; the order is a readability choice, not a fact to re-verify.
  const norm = (list) => [...list].sort((a, b) => a.name.localeCompare(b.name))
  assert.deepStrictEqual(norm(rows), norm(GLOBAL_CATEGORIES))
})

test('GLOBAL_CATEGORY_NAMES has no duplicates and matches GLOBAL_CATEGORIES', () => {
  assert.strictEqual(new Set(GLOBAL_CATEGORY_NAMES).size, 19)
  assert.deepStrictEqual(GLOBAL_CATEGORY_NAMES, GLOBAL_CATEGORIES.map((c) => c.name))
})

// ---- Re-parse EVERY category_rules insert and delete, replay in order ---
function parseKeywordRulesFromSchema(sql) {
  const region = sql.slice(sql.indexOf('-- CountWise — default category_rules seed'), sql.indexOf('-- Food: add the literal phrase') + 500)
  const events = []
  const insertRe = /insert into category_rules[\s\S]*?array\[([\s\S]*?)\],\s*\n\s*array\[([\d,\s]+)\][\s\S]*?where c\.name = '([^']+)'/g
  for (const m of region.matchAll(insertRe)) {
    const keywords = [...m[1].matchAll(/'([^']+)'/g)].map((x) => x[1])
    const priorities = m[2].split(',').map((s) => Number(s.trim()))
    events.push({ type: 'insert', category: m[3], pairs: keywords.map((k, i) => [k, priorities[i]]), pos: m.index })
  }
  const deleteRe = /delete from category_rules[\s\S]*?keyword\s*(?:in\s*\(([^)]+)\)|=\s*'([^']+)')[\s\S]*?category_id in \(select id from categories where name = '([^']+)'/g
  for (const m of region.matchAll(deleteRe)) {
    const keywords = m[1] ? [...m[1].matchAll(/'([^']+)'/g)].map((x) => x[1]) : [m[2]]
    events.push({ type: 'delete', category: m[3], keywords, pos: m.index })
  }
  events.sort((a, b) => a.pos - b.pos)

  const live = [] // [{keyword, category, priority}], insertion order preserved
  for (const ev of events) {
    if (ev.type === 'insert') {
      for (const [keyword, priority] of ev.pairs) live.push({ keyword, category: ev.category, priority })
    } else {
      for (let i = live.length - 1; i >= 0; i--) {
        if (live[i].category === ev.category && ev.keywords.includes(live[i].keyword)) live.splice(i, 1)
      }
    }
  }
  return live
}

test('GLOBAL_KEYWORD_RULES matches schema.sql after replaying every insert AND delete in document order', () => {
  const replayed = parseKeywordRulesFromSchema(schemaSql)
  const norm = (rows) => rows.map((r) => `${r.keyword}|${r.category}|${r.priority}`).sort()
  assert.deepStrictEqual(norm(replayed), norm(GLOBAL_KEYWORD_RULES))
})

test("'Other' and 'Other income' have zero keywords, by design (deliberate catch-alls)", () => {
  assert.strictEqual(GLOBAL_KEYWORD_RULES.filter((r) => r.category === 'Other').length, 0)
  assert.strictEqual(GLOBAL_KEYWORD_RULES.filter((r) => r.category === 'Other income').length, 0)
})

test('every GLOBAL_KEYWORD_RULES row points at a real GLOBAL_CATEGORIES name', () => {
  for (const r of GLOBAL_KEYWORD_RULES) assert.ok(GLOBAL_CATEGORY_NAMES.includes(r.category), `unknown category: ${r.category}`)
})

// ---- The real, live 'phone bill' collision — proven, not just claimed ---
test("'phone bill' is genuinely ambiguous in the live system (Bills & Utilities vs Mobile Recharge), order-dependent", () => {
  const asBillsFirst = GLOBAL_KEYWORD_RULES.filter((r) => r.keyword === 'phone bill')
  assert.strictEqual(asBillsFirst.length, 2, 'expected phone bill seeded under two categories')
  const categories = asBillsFirst.map((r) => r.category).sort()
  assert.deepStrictEqual(categories, ['Bills & Utilities', 'Mobile Recharge'])
  // Same equal-priority rules, opposite array order -> opposite real answer from the real matchCategory().
  const [a, b] = asBillsFirst
  const forward = [a, b].map((r) => ({ keyword: r.keyword, category_id: r.category, priority: r.priority }))
  const reversed = [b, a].map((r) => ({ keyword: r.keyword, category_id: r.category, priority: r.priority }))
  const resultForward = matchCategory('paid my phone bill 500', forward)
  const resultReversed = matchCategory('paid my phone bill 500', reversed)
  assert.notStrictEqual(resultForward, resultReversed, 'expected the real matchCategory() to disagree with itself depending on rule order')
})

// ---- Account-scoped categories, re-parsed fresh from categorySeed.js ----
test('ACCOUNT_SCOPED_CATEGORIES matches STUDENT_EXTRA + EMPLOYED_EXTRA, freshly parsed from categorySeed.js', () => {
  const extract = (block) => [...block.matchAll(/\{\s*name:\s*'([^']+)',\s*kind:\s*'([^']+)',\s*icon:\s*'[^']*',\s*\n\s*rules:\s*\[([^\]]*)\]\s*\}/g)]
    .map((m) => ({ name: m[1], kind: m[2], keywords: [...m[3].matchAll(/'([^']+)'/g)].map((x) => x[1]) }))
  const studentBlock = categorySeedJs.slice(categorySeedJs.indexOf('STUDENT_EXTRA'), categorySeedJs.indexOf('EMPLOYED_EXTRA'))
  const employedBlock = categorySeedJs.slice(categorySeedJs.indexOf('const EMPLOYED_EXTRA'), categorySeedJs.indexOf('export async function'))
  const parsed = [...extract(studentBlock), ...extract(employedBlock)]
  const expected = ACCOUNT_SCOPED_CATEGORIES.map((c) => ({ name: c.name, kind: c.kind, keywords: c.keywords }))
  assert.deepStrictEqual(parsed, expected)
})

test('no ACCOUNT_SCOPED_CATEGORIES name collides with a GLOBAL_CATEGORIES name', () => {
  for (const c of ACCOUNT_SCOPED_CATEGORIES) assert.ok(!GLOBAL_CATEGORY_NAMES.includes(c.name), `collision: ${c.name}`)
})

// ---- Spending context: re-exported, not copied ---------------------------
test('SPENDING_CONTEXT_VALUES is exactly the four real values (this is the v1 mistake this file must never repeat)', () => {
  assert.deepStrictEqual([...SPENDING_CONTEXT_VALUES].sort(), ['planned', 'routine', 'social', 'unplanned'])
})

console.log(`\n${passed} passed, ${failed} failed`)
if (failed > 0) process.exit(1)
