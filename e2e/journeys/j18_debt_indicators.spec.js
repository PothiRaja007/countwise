// J18 (D6) - the debt indicators on the Debts page and the small Debts card on Overview. They READ and calculate; they WRITE
// NOTHING. The fixed "today" is 15 Oct 2026. Seed 'debtlinked+debtplan+debtind' =
//   Education loan  250,000 at 9.5% on 1 Oct 2026, pays 5,000   no linked payment  -> opening figure 2,50,000
//   Bike loan       60,000 on 1 Aug 2026 at 12%, pays 3,000, 2 linked payments of 5,000 -> owes 51,156 today (replay)
//   Card            80,000 at 36%, pays 3,000, credit card       no linked payment  -> opening figure 80,000 (estimate)
//   Friend loan     10,000 at 0%, no monthly payment              no linked payment  -> opening figure 10,000
//   Old phone EMI   closed                                        -> in no indicator
//   income Jul 60,000 + Aug 60,000 + Sep 1,00,000 = 2,20,000
// Expected numbers come from an independent calculation (scratch replay in BigInt paise, see src/lib/debtIndicators.test.js):
//   total 51,156 + 3,40,000 = 3,91,156;  monthly 5,000 + 3,000 + 3,000 = 11,000;  burden 11,000 x 3 / 2,20,000 = 15.0%;
//   interest paid 1,156 (Bike loan only);  progress 8,844 / (8,844 + 51,156) = 14.7%.
import { test, expect } from '../support/fixtures.js'

const SEED = 'debtlinked+debtplan+debtind'
const ind = (page) => page.getByTestId('indicators')
const id = (page, k) => page.getByTestId(k)
const tab = (page, name) => page.getByRole('button', { name, exact: true })
// Leave the page and come back so it reads the (changed) data again. Waits for the OTHER page to really be on screen
// before returning, so a slow machine cannot make the second visit a no-op on the page that was already open.
async function revisit(app, page, to = '/debts') {
  await app.go('/transactions')
  await expect(page.getByPlaceholder('Search description...').first()).toBeVisible()
  await app.go(to)
}

const BANNED = [/\bshould\b/i, /\brecommend/i, /\badvis(e|ed|es|ing)\b/i, /\bsuggest/i, /\bbest\b/i, /\bbetter\b/i, /\bideal/i, /\boptimal/i, /\bmust\b/i, /\bought\b/i, /\byou need\b/i, /\bsmart/i, /\bwise/i, /\bguarantee/i, /\bsafe\b/i, /\bfastest\b/i, /\bcheapest\b/i, /\bavoid\b/i, /\b(high|low|healthy|unhealthy|risky|dangerous|good|bad|heavy|manageable|comfortable|worrying)\b/i]

