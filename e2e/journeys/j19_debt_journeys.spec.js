// J19 (D7) - end-to-end journeys across the whole Debt Module, and one cross-screen consistency test. VERIFICATION ONLY:
// nothing here changes the app. Every journey states the writes it is allowed to make (the approved debt-module writes only)
// and proves that transactions, accounts, goals and goal contributions are left exactly as they were.
// The fixed "today" is 15 Oct 2026. Seed 'debtlinked+debtplan+debtind' is described in j18_debt_indicators.spec.js.
// Expected numbers come from refReplay() below: an independent BigInt (paise) calculation that does not import any app code.
import { test, expect } from '../support/fixtures.js'

const FULL = 'debtlinked+debtplan+debtind'
const id = (page, k) => page.getByTestId(k)
const tab = (page, name) => page.getByRole('button', { name, exact: true })
const ind = (page) => page.getByTestId('indicators')
const card = (page, name) => page.getByTestId('debt-card').filter({ has: page.getByRole('heading', { name, exact: true }) })
const dialog = (page) => page.getByRole('dialog')
const payBtn = (c, name) => c.getByRole('button', { name: `Payments for ${name}` })
const MONEY_TABLES = ['transactions', 'accounts', 'goals', 'goal_contributions']
// The only writes the Debt Module is approved to make (D3 and D4b). Anything else is a defect.
const APPROVED = ['debts:insert', 'debts:update', 'debt_payments:insert', 'debt_payments:delete']

// ---- independent reference ------------------------------------------------------------------------------------------
// Indian digit grouping of an amount in paise, e.g. 39115600n -> "₹3,91,156.00".
function inr(paise) {
  const neg = paise < 0n; const p = neg ? -paise : paise
  const rupees = (p / 100n).toString(); const frac = (p % 100n).toString().padStart(2, '0')
  let head = rupees.slice(0, -3); const tail = rupees.slice(-3)
  head = head.replace(/\B(?=(\d{2})+(?!\d))/g, ',')
  return `${neg ? '-' : ''}₹${head ? `${head},` : ''}${tail}.${frac}`
}
const P = (rupees) => BigInt(Math.round(rupees * 100))
const monthIdx = (iso) => Number(iso.slice(0, 4)) * 12 + Number(iso.slice(5, 7)) - 1
// Monthly interest = principal x rate / 12, rounded half up, on the PRINCIPAL only. A payment pays unpaid interest first,
// then principal; anything left over is an overpayment. A payment in the as-of month counts in the first month.
function refReplay({ asOf, principal, accrued = 0, ratePct, payments, today = '2026-10-15' }) {
  const buckets = monthIdx(today) - monthIdx(asOf)
  const paid = new Map()
  for (const p of payments) {
    if (p.date <= asOf || p.date > today) continue
    const k = Math.max(1, monthIdx(p.date) - monthIdx(asOf))
    if (k <= buckets) paid.set(k, (paid.get(k) || 0n) + P(p.amount))
  }
  let pr = P(principal), ac = P(accrued), iPaid = 0n, pRepaid = 0n, over = 0n
  const rate = BigInt(Math.round(ratePct * 100))
  for (let k = 1; k <= buckets; k++) {
    ac += (pr * rate * 2n + 240000n / 2n) / 240000n
    const pay = paid.get(k) || 0n
    const toI = pay < ac ? pay : ac; const toP = pay - toI < pr ? pay - toI : pr
    ac -= toI; pr -= toP; iPaid += toI; pRepaid += toP; over += pay - toI - toP
  }
  return { principal: pr, interest: ac, total: pr + ac, interestPaid: iPaid, principalRepaid: pRepaid, overpaid: over }
}
const BIKE = { asOf: '2026-08-01', principal: 60000, ratePct: 12 }
const bikePays = (a, b) => [{ date: '2026-09-05', amount: a }, { date: '2026-10-05', amount: b }]

