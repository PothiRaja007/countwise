// J15 (D3) - the Debts screen. A debt is not an account: nothing here may touch transactions, accounts or goals.
// The in-memory stand-in mirrors the unique index debts_active_name_per_user (see e2e/support/mockdb.js).
// Seed kinds: 'debt' = one active loan (Education loan) + one closed debt; 'debt20' = twenty active debts.
import { test, expect } from '../support/fixtures.js'

// A refused save is logged to the console like every failed save. Only the refusal itself is allowed.
function onlyTheRefusal(errors) {
  expect(errors.length).toBeGreaterThan(0)
  for (const e of errors) expect(e).toMatch(/duplicate key value/)
  errors.length = 0
}

async function fill(page, f) {
  const set = async (id, v) => { if (v !== undefined) await page.locator(`#${id}`).fill(v) }
  if (f.name !== undefined) await set('debt-name', f.name)
  if (f.kind) await page.locator('#debt-kind').selectOption(f.kind)
  await set('debt-lender', f.lender); await set('debt-asof', f.asOf); await set('debt-principal', f.principal)
  await set('debt-accrued', f.accrued); await set('debt-rate', f.rate); await set('debt-payment', f.payment)
  await set('debt-months', f.months); await set('debt-due', f.due)
}
const addBtn = (page) => page.getByRole('button', { name: 'Add debt', exact: true })
const save = (page) => page.getByRole('button', { name: 'Save debt', exact: true })
const LOAN = { name: 'Bike loan', kind: 'term_loan', lender: 'HDFC', asOf: '2026-10-01', principal: '60000', rate: '11.5', payment: '3000', months: '24', due: '10' }

test('J15: Debts is in the sidebar (desktop) or the More menu (phone) and opens the page', async ({ app, page }) => {
  await app.open('/', 'debt')
  if (page.viewportSize().width < 768) {
    await page.getByRole('button', { name: 'More', exact: true }).click()
    await page.getByRole('dialog').getByRole('link', { name: 'Debts' }).click()
  } else {
    await page.locator('aside').getByRole('link', { name: 'Debts' }).click()
  }
  await expect(page.getByRole('heading', { name: 'Education loan' })).toBeVisible()
  expect(app.path()).toBe('/debts')
})

test('J15: the list shows the opening figures with their date, the rate, and a calculated projection', async ({ app, page }) => {
  await app.open('/debts', 'debt')
  const card = page.getByTestId('debt-card')
  await expect(card).toHaveCount(1) // the closed debt is on the other tab
  await expect(card).toContainText('Education loan'); await expect(card).toContainText('SBI')
  await expect(card).toContainText('On 1 Oct 2026: principal ₹2,50,000.00')
  await expect(card).toContainText('Interest rate: 9.5% a year'); await expect(card).toContainText('Monthly payment: ₹5,000.00')
  await expect(card).toContainText('60 months (5 years) left on 1 Oct 2026'); await expect(card).toContainText('Due on the 5th of each month')
  await expect(page.getByTestId('debt-projection')).toContainText('Calculated from the principal on 1 Oct 2026')
  await expect(card).not.toContainText('Cleared'); await expect(card).not.toContainText('Estimate')
  await page.getByRole('button', { name: 'Closed', exact: true }).click()
  await expect(page.getByTestId('debt-card')).toContainText('Old phone EMI')
  await expect(page.getByTestId('debt-card')).toContainText('Cleared') // G1: principal and interest both 0
  await expect(page.getByTestId('debt-projection')).toHaveCount(0)
  await app.noHorizontalScroll()
})

test('J15: adding a loan writes ONE debt row and nothing else; the Overview balance does not change', async ({ app, page }) => {
  await app.open('/debts', 'debt')
  const start = await app.counts(); const bal = await app.balance()
  await addBtn(page).click()
  await fill(page, LOAN)
  await save(page).click()
  await expect(page.getByRole('heading', { name: 'Bike loan' })).toBeVisible()
  await expect.poll(async () => app.delta(start, await app.counts())).toEqual({ debts: 1 })
  expect(await app.writeTables()).toEqual(['debts:insert'])
  const row = (await app.rows('debts')).find((r) => r.name === 'Bike loan')
  expect(row).toMatchObject({ kind: 'term_loan', lender: 'HDFC', as_of_date: '2026-10-01', as_of_outstanding: 60000, as_of_accrued_interest: 0, annual_rate_pct: 11.5, monthly_payment: 3000, remaining_months: 24, due_day: 10, status: 'active', user_id: 'u1' })
  expect(await app.balance()).toBe(bal)
  await app.go('/')
  expect(await app.balance()).toBe(bal)
})

