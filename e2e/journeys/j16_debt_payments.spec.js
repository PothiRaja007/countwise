// J16 (D4b) - linking existing expense transactions to debts. A debt payment is an ordinary expense the user links by hand.
// Linking and unlinking write ONLY the debt_payments table: never a transaction, an account or a goal, and no balance moves.
// The in-memory stand-in mirrors the rules of supabase/p17_debt_payments.sql (see e2e/support/mockdb.js).
// The fixed "today" is 15 Oct 2026. Seed kinds:
//   debtpay    Education loan (figures 1 Oct 2026), Bike loan (60,000 at 12% from 1 Aug 2026), a closed debt, and a spread of
//              transactions: two EMI/Loan expenses, groceries, taxi, a lump sum, plus an income, a transfer, an expense on the
//              as-of day, a future one and an older one (none of those five may ever be offered).
//   debtlinked debtpay + the two EMI expenses (5,000 on 5 Sep and 5,000 on 5 Oct) already linked to the Bike loan.
//   debtmany   debtpay + 230 more expenses (the picker shows the 200 newest).
//   debtbig    debtmany + 130 of them already linked (reads must be paged in 100s).
import { test, expect } from '../support/fixtures.js'
import { readFileSync } from 'node:fs'

const bike = (page) => page.getByTestId('debt-card').filter({ hasText: 'Bike loan' })
const edu = (page) => page.getByTestId('debt-card').filter({ hasText: 'Education loan' })
const payBtn = (card, name = 'Bike loan') => card.getByRole('button', { name: `Payments for ${name}` })
const dialog = (page) => page.getByRole('dialog')
const linkBtn = (page) => dialog(page).getByRole('button', { name: 'Link payments', exact: true })
const expandOthers = async (page) => { const b = dialog(page).getByRole('button', { name: /^Show other expenses/ }); if (await b.count()) await b.click() }
const linkWrites = async (app) => (await app.writes()).filter((w) => w.table === 'debt_payments')

async function openPicker(app, page, card, name = 'Bike loan') {
  await payBtn(card, name).click()
  await linkBtn(page).click()
  await expect(page.getByRole('heading', { name: /^Link payments:/ })).toBeVisible()
}

test('J16: a debt with linked payments shows the recalculated figures, the dates and the "not a lender statement" wording', async ({ app, page }) => {
  await app.open('/debts', 'debtlinked')
  const card = bike(page)
  await expect(card).toContainText('On 1 Aug 2026: principal ₹60,000.00') // the opening figures stay visible
  const f = card.getByTestId('debt-figures')
  // Worked by hand: Sep interest 600, paid 5,000 -> principal 55,600; Oct interest 556, paid 5,000 -> principal 51,156.
  await expect(f).toContainText('Owed today (calculated): ₹51,156.00')
  await expect(f).toContainText('Principal outstanding: ₹51,156.00'); await expect(f).toContainText('Unpaid interest: ₹0.00')
  await expect(f).toContainText('Principal repaid: ₹8,844.00'); await expect(f).toContainText('Interest paid: ₹1,156.00')
  await expect(f).toContainText('From your figures on 1 Aug 2026 and 2 linked payments, as of 15 Oct 2026. Not a lender statement.')
  await expect(f).not.toContainText('Overpaid')
  await expect(payBtn(card)).toContainText('Payments (2)')
  await expect(card.getByTestId('debt-projection')).toContainText('principal outstanding today is paid off in')
  await expect(card.getByTestId('debt-quiet')).toHaveCount(0) // paid on 5 Oct: nothing to say
  // The debt with nothing linked keeps the opening figures and says how to get today's figure; it invents no balance.
  await expect(edu(page)).toContainText('On 1 Oct 2026: principal ₹2,50,000.00')
  await expect(edu(page)).toContainText('No payments linked yet. Link your payments to see what you owe today.')
  await expect(edu(page).getByTestId('debt-figures')).toHaveCount(0)
  await expect(payBtn(edu(page), 'Education loan')).toContainText('Payments (0)')
  await app.noHorizontalScroll()
})