// ---- helpers --------------------------------------------------------------------------------------------------------
async function snap(app) {
  const s = { balance: await app.balance('a1') }
  for (const t of MONEY_TABLES) s[t] = await app.rows(t)
  return s
}
// The run wrote exactly `expected` (in order), only approved debt-module writes, and left every money table untouched.
async function expectOnly(app, expected, before) {
  const got = await app.writeTables()
  expect(got).toEqual(expected)
  for (const w of got) expect(APPROVED, `unapproved write ${w}`).toContain(w)
  const after = await snap(app)
  expect(after).toEqual(before)
}
async function revisit(app, page, to = '/debts') {
  await app.go('/transactions')
  await expect(page.getByPlaceholder('Search description...').first()).toBeVisible()
  await app.go(to)
}
async function fillDebt(page, f) {
  const set = async (k, v) => { if (v !== undefined) await page.locator(`#${k}`).fill(v) }
  await set('debt-name', f.name)
  if (f.kind) await page.locator('#debt-kind').selectOption(f.kind)
  await set('debt-asof', f.asOf); await set('debt-principal', f.principal); await set('debt-rate', f.rate)
  await set('debt-payment', f.payment); await set('debt-months', f.months)
}
async function linkBy(page, c, name, labels) {
  await payBtn(c, name).click()
  const existing = await page.getByTestId('payment-row').count()
  await dialog(page).getByRole('button', { name: 'Link payments', exact: true }).click()
  await expect(page.getByRole('heading', { name: /^Link payments:/ })).toBeVisible()
  const more = dialog(page).getByRole('button', { name: /^Show other expenses/ }); if (await more.count()) await more.click()
  for (const l of labels) await dialog(page).getByLabel(l).check()
  await dialog(page).getByRole('button', { name: labels.length > 1 ? `Link ${labels.length} payments` : 'Link payment', exact: true }).click()
  await expect(page.getByTestId('payment-row')).toHaveCount(existing + labels.length)
  await dialog(page).getByRole('button', { name: /^Close/ }).first().click().catch(() => {})
}
const reference = () => ({
  bikeLinked: refReplay({ ...BIKE, payments: bikePays(5000, 5000) }),
})

// ===========================================================================================================
// Journey 1: a new user adds a loan and a credit card. Only opening figures exist, so the indicators say so.
// ===========================================================================================================
test('J19-1: a new user adds a loan and a credit card: two debt rows, nothing else; opening-only indicators, no interest or progress', async ({ app, page }) => {
  await app.open('/debts', 'base')
  const before = await snap(app); const start = await app.counts()
  await page.getByRole('button', { name: 'Add debt', exact: true }).click()
  await fillDebt(page, { name: 'Study loan', kind: 'term_loan', asOf: '2026-10-01', principal: '60000', rate: '11.5', payment: '3000', months: '24' })
  await page.getByRole('button', { name: 'Save debt', exact: true }).click()
  await expect(page.getByRole('heading', { name: 'Study loan' })).toBeVisible()
  await page.getByRole('button', { name: 'Add debt', exact: true }).click()
  await fillDebt(page, { name: 'Shop card', kind: 'credit_card', asOf: '2026-10-01', principal: '20000', rate: '36', payment: '1000' })
  await page.getByRole('button', { name: 'Save debt', exact: true }).click()
  await expect(page.getByRole('heading', { name: 'Shop card' })).toBeVisible()
  await expect(ind(page)).toBeVisible()
  expect(app.delta(start, await app.counts())).toEqual({ debts: 2 })
  await expectOnly(app, ['debts:insert', 'debts:insert'], before)
  // 60,000 + 20,000 = 80,000, shown as opening figures only
  await expect(id(page, 'ind-total-amount')).toHaveText(inr(P(80000)))
  await expect(id(page, 'ind-total')).toContainText('Total owed (opening figures)')
  await expect(id(page, 'ind-total-mixed')).toHaveCount(0)
  await expect(id(page, 'ind-total-estimate')).toHaveText('Includes credit-card figures, which are estimates.')
  await expect(id(page, 'ind-monthly-amount')).toHaveText(inr(P(4000)))
  await expect(id(page, 'ind-interest-text')).toHaveText('Needs at least one linked payment that counts.')
  await expect(id(page, 'ind-progress-text')).toHaveText('Needs at least one linked payment that counts.')
  await expect(id(page, 'ind-burden-text')).toHaveText('Not enough income recorded.')
  await tab(page, 'Planner').click()
  await expect(id(page, 'planner-debt')).toHaveCount(2)
  await app.go('/')
  await expect(id(page, 'overview-debts-count')).toHaveText('2')
  await expect(id(page, 'overview-debts-monthly')).toHaveText(inr(P(4000)))
  expect(await app.writeTables()).toEqual(['debts:insert', 'debts:insert']) // reading the other screens added nothing
  await app.noHorizontalScroll()
})

