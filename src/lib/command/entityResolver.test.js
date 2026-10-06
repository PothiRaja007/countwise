// P2 — tests for the name matcher (entityResolver.js).
//
// The promises under test: whole words only; two matches are always returned as
// two (never reduced to one, and an exact match is not promoted over a partial
// one); "it" and "that goal" are recognised as references and never matched; a
// bare kind word is "empty"; and the result plugs straight into P1's ambiguity
// shape. The matcher never extracts a phrase from a sentence — in M12 the phrase
// is picked by hand, exactly as P3 will later do it in code.
import assert from 'node:assert'
import * as ER from './entityResolver.js'
import { resolveName, normalizeName, ambiguityFromResolution, EntityResolverError, ENTITY_KINDS } from './entityResolver.js'
import { createPendingAction } from './pendingAction.js'

let passed = 0, failed = 0
function test(name, fn) {
  try { fn(); passed++; console.log(`  PASS  ${name}`) }
  catch (err) { failed++; console.log(`  FAIL  ${name}\n${String(err.message).split('\n').map((l) => '        ' + l).join('\n')}`) }
}
const refusedWith = (code, fn) => assert.throws(fn, (e) => e instanceof EntityResolverError && e.code === code, `expected a refusal with code "${code}"`)

const c = (id, name) => ({ id, name })
const GOALS = [c('g1', 'Laptop'), c('g2', 'Laptop fund'), c('g3', 'Trip to Goa')]
const CATEGORIES = [c('c1', 'Food'), c('c2', 'Seafood'), c('c3', 'Rent')]
const ITEMS = [c('l1', 'Power BI certification'), c('l2', 'SQL basics')]
const ACCOUNTS = [c('a1', 'SBI Savings'), c('a2', 'Wallet'), c('a3', 'Bank')]
const run = (kind, list, phrase) => resolveName(phrase, list, { kind })
const names = (r) => r.matches.map((m) => m.name)

console.log('entityResolver tests\n')

test('M1: names are normalised — case, punctuation, hyphens, possessives, apostrophes, spaces, full-width characters', () => {
  assert.strictEqual(normalizeName('Power-BI'), 'power bi')
  assert.strictEqual(normalizeName('  Laptop    FUND  '), 'laptop fund')
  assert.strictEqual(normalizeName("SBI's Savings"), 'sbi savings')
  assert.strictEqual(normalizeName('SBI’s Savings'), 'sbi savings') // curly apostrophe
  assert.strictEqual(normalizeName("don't"), 'dont')
  assert.strictEqual(normalizeName('Trip, to... Goa!'), 'trip to goa')
  assert.strictEqual(normalizeName('ＳＢＩ  Ｓａｖｉｎｇｓ'), 'sbi savings') // full-width letters
  assert.strictEqual(normalizeName('₹ 5,000 fund'), '5 000 fund')
  assert.strictEqual(normalizeName(''), '')
  assert.strictEqual(normalizeName('!!!'), '')
  refusedWith('invalid_phrase', () => normalizeName(undefined))
  refusedWith('invalid_phrase', () => normalizeName(42))
  assert.strictEqual(run('account', [c('a', "SBI's Savings")], 'sbi savings').status, 'single') // same normalising on both sides
})

test('M2: whole words only — no substrings, no plurals, no typos', () => {
  assert.strictEqual(run('category', CATEGORIES, 'food').matches.length, 1) // Food, not Seafood
  assert.deepStrictEqual(names(run('category', CATEGORIES, 'food')), ['Food'])
  for (const [kind, list, phrase] of [
    ['category', CATEGORIES, 'sea'], ['category', CATEGORIES, 'foods'], ['category', CATEGORIES, 'fod'],
    ['goal', [c('x', 'Laptops')], 'laptop'], ['goal', GOALS, 'tri'], ['goal', GOALS, 'lap'], ['goal', GOALS, 'goas'],
  ]) assert.strictEqual(run(kind, list, phrase).status, 'none', `${phrase}`)
})

