// Plain Node test runner — no framework, no new dependency.
// Run with: node src/lib/exportCsv.test.js
// Only toCsv() is tested here — downloadCsv() touches the DOM (Blob,
// document.createElement) and has nothing meaningful to assert on outside
// a real browser; it's covered by manual verification instead.
import assert from 'node:assert'
import { toCsv } from './exportCsv.js'

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

console.log('exportCsv tests\n')

const columns = [
  { key: 'description', label: 'Description' },
  { key: 'amount', label: 'Amount' },
]

test('produces a correct header row', () => {
  const csv = toCsv([], columns)
  assert.strictEqual(csv, 'Description,Amount')
})

test('empty rows array produces just the header row, not an empty string', () => {
  const csv = toCsv([], columns)
  assert.strictEqual(csv.split('\r\n').length, 1)
  assert.strictEqual(csv, 'Description,Amount')
})

test('a field containing a comma is quoted', () => {
  const csv = toCsv([{ description: 'coffee, bus', amount: 120 }], columns)
  const dataLine = csv.split('\r\n')[1]
  assert.strictEqual(dataLine, '"coffee, bus",120')
})

test('a field containing a quote is escaped by doubling it, and the field is quoted', () => {
  const csv = toCsv([{ description: 'said "hi" to cashier', amount: 50 }], columns)
  const dataLine = csv.split('\r\n')[1]
  assert.strictEqual(dataLine, '"said ""hi"" to cashier",50')
})

test('a field containing a newline is quoted so it does not break into a second row', () => {
  const csv = toCsv([{ description: 'line one\nline two', amount: 10 }], columns)
  const lines = csv.split('\r\n')
  // Header + exactly one data row — the embedded \n must not have produced
  // a spurious extra CSV row.
  assert.strictEqual(lines.length, 2)
  assert.strictEqual(lines[1], '"line one\nline two",10')
})

test('a normal row with no special characters is left unquoted', () => {
  const csv = toCsv([{ description: 'coffee', amount: 80 }], columns)
  assert.strictEqual(csv, 'Description,Amount\r\ncoffee,80')
})

test('null and undefined values become empty fields, not the strings "null"/"undefined"', () => {
  const csv = toCsv([{ description: null, amount: undefined }], columns)
  const dataLine = csv.split('\r\n')[1]
  assert.strictEqual(dataLine, ',')
})

console.log(`\n${passed} passed, ${failed} failed`)
if (failed > 0) process.exit(1)