// ===========================================================================================================
// Journey 2: link payments to a loan. Figures are recalculated, the total becomes mixed, interest and progress appear.
// ===========================================================================================================
test('J19-2: linking two payments writes only the links; the loan is recalculated everywhere and the total becomes mixed basis', async ({ app, page }) => {
  await app.open('/debts', 'debtpay')
  const before = await snap(app); const start = await app.counts()
  await expect(id(page, 'ind-total-amount')).toHaveText(inr(P(310000))) // Education 2,50,000 + Bike 60,000, opening figures
  await expect(id(page, 'ind-total')).toContainText('Total owed (opening figures)')
  await linkBy(page, card(page, 'Bike loan'), 'Bike loan', ['Bike loan EMI Sep', 'Bike loan EMI Oct'])
  await page.keyboard.press('Escape')
  const ref = reference().bikeLinked
  expect(ref.total).toBe(P(51156)) // sanity: the reference reproduces the hand-worked figure
  await expectOnly(app, ['debt_payments:insert'], before)
  expect(app.delta(start, await app.counts())).toEqual({ debt_payments: 2 })
  const bike = card(page, 'Bike loan')
  await expect(bike.getByTestId('debt-figures')).toContainText(`Owed today (calculated): ${inr(ref.total)}`)
  await expect(bike.getByTestId('debt-figures')).toContainText(`Interest paid: ${inr(ref.interestPaid)}`)
  await expect(id(page, 'ind-total-amount')).toHaveText(inr(P(250000) + ref.total))
  await expect(id(page, 'ind-total')).toContainText('Total owed (mixed basis)')
  await expect(id(page, 'ind-total-mixed')).toBeVisible()
  await expect(id(page, 'ind-interest-amount')).toHaveText(inr(ref.interestPaid))
  const prog = (ref.principalRepaid * 1000n) / (ref.principalRepaid + ref.principal) // tenths of a percent, truncated
  await expect(id(page, 'ind-progress-percent')).toHaveText(`${Number(prog) / 10}%`.replace(/^(\d+)%$/, '$1.0%'))
  await tab(page, 'Planner').click()
  await expect(id(page, 'planner-debt').filter({ hasText: 'Bike loan' })).toContainText(`Starting principal ${inr(ref.principal)}`)
  await app.go('/')
  await expect(id(page, 'overview-debts-monthly')).toHaveText(inr(P(8000))) // 5,000 + 3,000: payments are not replayed on Overview
  expect(await app.writeTables()).toEqual(['debt_payments:insert'])
})

