// J22 (D10) - the redesigned Debt Module screens. This stage changes presentation only. These tests pin what the redesign
// must never lose: the important figure is shown first, secondary detail is collapsed but still in the page, every
// disclosure that changes how a figure is read stays visible, invalid saved data stays visible and is never turned into
// money, switching a Planner scenario only changes what is shown, and nothing is written.
// Seed 'debtlinked+debtplan+debtind' is described in j18_debt_indicators.spec.js (Education d1, Bike d3 owes 51,156 today,
// Card d4 is a credit card, Friend loan d5, Old phone EMI is closed).
import { test, expect } from '../support/fixtures.js'

const SEED = 'debtlinked+debtplan+debtind'
const id = (page, k) => page.getByTestId(k)
const tab = (page, name) => page.getByRole('button', { name, exact: true })
const card = (page, name) => page.getByTestId('debt-card').filter({ has: page.getByRole('heading', { name, exact: true }) })
async function revisit(app, page, to = '/debts') {
  await app.go('/transactions')
  await expect(page.getByPlaceholder('Search description...').first()).toBeVisible()
  await app.go(to)
}
const mutate = (page, rowId, patch) => page.evaluate(([i, p]) => window.__e2e.mutate('debts', i, p), [rowId, patch])
const DEBT_FIELDS = { kind: 'term_loan', lender: null, as_of_date: '2026-10-01', as_of_accrued_interest: 0, remaining_months: null, due_day: null, status: 'active' }

test('J22: an active card shows the owed-today figure first; the breakdown and projection are collapsed until opened', async ({ app, page }) => {
  await app.open('/debts', SEED)
  const bike = card(page, 'Bike loan')
  await expect(bike.getByTestId('debt-figures')).toContainText('Owed today (calculated): ₹51,156.00')
  await expect(bike.getByText('₹51,156.00', { exact: true }).first()).toBeVisible()
  await expect(bike.getByText('As of 15 Oct 2026. Not a lender statement.', { exact: true })).toBeVisible() // the short disclosure is never collapsed
  await expect(bike.getByText('Interest rate: 12% a year')).toBeVisible()
  await expect(bike.getByText('Monthly payment: ₹3,000.00')).toBeVisible()
  const details = bike.getByTestId('debt-details')
  await expect(details).not.toHaveAttribute('open', '')
  await expect(bike.getByText('Principal outstanding:')).toBeHidden()
  await expect(bike.getByTestId('debt-projection')).toBeHidden()
  await expect(bike.getByTestId('debt-projection')).toContainText('Unpaid interest is not included') // collapsed, not removed
  await details.getByText('Details', { exact: true }).click()
  await expect(bike.getByText('Principal outstanding:')).toBeVisible()
  await expect(bike.getByText('Interest paid:')).toBeVisible()
  await expect(bike.getByTestId('debt-projection')).toBeVisible()
  await expect(bike.getByRole('button', { name: 'Payments for Bike loan' })).toBeVisible()
  await expect(bike.getByRole('button', { name: 'Edit debt' })).toBeVisible()
  await expect(bike.getByRole('button', { name: 'Close debt' })).toBeVisible()
  expect(await app.writes()).toEqual([])
  await app.noHorizontalScroll()
})

test('J22: a credit card keeps its Estimate badge and the opening-figure estimate note visible without opening anything', async ({ app, page }) => {
  await app.open('/debts', SEED)
  const visa = page.getByTestId('debt-card').filter({ hasText: 'Estimate' }).first()
  await expect(visa.getByText('Estimate', { exact: true })).toBeVisible()
  await expect(visa).toContainText('Estimate: a credit card changes with every statement, so these are the figures you entered')
  await expect(visa.getByTestId('debt-no-payments')).toBeVisible()
  await app.noHorizontalScroll()
})