test('J16: the Payments dialog shows the disclosure and each linked payment with its date, amount, description and account', async ({ app, page }) => {
  await app.open('/debts', 'debtlinked')
  const start = await app.counts()
  await payBtn(bike(page)).click()
  await expect(page.getByTestId('payments-disclosure')).toHaveText('Amounts and dates come from your transactions. If you edit or delete a linked transaction, this debt changes.')
  const rows = page.getByTestId('payment-row')
  await expect(rows).toHaveCount(2)
  await expect(rows.nth(0)).toContainText('Bike loan EMI Oct'); await expect(rows.nth(0)).toContainText('5 Oct 2026 · SBI'); await expect(rows.nth(0)).toContainText('₹5,000.00')
  await expect(rows.nth(1)).toContainText('Bike loan EMI Sep'); await expect(rows.nth(1)).toContainText(/5 Sep(t)? 2026 · SBI/) // some locales write "Sept"
  await expect(dialog(page)).toContainText('2 of 2 linked payments are counted, ₹10,000.00 in total.')
  await app.noHorizontalScroll()
  await page.keyboard.press('Escape')
  await expect(dialog(page)).toHaveCount(0)
  expect(app.delta(start, await app.counts())).toEqual({})
  expect(await app.writeTables()).toEqual([])
})

test('J16: Unlink deletes ONLY the link: the transaction, the balance and every other table stay exactly as they were', async ({ app, page }) => {
  await app.open('/debts', 'debtlinked')
  const start = await app.counts(); const bal = await app.balance(); const txBefore = await app.rows('transactions'); const accBefore = await app.rows('accounts')
  await payBtn(bike(page)).click()
  await page.getByRole('button', { name: 'Unlink Bike loan EMI Oct' }).click()
  await expect(page.getByTestId('payment-row')).toHaveCount(1)
  expect(app.delta(start, await app.counts())).toEqual({ debt_payments: -1 })
  expect(await app.writeTables()).toEqual(['debt_payments:delete'])
  expect(await app.rows('transactions')).toEqual(txBefore); expect(await app.rows('accounts')).toEqual(accBefore)
  expect(await app.balance()).toBe(bal)
  await page.keyboard.press('Escape')
  const f = bike(page).getByTestId('debt-figures')
  // Only the September payment is left: principal 55,600, and October's 556 interest is unpaid.
  await expect(f).toContainText('Owed today (calculated): ₹56,156.00'); await expect(f).toContainText('Unpaid interest: ₹556.00')
  await expect(f).toContainText('and 1 linked payment, as of 15 Oct 2026')
  await expect(payBtn(bike(page))).toContainText('Payments (1)')
  await app.go('/'); expect(await app.balance()).toBe(bal)
})

test('J16: linking two payments writes ONE statement of two links; no transaction, account or goal is written and no balance moves', async ({ app, page }) => {
  await app.open('/debts', 'debtpay')
  const start = await app.counts(); const bal = await app.balance(); const txBefore = await app.rows('transactions'); const accBefore = await app.rows('accounts')
  const card = bike(page)
  await payBtn(card).click()
  await expect(dialog(page)).toContainText('No payments linked yet.')
  await linkBtn(page).click()
  await dialog(page).getByLabel('Bike loan EMI Sep').check()
  await dialog(page).getByLabel('Bike loan EMI Oct').check()
  await expect(dialog(page)).toContainText('2 selected, ₹10,000.00')
  await dialog(page).getByRole('button', { name: 'Link 2 payments' }).click()
  await expect(page.getByTestId('payment-row')).toHaveCount(2) // back in the Payments dialog
  expect(app.delta(start, await app.counts())).toEqual({ debt_payments: 2 })
  expect(await app.writeTables()).toEqual(['debt_payments:insert'])
  const w = (await linkWrites(app))[0]
  expect(w.x).toHaveLength(2)
  for (const r of w.x) expect(Object.keys(r).sort()).toEqual(['debt_id', 'transaction_id', 'user_id']) // no amount, no date
  expect(w.x.map((r) => r.transaction_id).sort()).toEqual(['p1', 'p2']); expect(w.x.every((r) => r.debt_id === 'd3' && r.user_id === 'u1')).toBe(true)
  expect(await app.rows('transactions')).toEqual(txBefore); expect(await app.rows('accounts')).toEqual(accBefore)
  expect(await app.balance()).toBe(bal)
  await page.keyboard.press('Escape')
  await expect(card.getByTestId('debt-figures')).toContainText('Owed today (calculated): ₹51,156.00')
  await app.go('/'); expect(await app.balance()).toBe(bal)
})

