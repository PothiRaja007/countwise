// J6 — every question is answered from the data and writes NOTHING, ever.
import { test, expect } from '../support/fixtures.js'

const QUESTIONS = [
  ['What is my balance?', 'Your total balance is ₹91,000.00, as of today.'],
  ['How much is left in my rent budget?', 'You have ₹4,500.00 left in your Rent budget for October 2026.'],
  ['How much have I put into my laptop goal?', 'You have set aside ₹3,000.00 for Laptop, which is 6% of the ₹50,000.00 target.'],
  ['How much is my PF?', 'Employee PF (monthly)'],
]

for (const [q, expected] of QUESTIONS) {
  test(`J6: "${q}" is answered and nothing changes`, async ({ app, page }) => {
    await app.open('/', 'sal+goal')
    const start = await app.counts()
    await app.say(q)
    await expect(page.getByText(expected, { exact: false }).first()).toBeVisible()
    expect(app.delta(start, await app.counts())).toEqual({})
    expect(await app.writes()).toEqual([])
    expect(await app.path()).toBe('/')
  })
}

test('J6: a spending question is a question, never an expense', async ({ app, page }) => {
  await app.open('/', 'base')
  const start = await app.counts()
  await app.say('How much did I spend on rent last month?')
  await expect(page.getByText('September 2026').first()).toBeVisible()
  expect(app.delta(start, await app.counts())).toEqual({})
  expect(await app.writes()).toEqual([])
})
