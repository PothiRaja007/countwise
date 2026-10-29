// J20 (KL-2 fix) - a debt whose SAVED opening figures are not valid (written outside the app; the app's own forms refuse them).
// The card must show a plain fallback instead of any amount or calculation, never "NaN", never treat the figure as zero, keep Edit,
// Close and Payments usable, and agree with the D6 indicators. Valid cards must be exactly as before.
// Seed 'debtlinked+debtplan+debtind' is described in j18_debt_indicators.spec.js (Education d1, Bike d3, Card d4, Friend loan d5).
import { test, expect } from '../support/fixtures.js'

const SEED = 'debtlinked+debtplan+debtind'
const FALLBACK = 'The saved figures for this debt are not valid. Edit this debt to correct them.'
const id = (page, k) => page.getByTestId(k)
const tab = (page, name) => page.getByRole('button', { name, exact: true })
const card = (page, name) => page.getByTestId('debt-card').filter({ has: page.getByRole('heading', { name, exact: true }) })
async function revisit(app, page, to = '/debts') {
  await app.go('/transactions')
  await expect(page.getByPlaceholder('Search description...').first()).toBeVisible()
  await app.go(to)
}
const mutate = (page, table, rowId, patch) => page.evaluate(([t, i, p]) => window.__e2e.mutate(t, i, p), [table, rowId, patch])

// each: [label, debt id, name, patch]
const BAD = [
  ['text principal', 'd5', 'Friend loan', { as_of_outstanding: 'abc' }],
  ['negative principal', 'd5', 'Friend loan', { as_of_outstanding: -5 }],
  ['text unpaid interest', 'd1', 'Education loan', { as_of_accrued_interest: 'abc' }],
  ['negative unpaid interest', 'd1', 'Education loan', { as_of_accrued_interest: -1 }],
  ['unreadable as-of date', 'd5', 'Friend loan', { as_of_date: 'not a date' }],
]

for (const [label, debtId, name, patch] of BAD) {
  test(`J20: ${label}: the card shows the fallback and no amount, never NaN; the rest of the page works`, async ({ app, page }) => {
    await app.open('/debts', SEED)
    await mutate(page, 'debts', debtId, patch)
    await revisit(app, page)
    const c = card(page, name)
    await expect(c).toBeVisible()
    await expect(c.getByTestId('debt-invalid')).toHaveText(FALLBACK)
    const text = await c.innerText()
    expect(text).not.toMatch(/NaN|Infinity|undefined|Invalid Date|₹/) // no money line, projection or date at all
    for (const k of ['debt-figures', 'debt-projection', 'debt-no-payments', 'debt-quiet', 'debt-figures-failed', 'debt-same-month']) await expect(c.getByTestId(k)).toHaveCount(0)
    expect(text).not.toMatch(/Cleared|Estimate|Nothing owed/) // never read as zero
    // repair access is still there
    await expect(c.getByRole('button', { name: 'Edit debt' })).toBeEnabled()
    await expect(c.getByRole('button', { name: 'Close debt' })).toBeEnabled()
    await expect(c.getByRole('button', { name: `Payments for ${name}` })).toBeEnabled()
    // the whole page is free of NaN, the other cards are normal, and the other tabs and the form still open
    expect(await page.locator('main').innerText()).not.toMatch(/NaN|Infinity|undefined|Invalid Date/)
    await expect(card(page, 'Bike loan').getByTestId('debt-figures')).toContainText('Owed today (calculated): ₹51,156.00')
    await expect(page.getByTestId('indicators')).toBeVisible()
    await tab(page, 'Closed').click(); await expect(page.getByRole('heading', { name: 'Old phone EMI' })).toBeVisible()
    await tab(page, 'Planner').click(); await expect(id(page, 'planner')).toBeVisible()
    await tab(page, 'Active').click()
    await page.getByRole('button', { name: 'Add debt', exact: true }).click(); await expect(page.locator('#debt-name')).toBeVisible()
    expect(await app.writes()).toEqual([]) // looking at an invalid row writes nothing
    await app.noHorizontalScroll()
  })
}