test('J16: the picker offers only unlinked expenses after the as-of date through today, EMI / Loan first, nothing hidden', async ({ app, page }) => {
  await app.open('/debts', 'debtpay')
  await openPicker(app, page, bike(page))
  const suggested = page.getByTestId('link-suggested').getByTestId('link-row')
  await expect(suggested).toHaveCount(2)
  await expect(suggested.nth(0)).toContainText('Bike loan EMI Oct'); await expect(suggested.nth(1)).toContainText('Bike loan EMI Sep') // newest first
  await expect(page.getByTestId('link-others')).toHaveCount(0) // other expenses are one click away, not hidden
  await dialog(page).getByRole('button', { name: 'Show other expenses (5)' }).click()
  const others = page.getByTestId('link-others')
  for (const d of ['Groceries', 'Taxi', 'Lump sum']) await expect(others).toContainText(d)
  await expect(others.getByTestId('link-row')).toHaveCount(5)
  // never offered: income, transfer, an expense on the as-of day (1 Aug), one dated after today, one before the figures
  for (const d of ['Refund', 'Move to HDFC', 'Same day as the figures', 'Future dated', 'Before the figures']) await expect(dialog(page)).not.toContainText(d)
  // each debt has its own window: the Education loan (figures 1 Oct) is offered only expenses after 1 Oct
  await dialog(page).getByRole('button', { name: 'Back' }).click()
  await page.keyboard.press('Escape')
  await openPicker(app, page, edu(page).first(), 'Education loan')
  await expandOthers(page)
  const eduRows = dialog(page).getByTestId('link-row')
  await expect(eduRows).toHaveCount(4) // EMI Oct (5 Oct), Groceries, Taxi, Lump sum; the 1 Oct expense (t2) is the as-of day
  await expect(dialog(page)).not.toContainText('Bike loan EMI Sep')
  await app.noHorizontalScroll()
})

test('J16: already-linked transactions are not offered again, not even for another debt', async ({ app, page }) => {
  await app.open('/debts', 'debtlinked')
  await openPicker(app, page, bike(page))
  await expect(page.getByTestId('link-suggested')).toHaveCount(0) // both EMI expenses are linked
  await expect(dialog(page)).not.toContainText('Bike loan EMI')
  await expect(dialog(page)).toContainText('Groceries')
  await dialog(page).getByRole('button', { name: 'Back' }).click(); await page.keyboard.press('Escape')
  await openPicker(app, page, edu(page).first(), 'Education loan')
  await expect(dialog(page)).not.toContainText('Bike loan EMI Oct') // linked to the Bike loan, so not offered for the Education loan
})

test('J16: a double click on Link payment writes ONE link', async ({ app, page }) => {
  await app.open('/debts', 'debtpay')
  const start = await app.counts()
  await openPicker(app, page, bike(page))
  await expandOthers(page)
  await dialog(page).getByLabel('Groceries').check()
  const btn = dialog(page).getByRole('button', { name: 'Link payment', exact: true })
  await btn.evaluate(async (el) => { el.click(); await new Promise((r) => setTimeout(r, 40)); el.click() })
  await page.waitForTimeout(800)
  expect(app.delta(start, await app.counts())).toEqual({ debt_payments: 1 })
  expect(await app.writeTables()).toEqual(['debt_payments:insert'])
})

test('J16: two clicks in the same instant write ONE link, and the same for Unlink', async ({ app, page }) => {
  await app.open('/debts', 'debtpay')
  const start = await app.counts()
  await openPicker(app, page, bike(page))
  await expandOthers(page)
  await dialog(page).getByLabel('Taxi').check()
  await dialog(page).getByRole('button', { name: 'Link payment', exact: true }).evaluate((el) => { el.click(); el.click() })
  await page.waitForTimeout(800)
  expect(app.delta(start, await app.counts())).toEqual({ debt_payments: 1 })
  expect(await app.writeTables()).toEqual(['debt_payments:insert']) // one attempt, not a second one the database had to refuse
  await page.getByRole('button', { name: 'Unlink Taxi' }).evaluate((el) => { el.click(); el.click() })
  await page.waitForTimeout(800)
  expect(app.delta(start, await app.counts())).toEqual({})
  expect(await app.writeTables()).toEqual(['debt_payments:insert', 'debt_payments:delete'])
})