test('J15: an interest-free debt is forced to 0%; a credit card is labelled an Estimate with no projection', async ({ app, page }) => {
  await app.open('/debts', 'debt')
  await addBtn(page).click()
  await page.locator('#debt-kind').selectOption('interest_free')
  await expect(page.locator('#debt-rate')).toHaveValue('0'); await expect(page.locator('#debt-rate')).toBeDisabled()
  await fill(page, { name: 'Phone EMI', asOf: '2026-10-01', principal: '12000', payment: '1000', months: '12' })
  await save(page).click()
  await expect(page.getByRole('heading', { name: 'Phone EMI' })).toBeVisible()
  expect((await app.rows('debts')).find((r) => r.name === 'Phone EMI')).toMatchObject({ kind: 'interest_free', annual_rate_pct: 0 })

  await addBtn(page).click()
  await fill(page, { name: 'Visa card', kind: 'credit_card', asOf: '2026-10-01', principal: '8000', rate: '36', payment: '500', months: '10' })
  await save(page).click()
  const card = page.getByTestId('debt-card').filter({ hasText: 'Visa card' })
  await expect(card.getByText('Estimate', { exact: true })).toBeVisible() // the label itself, not the sentence under it
  await expect(card).toContainText('not a current balance')
  await expect(card.getByTestId('debt-projection')).toHaveCount(0) // no schedule for a card
})

test('J15: a zero principal saves and shows Cleared, with no projection', async ({ app, page }) => {
  await app.open('/debts', 'debt')
  await addBtn(page).click()
  await fill(page, { ...LOAN, name: 'Cleared loan', principal: '0' })
  await save(page).click()
  const card = page.getByTestId('debt-card').filter({ hasText: 'Cleared loan' })
  await expect(card).toContainText('Cleared'); await expect(card).toContainText('Nothing owed on 1 Oct 2026')
  await expect(card.getByTestId('debt-projection')).toHaveCount(0)
})

test('J15: bad input is refused in the form with a plain message and nothing is written', async ({ app, page }) => {
  await app.open('/debts', 'debt')
  const start = await app.counts()
  await addBtn(page).click()
  await save(page).click() // everything empty
  await expect(page.getByText('Give this debt a name.')).toBeVisible()
  await expect(page.getByText('Enter the yearly interest rate. Use 0 if there is none.')).toBeVisible()
  await expect(page.getByText('Principal owed is required.')).toBeVisible()
  await fill(page, { ...LOAN, rate: '' })
  await save(page).click()
  await expect(page.getByText('Enter the yearly interest rate. Use 0 if there is none.')).toBeVisible() // no default
  await fill(page, { ...LOAN, asOf: '2026-10-16' })
  await save(page).click()
  await expect(page.getByText('This date cannot be in the future')).toBeVisible()
  await fill(page, { ...LOAN, asOf: '2026-10-01', principal: '1000.123' })
  await save(page).click()
  await expect(page.getByText('Principal owed must be a number with at most 2 decimals')).toBeVisible()
  await fill(page, { ...LOAN, principal: '60000', rate: '10.123' })
  await save(page).click()
  await expect(page.getByText('The rate must be a number with at most 2 decimals')).toBeVisible()
  await fill(page, { ...LOAN, rate: '101' })
  await save(page).click()
  await expect(page.getByText('The rate must be between 0 and 100.')).toBeVisible()
  await fill(page, { ...LOAN, rate: '11.5', months: '601', due: '32' })
  await save(page).click()
  await expect(page.getByText('Months remaining must be a whole number from 1 to 600.')).toBeVisible()
  await expect(page.getByText('The due day must be a whole number from 1 to 31.')).toBeVisible()
  expect(app.delta(start, await app.counts())).toEqual({})
  expect(await app.writeTables()).toEqual([])
})

