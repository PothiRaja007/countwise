// J17 (D5) - the repayment planner on the Debts page. It shows calculated scenarios and WRITES NOTHING: no row is created,
// changed or deleted, nothing is saved, and the inputs are gone on reload.
// The fixed "today" is 15 Oct 2026, so month 1 of a plan is Nov 2026. Seed kinds: 'debtlinked+debtplan' =
//   Education loan  250,000 at 9.5%, pays 5,000   (no linked payment: the opening principal is used)
//   Bike loan       60,000 on 1 Aug 2026 at 12%, pays 3,000, two linked payments of 5,000 -> 51,156 principal today (D4b)
//   Card            80,000 at 36%, pays 3,000      (credit card: estimate)
//   Old phone EMI   closed                         (left out: Closed)
//   Friend loan     10,000 at 0%, no payment       (left out: No monthly payment entered)
// Expected numbers below come from an independent month-by-month simulation (see src/lib/debtPlanner.test.js), not from
// the planner under test.
import { test, expect } from '../support/fixtures.js'

const SEED = 'debtlinked+debtplan'
const planner = (page) => page.getByTestId('planner')
const tab = (page, name) => page.getByRole('button', { name, exact: true })
const sc = (page, key) => page.getByTestId(`scenario-${key}`)
const BANNED = [/\bshould\b/i, /\brecommend/i, /\badvis(e|ed|es|ing)\b/i, /\bsuggest/i, /\bbest\b/i, /\bbetter\b/i, /\bideal/i, /\boptimal/i, /\bmust\b/i, /\bought\b/i, /\byou need\b/i, /\bsmart/i, /\bwise/i, /\bguarantee/i, /\bsafe\b/i, /\bfastest\b/i, /\bcheapest\b/i, /\bavoid\b/i]

async function openPlanner(app, page, seed = SEED) {
  await app.open('/debts', seed)
  await tab(page, 'Planner').click()
  await expect(planner(page)).toBeVisible()
}
async function plan(page, { budget = '', amount = '', month = '' } = {}) {
  await page.getByTestId('planner-budget').fill(budget)
  await page.getByTestId('planner-lump-amount').fill(amount)
  await page.getByTestId('planner-lump-month').fill(month)
}

test('J17: the Planner tab lists the debts in the plan with the balance used and why, and the debts left out with the reason', async ({ app, page }) => {
  await openPlanner(app, page)
  await expect(planner(page).getByRole('heading', { name: 'Repayment planner' })).toBeVisible()
  await expect(page.getByTestId('planner-basis')).toHaveText('Calculated from your figures. Not a lender statement. Not financial advice.')
  const debts = page.getByTestId('planner-debt')
  await expect(debts).toHaveCount(3)
  const edu = debts.filter({ hasText: 'Education loan' }), bike = debts.filter({ hasText: 'Bike loan' }), card = debts.filter({ hasText: 'Card' })
  await expect(edu).toContainText('Starting principal ₹2,50,000.00'); await expect(edu).toContainText('(opening principal on 1 Oct 2026)')
  await expect(bike).toContainText('Starting principal ₹51,156.00') // the principal outstanding TODAY, from D4b, not the 60,000 opening figure
  await expect(bike).toContainText('(principal outstanding today, from your figures on 1 Aug 2026 and 2 linked payments)')
  await expect(card).toContainText('Estimate'); await expect(edu).not.toContainText('Estimate')
  await expect(page.getByTestId('planner-principal-only')).toHaveText('The starting balance is the principal only. Unpaid interest is not included.')
  const out = page.getByTestId('planner-excluded-item')
  await expect(out).toHaveCount(2)
  await expect(out.filter({ hasText: 'Old phone EMI' })).toHaveText('Old phone EMI: Closed')
  await expect(out.filter({ hasText: 'Friend loan' })).toHaveText('Friend loan: No monthly payment entered')
  await app.noHorizontalScroll()
})