test('J16: the picker shows the 200 newest eligible expenses, says that more may exist, and reads in pages of at most 100', async ({ app, page }) => {
  await app.open('/debts', 'debtmany')
  await openPicker(app, page, bike(page))
  await expandOthers(page)
  await expect(dialog(page).getByTestId('link-row')).toHaveCount(200)
  await expect(page.getByTestId('link-more')).toContainText('Showing the 200 newest eligible expenses. Older ones may exist and are not listed here.')
  const reads = await page.evaluate(() => window.__mock.reads.filter((r) => r.table === 'transactions' && r.range))
  expect(reads.length).toBeGreaterThanOrEqual(3)
  expect(reads.every((r) => r.range[1] - r.range[0] + 1 <= 100)).toBe(true)
  await app.noHorizontalScroll()
  // with few eligible expenses there is no such notice
  await app.open('/debts', 'debtpay')
  await openPicker(app, page, bike(page))
  await expect(page.getByTestId('link-more')).toHaveCount(0)
})

test('J16: 130 linked payments are read in chunks of at most 100 (nothing is cut off) and all of them are listed', async ({ app, page }) => {
  await app.open('/debts', 'debtbig')
  await expect(payBtn(bike(page))).toContainText('Payments (130)')
  await expect(bike(page).getByTestId('debt-figures')).toContainText('and 130 linked payments')
  const reads = await page.evaluate(() => window.__mock.reads.filter((r) => r.table === 'debt_payments' || (r.table === 'transactions' && r.inSizes.length)))
  // (the app may read twice in development mode; what matters is which page sizes were ever asked for)
  const uniq = (list) => [...new Set(list.map((x) => JSON.stringify(x)))].map((x) => JSON.parse(x))
  expect(uniq(reads.filter((r) => r.table === 'debt_payments').map((r) => r.range))).toEqual([[0, 99], [100, 199]])
  expect(uniq(reads.filter((r) => r.table === 'transactions').map((r) => r.inSizes[0]))).toEqual([100, 30])
  await payBtn(bike(page)).click()
  await expect(page.getByTestId('payment-row')).toHaveCount(130)
})

test('J16: a linked transaction edited into income is NOT counted ("Not counted: this is no longer an expense") and can be unlinked', async ({ app, page }) => {
  await app.open('/debts', 'debtlinked')
  await page.evaluate(() => window.__e2e.mutate('transactions', 'p2', { type: 'income' })) // what editing it on the Transactions page does
  await app.go('/'); await app.go('/debts')
  const card = bike(page)
  await expect(card.getByTestId('debt-figures')).toContainText('Owed today (calculated): ₹56,156.00') // only the September payment counts
  await expect(card.getByTestId('debt-figures')).toContainText('and 1 linked payment')
  await expect(payBtn(card)).toContainText('Payments (2)') // still linked
  await payBtn(card).click()
  const row = page.getByTestId('payment-row').filter({ hasText: 'Bike loan EMI Oct' })
  await expect(row.getByTestId('payment-note')).toHaveText('Not counted: this is no longer an expense')
  await expect(dialog(page)).toContainText('1 of 2 linked payments are counted')
  const txBefore = await app.rows('transactions')
  await row.getByRole('button', { name: 'Unlink Bike loan EMI Oct' }).click()
  await expect(page.getByTestId('payment-row')).toHaveCount(1)
  expect(await app.rows('transactions')).toEqual(txBefore) // the transaction itself is untouched
  expect(await app.writeTables()).toEqual(['debt_payments:delete'])
})

test('J16: editing a linked amount or deleting a linked transaction changes the debt on the next load', async ({ app, page }) => {
  await app.open('/debts', 'debtlinked')
  await page.evaluate(() => window.__e2e.mutate('transactions', 'p1', { amount: 4000 }))
  await app.go('/'); await app.go('/debts')
  // Sep: interest 600, paid 4,000 -> principal 56,600. Oct: interest 566, paid 5,000 -> principal 52,166.
  await expect(bike(page).getByTestId('debt-figures')).toContainText('Owed today (calculated): ₹52,166.00')
  await page.evaluate(() => window.__e2e.remove('transactions', 'p1')) // the database removes the link with it
  await app.go('/'); await app.go('/debts')
  await expect(payBtn(bike(page))).toContainText('Payments (1)')
  // Oct only: Sep interest 600 + Oct interest 600 -> principal 60,000; paid 5,000 in Oct -> interest 1,200 first, then 3,800 principal.
  await expect(bike(page).getByTestId('debt-figures')).toContainText('Owed today (calculated): ₹56,200.00')
  expect(await app.writeTables()).toEqual([])
})

