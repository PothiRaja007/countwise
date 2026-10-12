// P15b: the database refuses a second ACTIVE goal / open learning item with the same name. The app must say so in plain words.
// (The in-memory stand-in mirrors the unique indexes; see e2e/support/mockdb.js.)
import { test, expect } from '../support/fixtures.js'


// The app logs a refused save to the console (as for every failed save). Only the refusal itself is allowed; anything else still fails the test.
function onlyTheRefusal(errors) {
  expect(errors.length).toBeGreaterThan(0)
  for (const e of errors) expect(e).toMatch(/duplicate key value|already have an (active goal|open learning item)/)
  errors.length = 0
}

test('J14: a second active goal with the same name is refused with a clear sentence, and nothing is added', async ({ app, page, errors }) => {
  await app.open('/goals', 'goal')
  const start = await app.counts()
  await page.getByRole('button', { name: 'New goal' }).first().click()
  await page.getByPlaceholder('Goal name').fill('laptop')
  await page.getByPlaceholder('Target amount').fill('9000')
  await app.btn('Create goal').click()
  await expect(page.getByText('You already have an active goal with this name')).toBeVisible()
  await expect(page.getByText("Couldn't create this goal")).toHaveCount(0)
  expect(app.delta(start, await app.counts())).toEqual({})
  onlyTheRefusal(errors)
  // a different name still works
  await page.getByPlaceholder('Goal name').fill('Phone')
  await app.btn('Create goal').click()
  await expect.poll(async () => app.delta(start, await app.counts())).toEqual({ goals: 1 })
})

test('J14: a second open learning item with the same name is refused with a clear sentence', async ({ app, page, errors }) => {
  await app.open('/learning', 'learn')
  const start = await app.counts()
  await page.getByRole('button', { name: 'Add learning item' }).first().click()
  const name = (await app.rows('learning_items')).find((r) => r.status !== 'completed').name
  await page.getByPlaceholder('e.g. Advanced Excel course').fill(name.toUpperCase())
  await page.getByPlaceholder('0').first().fill('500')
  await app.btn('Add item').click()
  await expect(page.getByText('You already have an open learning item with this name').first()).toBeVisible()
  expect(app.delta(start, await app.counts())).toEqual({})
  onlyTheRefusal(errors)
})