test('J22: invalid saved figures and invalid saved fields stay visible on the redesigned card, with no money and no details section', async ({ app, page }) => {
  await app.open('/debts', SEED)
  await mutate(page, 'd5', { as_of_outstanding: 'abc' })
  await mutate(page, 'd1', { annual_rate_pct: 'abc', monthly_payment: 0 })
  await revisit(app, page)
  const bad = card(page, 'Friend loan')
  await expect(bad.getByTestId('debt-invalid')).toBeVisible()
  await expect(bad.getByTestId('debt-details')).toHaveCount(0)
  expect(await bad.innerText()).not.toMatch(/NaN|Infinity|undefined|₹/)
  const edu = card(page, 'Education loan')
  await expect(edu.getByTestId('debt-rate-invalid')).toHaveText('Interest rate: not valid. Edit this debt to correct it.')
  await expect(edu.getByTestId('debt-payment-invalid')).toHaveText('Monthly payment: not valid. Edit this debt to correct it.')
  await expect(edu.getByTestId('debt-projection')).toHaveCount(0) // nothing is calculated from a bad rate or payment
  expect(await page.locator('main').innerText()).not.toMatch(/NaN|Infinity|undefined|Invalid Date/)
  expect(await app.writes()).toEqual([])
  await app.noHorizontalScroll()
})

test('J22: a closed debt reads as finished: Closed and Cleared badges, no projection, Reopen available, view-only Payments', async ({ app, page }) => {
  await app.open('/debts', SEED)
  await tab(page, 'Closed').click()
  const c = card(page, 'Old phone EMI')
  await expect(c.getByText('Closed', { exact: true })).toBeVisible()
  await expect(c.getByText('Cleared', { exact: true })).toBeVisible()
  await expect(c.getByTestId('debt-projection')).toHaveCount(0)
  await expect(c.getByRole('button', { name: 'Reopen debt' })).toBeVisible()
  await expect(c.getByRole('button', { name: 'Close debt' })).toHaveCount(0)
  await expect(c.getByRole('button', { name: 'Payments for Old phone EMI' })).toBeVisible()
  expect(await app.writes()).toEqual([])
  await app.noHorizontalScroll()
})

test('J22: indicators keep the total, its basis note and the mixed-basis warning visible; the working is collapsed but present', async ({ app, page }) => {
  await app.open('/debts', SEED)
  await expect(id(page, 'ind-total-amount')).toHaveText('₹3,91,156.00')
  await expect(id(page, 'ind-total-note')).toBeVisible()
  await expect(id(page, 'ind-total-mixed')).toBeVisible()
  await expect(id(page, 'ind-total-estimate')).toBeVisible()
  await expect(id(page, 'indicators-basis')).toBeVisible()
  await expect(id(page, 'ind-total-details')).not.toHaveAttribute('open', '')
  await expect(id(page, 'ind-total-components')).toBeHidden()
  await expect(id(page, 'ind-total-components')).toContainText('Every amount is principal plus unpaid interest')
  await id(page, 'ind-total-details').getByText('How this total is worked out').click()
  await expect(id(page, 'ind-total-components')).toBeVisible()
  await expect(id(page, 'ind-items')).toBeVisible()
  await expect(id(page, 'ind-definitions')).not.toHaveAttribute('open', '')
  await expect(id(page, 'ind-definitions')).toContainText('Monthly required payments divided by the average monthly income')
  expect(await app.writes()).toEqual([])
  await app.noHorizontalScroll()
})