test('J18: the five indicators match an independent calculation, with the mixed-basis warning and the credit-card estimate label', async ({ app, page }) => {
  await app.open('/debts', SEED)
  await expect(ind(page)).toBeVisible()
  await expect(ind(page).getByRole('heading', { name: 'Debt indicators' })).toBeVisible()
  await expect(id(page, 'indicators-basis')).toContainText('Calculated from your figures and linked payments. Not a lender statement. Not financial advice.')
  await expect(id(page, 'indicators-basis')).toContainText('Closed debts are not included.')
  await expect(id(page, 'ind-total-amount')).toHaveText('₹3,91,156.00')
  await expect(id(page, 'ind-total')).toContainText('Total owed (mixed basis)')
  await expect(id(page, 'ind-total-components')).toHaveText('Every amount is principal plus unpaid interest. Nothing else (fees, penalties) is included. An overpayment is shown but not subtracted from any total.')
  await expect(id(page, 'ind-total-note')).toHaveText('A calculated total, not a verified current balance.')
  await expect(id(page, 'ind-total-mixed')).toContainText('Mixed basis: this total adds amounts calculated from linked payments to opening figures that are not current. It is not a verified current debt balance.')
  await expect(id(page, 'ind-total-opening-only')).toHaveCount(0)
  await expect(id(page, 'ind-total-estimate')).toHaveText('Includes credit-card figures, which are estimates.')
  await expect(id(page, 'ind-total-split')).toContainText('Calculated from linked payments: ₹51,156.00 (1 debt).')
  await expect(id(page, 'ind-total-split')).toContainText('Opening figures: ₹3,40,000.00 (3 debts).')
  await expect(id(page, 'ind-total-nofigure')).toHaveCount(0)
  await expect(id(page, 'ind-monthly-amount')).toHaveText('₹11,000.00')
  await expect(id(page, 'ind-monthly')).toContainText('3 debts included.')
  await expect(id(page, 'ind-monthly-skipped')).toHaveText('Not included: Friend loan (No monthly payment entered).')
  await expect(id(page, 'ind-burden-percent')).toHaveText('15.0%')
  await expect(id(page, 'ind-burden-inputs')).toContainText('₹11,000.00 a month divided by an average income of ₹73,333.33 (Jul 2026 to Sep 2026).')
  await expect(id(page, 'ind-interest-amount')).toHaveText('₹1,156.00')
  await expect(id(page, 'ind-interest')).toContainText('From 1 debt with linked payments; 3 active debts without a counted payment not included.')
  await expect(id(page, 'ind-progress-percent')).toHaveText('14.7%')
  await expect(id(page, 'ind-progress-detail')).toContainText('₹8,844.00 of ₹60,000.00 principal')
  // the per-debt breakdown says which basis each amount has; the closed debt is not in it
  await ind(page).getByText('How this total is worked out').click()
  await expect(id(page, 'ind-meanings')).toContainText('Calculated: as of today')
  await expect(id(page, 'ind-meanings')).toContainText('Opening figure: as of its own date only.')
  const items = id(page, 'ind-item')
  await expect(items).toHaveCount(4)
  await expect(items.filter({ hasText: 'Bike loan' })).toContainText('₹51,156.00 calculated from your figures and linked payments, as of 15 Oct 2026 (principal ₹51,156.00 + unpaid interest ₹0.00)')
  await expect(items.filter({ hasText: 'Education loan' })).toContainText('₹2,50,000.00 opening figure on 1 Oct 2026, not a current balance (principal ₹2,50,000.00 + unpaid interest ₹0.00; interest since that date not added)')
  await expect(items.filter({ hasText: 'Card' })).toContainText('₹80,000.00 opening figure on 1 Oct 2026, not a current balance (estimate)')
  await expect(items.filter({ hasText: 'Friend loan' })).toContainText('₹10,000.00 opening figure on 1 Oct 2026, not a current balance')
  await expect(items.filter({ hasText: 'Old phone EMI' })).toHaveCount(0)
  expect(await ind(page).innerText()).not.toMatch(/NaN|Infinity|undefined/) // the indicators only (an invalid figure is shown by the existing debt card as before)
  await app.noHorizontalScroll()
})

test('J18: debts without a linked payment show only their opening figures and say so; no mixed warning, no interest or progress', async ({ app, page }) => {
  await app.open('/debts', 'debt') // Education loan only (active) + a closed debt
  await expect(id(page, 'ind-total-amount')).toHaveText('₹2,50,000.00')
  await expect(id(page, 'ind-total')).toContainText('Total owed (opening figures)')
  await expect(id(page, 'ind-total-opening-only')).toHaveText('Every amount in this total is an opening figure on the date shown, not a current balance.')
  await expect(id(page, 'ind-total-mixed')).toHaveCount(0)
  await expect(id(page, 'ind-total-note')).toHaveText('A calculated total, not a verified current balance.')
  await expect(id(page, 'ind-interest-text')).toHaveText('Needs at least one linked payment that counts.')
  await expect(id(page, 'ind-progress-text')).toHaveText('Needs at least one linked payment that counts.')
  await expect(id(page, 'ind-interest-amount')).toHaveCount(0)
  await expect(id(page, 'ind-progress-percent')).toHaveCount(0)
  await expect(id(page, 'ind-monthly-amount')).toHaveText('₹5,000.00')
  // only Sep has income in the base data: the burden is not guessed
  await expect(id(page, 'ind-burden-text')).toHaveText('Not enough income recorded.')
  await expect(id(page, 'ind-burden-percent')).toHaveCount(0)
})

