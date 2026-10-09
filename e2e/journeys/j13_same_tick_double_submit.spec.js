// J13 (added in P14, fix N-6) — two clicks in the SAME instant (no gap at all) still write ONE row.
// J11 clicks 40 ms apart; P12 found that a same-tick double click could create two goals. The save buttons now
// lock synchronously, so the second click is ignored.
import { test, expect } from '../support/fixtures.js'

const sameTick = (locator) => locator.evaluate((el) => { el.click(); el.click() })

test('J13: same-instant double click on Confirm writes ONE transaction', async ({ app, page }) => {
  await app.open('/')
  const start = await app.counts()
  await app.say('dinner with friends 500 sbi')
  await sameTick(app.btn('Confirm'))
  await page.waitForTimeout(800)
  expect(app.delta(start, await app.counts())).toEqual({ transactions: 1 })
  expect(await app.writeTables()).toEqual(['transactions:insert'])
})

test('J13: same-instant double click on Create goal writes ONE goal, on Contribute ONE allocation', async ({ app, page }) => {
  await app.open('/')
  const start = await app.counts()
  await app.say('Create a goal called Phone for 20000 by December')
  await app.btn('Continue in Goals').click()
  await expect(page.getByRole('heading', { name: 'New goal', exact: true })).toHaveCount(1)
  await sameTick(app.btn('Create goal'))
  await page.waitForTimeout(800)
  expect(app.delta(start, await app.counts())).toEqual({ goals: 1 })

  await app.go('/')
  await app.say('Add 500 to my phone goal')
  await app.btn('Continue in Goals').click()
  await expect(page.getByRole('heading', { name: 'Contribute to Phone', exact: true })).toHaveCount(1)
  await page.locator('select').first().selectOption({ label: 'SBI' })
  await sameTick(app.btn('Contribute'))
  await page.waitForTimeout(800)
  expect(app.delta(start, await app.counts())).toEqual({ goals: 1, goal_contributions: 1 })
  expect((await app.rows('transactions')).length, 'an allocation is not an expense').toBe(start.transactions)
})
