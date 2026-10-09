// J10 — Cancel at every stage writes nothing and leaves the database exactly as it was.
import { test, expect } from '../support/fixtures.js'

async function untouched(app, start) {
  expect(await app.writes(), 'no write at all').toEqual([])
  expect(app.delta(start, await app.counts()), 'no row changed').toEqual({})
}

const PANELS = [
  ['a bare word (the P4 guard panel)', 'base', 'pension', 'Cancel'],
  ['a mixed message (P11)', 'sal', 'salary received and pension estimate', 'Cancel'],
  ['an open detail in a question', 'base', 'How much did I spend on food this month?', 'Cancel'],
  ['a goal choice', 'goal2', 'Add 500 to my laptop goal', 'Cancel'],
  ['the salary estimate panel', 'sal', 'Received my salary', 'Cancel'],
  ['the review screen', 'base', 'dinner with friends 500 sbi', 'Cancel'],
]
for (const [label, db, text, cancel] of PANELS) {
  test(`J10: Cancel on ${label}`, async ({ app }) => {
    await app.open('/', db)
    const start = await app.counts()
    await app.say(text)
    await app.btn(cancel).click()
    await expect(app.box()).toHaveValue('')
    await untouched(app, start)
  })
}

test('J10: Close on a pension answer and on a query answer', async ({ app, page }) => {
  await app.open('/', 'sal+goal')
  const start = await app.counts()
  await app.say('How much is my PF?')
  await app.btn('Close').click()
  await app.say('What is my balance?')
  await app.btn('Close').click()
  await untouched(app, start)
})

const PAGES = [
  ['the New goal form', 'base', 'Create a goal called Phone for 20000', 'Continue in Goals', 'New goal'],
  ['the Contribute dialog', 'goal', 'Add 500 to my laptop goal', 'Continue in Goals', 'Contribute to Laptop'],
  ['the Edit budget dialog', 'base', 'Set my rent budget to 5000', 'Continue in Budgets', 'Edit budget'],
  ['the Add learning item form', 'learn', 'Add Tableau to my learning', 'Continue in Learning', null],
  ['the Edit learning item form', 'learn', 'Mark my Power BI course as completed', 'Continue in Learning', null],
]
for (const [label, db, text, cont, heading] of PAGES) {
  test(`J10: Cancel in ${label}`, async ({ app, page }) => {
    await app.open('/', db)
    const start = await app.counts()
    await app.say(text)
    await app.btn(cont).click()
    if (heading) await expect(page.getByRole('heading', { name: heading, exact: true })).toBeVisible()
    else await expect(page.locator('dialog')).toBeVisible()
    await untouched(app, start)
    const scope = heading && heading !== 'Edit budget' ? page : page.locator('dialog')
    await scope.getByRole('button', { name: 'Cancel', exact: true }).click()
    await expect(page.locator('dialog')).toHaveCount(0)
    await untouched(app, start)
  })
}
