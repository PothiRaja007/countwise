// Known product issues found by P12. They are PINNED as they behave today, not fixed (P12 changes no product code).
// If a fix ever lands, the matching test fails on purpose so this file is updated.
import { test, expect } from '../support/fixtures.js'

test('KNOWN ISSUE F-1 (pinned, not fixed): the Learning ROI page is wider than a phone screen', async ({ app, page }, info) => {
  await app.open('/learning', 'learn')
  await page.waitForTimeout(600)
  const over = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth)
  if (info.project.name.startsWith('phone')) expect(over, 'at 390px wide the page scrolls sideways').toBeGreaterThan(1)
  else expect(over, 'at 1280px wide it fits').toBeLessThanOrEqual(1)
})

test('every other page fits a phone screen (no sideways scroll)', async ({ app, page }, info) => {
  test.skip(!info.project.name.startsWith('phone'), 'phone width only')
  for (const [route, db] of [['/', 'base'], ['/goals', 'goal'], ['/budgets', 'base'], ['/transactions', 'base'], ['/salary', 'sal'], ['/pf-pension', 'sal']]) {
    await app.open(route, db)
    await page.waitForTimeout(500)
    await app.noHorizontalScroll()
  }
})
