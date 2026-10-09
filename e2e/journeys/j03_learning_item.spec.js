// J3 — learning commands plan only; the Learning page writes, and only on its own button.
import { test, expect } from '../support/fixtures.js'

test('J3: add a learning item from Money Inbox', async ({ app, page }) => {
  await app.open('/', 'learn')
  const start = await app.counts()
  await app.say('Add Tableau to my learning')
  await expect(app.btn('Continue in Learning')).toBeVisible()
  expect(await app.writes()).toEqual([])
  await app.btn('Continue in Learning').click()
  await expect(page.locator('dialog')).toBeVisible()
  expect(await app.writes(), 'opening the form saves nothing').toEqual([])
  await page.locator('dialog').getByRole('button', { name: 'Add item', exact: true }).click()
  await expect(page.locator('dialog')).toHaveCount(0)
  expect(app.delta(start, await app.counts())).toEqual({ learning_items: 1 })
  expect(await app.writeTables()).toEqual(['learning_items:insert'])
  expect((await app.rows('learning_items')).at(-1)).toMatchObject({ name: 'Tableau', status: 'planned' })
})

test('J3b: mark an item completed — the page saves an update, no new row, progress is not rewritten', async ({ app, page }) => {
  await app.open('/', 'learn')
  const start = await app.counts()
  await app.say('Mark my Power BI course as completed')
  await app.btn('Continue in Learning').click()
  await expect(page.locator('dialog')).toBeVisible()
  expect(await app.writes()).toEqual([])
  await page.locator('dialog').getByRole('button', { name: 'Save changes', exact: true }).click()
  await expect(page.locator('dialog')).toHaveCount(0)
  expect(app.delta(start, await app.counts()), 'an update, not an insert').toEqual({})
  expect(await app.writeTables()).toEqual(['learning_items:update'])
  expect((await app.rows('learning_items')).find((i) => i.id === 'l1')).toMatchObject({ status: 'completed', progress_pct: 40 })
})
