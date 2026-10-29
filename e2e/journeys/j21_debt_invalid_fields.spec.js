// J21 (KL-13 fix) - a debt whose SAVED rate, monthly payment, months left or due day is not valid (a bad row written outside the
// app; the database and the app's own forms refuse them). Each field shows "<Label>: not valid. Edit this debt to correct it."
// and only what DEPENDS on that field is withheld. Opening figures that are invalid take precedence (the KL-2 fallback).
// Seed 'debtlinked+debtplan+debtind': Education loan d1 (9.5%, pays 5,000, 60 months, due the 5th, no linked payment, shows an
// EMI line and a payoff schedule); Bike loan d3 (12%, pays 3,000, two linked payments -> owed today 51,156).
import { test, expect } from '../support/fixtures.js'

const SEED = 'debtlinked+debtplan+debtind'
const id = (page, k) => page.getByTestId(k)
const tab = (page, name) => page.getByRole('button', { name, exact: true })
const card = (page, name) => page.getByTestId('debt-card').filter({ has: page.getByRole('heading', { name, exact: true }) })
const BAD_TEXT = /NaN|Infinity|undefined|Invalid Date/
const FALLBACK = { rate: 'Interest rate: not valid. Edit this debt to correct it.', payment: 'Monthly payment: not valid. Edit this debt to correct it.', months: 'Months left: not valid. Edit this debt to correct it.', dueDay: 'Due day: not valid. Edit this debt to correct it.' }
const TID = { rate: 'debt-rate-invalid', payment: 'debt-payment-invalid', months: 'debt-months-invalid', dueDay: 'debt-dueday-invalid' }
async function revisit(app, page, to = '/debts') {
  await app.go('/transactions')
  await expect(page.getByPlaceholder('Search description...').first()).toBeVisible()
  await app.go(to)
}
const mutate = (page, rowId, patch) => page.evaluate(([i, p]) => window.__e2e.mutate('debts', i, p), [rowId, patch])
async function setup(app, page, patch, rowId = 'd1') { await app.open('/debts', SEED); await mutate(page, rowId, patch); await revisit(app, page) }
// What the intact Education card shows, so each test can say what must stay and what must go.
const STAYS = {
  principal: 'On 1 Oct 2026: principal ₹2,50,000.00',
  rate: 'Interest rate: 9.5% a year',
  payment: 'Monthly payment: ₹5,000.00',
  months: '60 months (5 years) left on 1 Oct 2026',
  dueDay: 'Due on the 5th of each month',
}

