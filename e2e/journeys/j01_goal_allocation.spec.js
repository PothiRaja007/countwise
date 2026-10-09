// J1 — create a goal, then add to it. A goal contribution is an ALLOCATION, never spending:
// it writes goal_contributions only, creates no expense transaction, and leaves the real account balance unchanged.
import { test, expect } from '../support/fixtures.js'

test('J1: create a goal, then contribute — an allocation, not an expense', async ({ app, page }) => {
  await app.open('/')
  const start = await app.counts()
  const balance0 = await app.balance('a1')
  expect(balance0).toBe(91000)

  // --- create the goal: Money Inbox only plans; the Goals page writes
  await app.say('Create a goal called Laptop for 50000 by December')
  await expect(page.getByText('I understood: plan a goal “Laptop” with a target of ₹50,000 by 31 December 2026')).toBeVisible()
  expect(await app.writes()).toEqual([])
  await app.btn('Continue in Goals').click()
  await expect(page.getByRole('heading', { name: 'New goal', exact: true })).toBeVisible()
  expect(await app.path()).toBe('/goals')
  expect(await app.writes(), 'nothing saved before Create goal').toEqual([])
  await app.btn('Create goal').click()
  await expect(page.getByRole('heading', { name: 'New goal', exact: true })).toHaveCount(0)
  const afterGoal = await app.counts()
  expect(app.delta(start, afterGoal)).toEqual({ goals: 1 })
  expect(await app.writeTables()).toEqual(['goals:insert'])
  const goal = (await app.rows('goals')).find((g) => g.name === 'Laptop')
  expect(goal).toMatchObject({ target_amount: 50000, target_date: '2026-12-31', status: 'active' })

  // --- contribute to it: the Goals page's own dialog
  await app.go('/')
  await app.say('Add 2000 to my laptop goal')
  await expect(page.getByText('I understood: put ₹2,000 towards your Laptop goal')).toBeVisible()
  expect(await app.writes()).toHaveLength(1) // still just the goal insert
  await app.btn('Continue in Goals').click()
  await expect(page.getByRole('heading', { name: 'Contribute to Laptop', exact: true })).toBeVisible()
  await expect(page.getByPlaceholder('Amount')).toHaveValue('2000')
  await expect(app.btn('Contribute')).toBeDisabled() // no account chosen yet
  await page.locator('select').first().selectOption({ label: 'SBI' })
  await expect(page.getByText('Available in this account: ₹91,000')).toBeVisible()
  const beforeContribute = await app.counts()
  await app.btn('Contribute').click()
  await expect(page.getByRole('heading', { name: 'Contribute to Laptop', exact: true })).toHaveCount(0)

  const end = await app.counts()
  expect(app.delta(beforeContribute, end), 'only goal_contributions grew').toEqual({ goal_contributions: 1 })
  expect(app.delta(start, end), 'whole journey: one goal, one allocation').toEqual({ goals: 1, goal_contributions: 1 })
  expect(await app.writeTables()).toEqual(['goals:insert', 'goal_contributions:insert'])
  const gc = (await app.rows('goal_contributions'))[0]
  expect(gc).toMatchObject({ goal_id: goal.id, account_id: 'a1', amount: 2000, type: 'contribution' })

  // --- allocation, not expense
  const tx = await app.rows('transactions')
  expect(tx.filter((t) => t.original_input && /laptop/i.test(t.original_input)), 'no transaction mentions the goal').toEqual([])
  expect(tx).toHaveLength(start.transactions)
  expect(await app.balance('a1'), 'the real account balance is unchanged').toBe(balance0)
  await app.go('/')
  await expect(page.locator('body')).toContainText('₹91,000')
  // ...while the unallocated (available) amount fell by exactly the allocation
  await app.go('/goals')
  await page.locator('[aria-label="Contribute to goal"]').first().click()
  await page.locator('select').first().selectOption({ label: 'SBI' })
  await expect(page.getByText('Available in this account: ₹89,000')).toBeVisible()
  await app.btn('Cancel').click()
  expect(await app.writeTables()).toEqual(['goals:insert', 'goal_contributions:insert'])
  await app.noHorizontalScroll()
})