test('J15: a second active debt with the same name is refused with a sentence; closing the first makes the name free', async ({ app, page, errors }) => {
  await app.open('/debts', 'debt')
  const start = await app.counts()
  await addBtn(page).click()
  await fill(page, { ...LOAN, name: 'education LOAN' })
  await save(page).click()
  await expect(page.getByText('You already have an active debt with this name')).toBeVisible()
  await expect(page.getByText("Couldn't save this debt")).toHaveCount(0)
  expect(app.delta(start, await app.counts())).toEqual({})
  onlyTheRefusal(errors)
  await page.getByRole('button', { name: 'Close', exact: true }).click() // the dialog's X
  await page.getByRole('button', { name: 'Close debt' }).click()
  await expect(page.getByText('No active debts.')).toBeVisible()
  await addBtn(page).click()
  await fill(page, { ...LOAN, name: 'Education loan' })
  await save(page).click()
  await expect(page.getByTestId('debt-card')).toHaveCount(1)
  // reopening the closed one would now make two active debts with that name
  await page.getByRole('button', { name: 'Closed', exact: true }).click()
  const closed = page.getByTestId('debt-card').filter({ hasText: 'Education loan' })
  await closed.getByRole('button', { name: 'Reopen debt' }).click()
  await expect(page.getByText('You already have an active debt with this name')).toBeVisible()
  onlyTheRefusal(errors)
})

test('J15: editing a name asks nothing; editing an opening figure asks for confirmation first', async ({ app, page }) => {
  await app.open('/debts', 'debt')
  const start = await app.counts()
  await page.getByRole('button', { name: 'Edit debt' }).click()
  await page.locator('#debt-name').fill('Education loan (SBI)')
  await page.getByRole('button', { name: 'Save changes' }).click()
  await expect(page.getByRole('heading', { name: 'Education loan (SBI)' })).toBeVisible()
  expect(await app.writeTables()).toEqual(['debts:update'])
  expect(app.delta(start, await app.counts())).toEqual({})

  await page.getByRole('button', { name: 'Edit debt' }).click()
  await page.locator('#debt-principal').fill('240000')
  await page.getByRole('button', { name: 'Save changes' }).click()
  await expect(page.getByTestId('debt-confirm')).toContainText('This changes the starting point for every figure on this debt.')
  expect(await app.writeTables()).toEqual(['debts:update']) // nothing more was written yet
  await page.getByRole('button', { name: 'Go back' }).click()
  await expect(page.locator('#debt-principal')).toHaveValue('240000') // the form is still there with the user's input
  await page.getByRole('button', { name: 'Save changes' }).click()
  await page.getByRole('button', { name: 'Confirm and save' }).click()
  await expect(page.getByTestId('debt-card')).toContainText('principal ₹2,40,000.00')
  expect(await app.writeTables()).toEqual(['debts:update', 'debts:update'])
  expect((await app.rows('debts')).find((r) => r.id === 'd1').as_of_outstanding).toBe(240000)
})

test('J15: changing the rate or the date also needs confirmation; cancelling the form writes nothing', async ({ app, page }) => {
  await app.open('/debts', 'debt')
  for (const [id, v] of [['debt-rate', '10'], ['debt-asof', '2026-10-02'], ['debt-accrued', '100']]) {
    await page.getByRole('button', { name: 'Edit debt' }).click()
    await page.locator(`#${id}`).fill(v)
    await page.getByRole('button', { name: 'Save changes' }).click()
    await expect(page.getByTestId('debt-confirm')).toBeVisible()
    await page.getByRole('button', { name: 'Close', exact: true }).click()
  }
  expect(await app.writeTables()).toEqual([])
  expect((await app.rows('debts')).find((r) => r.id === 'd1')).toMatchObject({ annual_rate_pct: 9.5, as_of_date: '2026-10-01', as_of_accrued_interest: 0 })
})

test('J15: Close and Reopen move a debt between the tabs and never delete it', async ({ app, page }) => {
  await app.open('/debts', 'debt')
  const start = await app.counts()
  await page.getByRole('button', { name: 'Close debt' }).click()
  await expect(page.getByText('No active debts.')).toBeVisible()
  await page.getByRole('button', { name: 'Closed', exact: true }).click()
  await expect(page.getByTestId('debt-card')).toHaveCount(2)
  await page.getByTestId('debt-card').filter({ hasText: 'Education loan' }).getByRole('button', { name: 'Reopen debt' }).click()
  await page.getByRole('button', { name: 'Active', exact: true }).click()
  await expect(page.getByTestId('debt-card')).toHaveCount(1)
  expect(app.delta(start, await app.counts())).toEqual({})
  expect(await app.writeTables()).toEqual(['debts:update', 'debts:update'])
  expect(await page.getByRole('button', { name: /delete/i }).count()).toBe(0)
})