test('M3: two matches are NEVER reduced to one — both come back, in the candidates\' own order', () => {
  const r = run('goal', GOALS, 'laptop')
  assert.strictEqual(r.status, 'multiple')
  assert.deepStrictEqual(r.matches.map((m) => [m.id, m.name, m.matchType]), [['g1', 'Laptop', 'exact'], ['g2', 'Laptop fund', 'whole-words']])
  // The order follows the list, not the quality of the match.
  const reversed = run('goal', [GOALS[1], GOALS[0], GOALS[2]], 'laptop')
  assert.deepStrictEqual(reversed.matches.map((m) => m.id), ['g2', 'g1'])
  // No promotion: even with one exact match among partial ones, it is still "multiple".
  assert.strictEqual(r.matches.filter((m) => m.matchType === 'exact').length, 1)
  assert.strictEqual(r.status, 'multiple')
  // Two candidates with the same name are two matches too.
  const twins = run('goal', [c('t1', 'Trip'), c('t2', 'Trip')], 'trip')
  assert.deepStrictEqual([twins.status, twins.matches.length], ['multiple', 2])
  // Three.
  assert.strictEqual(run('goal', [c('1', 'Fund A'), c('2', 'Fund B'), c('3', 'Fund C')], 'fund').matches.length, 3)
})

test('M4: one exact match is single; a one-word partial match is single too', () => {
  const exact = run('goal', GOALS, 'laptop fund')
  assert.deepStrictEqual([exact.status, exact.matches[0].id, exact.matches[0].matchType], ['single', 'g2', 'exact'])
  const partial = run('goal', GOALS, 'goa')
  assert.deepStrictEqual([partial.status, partial.matches[0].name, partial.matches[0].matchType], ['single', 'Trip to Goa', 'whole-words'])
  assert.strictEqual(run('goal', GOALS, 'to goa trip').matches[0].matchType, 'exact') // word order does not matter
  assert.strictEqual(run('goal', GOALS, 'LAPTOP FUND').status, 'single')
})

test('M5: kind words are per-kind and dropped from both sides — "my laptop goal", "food budget", "power bi course", "sbi account"', () => {
  assert.deepStrictEqual(names(run('goal', GOALS, 'my laptop goal')), ['Laptop', 'Laptop fund'])
  assert.deepStrictEqual(names(run('goal', GOALS, 'the Laptop goals')), ['Laptop', 'Laptop fund'])
  assert.deepStrictEqual(names(run('category', CATEGORIES, 'food budget')), ['Food'])
  assert.deepStrictEqual(names(run('category', CATEGORIES, 'my food spending')), ['Food'])
  assert.deepStrictEqual(names(run('category', CATEGORIES, 'rent expenses')), ['Rent'])
  const course = run('learningItem', ITEMS, 'power bi course')
  assert.deepStrictEqual([course.status, names(course), course.matches[0].matchType], ['single', ['Power BI certification'], 'exact'])
  assert.deepStrictEqual(names(run('learningItem', ITEMS, 'my sql learning item')), ['SQL basics'])
  assert.deepStrictEqual(names(run('account', ACCOUNTS, 'sbi account')), ['SBI Savings'])
  // A kind word only helps for ITS kind: "course" is not dropped for a goal.
  assert.strictEqual(run('goal', GOALS, 'laptop course').status, 'none')
  assert.strictEqual(run('category', CATEGORIES, 'food goal').status, 'none')
})

test('M6: names that look like type words survive — an account called "Bank" or "Wallet" can still be found', () => {
  assert.deepStrictEqual(names(run('account', ACCOUNTS, 'bank')), ['Bank'])
  assert.deepStrictEqual(names(run('account', ACCOUNTS, 'wallet')), ['Wallet'])
  assert.deepStrictEqual(names(run('account', ACCOUNTS, 'my wallet account')), ['Wallet'])
  // A candidate made only of kind or filler words is accepted and simply never matches by those words.
  const odd = [c('o1', 'Goal'), c('o2', 'My goal'), c('o3', 'Laptop goal')]
  assert.strictEqual(run('goal', odd, 'laptop').status, 'single')
  assert.deepStrictEqual(names(run('goal', odd, 'laptop')), ['Laptop goal'])
  assert.strictEqual(run('goal', odd, 'goal').status, 'empty') // the bare phrase asks
  assert.strictEqual(run('goal', odd, 'my goal').status, 'empty')
})

test('M7: references — "it", "that", "this", "that one", "the same", "that goal" — are recognised, never matched', () => {
  for (const phrase of ['it', 'that', 'this', 'that one', 'this one', 'the same', 'same one', 'above', 'previous', 'last', 'IT', 'That!']) {
    const r = run('goal', GOALS, phrase)
    assert.strictEqual(r.status, 'reference', phrase)
    assert.deepStrictEqual([...r.matches], [])
  }
  assert.strictEqual(run('goal', GOALS, 'that goal').status, 'reference')
  assert.strictEqual(run('goal', GOALS, 'my goal that').status, 'reference')
  assert.strictEqual(run('account', ACCOUNTS, 'that account').status, 'reference')
  assert.strictEqual(run('category', CATEGORIES, 'that budget').status, 'reference')
  // Even a candidate literally named "That" is not matched by the reference word.
  assert.strictEqual(run('goal', [c('x', 'That')], 'that').status, 'reference')
  // A reference word next to a real name is a name search, not a reference.
  assert.strictEqual(run('goal', GOALS, 'that laptop').status, 'none') // "that" is not in "Laptop"
})