test('J22: Planner overview cards, one debt row each, a scenario switcher that only changes what is shown, and nothing is written', async ({ app, page }) => {
  await app.open('/debts', SEED)
  await tab(page, 'Planner').click()
  await expect(id(page, 'planner')).toBeVisible()
  await expect(id(page, 'planner-stat-budget')).toBeVisible()
  await expect(id(page, 'planner-stat-required')).toContainText('₹11,000.00')
  await expect(id(page, 'planner-principal-only')).toBeVisible() // principal-only disclosure is never collapsed
  await expect(id(page, 'planner-basis')).toContainText('Not a lender statement. Not financial advice.')
  await expect(id(page, 'planner-debt')).toHaveCount(3)
  await expect(id(page, 'planner-notes')).not.toHaveAttribute('open', '')
  await expect(id(page, 'planner-snowball-order')).toBeVisible() // the snowball explanation is never collapsed
  await expect(id(page, 'planner-notes')).toContainText('When a debt is cleared, its payment moves to the next debt.') // collapsed, not removed
  await expect(id(page, 'planner-notes').getByText('When a debt is cleared')).toBeHidden()
  // default is the required-payments scenario; the other two are in the page but not shown
  const base = await id(page, 'scenario-baseline-result').innerText()
  await expect(id(page, 'scenario-baseline-result')).toBeVisible()
  await expect(id(page, 'scenario-avalanche-result')).toBeHidden()
  await expect(id(page, 'planner-stat-months')).toContainText(base.replace('Debt-free in ', '').split(' (')[0])
  await id(page, 'planner-pick-avalanche').click()
  await expect(id(page, 'scenario-avalanche-result')).toBeVisible()
  await expect(id(page, 'scenario-baseline-result')).toBeHidden()
  await expect(id(page, 'planner-pick-avalanche')).toHaveAttribute('aria-pressed', 'true')
  await id(page, 'planner-pick-snowball').click()
  await expect(id(page, 'scenario-snowball-result')).toBeVisible()
  // switching changed no figures and wrote nothing
  expect(await id(page, 'scenario-baseline-result').innerText()).toBe(base)
  expect(await app.writes()).toEqual([])
  expect(await id(page, 'planner').innerText()).not.toMatch(/NaN|Infinity|undefined/)
  await app.noHorizontalScroll()
})

test('J22: the snowball warning stays visible when another scenario is selected', async ({ app, page }) => {
  await app.open('/debts', 'debt')
  await page.evaluate(([fields, rows]) => {
    window.__e2e.remove('debts', 'd1'); window.__e2e.remove('debts', 'd2')
    rows.forEach((r, i) => window.__e2e.add('debts', { ...fields, id: `x${i}`, name: r[0], as_of_outstanding: r[1], annual_rate_pct: r[2], monthly_payment: r[3] }))
  }, [DEBT_FIELDS, [['Debt E0', 211397.34, 0.25, 4743.96], ['Debt A1', 383322.62, 28.57, 17906.83]]])
  await app.go('/'); await app.go('/debts')
  await tab(page, 'Planner').click()
  await page.getByTestId('planner-budget').fill('24705.47')
  await page.getByTestId('planner-lump-amount').fill('5183')
  await page.getByTestId('planner-lump-month').fill('9')
  await expect(id(page, 'planner-pick-baseline')).toHaveAttribute('aria-pressed', 'true')
  await expect(id(page, 'snowball-warning')).toBeVisible() // while Required only is selected
  await expect(id(page, 'snowball-warning')).toHaveText('With the one-time payment, the snowball scenario costs ₹24.67 more interest than the same snowball plan without it (same monthly budget).')
  await id(page, 'planner-pick-avalanche').click()
  await expect(id(page, 'snowball-warning')).toBeVisible()
  expect(await app.writes()).toEqual([])
})

test('J22: Planner "Not in the plan" keeps every reason, collapsed behind a count', async ({ app, page }) => {
  await app.open('/debts', SEED)
  await tab(page, 'Planner').click()
  const ex = id(page, 'planner-excluded-details')
  await expect(ex).toContainText('Not in the plan (')
  await expect(ex).not.toHaveAttribute('open', '')
  await expect(id(page, 'planner-excluded-item').first()).toBeHidden()
  await ex.getByText('Not in the plan', { exact: false }).click()
  await expect(id(page, 'planner-excluded-item').first()).toBeVisible()
  await expect(id(page, 'planner-excluded')).toContainText('No monthly payment entered')
})
