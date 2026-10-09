// J7 — clarify, then choose. A clarification only asks; choosing starts a read-only answer or a page, never a write.
import { test, expect } from '../support/fixtures.js'

test('J7: an open detail is asked; Edit my message returns the text; the fixed question is answered; nothing is written', async ({ app, page }) => {
  await app.open('/', 'base')
  const start = await app.counts()
  await app.say('How much did I spend on food this month?')
  await expect(page.getByText('Which category?')).toBeVisible()
  await expect(page.getByText('Food, Food delivery')).toBeVisible()
  expect(await app.writes()).toEqual([])
  await app.btn('Edit my message').click()
  await expect(app.box()).toHaveValue('How much did I spend on food this month?')
  await app.say('How much did I spend on Food delivery this month?')
  await expect(page.getByText('No expenses are recorded for Food delivery in October 2026.')).toBeVisible()
  expect(app.delta(start, await app.counts())).toEqual({})
  expect(await app.writes()).toEqual([])
})

test('J7a: two matching goals — choosing one only plans; Goals still writes nothing until its own button', async ({ app, page }) => {
  await app.open('/', 'goal2')
  const start = await app.counts()
  await app.say('Add 500 to my laptop goal')
  await expect(page.getByText('Which goal? Laptop, Laptop bag')).toBeVisible()
  expect(await app.writes()).toEqual([])
  await app.btn('Laptop bag').click()
  await expect(page.getByText('I understood: put ₹500 towards your Laptop bag goal')).toBeVisible()
  await expect(app.btn('Continue in Goals')).toBeVisible()
  expect(await app.writes()).toEqual([])
  expect(app.delta(start, await app.counts())).toEqual({})
})

test('J7b: a bare word asks; choosing the pension estimate answers it', async ({ app, page }) => {
  await app.open('/', 'sal')
  const start = await app.counts()
  await app.say('pension')
  await expect(app.btn('Show my pension estimate')).toBeVisible()
  expect(await app.writes()).toEqual([])
  await app.btn('Show my pension estimate').click()
  await expect(page.getByText('Employee PF (monthly)')).toBeVisible()
  await expect(page.getByText('ESTIMATED', { exact: true }).or(page.getByText('Estimated', { exact: true })).first()).toBeVisible()
  expect(app.delta(start, await app.counts())).toEqual({})
  expect(await app.writes()).toEqual([])
})

test('J7c: "Edit my message" returns the text; "Cancel" clears it', async ({ app, page }) => {
  await app.open('/', 'base')
  await app.say('pension')
  await app.btn('Cancel').click()
  await expect(app.box()).toHaveValue('')
  await app.say('How much did I spend on food this month?')
  await app.btn('Edit my message').click()
  await expect(app.box()).toHaveValue('How much did I spend on food this month?')
  expect(await app.writes()).toEqual([])
})