test('J17: with no extra money the three scenarios are shown with dates, interest and total paid; methods tie, and the card marks it an estimate', async ({ app, page }) => {
  await openPlanner(app, page)
  await expect(page.getByTestId('planner-summary')).toContainText('Monthly budget ₹11,000.00')
  await expect(page.getByTestId('planner-budget')).toHaveAttribute('placeholder', '11000')
  await expect(sc(page, 'baseline').getByTestId('scenario-baseline-result')).toHaveText('Debt-free in 64 months (Feb 2032)')
  await expect(sc(page, 'baseline')).toContainText('Total interest: ₹15,80,86.13'.replace('15,80,86.13', '1,58,086.13'))
  await expect(sc(page, 'baseline')).toContainText('Total paid: ₹5,39,242.13')
  await expect(sc(page, 'baseline')).toContainText('Card: cleared in May 2031 (month 55)')
  for (const key of ['avalanche', 'snowball']) {
    await expect(sc(page, key).getByTestId(`scenario-${key}-result`)).toHaveText('Debt-free in 46 months (Aug 2030)')
    await expect(sc(page, key)).toContainText('Total interest: ₹1,20,355.96')
    await expect(sc(page, key)).toContainText('Card: cleared in Jul 2029 (month 33)')
    await expect(sc(page, key).getByTestId(`scenario-${key}-saving`)).toContainText('Interest compared with required payments only: ₹37,730.17 less')
  }
  await expect(page.getByTestId('planner-comparison')).toHaveText('For these figures, both methods cost the same interest.')
  await expect(page.getByTestId('scenario-estimate')).toHaveCount(3) // a credit card is in the plan: every scenario says Estimate
  await expect(page.getByTestId('planner-estimate')).toContainText('Estimate: a credit card is included')
  await expect(planner(page)).toContainText('Snowball is a valid way to order payments.')
  await expect(planner(page)).toContainText('Month 1 is the month after today.')
  await app.noHorizontalScroll()
})

test('J17: a higher budget and a one-time payment change the avalanche and snowball scenarios, not the baseline; the interest comparison is in numbers', async ({ app, page }) => {
  await openPlanner(app, page)
  await plan(page, { budget: '13500', amount: '20000', month: '2' })
  await expect(page.getByText('Month 2 is Dec 2026.')).toBeVisible()
  await expect(page.getByTestId('planner-summary')).toContainText('Monthly budget ₹13,500.00')
  await expect(page.getByTestId('planner-summary')).toContainText('₹2,500.00 more than the required payments')
  await expect(page.getByTestId('planner-summary')).toContainText('one-time ₹20,000.00 in month 2 (Dec 2026)')
  await expect(sc(page, 'baseline').getByTestId('scenario-baseline-result')).toHaveText('Debt-free in 64 months (Feb 2032)') // unchanged
  await expect(sc(page, 'baseline')).toContainText('Total interest: ₹1,58,086.13')
  await expect(sc(page, 'avalanche').getByTestId('scenario-avalanche-result')).toHaveText('Debt-free in 32 months (Jun 2029)')
  await expect(sc(page, 'avalanche')).toContainText('Total interest: ₹61,996.27')
  await expect(sc(page, 'avalanche')).toContainText('Card: cleared in Dec 2027 (month 14)')
  await expect(sc(page, 'avalanche').getByTestId('scenario-avalanche-saving')).toContainText('₹96,089.86 less')
  await expect(sc(page, 'avalanche').getByTestId('scenario-avalanche-saving')).toContainText('32 months sooner')
  await expect(sc(page, 'snowball').getByTestId('scenario-snowball-result')).toHaveText('Debt-free in 33 months (Jul 2029)')
  await expect(sc(page, 'snowball')).toContainText('Total interest: ₹72,038.76')
  await expect(sc(page, 'snowball')).toContainText('Bike loan: cleared in Apr 2027 (month 6)')
  await expect(sc(page, 'snowball').getByTestId('scenario-snowball-saving')).toContainText('₹86,047.37 less')
  await expect(page.getByTestId('planner-comparison')).toHaveText('For these figures, avalanche costs ₹10,042.49 less interest than snowball.')
  await expect(planner(page)).toContainText('The one-time payment and any extra budget apply to the avalanche and snowball scenarios only.')
  await app.noHorizontalScroll()
  // clearing the inputs goes back to the plain plan
  await plan(page)
  await expect(page.getByTestId('planner-comparison')).toHaveText('For these figures, both methods cost the same interest.')
})