test('J16: a linked payment in the same month as the figures is said to be waiting, not silently ignored', async ({ app, page }) => {
  await app.open('/debts', 'debtpay')
  await payBtn(edu(page), 'Education loan').click()
  await linkBtn(page).click()
  await dialog(page).getByLabel('Bike loan EMI Oct').check() // 5 Oct, after the figures of 1 Oct
  await dialog(page).getByRole('button', { name: 'Link payment', exact: true }).click()
  await expect(page.getByTestId('payment-row')).toHaveCount(1)
  await page.keyboard.press('Escape')
  const card = edu(page)
  await expect(card.getByTestId('debt-same-month')).toContainText('1 linked payment will be applied from Nov 2026')
  await expect(card.getByTestId('debt-figures')).toHaveCount(0)
})

test('J16: payments that clear a debt show Cleared and an overpayment is shown as overpaid; a card stays an Estimate with no schedule', async ({ app, page }) => {
  await app.open('/debts', 'debtpay')
  await payBtn(bike(page)).click()
  await linkBtn(page).click()
  await expandOthers(page)
  await dialog(page).getByLabel('Lump sum').check() // 70,000 against about 60,600 owed
  await dialog(page).getByRole('button', { name: 'Link payment', exact: true }).click()
  await page.keyboard.press('Escape')
  const card = bike(page)
  await expect(card).toContainText('Cleared')
  await expect(card.getByTestId('debt-figures')).toContainText('Owed today (calculated): ₹0.00')
  await expect(card.getByTestId('debt-figures')).toContainText('Overpaid:')
  await expect(card.getByTestId('debt-projection')).toHaveCount(0) // no schedule for a zero balance
  // a credit card with a linked payment is an estimate, and never gets a payoff schedule
  await page.evaluate(() => window.__e2e.add('debts', { id: 'cc', name: 'Visa card', kind: 'credit_card', lender: null, as_of_date: '2026-08-01', as_of_outstanding: 8000, as_of_accrued_interest: 0, annual_rate_pct: 36, monthly_payment: 500, remaining_months: null, due_day: null, status: 'active' }))
  await app.go('/'); await app.go('/debts')
  const visa = page.getByTestId('debt-card').filter({ hasText: 'Visa card' })
  await payBtn(visa, 'Visa card').click(); await linkBtn(page).click(); await expandOthers(page)
  await dialog(page).getByLabel('Taxi').check()
  await dialog(page).getByRole('button', { name: 'Link payment', exact: true }).click()
  await page.keyboard.press('Escape')
  await expect(visa.getByTestId('debt-figures')).toContainText('Owed today (estimate)')
  await expect(visa.getByTestId('debt-figures')).toContainText('Estimate: a credit card changes with every statement')
  await expect(visa.getByTestId('debt-projection')).toHaveCount(0)
})

test('J16: "No payment linked in N months" appears after two quiet calendar months, is never worded as overdue, and not for a cleared debt', async ({ app, page }) => {
  await app.open('/debts', 'debtlinked')
  await page.evaluate(() => {
    window.__e2e.mutate('transactions', 'p1', { transaction_date: '2026-08-05' })
    window.__e2e.mutate('transactions', 'p2', { transaction_date: '2026-08-10' })
  })
  await app.go('/'); await app.go('/debts')
  const card = bike(page)
  await expect(card.getByTestId('debt-quiet')).toHaveText('No payment linked in 2 months') // last payment 10 Aug, today 15 Oct
  await expect(card).not.toContainText(/overdue/i)
  // with nothing linked it counts from the date of the figures (1 Aug 2026 -> 2 months), and a cleared debt says nothing
  await app.open('/debts', 'debtpay')
  await expect(bike(page).getByTestId('debt-quiet')).toHaveText('No payment linked in 2 months')
  await expect(edu(page).getByTestId('debt-quiet')).toHaveCount(0) // figures from 1 Oct: not quiet yet
  await page.getByRole('button', { name: 'Closed', exact: true }).click()
  await expect(page.getByTestId('debt-card').filter({ hasText: 'Old phone EMI' }).getByTestId('debt-quiet')).toHaveCount(0)
})