const CASES = [
  // [label, field, patch]
  ['text rate', 'rate', { annual_rate_pct: 'abc' }], ['negative rate', 'rate', { annual_rate_pct: -1 }], ['rate over 100', 'rate', { annual_rate_pct: 100.5 }], ['rate with 3 decimals', 'rate', { annual_rate_pct: 9.555 }],
  ['text payment', 'payment', { monthly_payment: 'abc' }], ['zero payment', 'payment', { monthly_payment: 0 }], ['negative payment', 'payment', { monthly_payment: -5 }], ['payment over the maximum', 'payment', { monthly_payment: 100000000001 }],
  ['text months', 'months', { remaining_months: 'abc' }], ['zero months', 'months', { remaining_months: 0 }], ['601 months', 'months', { remaining_months: 601 }], ['fractional months', 'months', { remaining_months: 12.5 }],
  ['text due day', 'dueDay', { due_day: 'abc' }], ['due day 0', 'dueDay', { due_day: 0 }], ['due day 32', 'dueDay', { due_day: 32 }],
]
for (const [label, field, patch] of CASES) {
  test(`J21: ${label}: that line says it is not valid; only what depends on it is withheld; no NaN anywhere`, async ({ app, page }) => {
    await setup(app, page, patch)
    const c = card(page, 'Education loan')
    await expect(c.getByTestId(TID[field])).toHaveText(FALLBACK[field])
    for (const other of Object.keys(TID)) if (other !== field) await expect(c.getByTestId(TID[other])).toHaveCount(0)
    const text = await c.innerText()
    expect(text).not.toMatch(BAD_TEXT)
    expect(await page.locator('main').innerText()).not.toMatch(BAD_TEXT)
    expect(text).toContain(STAYS.principal) // the opening figures are untouched by a bad rate, payment, months or due day
    for (const k of Object.keys(STAYS)) if (k !== field && k !== 'principal') expect(text, `unaffected line "${STAYS[k]}"`).toContain(STAYS[k])
    const proj = (await c.getByTestId('debt-projection').count()) ? await c.getByTestId('debt-projection').innerText() : ''
    const emi = /would clear the principal in 60 months/.test(proj), sched = /is paid off in|does not cover a month of interest|more than 50 years/.test(proj)
    if (field === 'rate') { expect(emi || sched).toBe(false); await expect(c.getByTestId('debt-projection')).toHaveCount(0) }   // both need the rate
    if (field === 'payment') { expect(emi).toBe(true); expect(sched).toBe(false) }                                              // EMI needs rate + months only
    if (field === 'months') { expect(emi).toBe(false); expect(sched).toBe(true) }                                                // schedule needs rate + payment only
    if (field === 'dueDay') { expect(emi).toBe(true); expect(sched).toBe(true) }                                                 // the due day feeds no calculation
    // repair access, other cards, other tabs, and nothing written by looking
    await expect(c.getByRole('button', { name: 'Edit debt' })).toBeEnabled()
    await expect(c.getByRole('button', { name: 'Close debt' })).toBeEnabled()
    await expect(c.getByRole('button', { name: 'Payments for Education loan' })).toBeEnabled()
    await expect(card(page, 'Bike loan').getByTestId('debt-figures')).toContainText('Owed today (calculated): ₹51,156.00')
    await tab(page, 'Closed').click(); await expect(page.getByRole('heading', { name: 'Old phone EMI' })).toBeVisible()
    await tab(page, 'Planner').click(); await expect(id(page, 'planner')).toBeVisible()
    expect(await page.locator('main').innerText()).not.toMatch(BAD_TEXT)
    expect(await app.writes()).toEqual([])
    await app.noHorizontalScroll()
  })
}

test('J21: a bad rate on a debt WITH linked payments withholds the calculated figures with the existing plain sentence; opening figures stay', async ({ app, page }) => {
  await setup(app, page, { annual_rate_pct: 'abc' }, 'd3')
  const c = card(page, 'Bike loan')
  await expect(c.getByTestId(TID.rate)).toHaveText(FALLBACK.rate)
  await expect(c.getByTestId('debt-figures')).toHaveCount(0)
  await expect(c.getByTestId('debt-figures-failed')).toBeVisible()
  await expect(c).toContainText('On 1 Aug 2026: principal ₹60,000.00')
  expect(await c.innerText()).not.toMatch(BAD_TEXT)
})

test('J21: a bad monthly payment on a debt WITH linked payments keeps the calculated figures and withholds only the payoff schedule', async ({ app, page }) => {
  await setup(app, page, { monthly_payment: 'abc' }, 'd3')
  const c = card(page, 'Bike loan')
  await expect(c.getByTestId(TID.payment)).toHaveText(FALLBACK.payment)
  await expect(c.getByTestId('debt-figures')).toContainText('Owed today (calculated): ₹51,156.00')
  await expect(c.getByTestId('debt-projection')).toHaveCount(0)
  expect(await c.innerText()).not.toMatch(BAD_TEXT)
})

test('J21: when the opening figures are also invalid, the KL-2 fallback wins and no field line is shown', async ({ app, page }) => {
  await setup(app, page, { as_of_outstanding: 'abc', monthly_payment: 'abc', annual_rate_pct: 'abc' })
  const c = card(page, 'Education loan')
  await expect(c.getByTestId('debt-invalid')).toHaveText('The saved figures for this debt are not valid. Edit this debt to correct them.')
  for (const k of Object.values(TID)) await expect(c.getByTestId(k)).toHaveCount(0)
  expect(await c.innerText()).not.toMatch(/₹|NaN/)
})