test('J17: a budget below the required payments is refused with the shortfall; typing mistakes get a plain sentence; nothing is calculated meanwhile', async ({ app, page }) => {
  await openPlanner(app, page)
  await plan(page, { budget: '5000' })
  await expect(page.getByTestId('planner-message')).toHaveText('Your budget is ₹6,000.00 short of the required payments.')
  await expect(page.getByTestId('planner-results')).toHaveCount(0)
  for (const [input, text] of [
    [{ budget: 'abc' }, 'Enter the budget as a number with at most 2 decimals, above zero.'],
    [{ budget: '0' }, 'Enter the budget as a number with at most 2 decimals, above zero.'],
    [{ budget: '12000', amount: '5000' }, 'Enter both the amount and the month for the one-time payment, or leave both empty.'],
    [{ budget: '12000', month: '3' }, 'Enter both the amount and the month for the one-time payment, or leave both empty.'],
    [{ budget: '12000', amount: 'x', month: '3' }, 'Enter the one-time amount as a number with at most 2 decimals, above zero.'],
    [{ budget: '12000', amount: '5000', month: '601' }, 'Enter the month as a whole number from 1 to 600.'],
  ]) {
    await plan(page, input)
    await expect(page.getByTestId('planner-message')).toHaveText(text)
    await expect(page.getByTestId('planner-results')).toHaveCount(0)
  }
  await plan(page, { budget: '12000' })
  await expect(page.getByTestId('planner-message')).toHaveCount(0)
  await expect(page.getByTestId('planner-results')).toBeVisible()
  const body = await page.locator('body').innerText()
  expect(body).not.toMatch(/NaN|Infinity|undefined/)
})

test('J17: a monthly payment that does not cover one month of interest is refused, naming the debt', async ({ app, page }) => {
  await app.open('/debts', SEED)
  await page.evaluate(() => window.__e2e.mutate('debts', 'd1', { monthly_payment: 1000 }))
  await app.go('/'); await app.go('/debts')
  await tab(page, 'Planner').click()
  await expect(page.getByTestId('planner-message')).toContainText("The monthly payment for Education loan (₹1,000.00) does not cover one month's interest (₹1,979.17), so this debt would never pay off.")
  await expect(page.getByTestId('planner-results')).toHaveCount(0)
})

test('J17: a plan that cannot finish within 50 years says so and shows no date', async ({ app, page }) => {
  await app.open('/debts', 'debtlinked')
  await page.evaluate(() => { window.__e2e.mutate('debts', 'd1', { monthly_payment: 1980 }); window.__e2e.mutate('debts', 'd3', { status: 'closed' }) })
  await app.go('/'); await app.go('/debts')
  await tab(page, 'Planner').click()
  await expect(sc(page, 'baseline').getByTestId('scenario-baseline-result')).toHaveText('Does not pay off within 50 years')
  await expect(sc(page, 'baseline')).toContainText('Education loan: not cleared within 50 years')
  await expect(sc(page, 'baseline')).not.toContainText(/\b(19|20)\d\d\)/)
  await expect(page.getByTestId('planner-comparison')).toHaveText('With one debt, both methods give the same result.')
  expect(await page.locator('body').innerText()).not.toMatch(/NaN|Infinity|undefined/)
})

test('J17: a debt cleared by its linked payments is left out with the reason; with nothing left to plan the page says so', async ({ app, page }) => {
  await app.open('/debts', 'debtlinked')
  await page.evaluate(() => window.__e2e.mutate('transactions', 'p1', { amount: 70000 })) // the Sep payment now covers the whole debt
  await app.go('/'); await app.go('/debts')
  await expect(page.getByTestId('debt-card').filter({ hasText: 'Bike loan' })).toContainText('Cleared')
  await tab(page, 'Planner').click()
  await expect(page.getByTestId('planner-excluded-item').filter({ hasText: 'Bike loan' })).toHaveText('Bike loan: Cleared')
  await expect(page.getByTestId('planner-debt')).toHaveCount(1)
  await page.evaluate(() => window.__e2e.mutate('debts', 'd1', { monthly_payment: null }))
  await app.go('/'); await app.go('/debts')
  await tab(page, 'Planner').click()
  await expect(page.getByTestId('planner-none')).toHaveText('None of your debts can be planned yet. See the reasons below.')
  await expect(page.getByTestId('planner-excluded-item').filter({ hasText: 'Education loan' })).toHaveText('Education loan: No monthly payment entered')
  await expect(page.getByTestId('planner-budget')).toHaveCount(0)
})