// ===========================================================================================================
// Journey 3: clear a debt with linked payments. Cleared / overpaid, monthly drops, Planner leaves it out, Overview still counts it.
// ===========================================================================================================
test('J19-3: a lump sum linked to the Bike loan clears it: overpayment shown not subtracted, monthly drops, Planner leaves it out', async ({ app, page }) => {
  await app.open('/debts', FULL)
  const before = await snap(app)
  const ref = refReplay({ ...BIKE, payments: [...bikePays(5000, 5000), { date: '2026-10-14', amount: 70000 }] })
  expect(ref.total).toBe(0n); expect(ref.overpaid).toBeGreaterThan(0n)
  await linkBy(page, card(page, 'Bike loan'), 'Bike loan', ['Lump sum'])
  await page.keyboard.press('Escape')
  await expectOnly(app, ['debt_payments:insert'], before)
  await ind(page).getByText('Show each debt').click()
  await expect(id(page, 'ind-item').filter({ hasText: 'Bike loan' })).toContainText('overpaid')
  await expect(id(page, 'ind-item').filter({ hasText: 'Bike loan' })).toContainText('not subtracted')
  await expect(id(page, 'ind-total-amount')).toHaveText(inr(P(340000))) // the other three debts only; the overpayment is not taken off
  await expect(id(page, 'ind-monthly-amount')).toHaveText(inr(P(8000)))
  await expect(id(page, 'ind-monthly-skipped')).toContainText('Bike loan (Cleared)')
  await tab(page, 'Planner').click()
  await expect(id(page, 'planner-excluded-item').filter({ hasText: 'Bike loan' })).toHaveText('Bike loan: Cleared')
  await expect(id(page, 'planner-debt')).toHaveCount(2)
  await app.go('/')
  await expect(id(page, 'overview-debts-monthly')).toHaveText(inr(P(11000)))
  await expect(id(page, 'overview-debts-differ')).toBeVisible()
  expect(await app.writeTables()).toEqual(['debt_payments:insert'])
})

// ===========================================================================================================
// Journey 4: edit an opening figure (asks first); every screen follows.
// ===========================================================================================================
test('J19-4: changing an opening figure needs confirmation, writes one debt update, and every screen follows', async ({ app, page }) => {
  await app.open('/debts', FULL)
  const before = await snap(app)
  const edu = card(page, 'Education loan')
  await edu.getByRole('button', { name: 'Edit debt' }).click()
  await page.locator('#debt-principal').fill('240000')
  await page.getByRole('button', { name: 'Save changes' }).click()
  await expect(id(page, 'debt-confirm')).toBeVisible()
  expect(await app.writeTables()).toEqual([]) // nothing is written before the confirmation
  await page.getByRole('button', { name: 'Confirm and save' }).click()
  await expect(card(page, 'Education loan')).toContainText('principal ₹2,40,000.00')
  await expectOnly(app, ['debts:update'], before)
  await expect(id(page, 'ind-total-amount')).toHaveText(inr(P(240000) + P(51156) + P(80000) + P(10000)))
  await tab(page, 'Planner').click()
  await expect(id(page, 'planner-debt').filter({ hasText: 'Education loan' })).toContainText('Starting principal ₹2,40,000.00')
  await app.go('/')
  await expect(id(page, 'overview-debts-monthly')).toHaveText(inr(P(11000))) // the monthly payment did not change
  const w = (await app.writes()).find((x) => x.table === 'debts')
  expect(Object.keys(w.x).sort()).toContain('as_of_outstanding')
  expect(w.x.as_of_outstanding).toBe(240000)
})

// ===========================================================================================================
// Journey 5: close and reopen a debt.
// ===========================================================================================================
test('J19-5: closing the Card removes it from the indicators, the Planner and the Overview count; reopening brings it back', async ({ app, page }) => {
  await app.open('/debts', FULL)
  const before = await snap(app)
  await card(page, 'Card').getByRole('button', { name: 'Close debt' }).click()
  await expect(card(page, 'Card')).toHaveCount(0)
  await expectOnly(app, ['debts:update'], before)
  await expect(id(page, 'ind-total-amount')).toHaveText(inr(P(311156)))
  await expect(id(page, 'ind-monthly-amount')).toHaveText(inr(P(8000)))
  await tab(page, 'Planner').click()
  await expect(id(page, 'planner-debt')).toHaveCount(2)
  await expect(id(page, 'planner-excluded-item').filter({ hasText: 'Card' })).toHaveText('Card: Closed')
  await app.go('/')
  await expect(id(page, 'overview-debts-count')).toHaveText('3')
  await expect(id(page, 'overview-debts-monthly')).toHaveText(inr(P(8000)))
  await app.go('/debts'); await tab(page, 'Closed').click()
  await card(page, 'Card').getByRole('button', { name: 'Reopen debt' }).click()
  await tab(page, 'Active').click()
  await expect(card(page, 'Card')).toBeVisible()
  await expectOnly(app, ['debts:update', 'debts:update'], before)
  await expect(id(page, 'ind-total-amount')).toHaveText(inr(P(391156)))
  await expect(id(page, 'ind-monthly-amount')).toHaveText(inr(P(11000)))
})