test('J21: empty optional fields are not invalid: no fallback line, no schedule, no NaN', async ({ app, page }) => {
  await setup(app, page, { monthly_payment: null, remaining_months: null, due_day: null })
  const c = card(page, 'Education loan')
  for (const k of Object.values(TID)) await expect(c.getByTestId(k)).toHaveCount(0)
  const text = await c.innerText()
  expect(text).not.toMatch(BAD_TEXT)
  expect(text).not.toMatch(/Monthly payment|left on|Due on/)
  expect(text).toContain(STAYS.rate)
})

test('J21: valid boundary values show normally (rate 0 and 100, 1 and 600 months, due day 31, payment 0.01)', async ({ app, page }) => {
  for (const patch of [{ annual_rate_pct: 0 }, { annual_rate_pct: 100 }, { remaining_months: 1 }, { remaining_months: 600 }, { due_day: 31 }, { monthly_payment: 0.01 }]) {
    await setup(app, page, patch)
    const c = card(page, 'Education loan')
    for (const k of Object.values(TID)) await expect(c.getByTestId(k)).toHaveCount(0)
    expect(await c.innerText()).not.toMatch(BAD_TEXT)
    await page.goto('about:blank')
  }
})

test('J21: the card and the indicators agree about a bad monthly payment', async ({ app, page }) => {
  await setup(app, page, { monthly_payment: 'abc' })
  await expect(card(page, 'Education loan').getByTestId(TID.payment)).toBeVisible()
  await expect(id(page, 'ind-monthly-skipped')).toContainText('Education loan (Monthly payment is not valid)')
  await expect(id(page, 'ind-monthly-amount')).toHaveText('₹6,000.00') // 3,000 + 3,000: Education loan is left out, not counted as zero or NaN
})

test('J21: repair works: a bad rate needs the usual confirmation; a bad monthly payment saves directly; nothing is written before Save/Confirm', async ({ app, page }) => {
  await setup(app, page, { annual_rate_pct: 'abc', monthly_payment: 'abc' })
  const c = card(page, 'Education loan')
  await c.getByRole('button', { name: 'Edit debt' }).click()
  await page.locator('#debt-rate').fill('9.5'); await page.locator('#debt-payment').fill('5000')
  expect(await app.writes()).toEqual([])
  await page.getByRole('button', { name: 'Save changes' }).click()
  await expect(id(page, 'debt-confirm')).toBeVisible() // changing the rate still asks first
  expect(await app.writes()).toEqual([])
  await page.getByRole('button', { name: 'Confirm and save' }).click()
  await expect(card(page, 'Education loan').getByTestId(TID.rate)).toHaveCount(0)
  await expect(card(page, 'Education loan').getByTestId(TID.payment)).toHaveCount(0)
  await expect(card(page, 'Education loan')).toContainText('Interest rate: 9.5% a year')
  await expect(card(page, 'Education loan')).toContainText('Monthly payment: ₹5,000.00')
  expect(await app.writeTables()).toEqual(['debts:update'])
})

test('J21: Payments and Close work on a debt with a bad field and write only what they should', async ({ app, page }) => {
  await setup(app, page, { monthly_payment: 'abc' }, 'd3')
  await card(page, 'Bike loan').getByRole('button', { name: 'Payments for Bike loan' }).click()
  await expect(page.getByRole('dialog')).toBeVisible()
  expect(await page.getByRole('dialog').innerText()).not.toMatch(BAD_TEXT)
  expect(await app.writes()).toEqual([])
  await page.keyboard.press('Escape')
  await card(page, 'Bike loan').getByRole('button', { name: 'Close debt' }).click()
  await expect(card(page, 'Bike loan')).toHaveCount(0)
  expect(await app.writeTables()).toEqual(['debts:update'])
})