test('J17: payments in the same month as the figures: the opening principal is used and the page says which balance it used', async ({ app, page }) => {
  await app.open('/debts', 'debtlinked')
  await page.evaluate(() => window.__e2e.mutate('debts', 'd3', { as_of_date: '2026-10-01' })) // the figures are from this month: nothing is applied yet
  await app.go('/'); await app.go('/debts')
  await tab(page, 'Planner').click()
  const bike = page.getByTestId('planner-debt').filter({ hasText: 'Bike loan' })
  await expect(bike).toContainText('Starting principal ₹60,000.00')
  await expect(bike).toContainText('(opening principal on 1 Oct 2026)')
})

test('J17: no debts: the planner says to add one; a failed load of linked payments means no plan is shown, only the reason', async ({ app, page, errors }) => {
  await app.open('/debts', 'base')
  await tab(page, 'Planner').click()
  await expect(page.getByTestId('planner-empty')).toHaveText('Add a debt to see repayment scenarios.')
  await page.goto('about:blank')
  await app.open('/debts', 'debtlinked')
  await page.evaluate(() => { window.__mock.failRead = 'debt_payments' })
  await app.go('/'); await app.go('/debts')
  await tab(page, 'Planner').click()
  await expect(page.getByTestId('planner-unavailable')).toContainText("Linked payments couldn't be loaded, so the planner can't use today's balances. Use Retry payments above.")
  await expect(page.getByTestId('planner-results')).toHaveCount(0)
  await expect(page.getByTestId('planner-budget')).toHaveCount(0)
  errors.length = 0
  await page.evaluate(() => { window.__mock.failRead = null })
  await page.getByRole('button', { name: 'Retry payments' }).click()
  await expect(page.getByTestId('planner-results')).toBeVisible()
})

test('J17: the planner writes nothing at all, and the inputs are gone after a reload', async ({ app, page }) => {
  await openPlanner(app, page)
  const store = () => page.evaluate(() => JSON.stringify([Object.entries(window.localStorage).sort(), Object.entries(window.sessionStorage).sort()]))
  const storeBefore = await store() // whatever the app itself keeps (sign-in stand-in) before the planner is used
  const start = await app.counts()
  const tx = await app.rows('transactions'), accounts = await app.rows('accounts'), links = await app.rows('debt_payments')
  await plan(page, { budget: '13500', amount: '20000', month: '2' })
  await expect(page.getByTestId('planner-results')).toBeVisible()
  await plan(page, { budget: '5000' })
  await expect(page.getByTestId('planner-message')).toBeVisible()
  await plan(page, { budget: '12000' })
  await tab(page, 'Active').click(); await tab(page, 'Planner').click()
  await tab(page, 'Closed').click(); await tab(page, 'Planner').click()
  expect(await app.writes()).toEqual([])
  expect(app.delta(start, await app.counts())).toEqual({})
  expect(await app.rows('transactions')).toEqual(tx)
  expect(await app.rows('accounts')).toEqual(accounts)
  expect(await app.rows('debt_payments')).toEqual(links)
  expect(await store()).toBe(storeBefore) // the planner stored nothing in the browser
  // the typed numbers are not kept: back to the plain plan after a reload
  await page.reload()
  await page.waitForFunction(() => !document.body.innerText.includes('Loading'))
  await tab(page, 'Planner').click()
  await expect(page.getByTestId('planner-budget')).toHaveValue('')
  await expect(page.getByTestId('planner-lump-amount')).toHaveValue('')
  await expect(page.getByTestId('planner-lump-month')).toHaveValue('')
})