// ===========================================================================================================
// Journey 6: a linked transaction is edited or deleted elsewhere; the debt is recalculated the next time the page loads.
// ===========================================================================================================
test('J19-6: editing or deleting a linked transaction recalculates the debt on the next load; the app itself writes nothing', async ({ app, page }) => {
  await app.open('/debts', FULL)
  await page.evaluate(() => window.__e2e.mutate('transactions', 'p1', { amount: 300 }))
  await revisit(app, page)
  const edited = refReplay({ ...BIKE, payments: bikePays(300, 5000) })
  await expect(card(page, 'Bike loan').getByTestId('debt-figures')).toContainText(`Owed today (calculated): ${inr(edited.total)}`)
  await page.evaluate(() => window.__e2e.remove('transactions', 'p2')) // deleting the transaction removes its link with it
  await revisit(app, page)
  const deleted = refReplay({ ...BIKE, payments: [{ date: '2026-09-05', amount: 300 }] })
  await expect(payBtn(card(page, 'Bike loan'), 'Bike loan')).toContainText('Payments (1)')
  await expect(card(page, 'Bike loan').getByTestId('debt-figures')).toContainText(`Owed today (calculated): ${inr(deleted.total)}`)
  await expect(card(page, 'Bike loan').getByTestId('debt-figures')).toContainText(`Unpaid interest: ${inr(deleted.interest)}`)
  await expect(id(page, 'ind-total-amount')).toHaveText(inr(P(250000) + deleted.total + P(80000) + P(10000)))
  expect(await app.writeTables()).toEqual([]) // the app wrote nothing; the changes above were made outside it
})

// ===========================================================================================================
// Journey 7: the Planner. A lump sum and an extra budget are calculated, never stored.
// ===========================================================================================================
test('J19-7: planner inputs write nothing, change nothing, and are gone after a reload', async ({ app, page }) => {
  await app.open('/debts', FULL)
  const before = await snap(app); const debts = await app.rows('debts'); const links = await app.rows('debt_payments')
  await tab(page, 'Planner').click()
  await page.getByTestId('planner-budget').fill('12000')
  await page.getByTestId('planner-lump-amount').fill('5000')
  await page.getByTestId('planner-lump-month').fill('3')
  await expect(id(page, 'planner-results')).toBeVisible()
  await expectOnly(app, [], before)
  expect(await app.rows('debts')).toEqual(debts); expect(await app.rows('debt_payments')).toEqual(links)
  await page.reload(); await page.waitForFunction(() => !document.body.innerText.includes('Loading...'))
  await tab(page, 'Planner').click()
  await expect(page.getByTestId('planner-budget')).toHaveValue('')
  await expect(page.getByTestId('planner-lump-amount')).toHaveValue('')
  await expect(id(page, 'planner-results')).toBeVisible() // the no-extra-money scenarios are back
  expect(await app.writeTables()).toEqual([])
})

// ===========================================================================================================
// Journey 8: limits and failures.
// ===========================================================================================================
test('J19-8a: at 20 active debts the screens still work and writes nothing; the limit message is shown', async ({ app, page }) => {
  await app.open('/debts', 'debt20')
  const before = await snap(app)
  await expect(page.getByText('You can have 20 active debts at once. Close one to add another.').first()).toBeVisible()
  await expect(ind(page)).toBeVisible()
  expect(await ind(page).innerText()).not.toMatch(/NaN|Infinity|undefined/)
  await tab(page, 'Planner').click(); await tab(page, 'Active').click()
  await app.go('/'); await expect(id(page, 'overview-debts-count')).toHaveText('20')
  await expectOnly(app, [], before)
})