test('J16: a closed debt keeps its links and its payments are read-only until it is reopened', async ({ app, page }) => {
  await app.open('/debts', 'debtlinked')
  const start = await app.counts()
  await bike(page).getByRole('button', { name: 'Close debt' }).click()
  await page.getByRole('button', { name: 'Closed', exact: true }).click()
  const card = bike(page)
  await expect(card).toBeVisible()
  expect(app.delta(start, await app.counts())).toEqual({}) // closing deleted no link
  await payBtn(card).click()
  await expect(page.getByTestId('payment-row')).toHaveCount(2)
  await expect(dialog(page)).toContainText('This debt is closed, so its payments are read-only.')
  await expect(dialog(page).getByRole('button', { name: /^Unlink/ })).toHaveCount(0)
  await expect(linkBtn(page)).toHaveCount(0)
  await page.keyboard.press('Escape')
  // its links are still exported
  const [download] = await Promise.all([page.waitForEvent('download'), page.getByRole('button', { name: 'Export payments' }).click()])
  expect(readFileSync(await download.path(), 'utf8')).toContain('Bike loan,closed,2026-10-05,5000,Bike loan EMI Oct,SBI,expense,yes,,')
  await card.getByRole('button', { name: 'Reopen debt' }).click()
  await page.getByRole('button', { name: 'Active', exact: true }).click()
  await payBtn(bike(page)).click()
  await expect(dialog(page).getByRole('button', { name: /^Unlink/ })).toHaveCount(2)
  expect((await app.writeTables()).filter((t) => t.startsWith('debt_payments'))).toEqual([])
})

test('J16: if the picked payment was linked, changed or removed meanwhile, the user gets a plain sentence and keeps the rest of the selection', async ({ app, page, errors }) => {
  await app.open('/debts', 'debtpay')
  await openPicker(app, page, bike(page))
  await expandOthers(page)
  await dialog(page).getByLabel('Groceries').check(); await dialog(page).getByLabel('Taxi').check()
  await page.evaluate(() => window.__e2e.add('debt_payments', { id: 'x1', debt_id: 'd1', transaction_id: 'p3' })) // linked elsewhere meanwhile
  const start = await app.counts()
  await dialog(page).getByRole('button', { name: 'Link 2 payments' }).click()
  await expect(dialog(page).getByRole('alert')).toHaveText('This payment is already linked to a debt.')
  expect(app.delta(start, await app.counts())).toEqual({}) // all or nothing: Taxi was not saved either
  await expect(dialog(page).getByLabel('Groceries')).toHaveCount(0) // the list was refreshed
  await expect(dialog(page).getByLabel('Taxi')).toBeChecked() // the rest of the selection is kept
  expect(errors.length).toBeGreaterThan(0); errors.length = 0
  await page.evaluate(() => window.__e2e.mutate('transactions', 'p4', { type: 'income' })) // edited into income meanwhile
  await dialog(page).getByRole('button', { name: 'Link payment', exact: true }).click()
  await expect(dialog(page).getByRole('alert')).toHaveText('Only an expense can be a debt payment.')
  expect(app.delta(start, await app.counts())).toEqual({})
  errors.length = 0
  await dialog(page).getByRole('button', { name: 'Back' }).click()
  await page.keyboard.press('Escape')
  await openPicker(app, page, bike(page))
  await expandOthers(page)
  await dialog(page).getByLabel('Lump sum').check()
  await page.evaluate(() => window.__e2e.remove('transactions', 'p10')) // deleted meanwhile
  await dialog(page).getByRole('button', { name: 'Link payment', exact: true }).click()
  await expect(dialog(page).getByRole('alert')).toHaveText('That transaction or debt no longer exists.')
  errors.length = 0
})