test('J15: Export CSV downloads the stored columns of every debt, active and closed', async ({ app, page }) => {
  await app.open('/debts', 'debt')
  const [download] = await Promise.all([page.waitForEvent('download'), page.getByRole('button', { name: 'Export CSV' }).click()])
  expect(download.suggestedFilename()).toBe('countwise-debts-2026-10-15.csv')
  const path = await download.path()
  const csv = (await import('node:fs')).readFileSync(path, 'utf8')
  const lines = csv.trim().split('\r\n')
  expect(lines[0]).toBe('name,kind,lender,status,as_of_date,as_of_outstanding,as_of_accrued_interest,annual_rate_pct,monthly_payment,remaining_months,due_day,created_at,updated_at')
  expect(lines).toHaveLength(3)
  expect(lines[1]).toMatch(/^(Education loan|Old phone EMI),/); expect(csv).toContain('Education loan,term_loan,SBI,active,2026-10-01,250000,0,9.5,5000,60,5')
  expect(csv).toContain('Old phone EMI,interest_free,,closed')
  expect(await app.writeTables()).toEqual([])
})

test('J15: with no debts the page says so and Export is off', async ({ app, page }) => {
  await app.open('/debts', 'base')
  await expect(page.getByText('No debts added yet.')).toBeVisible()
  await expect(page.getByRole('button', { name: 'Export CSV' })).toBeDisabled()
})

test('J15: at 20 active debts Add and Reopen explain the limit instead of opening or writing', async ({ app, page }) => {
  await app.open('/debts', 'debt+debt20')
  const start = await app.counts()
  await expect(page.getByText('You can have 20 active debts at once. Close one to add another.').first()).toBeVisible()
  await addBtn(page).click()
  await expect(page.locator('#debt-name')).toHaveCount(0)
  await page.getByRole('button', { name: 'Closed', exact: true }).click()
  await page.getByRole('button', { name: 'Reopen debt' }).click()
  await expect(page.getByText('You can have 20 active debts at once. Close one to add another.').first()).toBeVisible()
  expect(app.delta(start, await app.counts())).toEqual({})
  expect(await app.writeTables()).toEqual([])
})

test('J15: a failed load shows a plain error with Retry; a failed save keeps the form and the typed values', async ({ app, page, errors }) => {
  await app.open('/debts', 'debt')
  await page.evaluate(() => { window.__mock.failRead = 'debts' })
  await app.go('/'); await app.go('/debts')
  await expect(page.getByText('Something went wrong loading this page')).toBeVisible()
  await page.evaluate(() => { window.__mock.failRead = null })
  await page.getByRole('button', { name: 'Retry' }).click()
  await expect(page.getByRole('heading', { name: 'Education loan' })).toBeVisible()
  errors.length = 0

  await page.evaluate(() => { window.__mock.failWrite = 'debts' })
  const start = await app.counts()
  await addBtn(page).click()
  await fill(page, LOAN)
  await save(page).click()
  await expect(page.getByText("Couldn't save this debt. Please try again.")).toBeVisible()
  await expect(page.locator('#debt-name')).toHaveValue('Bike loan')
  expect(app.delta(start, await app.counts())).toEqual({})
  errors.length = 0
})

test('J15: a double click on Save writes ONE debt', async ({ app, page }) => {
  await app.open('/debts', 'debt')
  const start = await app.counts()
  await addBtn(page).click()
  await fill(page, LOAN)
  await save(page).evaluate(async (el) => { el.click(); await new Promise((r) => setTimeout(r, 40)); el.click() })
  await page.waitForTimeout(800)
  expect(app.delta(start, await app.counts())).toEqual({ debts: 1 })
  expect(await app.writeTables()).toEqual(['debts:insert'])
})

test('J15: two clicks on Save in the same instant write ONE debt', async ({ app, page }) => {
  await app.open('/debts', 'debt')
  const start = await app.counts()
  await addBtn(page).click()
  await fill(page, LOAN)
  await save(page).evaluate((el) => { el.click(); el.click() }) // same tick: the disabled state has not rendered yet
  await page.waitForTimeout(800)
  expect(app.delta(start, await app.counts())).toEqual({ debts: 1 })
  expect(await app.writeTables()).toEqual(['debts:insert']) // one attempt, not a second one the database had to refuse
})

test('J15: Escape on the form writes nothing', async ({ app, page }) => {
  await app.open('/debts', 'debt')
  await addBtn(page).click()
  await fill(page, LOAN)
  await page.keyboard.press('Escape')
  await expect(page.locator('#debt-name')).toHaveCount(0)
  expect(await app.writeTables()).toEqual([])
})
