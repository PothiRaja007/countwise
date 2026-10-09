// J9 — several entries in one message are several rows; a single event with "and" is one row;
// the parser's known limit ("then / also / plus / but / +" do not start a new row) is PINNED as the expected result.
import { test, expect, NOTE_MIXED } from '../support/fixtures.js'

const rowsInReview = (page) => page.getByLabel('Include this row')

test('J9: three entries become three transactions, only after Confirm', async ({ app, page }) => {
  await app.open('/')
  const start = await app.counts()
  await app.say('rent 4000 sbi, dinner 500 sbi and fuel 300 sbi')
  await expect(app.btn('Confirm')).toBeVisible()
  await expect(rowsInReview(page)).toHaveCount(3)
  await expect(page.getByText(NOTE_MIXED)).toHaveCount(0)
  expect(await app.writes()).toEqual([])
  await app.btn('Confirm').click()
  await expect.poll(async () => (await app.writes()).length).toBe(1)
  expect(app.delta(start, await app.counts())).toEqual({ transactions: 3 })
  const added = (await app.rows('transactions')).slice(-3)
  expect(added.map((t) => t.amount).sort((a, b) => a - b)).toEqual([300, 500, 4000])
  expect(added.every((t) => t.type === 'expense')).toBe(true)
})

test('J9b: single events stay ONE row', async ({ app, page }) => {
  await app.open('/')
  for (const [text, amount] of [['bought tea and biscuits 150 sbi', 150], ['paid 1,25,000 for rent sbi', 125000]]) {
    await app.say(text)
    await expect(rowsInReview(page)).toHaveCount(1)
    await expect(page.getByText(NOTE_MIXED)).toHaveCount(0)
    const start = await app.counts()
    await app.btn('Confirm').click()
    await expect.poll(async () => (await app.counts()).transactions).toBe(start.transactions + 1)
    expect((await app.rows('transactions')).at(-1).amount).toBe(amount)
    await app.open('/')
  }
})

test('J9c: an amount-less salary row next to a payment is a normal two-row review, not a mix', async ({ app, page }) => {
  await app.open('/', 'sal')
  await app.say('rent 4000 sbi, Received my salary')
  await expect(rowsInReview(page)).toHaveCount(2)
  await expect(page.getByText(NOTE_MIXED)).toHaveCount(0)
  await expect(page.getByText('Estimated take-home')).toHaveCount(0)
  expect(await app.writes()).toEqual([])
})

test('J9d: KNOWN PARSER LIMIT (pinned, not fixed): "then" does not start a second row', async ({ app, page }) => {
  await app.open('/')
  await app.say('rent 4000 sbi then dinner 500 sbi')
  await expect(app.btn('Confirm')).toBeVisible()
  await expect(rowsInReview(page), 'today the second entry is not read as a row').toHaveCount(1)
  await expect(page.getByText(NOTE_MIXED)).toHaveCount(0)
  expect(await app.writes()).toEqual([])
})

test('J9e: KNOWN ISSUE F-2 (pinned, not fixed): "Received my salary, rent 4000 sbi" is read as ONE income of 4000', async ({ app, page }) => {
  // The locked parser does not split a no-amount first clause from the next one, so the rent amount lands on an
  // income row. Nothing is saved without Confirm and the row is editable. Same result on the P8b baseline.
  await app.open('/', 'sal')
  await app.say('Received my salary, rent 4000 sbi')
  await expect(rowsInReview(page)).toHaveCount(1)
  await expect(page.getByText(NOTE_MIXED)).toHaveCount(0)
  expect(await app.writes()).toEqual([])
  await app.btn('Confirm').click()
  await expect.poll(async () => (await app.writes()).length).toBe(1)
  expect((await app.rows('transactions')).at(-1)).toMatchObject({ type: 'income', amount: 4000 })
})