test('J18: payment burden needs income in each of the last 3 complete months; a gap or a bad payment is disclosed, never counted as zero', async ({ app, page }) => {
  await app.open('/debts', SEED)
  await expect(id(page, 'ind-burden-percent')).toBeVisible()
  // remove the August income: the burden is withdrawn with the reason
  await page.evaluate(() => window.__e2e.mutate('transactions', 'in-aug', { transaction_date: '2026-10-01' }))
  await revisit(app, page)
  await expect(id(page, 'ind-burden-text')).toHaveText('Not enough income recorded.')
  await expect(ind(page)).toContainText('Needs income recorded in each of Jul 2026, Aug 2026, Sep 2026.')
  // an invalid monthly payment (negative) and a debt with invalid opening figures are named, not zeroed
  await page.evaluate(() => { window.__e2e.mutate('debts', 'd4', { monthly_payment: -5 }); window.__e2e.mutate('debts', 'd5', { as_of_outstanding: 'abc' }) })
  await revisit(app, page)
  await expect(id(page, 'ind-monthly-skipped')).toContainText('Card (Monthly payment is not valid)')
  await expect(id(page, 'ind-monthly-amount')).toHaveText('₹8,000.00')
  await expect(id(page, 'ind-total-nofigure')).toContainText('Friend loan (Figures are not valid)')
  await expect(id(page, 'ind-total-nofigure')).toContainText('not counted as zero')
  expect(await ind(page).innerText()).not.toMatch(/NaN|Infinity|undefined/) // the indicators only (an invalid figure is shown by the existing debt card as before)
})

test('J18: when linked payments cannot be loaded, owed amounts, interest paid and progress are withdrawn with the reason; monthly payments still show', async ({ app, page, errors }) => {
  await app.open('/debts', SEED)
  await page.evaluate(() => { window.__mock.failRead = 'debt_payments' })
  await revisit(app, page)
  await expect(id(page, 'ind-total-text')).toContainText("Linked payments couldn't be loaded")
  await expect(id(page, 'ind-total-amount')).toHaveCount(0)
  await expect(id(page, 'ind-interest-text')).toContainText("Linked payments couldn't be loaded")
  await expect(id(page, 'ind-progress-text')).toContainText("Linked payments couldn't be loaded")
  await expect(id(page, 'ind-monthly-amount')).toHaveText('₹11,000.00')
  expect(await ind(page).innerText()).not.toMatch(/NaN|Infinity|undefined/) // the indicators only (an invalid figure is shown by the existing debt card as before)
  errors.length = 0
  await page.evaluate(() => { window.__mock.failRead = null })
  await page.getByRole('button', { name: 'Retry payments' }).click()
  await expect(id(page, 'ind-total-amount')).toHaveText('₹3,91,156.00')
})

test('J18: the indicators are only on the Active tab; none with no debts', async ({ app, page }) => {
  await app.open('/debts', SEED)
  await expect(ind(page)).toBeVisible()
  await tab(page, 'Closed').click(); await expect(ind(page)).toHaveCount(0)
  await tab(page, 'Planner').click(); await expect(ind(page)).toHaveCount(0)
  await tab(page, 'Active').click(); await expect(ind(page)).toBeVisible()
  await page.goto('about:blank')
  await app.open('/debts', 'base')
  await expect(ind(page)).toHaveCount(0)
})

test('J18: Overview shows the Debts card (count, monthly payments, burden, link) and says what it cannot detect', async ({ app, page }) => {
  await app.open('/', SEED)
  const card = id(page, 'overview-debts')
  await expect(card).toBeVisible()
  await expect(id(page, 'overview-debts-count')).toHaveText('4') // Education, Bike, Card, Friend loan (the closed debt is not counted)
  await expect(id(page, 'overview-debts-monthly')).toHaveText('₹11,000.00')
  await expect(id(page, 'overview-debts-skipped')).toContainText('Friend loan (No monthly payment entered)')
  await expect(id(page, 'overview-debts-burden')).toHaveText('15.0%')
  await expect(id(page, 'overview-debts-differ')).toBeVisible()
  await expect(id(page, 'overview-debts-differ')).toHaveText('These figures may differ from the Debts page and are not reconciled with it. Linked payments are not replayed on Overview, so a debt cleared or reduced by linked payments is still counted here from its entered monthly payment.')
  expect(await page.evaluate(() => { const n = document.querySelector('[data-testid="overview-debts-differ"]'), f = document.querySelector('[data-testid="overview-debts-monthly"]'); return !!(n.compareDocumentPosition(f) & Node.DOCUMENT_POSITION_FOLLOWING) })).toBe(true) // the caution comes before the figures
  await expect(id(page, 'overview-debts-note')).toContainText('Not a lender statement. Not financial advice.')
  await expect(card).not.toContainText('Total owed')
  await id(page, 'overview-debts-link').click()
  await expect(page).toHaveURL(/\/debts$/)
  await expect(ind(page)).toBeVisible()
})

