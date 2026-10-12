import assert from 'node:assert/strict'
import { dateFromISO } from './isoDate.js'

let pass = 0
function check(name, fn) { fn(); pass++; console.log('  ok  ' + name) }

check('keeps the calendar day in any time zone', () => {
  const d = dateFromISO('2026-08-01')
  assert.equal(d.getFullYear(), 2026)
  assert.equal(d.getMonth(), 7)
  assert.equal(d.getDate(), 1)
})
check('reads the first 10 characters of a longer string', () => {
  assert.equal(dateFromISO('2026-12-31T00:00:00').getDate(), 31)
})
check('the month name is the right month', () => {
  assert.equal(dateFromISO('2026-11-01').toLocaleDateString('en-IN', { month: 'long' }), 'November')
})
console.log(`${pass} passed, 0 failed`)