test('M8: a bare filler or kind word is "empty" — the caller asks', () => {
  for (const phrase of ['', '   ', 'my', 'the goal', 'my goals', 'a', '!!!', '...', 'The']) assert.strictEqual(run('goal', GOALS, phrase).status, 'empty', JSON.stringify(phrase))
  assert.strictEqual(run('category', CATEGORIES, 'budget').status, 'empty')
  assert.strictEqual(run('category', CATEGORIES, 'my budgets').status, 'empty')
  assert.strictEqual(run('learningItem', ITEMS, 'course').status, 'empty')
  assert.strictEqual(run('account', ACCOUNTS, 'my account').status, 'empty')
  assert.strictEqual(run('goal', [], '').status, 'empty') // empty wins over an empty list
})

test('M9: not found is "none" — including account type words and plurals, which are deliberately not handled', () => {
  assert.strictEqual(run('goal', GOALS, 'holiday').status, 'none')
  assert.strictEqual(run('goal', [], 'laptop').status, 'none')
  assert.strictEqual(run('account', ACCOUNTS, 'cash').status, 'none') // type words belong to the transaction parser
  assert.strictEqual(run('account', ACCOUNTS, 'upi').status, 'none')
  assert.strictEqual(run('account', ACCOUNTS, 'card').status, 'none')
  assert.strictEqual(run('category', [c('g', 'Groceries')], 'grocery').status, 'none') // no stemming
  assert.strictEqual(run('category', [c('g', 'Groceries')], 'groceries').status, 'single')
  assert.strictEqual(run('goal', GOALS, 'laptop and phone').status, 'none') // every word must be found
  const none = run('goal', GOALS, 'holiday')
  assert.deepStrictEqual([none.considered, none.matches.length, none.tokens], [3, 0, ['holiday']])
})

test('M10: bad input is refused with the right code; inputs are never changed; results are deeply frozen', () => {
  refusedWith('invalid_candidates', () => run('goal', [c('1', 'A'), c('1', 'B')], 'a')) // duplicate ids
  refusedWith('invalid_candidates', () => run('goal', [c('1', '')], 'a')) // empty name
  refusedWith('invalid_candidates', () => run('goal', [c('1', '   ')], 'a'))
  refusedWith('invalid_candidates', () => run('goal', [{ id: 1, name: 'A' }], 'a')) // non-text id
  refusedWith('invalid_candidates', () => run('goal', [{ id: '', name: 'A' }], 'a'))
  refusedWith('invalid_candidates', () => run('goal', [{ id: 'x' }], 'a'))
  refusedWith('invalid_candidates', () => run('goal', [null], 'a'))
  refusedWith('invalid_candidates', () => run('goal', 'not a list', 'a'))
  refusedWith('invalid_candidates', () => run('goal', undefined, 'a'))
  refusedWith('invalid_kind', () => resolveName('a', GOALS, { kind: 'budget' }))
  refusedWith('invalid_kind', () => resolveName('a', GOALS, {}))
  refusedWith('invalid_kind', () => resolveName('a', GOALS))
  refusedWith('invalid_kind', () => resolveName('a', GOALS, { kind: undefined }))
  refusedWith('invalid_phrase', () => resolveName(undefined, GOALS, { kind: 'goal' }))
  refusedWith('invalid_phrase', () => resolveName(7, GOALS, { kind: 'goal' }))
  assert.deepStrictEqual([...ENTITY_KINDS], ['goal', 'category', 'learningItem', 'account'])
  // Frozen input is accepted and unchanged.
  const frozen = Object.freeze(GOALS.map((g) => Object.freeze({ ...g })))
  const before = JSON.stringify(frozen)
  const r = resolveName('laptop', frozen, { kind: 'goal' })
  assert.strictEqual(JSON.stringify(frozen), before)
  assert.ok(Object.isFrozen(r) && Object.isFrozen(r.matches) && Object.isFrozen(r.matches[0]) && Object.isFrozen(r.tokens))
  assert.throws(() => { r.status = 'single' }, TypeError)
  assert.throws(() => { r.matches.push({}) }, TypeError)
  // Extra keys on a candidate are ignored and not copied into the result.
  assert.deepStrictEqual(Object.keys(resolveName('trip', [{ id: 'z', name: 'Trip', secret: 1 }], { kind: 'goal' }).matches[0]).sort(), ['id', 'matchType', 'name'])
})

