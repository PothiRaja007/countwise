// J12 — page handoff: a planned action is used once, expires after 5 minutes, and never survives a reload or a Cancel.
import { test, expect, NOW } from '../support/fixtures.js'

test('J12: an expired plan does nothing — no page change, no form, no write', async ({ app, page }) => {
  await app.open('/')
  const start = await app.counts()
  await app.say('Create a goal called Phone for 20000')
  await expect(app.btn('Continue in Goals')).toBeVisible()
  await page.clock.setFixedTime(new Date(new Date(NOW).getTime() + 6 * 60 * 1000))
  await app.btn('Continue in Goals').click()
  await expect(page.getByText('That timed out. Please send your message again.')).toBeVisible()
  expect(await app.path()).toBe('/')
  await expect(page.getByRole('heading', { name: 'New goal', exact: true })).toHaveCount(0)
  expect(await app.writes()).toEqual([])
  expect(app.delta(start, await app.counts())).toEqual({})
})

test('J12: a plan is read ONCE — a reload or coming back does not reopen the form', async ({ app, page }) => {
  await app.open('/')
  await app.say('Create a goal called Phone for 20000')
  await app.btn('Continue in Goals').click()
  await expect(page.getByRole('heading', { name: 'New goal', exact: true })).toHaveCount(1)
  await page.reload()
  await page.waitForFunction(() => !document.body.innerText.includes('Loading'))
  await page.waitForTimeout(600)
  expect(await app.path()).toBe('/goals')
  await expect(page.getByRole('heading', { name: 'New goal', exact: true })).toHaveCount(0)
  expect(await app.writes()).toEqual([])
  await app.go('/')
  await app.go('/goals')
  await expect(page.getByRole('heading', { name: 'New goal', exact: true })).toHaveCount(0)
})

test('J12: Cancel on the panel forgets the plan — opening Goals later shows no form', async ({ app, page }) => {
  await app.open('/')
  await app.say('Create a goal called Phone for 20000')
  await app.btn('Cancel').click()
  await app.go('/goals')
  await expect(page.getByRole('heading', { name: 'New goal', exact: true })).toHaveCount(0)
  expect(await app.writes()).toEqual([])
})

test('J12: a plan never opens a form for another page (Budgets plan lands on Budgets only)', async ({ app, page }) => {
  await app.open('/')
  await app.say("Create next month's budget")
  await app.btn('Continue in Budgets').click()
  expect(await app.path()).toBe('/budgets')
  await expect(page.getByRole('heading', { name: 'New goal', exact: true })).toHaveCount(0)
  await expect(page.getByRole('heading', { name: 'Pool your monthly expenses', exact: true })).toBeVisible()
  expect(await app.writes()).toEqual([])
})
