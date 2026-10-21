import assert from 'node:assert/strict'
import { duplicateNameMessage } from './duplicateName.js'

let passed = 0, failed = 0
function test(name, fn) {
  try { fn(); passed++; console.log(`  PASS  ${name}`) } catch (e) { failed++; console.log(`  FAIL  ${name}\n        ${e.message}`) }
}
const dup = (idx) => ({ code: '23505', message: `duplicate key value violates unique constraint "${idx}"` })

test('D1: a duplicate active goal name gets the goal sentence', () => {
  assert.match(duplicateNameMessage(dup('goals_active_name_per_user'), 'goal'), /active goal with this name/)
})
test('D2: a duplicate open learning name gets the learning sentence', () => {
  assert.match(duplicateNameMessage(dup('learning_open_name_per_user'), 'learning'), /open learning item with this name/)
})
test('D3: another unique violation, another kind, or another code is not claimed', () => {
  assert.equal(duplicateNameMessage(dup('accounts_pkey'), 'goal'), null)
  assert.equal(duplicateNameMessage(dup('goals_active_name_per_user'), 'learning'), null)
  assert.equal(duplicateNameMessage({ code: '42501', message: 'goals_active_name_per_user' }, 'goal'), null)
})
test('D4: no error, a network error, or an unknown kind returns null', () => {
  assert.equal(duplicateNameMessage(null, 'goal'), null)
  assert.equal(duplicateNameMessage({ message: 'Failed to fetch' }, 'goal'), null)
  assert.equal(duplicateNameMessage(dup('goals_active_name_per_user'), 'other'), null)
})

test('D5: a duplicate active debt name gets the debt sentence', () => {
  assert.match(duplicateNameMessage(dup('debts_active_name_per_user'), 'debt'), /active debt with this name/)
})
test('D6: the debt index is claimed by no other kind, and no other index by the debt kind', () => {
  assert.equal(duplicateNameMessage(dup('debts_active_name_per_user'), 'goal'), null)
  assert.equal(duplicateNameMessage(dup('debts_active_name_per_user'), 'learning'), null)
  assert.equal(duplicateNameMessage(dup('goals_active_name_per_user'), 'debt'), null)
  assert.equal(duplicateNameMessage({ code: '42501', message: 'debts_active_name_per_user' }, 'debt'), null)
  assert.equal(duplicateNameMessage({ message: 'Failed to fetch' }, 'debt'), null)
})

console.log(`\n${passed} passed, ${failed} failed`)
if (failed > 0) process.exit(1)