test('J20: the card and the indicators agree: an invalid row is named "Figures are not valid" in the indicators and shows the fallback on the card', async ({ app, page }) => {
  await app.open('/debts', SEED)
  await mutate(page, 'debts', 'd5', { as_of_outstanding: 'abc' })
  await revisit(app, page)
  await expect(id(page, 'ind-total-nofigure')).toContainText('Friend loan (Figures are not valid)')
  await expect(card(page, 'Friend loan').getByTestId('debt-invalid')).toBeVisible()
  // and a row the indicators accept is NOT given the fallback
  await expect(card(page, 'Education loan').getByTestId('debt-invalid')).toHaveCount(0)
  await expect(page.getByTestId('debt-invalid')).toHaveCount(1)
})

test('J20: Payments opens for an invalid row and writes nothing', async ({ app, page, errors }) => {
  await app.open('/debts', SEED)
  await mutate(page, 'debts', 'd5', { as_of_outstanding: 'abc' })
  await revisit(app, page)
  await card(page, 'Friend loan').getByRole('button', { name: 'Payments for Friend loan' }).click()
  await expect(page.getByRole('dialog')).toBeVisible()
  expect(await page.getByRole('dialog').innerText()).not.toMatch(/NaN|Infinity|undefined/)
  expect(await app.writes()).toEqual([])
  void errors
})

test('J20: Close works on an invalid row (one debt update, nothing else)', async ({ app, page }) => {
  await app.open('/debts', SEED)
  await mutate(page, 'debts', 'd5', { as_of_outstanding: 'abc' })
  await revisit(app, page)
  const start = await app.counts(); const before = await app.rows('transactions')
  await card(page, 'Friend loan').getByRole('button', { name: 'Close debt' }).click()
  await expect(card(page, 'Friend loan')).toHaveCount(0)
  expect(await app.writeTables()).toEqual(['debts:update'])
  expect(app.delta(start, await app.counts())).toEqual({})
  expect(await app.rows('transactions')).toEqual(before)
})

test('J20: the repair flow works: Edit, correct the figure, confirm (the usual confirmation still applies), and the card is normal again', async ({ app, page }) => {
  await app.open('/debts', SEED)
  await mutate(page, 'debts', 'd5', { as_of_outstanding: 'abc' })
  await revisit(app, page)
  await card(page, 'Friend loan').getByRole('button', { name: 'Edit debt' }).click()
  await page.locator('#debt-principal').fill('12000')
  await page.getByRole('button', { name: 'Save changes' }).click()
  await expect(id(page, 'debt-confirm')).toBeVisible() // changing an opening figure still asks first
  expect(await app.writeTables()).toEqual([])           // nothing is written before the confirmation
  await page.getByRole('button', { name: 'Confirm and save' }).click()
  await expect(card(page, 'Friend loan')).toContainText('principal ₹12,000.00')
  await expect(page.getByTestId('debt-invalid')).toHaveCount(0)
  expect(await app.writeTables()).toEqual(['debts:update'])
  expect((await app.rows('debts')).find((r) => r.id === 'd5').as_of_outstanding).toBe(12000)
})

// Valid rows are unchanged: the exact text of every kind of card the module shows.
test('J20: valid cards are exactly as before (loan, linked payments, credit-card estimate, interest-free, accrued interest, cleared)', async ({ app, page }) => {
  await app.open('/debts', SEED)
  await mutate(page, 'debts', 'd1', { as_of_accrued_interest: 5000 })
  await revisit(app, page)
  await expect(page.getByTestId('debt-invalid')).toHaveCount(0)
  await expect(card(page, 'Education loan')).toContainText('On 1 Oct 2026: principal ₹2,50,000.00, unpaid interest ₹5,000.00')
  await expect(card(page, 'Education loan')).toContainText('Interest rate: 9.5% a year')
  await expect(card(page, 'Bike loan').getByTestId('debt-figures')).toContainText('Owed today (calculated): ₹51,156.00')
  await expect(card(page, 'Card')).toContainText('Estimate')
  await expect(card(page, 'Card')).toContainText('On 1 Oct 2026: principal ₹80,000.00')
  await expect(card(page, 'Friend loan')).toContainText('On 1 Oct 2026: principal ₹10,000.00')
  await tab(page, 'Closed').click()
  await expect(card(page, 'Old phone EMI')).toContainText('Cleared')
  await expect(card(page, 'Old phone EMI')).toContainText('Nothing owed on 1 Oct 2026.')
  expect(await page.locator('main').innerText()).not.toMatch(/NaN|Infinity|undefined|Invalid Date/)
  expect(await app.writes()).toEqual([])
})