test('J18: Overview is unchanged with no debts, and still loads normally if the debts cannot be read', async ({ app, page, errors }) => {
  await app.open('/', 'base')
  await expect(id(page, 'overview-debts')).toHaveCount(0)
  const plain = await page.locator('main').innerText()
  await page.goto('about:blank')
  await app.open('/', 'debtlinked') // debts exist...
  await page.evaluate(() => { window.__mock.failRead = 'debts' })
  await expect(id(page, 'overview-debts')).toBeVisible() // loaded once, before the failure is switched on
  await app.go('/transactions')
  await expect(id(page, 'overview-debts')).toHaveCount(0) // Overview is really gone (waits for the route change, not a fixed time)
  await app.go('/') // ...Overview is re-opened and its debts read now fails
  await expect(page.getByText(/total balance/i).first()).toBeVisible() // the page loaded
  await page.waitForTimeout(800) // let the (failing) debts read finish
  await expect(id(page, 'overview-debts')).toHaveCount(0)
  await expect(page.getByText('Something went wrong loading this page')).toHaveCount(0)
  expect(await page.locator('main').innerText()).toMatch(/total balance/i)
  errors.length = 0
  // control: with the read working again, the card comes back, so it was absent only because of the failure
  await page.evaluate(() => { window.__mock.failRead = null })
  await app.go('/transactions'); await expect(id(page, 'overview-debts')).toHaveCount(0)
  await app.go('/')
  await expect(id(page, 'overview-debts')).toBeVisible()
  expect(plain).toMatch(/total balance/i)
})

// A credit card WITH a counted linked payment is calculated, and every place it appears still says estimate.
test('J18: a credit card with a linked payment is still labelled an estimate in the total, the breakdown, interest paid and progress', async ({ app, page }) => {
  await app.open('/debts', SEED)
  await page.evaluate(() => { window.__e2e.mutate('debts', 'd4', { as_of_date: '2026-08-01' }); window.__e2e.add('debt_payments', { id: 'lk8', debt_id: 'd4', transaction_id: 'p3' }) }) // Card: figures from 1 Aug, one counted payment (1,200)
  await revisit(app, page)
  await ind(page).getByText('How this total is worked out').click()
  const card = id(page, 'ind-item').filter({ hasText: 'Card' })
  await expect(card).toContainText('calculated from your figures and linked payments')
  await expect(card).toContainText('(estimate)')
  await expect(id(page, 'ind-total-estimate')).toHaveText('Includes credit-card figures, which are estimates.')
  await expect(id(page, 'ind-interest')).toContainText('Includes a credit-card estimate.')
  await expect(id(page, 'ind-progress')).toContainText('Includes a credit-card estimate.')
  // the loan items are not marked
  await expect(id(page, 'ind-item').filter({ hasText: 'Bike loan' })).not.toContainText('(estimate)')
  await expect(id(page, 'ind-item').filter({ hasText: 'Education loan' })).not.toContainText('(estimate)')
})

// A debt cleared by linked payments: Debts page and Overview card legitimately differ, and the card says so.
test('J18: a debt cleared by linked payments is left out of the Debts page monthly total but still counted on Overview, which says so', async ({ app, page }) => {
  await app.open('/debts', SEED)
  await page.evaluate(() => { window.__e2e.mutate('transactions', 'p10', { type: 'expense' }); window.__e2e.add('debt_payments', { id: 'lk9', debt_id: 'd3', transaction_id: 'p10' }) }) // the 70,000 lump sum is linked to the Bike loan
  await revisit(app, page)
  await expect(id(page, 'ind-monthly-amount')).toHaveText('₹8,000.00') // Bike loan is cleared: its 3,000 is not required
  await expect(id(page, 'ind-monthly-skipped')).toContainText('Bike loan (Cleared)')
  await ind(page).getByText('How this total is worked out').click()
  await expect(id(page, 'ind-item').filter({ hasText: 'Bike loan' })).toContainText('overpaid')
  await expect(id(page, 'ind-item').filter({ hasText: 'Bike loan' })).toContainText('not subtracted')
  await app.go('/')
  await expect(id(page, 'overview-debts-monthly')).toHaveText('₹11,000.00') // not replayed here
  await expect(id(page, 'overview-debts-differ')).toContainText('a debt cleared or reduced by linked payments is still counted here')
})