test('J17: the planner tab hides the add and export buttons; the other tabs are unchanged', async ({ app, page }) => {
  await app.open('/debts', SEED)
  await expect(page.getByRole('button', { name: 'Add debt' })).toBeVisible()
  await tab(page, 'Planner').click()
  await expect(page.getByRole('button', { name: 'Add debt' })).toHaveCount(0)
  await expect(page.getByRole('button', { name: 'Export CSV' })).toHaveCount(0)
  await expect(page.getByTestId('debt-card')).toHaveCount(0)
  await tab(page, 'Active').click()
  await expect(page.getByRole('button', { name: 'Add debt' })).toBeVisible()
  await expect(page.getByTestId('debt-card')).toHaveCount(4) // Education loan, Bike loan, Card, Friend loan
  await tab(page, 'Closed').click()
  await expect(page.getByTestId('debt-card')).toHaveCount(1)
})

test('J17: the words on the planner page give no advice and carry the disclosures', async ({ app, page }) => {
  await openPlanner(app, page)
  await plan(page, { budget: '13500', amount: '20000', month: '2' })
  await expect(page.getByTestId('planner-results')).toBeVisible()
  await page.getByTestId('planner-notes').evaluate((el) => { el.open = true }) // D10: the secondary notes are collapsed; the wording check covers them too
  const text = await planner(page).innerText()
  for (const re of BANNED) expect(text, `advice wording ${re}`).not.toMatch(re)
  expect(text).toContain('Not a lender statement. Not financial advice.')
  expect(text).toContain('Unpaid interest is not included.')
  expect(text).toContain('Dates are by month.')
  expect(text).toContain('not a mistake'.replace('not a mistake', 'valid way to order payments'))
  await app.noHorizontalScroll()
})

test('J17: the planner works by keyboard: tab order reaches the three fields and a screen reader gets labels', async ({ app, page }) => {
  await openPlanner(app, page)
  await expect(page.getByLabel('Monthly budget for all debts (₹)')).toBeVisible()
  await expect(page.getByLabel('One-time extra payment (optional): Amount (₹)')).toBeVisible()
  await expect(page.getByLabel('In month number')).toBeVisible()
  await page.getByTestId('planner-budget').focus()
  await page.keyboard.press('Tab'); await expect(page.getByTestId('planner-lump-amount')).toBeFocused()
  await page.keyboard.press('Tab'); await expect(page.getByTestId('planner-lump-month')).toBeFocused()
  await page.keyboard.type('4')
  await expect(page.getByText('Month 4 is Feb 2027.')).toBeVisible()
  await expect(planner(page)).toHaveAttribute('aria-label', 'Repayment planner')
})

// ---- D5 correction: the snowball order explanation and the calculated warning (exact figures from an independent simulation) ----
const DEBT_FIELDS = { kind: 'term_loan', lender: null, as_of_date: '2026-10-01', as_of_accrued_interest: 0, remaining_months: null, due_day: null, status: 'active' }
async function useDebts(app, page, list) {
  await app.open('/debts', 'debt')
  await page.evaluate(([fields, rows]) => {
    window.__e2e.remove('debts', 'd1'); window.__e2e.remove('debts', 'd2')
    rows.forEach((r, i) => window.__e2e.add('debts', { ...fields, id: `x${i}`, name: r[0], as_of_outstanding: r[1], annual_rate_pct: r[2], monthly_payment: r[3] }))
  }, [DEBT_FIELDS, list])
  await app.go('/'); await app.go('/debts')
  await tab(page, 'Planner').click()
  await expect(planner(page)).toBeVisible()
}
const warn = (page) => page.getByTestId('snowball-warning')

test('J17: the snowball explanation is always shown, in plain words, whatever is typed', async ({ app, page }) => {
  await openPlanner(app, page)
  const note = page.getByTestId('planner-snowball-order')
  await expect(note).toHaveText('Snowball puts extra money on the smallest remaining balance, whatever its interest rate. Adding money can change which debt is paid first, so total interest can go up as well as down.')
  await plan(page, { budget: '13500', amount: '20000', month: '2' })
  await expect(note).toBeVisible()
  await app.noHorizontalScroll()
})

