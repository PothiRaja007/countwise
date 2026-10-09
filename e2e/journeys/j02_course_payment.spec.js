// J2 — "paid for a course": the review screen writes ONE expense; the learning offer then opens the Learning page,
// which writes a learning item only when the user presses Add item there. Expense and item are not linked.
import { test, expect } from '../support/fixtures.js'

const PAY = 'Paid ₹8,000 for a Power BI certification sbi'

test('J2: pay for a course, accept the offer, add the learning item', async ({ app, page }) => {
  await app.open('/')
  const start = await app.counts()
  await app.say(PAY)
  await expect(app.btn('Confirm')).toBeVisible()
  expect(await app.writes(), 'review screen writes nothing until Confirm').toEqual([])

  await app.btn('Confirm').click()
  await expect(page.getByText('Track “Power BI certification” in Learning ROI?')).toBeVisible()
  const afterPay = await app.counts()
  expect(app.delta(start, afterPay), 'exactly one expense').toEqual({ transactions: 1 })
  const t = (await app.rows('transactions')).at(-1)
  expect(t).toMatchObject({ type: 'expense', amount: 8000, account_id: 'a1' })
  expect(await app.writeTables()).toEqual(['transactions:insert'])
  await expect(page.getByText('Nothing else is saved until you press Add item in Learning ROI.')).toBeVisible()

  await app.btn('Open Learning ROI').click()
  await expect(page.locator('dialog')).toBeVisible()
  expect(await app.path()).toBe('/learning')
  await expect(page.locator('dialog input[type=number]').first()).toHaveValue('8000')
  expect(app.delta(afterPay, await app.counts()), 'opening the form saves nothing').toEqual({})

  await page.locator('dialog').getByRole('button', { name: 'Add item', exact: true }).click()
  await expect(page.locator('dialog')).toHaveCount(0)
  const end = await app.counts()
  expect(app.delta(start, end), 'one expense, one learning item').toEqual({ transactions: 1, learning_items: 1 })
  expect(await app.writeTables()).toEqual(['transactions:insert', 'learning_items:insert'])
  const item = (await app.rows('learning_items'))[0]
  expect(item).toMatchObject({ name: 'Power BI certification', cost: 8000, status: 'planned' })
  expect(Object.keys(item).some((k) => /transaction/i.test(k)), 'the item is not linked to the payment').toBe(false)
})

test('J2b: "No thanks" ends the offer with nothing more written', async ({ app, page }) => {
  await app.open('/')
  const start = await app.counts()
  await app.say(PAY)
  await app.btn('Confirm').click()
  await app.btn('No thanks').click()
  await expect(app.box()).toHaveValue('')
  expect(app.delta(start, await app.counts())).toEqual({ transactions: 1 })
  expect(await app.path()).toBe('/')
})