// KNOWN LIMITATIONS recorded for D7 (nothing here is fixed in D6).
// KL-1: an invalid stored opening figure must not break the indicators or the rest of the debt page.
test('J18 KL-1 (for D7): an invalid opening figure is named and left out of the indicators; the rest of the Debts page keeps working', async ({ app, page }) => {
  await app.open('/debts', SEED)
  await page.evaluate(() => window.__e2e.mutate('debts', 'd5', { as_of_outstanding: 'abc' }))
  await revisit(app, page)
  await expect(ind(page)).toBeVisible()
  await expect(id(page, 'ind-total-nofigure')).toContainText('Friend loan (Figures are not valid)')
  await expect(id(page, 'ind-total-amount')).toHaveText('₹3,81,156.00') // the other three debts are still added up
  expect(await ind(page).innerText()).not.toMatch(/NaN|Infinity|undefined/)
  await expect(page.getByRole('heading', { name: 'Education loan' })).toBeVisible()
  await expect(page.getByRole('heading', { name: 'Bike loan' })).toBeVisible()
  await tab(page, 'Closed').click(); await expect(page.getByRole('heading', { name: 'Old phone EMI' })).toBeVisible()
  await tab(page, 'Planner').click(); await expect(page.getByTestId('planner')).toBeVisible()
  await tab(page, 'Active').click()
  await page.getByRole('button', { name: 'Add debt' }).click(); await expect(page.getByRole('button', { name: 'Cancel' }).first()).toBeVisible()
  expect(await app.writes()).toEqual([])
})
// KL-2 (fixed in D8): the existing debt card used to show "NaN" for an invalid opening figure. It now shows the fallback text
// and no amount; the indicators are unchanged. The full regression set is j20_debt_invalid_figures.spec.js.
test('J18 KL-2 (fixed): the debt card shows the fallback text instead of NaN for an invalid opening figure; the indicators never showed NaN', async ({ app, page }) => {
  await app.open('/debts', SEED)
  await page.evaluate(() => window.__e2e.mutate('debts', 'd5', { as_of_outstanding: 'abc' }))
  await revisit(app, page)
  await expect(page.locator('main')).not.toContainText('NaN') // D3 card (fixed)
  await expect(page.getByTestId('debt-invalid')).toHaveText('The saved figures for this debt are not valid. Edit this debt to correct them.')
  expect(await ind(page).innerText()).not.toContain('NaN')       // D6 indicators
})

test('J18: the indicators write nothing, change no balance, and keep no data in the browser', async ({ app, page }) => {
  await app.open('/', SEED)
  const store = () => page.evaluate(() => JSON.stringify([Object.entries(window.localStorage).sort(), Object.entries(window.sessionStorage).sort()]))
  const storeBefore = await store()
  const start = await app.counts()
  const balance = await app.balance('a1')
  const tx = await app.rows('transactions'), debts = await app.rows('debts'), links = await app.rows('debt_payments')
  await app.go('/debts'); await expect(ind(page)).toBeVisible()
  await ind(page).getByText('How this total is worked out').click()
  await tab(page, 'Closed').click(); await tab(page, 'Planner').click(); await tab(page, 'Active').click()
  await app.go('/'); await expect(id(page, 'overview-debts')).toBeVisible()
  await page.reload(); await page.waitForFunction(() => !document.body.innerText.includes('Loading...'))
  expect(await app.writes()).toEqual([])
  expect(await app.writeTables()).toEqual([])
  expect(app.delta(start, await app.counts())).toEqual({})
  expect(await app.balance('a1')).toBe(balance)
  expect(await app.rows('transactions')).toEqual(tx); expect(await app.rows('debts')).toEqual(debts); expect(await app.rows('debt_payments')).toEqual(links)
  expect(await store()).toBe(storeBefore)
})

test('J18: no advice wording on the indicators or the Overview card, and the page fits the screen', async ({ app, page }) => {
  await app.open('/debts', SEED)
  await ind(page).getByText('How this total is worked out').click()
  const t1 = await ind(page).innerText()
  for (const re of BANNED) expect(t1, `${re}`).not.toMatch(re)
  await app.noHorizontalScroll()
  await app.go('/')
  const t2 = await id(page, 'overview-debts').innerText()
  for (const re of BANNED) expect(t2, `${re}`).not.toMatch(re)
  await app.noHorizontalScroll()
  // neither shows a colour-coded verdict: no element in the indicators carries a status colour class on the figures
  await app.go('/debts')
  expect(await ind(page).locator('[data-testid="ind-burden-percent"]').getAttribute('class')).not.toMatch(/green|red|amber|good|bad|warn/i)
})