test('J16: a failed load of the links shows a plain error with Retry and keeps the debts; failed saves keep the selection', async ({ app, page, errors }) => {
  await app.open('/debts', 'debtlinked')
  for (const table of ['debt_payments', 'transactions']) {
    await page.evaluate((t) => { window.__mock.failRead = t }, table)
    await app.go('/'); await app.go('/debts')
    await expect(page.getByTestId('payments-error')).toContainText("Couldn't load your linked payments")
    await expect(bike(page)).toContainText('On 1 Aug 2026: principal ₹60,000.00') // the debts still show their opening figures
    await expect(bike(page).getByTestId('debt-figures')).toHaveCount(0) // and no invented balance
    await expect(payBtn(bike(page))).toBeDisabled()
    await expect(page.getByRole('button', { name: 'Export payments' })).toBeDisabled()
    errors.length = 0
    await page.evaluate(() => { window.__mock.failRead = null })
    await page.getByRole('button', { name: 'Retry payments' }).click()
    await expect(bike(page).getByTestId('debt-figures')).toContainText('₹51,156.00')
    await expect(page.getByTestId('payments-error')).toHaveCount(0)
  }

  await page.evaluate(() => { window.__mock.failWrite = 'debt_payments' })
  const start = await app.counts()
  await payBtn(bike(page)).click()
  await page.getByRole('button', { name: 'Unlink Bike loan EMI Oct' }).click()
  await expect(dialog(page).getByRole('alert')).toHaveText("Couldn't unlink this payment. Please try again.")
  await expect(page.getByTestId('payment-row')).toHaveCount(2)
  await linkBtn(page).click()
  await dialog(page).getByLabel('Groceries').check()
  await dialog(page).getByRole('button', { name: 'Link payment', exact: true }).click()
  await expect(dialog(page).getByRole('alert')).toHaveText("Couldn't link these payments. Please try again.")
  await expect(dialog(page).getByLabel('Groceries')).toBeChecked() // the selection is kept
  expect(app.delta(start, await app.counts())).toEqual({})
  errors.length = 0
  await page.evaluate(() => { window.__mock.failWrite = null })
  await dialog(page).getByRole('button', { name: 'Link payment', exact: true }).click() // the same selection, saved on retry
  await expect(page.getByTestId('payment-row')).toHaveCount(3)
  expect(app.delta(start, await app.counts())).toEqual({ debt_payments: 1 })
})

test('J16: Export payments downloads one row per link with quoting and formula protection; it is off when nothing is linked', async ({ app, page }) => {
  await app.open('/debts', 'debtpay')
  await expect(page.getByRole('button', { name: 'Export payments' })).toBeDisabled()
  await app.open('/debts', 'debtlinked')
  await page.evaluate(() => {
    window.__e2e.mutate('transactions', 'p2', { description: '=HYPERLINK("http://example.com","x"), "EMI"' })
    window.__e2e.mutate('transactions', 'p1', { type: 'income' })
  })
  await app.go('/'); await app.go('/debts')
  const [download] = await Promise.all([page.waitForEvent('download'), page.getByRole('button', { name: 'Export payments' }).click()])
  expect(download.suggestedFilename()).toBe('countwise-debt-payments-2026-10-15.csv')
  const csv = readFileSync(await download.path(), 'utf8')
  const lines = csv.trim().split('\r\n')
  expect(lines[0]).toBe('debt_name,debt_status,transaction_date,amount,description,account,transaction_type,counted,not_counted_reason,linked_on')
  expect(lines).toHaveLength(3)
  expect(csv).toContain(`Bike loan,active,2026-10-05,5000,"'=HYPERLINK(""http://example.com"",""x""), ""EMI""",SBI,expense,yes,,`)
  expect(csv).toContain('Bike loan,active,2026-09-05,5000,Bike loan EMI Sep,SBI,income,no,Not counted: this is no longer an expense,')
  expect(csv).not.toMatch(/\bp1\b|\bp2\b|u1|lk1/) // no ids
  expect(await app.writeTables()).toEqual([])
})

test('J16: the Payments dialog and the picker fit the screen and close with Escape without writing', async ({ app, page }) => {
  await app.open('/debts', 'debtmany')
  await payBtn(bike(page)).click()
  await app.noHorizontalScroll()
  await linkBtn(page).click()
  await expect(page.getByRole('heading', { name: /^Link payments:/ })).toBeVisible()
  await expandOthers(page)
  await dialog(page).getByLabel('Taxi').check()
  await page.keyboard.press('Escape') // closes the picker, back to the Payments dialog
  await expect(page.getByRole('heading', { name: /^Payments:/ })).toBeVisible()
  await page.keyboard.press('Escape')
  await expect(dialog(page)).toHaveCount(0)
  expect(await app.writeTables()).toEqual([])
  expect((await app.counts()).debt_payments).toBe(0)
})