test('J17: pinned small case: the one-time payment raises snowball interest by ₹24.67 and the warning says so, only on the snowball card', async ({ app, page }) => {
  await useDebts(app, page, [['Debt E0', 211397.34, 0.25, 4743.96], ['Debt A1', 383322.62, 28.57, 17906.83]])
  await plan(page, { budget: '24705.47' })
  await expect(warn(page)).toHaveCount(0)                         // nothing added yet: no comparison, no warning
  await plan(page, { budget: '24705.47', amount: '5183', month: '9' })
  await expect(warn(page)).toHaveCount(1)
  await expect(warn(page)).toHaveText('With the one-time payment, the snowball scenario costs ₹24.67 more interest than the same snowball plan without it (same monthly budget).')
  await expect(sc(page, 'snowball').getByTestId('snowball-warning')).toHaveCount(1)
  await expect(sc(page, 'avalanche').getByTestId('snowball-warning')).toHaveCount(0)
  await expect(sc(page, 'baseline').getByTestId('snowball-warning')).toHaveCount(0)
  await expect(sc(page, 'snowball')).toContainText('Total interest: ₹1,59,757.62') // the same figures as the independent simulation
  await expect(sc(page, 'avalanche')).toContainText('Total interest: ₹1,33,352.31')
  await expect(planner(page)).toContainText('Not a lender statement. Not financial advice.')
  await app.noHorizontalScroll()
  expect(await app.writes()).toEqual([])
  // take the one-time payment away: the warning goes with it
  await plan(page, { budget: '24705.47' })
  await expect(warn(page)).toHaveCount(0)
  // extra monthly budget only (22,650.79 required): lowers snowball interest, so no warning
  await plan(page, { budget: '26000' })
  await expect(warn(page)).toHaveCount(0)
})

test('J17: larger case: a one-time payment raises snowball interest by ₹48,332.36 and the warning shows that amount', async ({ app, page }) => {
  await useDebts(app, page, [['DK0', 394756.98, 29.67, 11123.41], ['DW1', 284911.67, 1.04, 4789.97], ['DR2', 471407.23, 0.3, 6495.15], ['DJ3', 342916.59, 9.43, 3678.68]])
  await plan(page, { budget: '32918.99', amount: '10589.01', month: '16' })
  await expect(warn(page)).toHaveCount(1)
  await expect(warn(page)).toHaveText('With the one-time payment, the snowball scenario costs ₹48,332.36 more interest than the same snowball plan without it (same monthly budget).')
  await expect(sc(page, 'snowball')).toContainText('Total interest: ₹6,16,011.58')
  await app.noHorizontalScroll()
})

test('J17: larger case: an extra monthly budget raises snowball interest by ₹35,373.03 over required payments only; the warning says so', async ({ app, page }) => {
  await useDebts(app, page, [['DH0', 146182.35, 33.4, 7239.61], ['DC1', 367420.2, 30.96, 11664.32], ['DE2', 92757.11, 0, 3742.51], ['DU3', 344884.98, 10.41, 5054.08]])
  await plan(page, { budget: '28401.74' })
  await expect(warn(page)).toHaveCount(1)
  await expect(warn(page)).toHaveText('With the extra monthly budget, the snowball scenario costs ₹35,373.03 more interest than the same snowball plan at the required payments only (same one-time payment, if any).')
  await expect(sc(page, 'snowball')).toContainText('Total interest: ₹5,27,698.30')
  await plan(page, { budget: '27700.52' }) // required payments only: nothing added, no warning
  await expect(warn(page)).toHaveCount(0)
})

test('J17: no warning when added money lowers snowball interest', async ({ app, page }) => {
  await openPlanner(app, page)
  await plan(page, { budget: '13500', amount: '20000', month: '2' })
  await expect(page.getByTestId('planner-results')).toBeVisible()
  await expect(warn(page)).toHaveCount(0)
  await expect(page.getByTestId('planner-snowball-order')).toBeVisible()
})