test('M11: ambiguityFromResolution gives P1\'s exact shape, refuses anything but "multiple", and P1 accepts it', () => {
  const r = run('goal', GOALS, 'laptop')
  const amb = ambiguityFromResolution('goal', r)
  assert.deepStrictEqual({ ...amb, options: amb.options.map((o) => ({ ...o })) }, { field: 'goal', options: [{ id: 'g1', label: 'Laptop' }, { id: 'g2', label: 'Laptop fund' }] })
  assert.ok(Object.isFrozen(amb))
  for (const bad of [run('goal', GOALS, 'goa'), run('goal', GOALS, 'holiday'), run('goal', GOALS, 'it'), run('goal', GOALS, 'goal')]) {
    refusedWith('not_ambiguous', () => ambiguityFromResolution('goal', bad))
  }
  refusedWith('not_ambiguous', () => ambiguityFromResolution('goal', null))
  refusedWith('invalid_field', () => ambiguityFromResolution('', r))
  const action = createPendingAction({
    id: 'm11', intent: 'MODIFY_GOAL_CONTRIBUTE', source: 'Add 2000 to my laptop goal',
    fields: { amount: { value: 2000, kind: 'actual', origin: 'typed' } },
    ambiguities: [amb],
  }, 1_800_000_000_000)
  assert.strictEqual(action.status, 'needs_input')
  assert.strictEqual(action.ambiguities[0].options.length, 2)
  assert.deepStrictEqual([...action.missing], [])
})

test('M12: the answer-key sentences — with the phrase picked by hand, as P3 will later do it', () => {
  const cases = [
    ['Add 2000 to my laptop goal', 'goal', GOALS, 'laptop', 'multiple', ['Laptop', 'Laptop fund']],
    ['How much have I put into my laptop goal?', 'goal', GOALS, 'laptop', 'multiple', ['Laptop', 'Laptop fund']],
    ['How much is left in my food budget?', 'category', CATEGORIES, 'food', 'single', ['Food']],
    ['Increase my food budget to 5000', 'category', CATEGORIES, 'food', 'single', ['Food']],
    ['Mark my Power BI course as completed', 'learningItem', ITEMS, 'power bi', 'single', ['Power BI certification']],
    ['Add Power BI certification to my learning', 'learningItem', ITEMS, 'power bi certification', 'single', ['Power BI certification']],
    ['How much is in my SBI account?', 'account', ACCOUNTS, 'sbi', 'single', ['SBI Savings']],
    ['Add ₹2,000 to that goal', 'goal', GOALS, 'that goal', 'reference', []],
    ['Add ₹2,000 to it', 'goal', GOALS, 'it', 'reference', []],
    ['laptop', 'goal', GOALS, 'laptop', 'multiple', ['Laptop', 'Laptop fund']],
    ['goal', 'goal', GOALS, 'goal', 'empty', []],
  ]
  for (const [sentence, kind, list, phrase, status, expected] of cases) {
    const r = run(kind, list, phrase)
    assert.strictEqual(r.status, status, sentence)
    assert.deepStrictEqual(names(r), expected, sentence)
  }
})

test('M13: no hidden clock or randomness; the same input always gives the same answer; exactly five exports', () => {
  assert.deepStrictEqual(Object.keys(ER).sort(), ['ENTITY_KINDS', 'EntityResolverError', 'ambiguityFromResolution', 'normalizeName', 'resolveName'])
  const RealDate = globalThis.Date
  class NoClockDate extends RealDate {
    constructor(...args) {
      if (args.length === 0) throw new Error('code read the real clock: new Date() with no argument')
      super(...args)
    }
    static now() { throw new Error('code read the real clock: Date.now()') }
    static [Symbol.hasInstance](x) { return x instanceof RealDate }
  }
  const RealRandom = Math.random
  let first, second
  globalThis.Date = NoClockDate
  Math.random = () => { throw new Error('code used randomness') }
  try {
    first = JSON.stringify([run('goal', GOALS, 'laptop'), run('category', CATEGORIES, 'food budget'), run('goal', GOALS, 'it'), run('goal', GOALS, '')])
    ambiguityFromResolution('goal', run('goal', GOALS, 'laptop'))
    second = JSON.stringify([run('goal', GOALS, 'laptop'), run('category', CATEGORIES, 'food budget'), run('goal', GOALS, 'it'), run('goal', GOALS, '')])
  } finally { globalThis.Date = RealDate; Math.random = RealRandom }
  assert.strictEqual(first, second)
})

console.log(`\n${passed} passed, ${failed} failed`)
if (failed > 0) process.exit(1)
