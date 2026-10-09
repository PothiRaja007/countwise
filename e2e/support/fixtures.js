// P12 helpers shared by every journey. Test-only. Reads nothing from src/.
import { test as base, expect } from '@playwright/test'

// A fixed "now" so dates, "next month" and the 5-minute expiry are the same every time the suite runs.
export const NOW = '2026-10-15T12:00:00+05:30'
export const NOTE_MIXED = 'Please do one thing at a time: a command, a question, or an entry.'

const isLocal = (url) => /^(https?:\/\/)?(127\.0\.0\.1|localhost)(:|\/|$)/.test(url) || url.startsWith('data:') || url.startsWith('blob:')

export const test = base.extend({
  theme: ['light', { option: true }],
  errors: async ({}, use) => { const list = []; await use(list) },
  external: async ({}, use) => { const list = []; await use(list) },
  page: async ({ page, errors, external }, use) => {
    // Nothing leaves the machine: any request to another host is answered with an empty reply and recorded.
    await page.route('**/*', (route) => {
      const url = route.request().url()
      if (isLocal(url)) return route.continue()
      external.push(url)
      return route.fulfill({ status: 200, contentType: 'text/plain', body: '' })
    })
    page.on('pageerror', (e) => errors.push(String(e)))
    page.on('console', (m) => { if (m.type() === 'error') errors.push(m.text()) })
    await use(page)
    expect(errors, 'no console or page errors').toEqual([])
    expect(external.filter((u) => /supabase/i.test(u)), 'no request to any Supabase host').toEqual([])
  },
  app: async ({ page, theme }, use) => {
    const app = {
      page,
      /** Load a route with a fresh in-memory database of the given kind ('base' | 'sal' | 'goal'). */
      async open(path = '/', db = 'base') {
        await page.clock.setFixedTime(new Date(NOW))
        await page.addInitScript(({ db, theme }) => { window.__E2E = { db, theme } }, { db, theme })
        await page.goto(path)
        await page.waitForFunction(() => !document.body.innerText.includes('Loading...'))
        await expect(page.locator('html')).toHaveClass(theme === 'dark' ? /dark/ : /^(?!.*dark).*$/)
      },
      btn: (name) => page.getByRole('button', { name, exact: true }),
      box: () => page.locator('textarea').first(),
      path: () => new URL(page.url()).pathname,
      text: () => page.locator('body').innerText(),
      /** Type into Money Inbox and press Review. */
      async say(text) {
        await app.box().fill(text)
        await app.btn('Review').first().click()
        await page.waitForFunction(() => !document.body.innerText.includes('Reading...'))
        await page.waitForTimeout(250)
      },
      counts: () => page.evaluate(() => window.__e2e.counts()),
      rows: (t) => page.evaluate((t) => window.__e2e.rows(t), t),
      // The app itself saves two small settings rows (user_preferences: time zone, reminder time) when it opens.
      // That is existing behaviour and not a money write, so it is left out of every count.
      writes: () => page.evaluate(() => window.__mock.writes.filter((w) => w.table !== 'user_preferences')),
      writeTables: async () => (await app.writes()).map((w) => `${w.table}:${w.op}`),
      /** Non-zero differences between two counts() snapshots, e.g. { transactions: 1 }. */
      delta(before, after) {
        const d = {}
        for (const k of new Set([...Object.keys(before), ...Object.keys(after)])) if (k !== 'user_preferences' && (after[k] || 0) !== (before[k] || 0)) d[k] = (after[k] || 0) - (before[k] || 0)
        return d
      },
      /** Move inside the app without reloading (so the in-memory database is kept). */
      async go(to) {
        await page.evaluate((to) => { window.history.pushState({}, '', to); window.dispatchEvent(new PopStateEvent('popstate')) }, to)
        await page.waitForTimeout(500)
        await page.waitForFunction(() => !document.body.innerText.includes('Loading'))
      },
      /** Real balance of an account, from the transactions rows, with the app's own rule (goal contributions are NOT in it). */
      async balance(accountId = 'a1') {
        const tx = await app.rows('transactions')
        return tx.reduce((s, t) => (t.type === 'income' && t.account_id === accountId ? s + t.amount : t.type === 'expense' && t.account_id === accountId ? s - t.amount : t.type === 'transfer' && t.to_account_id === accountId ? s + t.amount : t.type === 'transfer' && t.account_id === accountId ? s - t.amount : s), 0)
      },
      async noHorizontalScroll() {
        const over = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth)
        expect(over, 'no horizontal page scroll').toBeLessThanOrEqual(1)
      },
    }
    await use(app)
  },
})
export { expect }
