// J11 — double clicks, Strict Mode (the app runs in React Strict Mode) and Escape never create a duplicate row.
import { test, expect } from '../support/fixtures.js'

// Two clicks on the SAME button 40 ms apart (a fast human double click). (A real double click on a phone can land the second tap on the
// bottom navigation that sits under a closing dialog, which tests the navigation, not the save button.)
const twice = (locator) => locator.evaluate(async (el) => { el.click(); await new Promise((r) => setTimeout(r, 40)); el.click() })

test('J11: double-click Confirm on the review screen writes ONE transaction', async ({ app, page }) => {
  await app.open('/')
  const start = await app.counts()
  await app.say('dinner with friends 500 sbi')
  await app.btn('Confirm').dblclick()
  await page.waitForTimeout(800)
  expect(app.delta(start, await app.counts())).toEqual({ transactions: 1 })
  expect(await app.writeTables()).toEqual(['transactions:insert'])
})

test('J11: double-click Create goal writes ONE goal; double-click Contribute writes ONE allocation', async ({ app, page }) => {
  await app.open('/')
  const start = await app.counts()
  await app.say('Create a goal called Phone for 20000 by December')
  await app.btn('Continue in Goals').click()
  await expect(page.getByRole('heading', { name: 'New goal', exact: true })).toHaveCount(1) // Strict Mode: one form, not two
  await twice(app.btn('Create goal'))
  await page.waitForTimeout(800)
  expect(app.delta(start, await app.counts())).toEqual({ goals: 1 })

  await app.go('/')
  await app.say('Add 500 to my phone goal')
  await app.btn('Continue in Goals').click()
  await expect(page.getByRole('heading', { name: 'Contribute to Phone', exact: true })).toHaveCount(1)
  await page.locator('select').first().selectOption({ label: 'SBI' })
  await twice(app.btn('Contribute'))
  await page.waitForTimeout(800)
  expect(app.delta(start, await app.counts())).toEqual({ goals: 1, goal_contributions: 1 })
  expect((await app.rows('transactions')).length, 'an allocation is not an expense').toBe(start.transactions)
})

test('J11: Escape on a form or the review screen writes nothing', async ({ app, page }) => {
  await app.open('/')
  const start = await app.counts()
  await app.say('Create a goal called Phone for 20000')
  await app.btn('Continue in Goals').click()
  await expect(page.getByRole('heading', { name: 'New goal', exact: true })).toBeVisible()
  await page.keyboard.press('Escape')
  await page.waitForTimeout(300)
  expect(await app.writes()).toEqual([])
  expect(app.delta(start, await app.counts())).toEqual({})
})