test('J19-8b: a failed read of the linked payments, or of the debts, never shows a wrong figure', async ({ app, page, errors }) => {
  await app.open('/debts', FULL)
  const before = await snap(app)
  // linked payments cannot be read: the owed figures are withdrawn, monthly payments still show
  await page.evaluate(() => { window.__mock.failRead = 'debt_payments' })
  await revisit(app, page)
  await expect(id(page, 'ind-total-text')).toContainText("Linked payments couldn't be loaded")
  await expect(id(page, 'ind-total-amount')).toHaveCount(0)
  await expect(id(page, 'ind-monthly-amount')).toHaveText(inr(P(11000)))
  // the debts cannot be read: the page says so; Retry works once the read works
  await page.evaluate(() => { window.__mock.failRead = 'debts' })
  await revisit(app, page)
  await expect(page.getByText('Something went wrong loading this page')).toBeVisible()
  await page.evaluate(() => { window.__mock.failRead = null })
  errors.length = 0
  await page.getByRole('button', { name: 'Retry' }).click()
  await expect(id(page, 'ind-total-amount')).toHaveText(inr(P(391156)))
  await expectOnly(app, [], before)
})

test('J19-8c: a failed save keeps the form and the typed values, and changes nothing', async ({ app, page, errors }) => {
  await app.open('/debts', 'debt')
  const before = await snap(app); const start = await app.counts(); const debts = await app.rows('debts')
  await page.evaluate(() => { window.__mock.failWrite = 'debts' })
  await page.getByRole('button', { name: 'Add debt', exact: true }).click()
  await fillDebt(page, { name: 'Bike loan', kind: 'term_loan', asOf: '2026-10-01', principal: '60000', rate: '11.5', payment: '3000', months: '24' })
  await page.getByRole('button', { name: 'Save debt', exact: true }).click()
  await expect(page.getByText("Couldn't save this debt. Please try again.")).toBeVisible()
  await expect(page.locator('#debt-name')).toHaveValue('Bike loan')
  await expect(page.locator('#debt-principal')).toHaveValue('60000')
  expect(app.delta(start, await app.counts())).toEqual({})
  expect(await app.rows('debts')).toEqual(debts)
  expect(await snap(app)).toEqual(before)
  errors.length = 0
})

// ===========================================================================================================
// Read-only paths: looking at the screens, in every order, writes nothing at all.
// ===========================================================================================================
test('J19-9: browsing Debts, Closed, Planner (with inputs), the indicators and Overview writes nothing and changes no balance', async ({ app, page }) => {
  await app.open('/', FULL)
  const before = await snap(app); const debts = await app.rows('debts'); const links = await app.rows('debt_payments')
  for (const path of ['/debts', '/', '/debts']) {
    await app.go(path)
    if (path === '/debts') {
      await ind(page).getByText('Show each debt').click()
      await tab(page, 'Closed').click(); await tab(page, 'Planner').click()
      await page.getByTestId('planner-budget').fill('15000')
      await tab(page, 'Active').click()
    }
  }
  await page.reload(); await page.waitForFunction(() => !document.body.innerText.includes('Loading...'))
  await expectOnly(app, [], before)
  expect(await app.rows('debts')).toEqual(debts); expect(await app.rows('debt_payments')).toEqual(links)
})

