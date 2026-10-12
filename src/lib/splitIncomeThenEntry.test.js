// P15 — F-2. "Received my salary, rent 4000 sbi" used to be read as ONE income of 4000.
// An income statement with no amount, followed by a piece that names its own thing, is two entries.
import assert from 'node:assert/strict'
import { splitClauses } from './categorization.js'

let passed = 0, failed = 0
function test(name, fn) {
  try { fn(); passed++; console.log(`  PASS  ${name}`) } catch (e) { failed++; console.log(`  FAIL  ${name}\n        ${e.message}`) }
}

test('F2a: salary statement, then rent with an amount -> two entries', () => {
  assert.deepEqual(splitClauses('Received my salary, rent 4000 sbi'), ['Received my salary', 'rent 4000 sbi'])
})
test('F2b: the same with "and"', () => {
  assert.deepEqual(splitClauses('Received my salary and rent 4000 sbi'), ['Received my salary', 'rent 4000 sbi'])
})
test('F2c: the other order is unchanged', () => {
  assert.deepEqual(splitClauses('rent 4000 sbi, Received my salary'), ['rent 4000 sbi', 'Received my salary'])
})
test('F2d: a bare amount after an income statement still belongs to it', () => {
  assert.deepEqual(splitClauses('Received my salary, 25000'), ['Received my salary, 25000'])
  assert.deepEqual(splitClauses('Received my salary, rs 5000'), ['Received my salary, rs 5000'])
  assert.deepEqual(splitClauses('got paid, 5000 from bank'), ['got paid, 5000 from bank'])
})
test('F2e: another income piece is not split off', () => {
  assert.deepEqual(splitClauses('Received my salary, bonus 5000'), ['Received my salary, bonus 5000'])
})
test('F2f: one event stays one entry', () => {
  assert.deepEqual(splitClauses('went to a movie with GF and spent 500 from bank'), ['went to a movie with GF and spent 500 from bank'])
})
test('F2g: two entries after a salary statement', () => {
  assert.deepEqual(splitClauses('salary received, dinner 500 and travel 200'), ['salary received', 'dinner 500', 'travel 200'])
})

console.log(`\n${passed} passed, ${failed} failed`)
if (failed > 0) process.exit(1)