// ===========================================================================================================
// Cross-screen consistency against the independent reference, including the DOCUMENTED differences.
// ===========================================================================================================
test('J19-10: Debts card, indicators, Planner and Overview agree where they should and differ only where documented', async ({ app, page }) => {
  await app.open('/debts', FULL)
  // (a) unpaid interest: both Bike payments are small, so interest is left over.
  await page.evaluate(() => { window.__e2e.mutate('transactions', 'p1', { amount: 300 }); window.__e2e.mutate('transactions', 'p2', { amount: 300 }) })
  await revisit(app, page)
  const bike = refReplay({ ...BIKE, payments: bikePays(300, 300) })
  expect(bike.principal).toBe(P(60000)); expect(bike.interest).toBeGreaterThan(0n)
  const total = bike.total + P(250000) + P(80000) + P(10000)
  const c = card(page, 'Bike loan').getByTestId('debt-figures')
  await expect(c).toContainText(`Owed today (calculated): ${inr(bike.total)}`)               // Debts card: principal + unpaid interest
  await expect(c).toContainText(`Principal outstanding: ${inr(bike.principal)}`)
  await expect(c).toContainText(`Unpaid interest: ${inr(bike.interest)}`)
  await expect(id(page, 'ind-total-amount')).toHaveText(inr(total))                          // indicator = the same figure, summed
  await ind(page).getByText('Show each debt').click()
  await expect(id(page, 'ind-item').filter({ hasText: 'Bike loan' })).toContainText(`principal ${inr(bike.principal)} + unpaid interest ${inr(bike.interest)}`)
  await tab(page, 'Planner').click()                                                          // DOCUMENTED difference 1: Planner uses principal only
  await expect(id(page, 'planner-debt').filter({ hasText: 'Bike loan' })).toContainText(`Starting principal ${inr(bike.principal)}`)
  await expect(id(page, 'planner-debt').filter({ hasText: 'Bike loan' })).not.toContainText(inr(bike.total))
  await expect(id(page, 'planner-principal-only')).toHaveText('The starting balance is the principal only. Unpaid interest is not included.')
  await app.go('/')                                                                           // DOCUMENTED difference 2: Overview has no total owed and does not replay payments
  await expect(id(page, 'overview-debts-monthly')).toHaveText(inr(P(11000)))
  await expect(id(page, 'overview-debts')).not.toContainText('Total owed')
  await expect(id(page, 'overview-debts-differ')).toBeVisible()

  // (b) opening snapshot with accrued interest: opening total = principal + unpaid interest, never aged; Planner takes principal only.
  await page.evaluate(() => window.__e2e.mutate('debts', 'd1', { as_of_accrued_interest: 5000 }))
  await revisit(app, page)
  await ind(page).getByText('Show each debt').click()
  await expect(id(page, 'ind-item').filter({ hasText: 'Education loan' })).toContainText(`${inr(P(255000))} opening figure on 1 Oct 2026, not a current balance (principal ${inr(P(250000))} + unpaid interest ${inr(P(5000))}`)
  await expect(id(page, 'ind-total-amount')).toHaveText(inr(total + P(5000)))
  await tab(page, 'Planner').click()
  await expect(id(page, 'planner-debt').filter({ hasText: 'Education loan' })).toContainText(`Starting principal ${inr(P(250000))}`)

  // (c) a debt cleared by linked payments: Debts page drops its payment, Planner leaves it out, Overview still counts it.
  await page.evaluate(() => window.__e2e.add('debt_payments', { id: 'lk-x', debt_id: 'd3', transaction_id: 'p10' }))
  await revisit(app, page)
  const cleared = refReplay({ ...BIKE, payments: [...bikePays(300, 300), { date: '2026-10-14', amount: 70000 }] })
  expect(cleared.total).toBe(0n)
  await expect(id(page, 'ind-monthly-amount')).toHaveText(inr(P(8000)))
  await tab(page, 'Planner').click()
  await expect(id(page, 'planner-excluded-item').filter({ hasText: 'Bike loan' })).toHaveText('Bike loan: Cleared')
  await app.go('/')
  await expect(id(page, 'overview-debts-monthly')).toHaveText(inr(P(11000)))
  expect(await app.writeTables()).toEqual([]) // none of the above was written by the app
})
