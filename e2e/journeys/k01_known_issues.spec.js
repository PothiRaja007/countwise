// Known product issues found by P12. Open ones are PINNED as they behave today. When a fix lands, the matching test is updated on purpose.
import { test, expect } from '../support/fixtures.js'

// F-1 was pinned by P12 as a known issue (the Learning page scrolled sideways on phones). P14 fixed it,
// so this test now asserts the stronger rule: the page fits at every width.
test('F-1 (fixed in P14): the Learning ROI page fits a phone screen and a desktop screen', async ({ app, page }) => {
  await app.open('/learning', 'learn')
  await page.waitForTimeout(600)
  const over = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth)
  expect(over, 'no sideways scroll').toBeLessThanOrEqual(1)
})

test('every page fits a phone screen (no sideways scroll)', async ({ app, page }, info) => {
  test.skip(!info.project.name.startsWith('phone'), 'phone width only')
  for (const [route, db] of [['/learning', 'learn'], ['/', 'base'], ['/goals', 'goal'], ['/budgets', 'base'], ['/transactions', 'base'], ['/salary', 'sal'], ['/pf-pension', 'sal']]) {
    await app.open(route, db)
    await page.waitForTimeout(500)
    await app.noHorizontalScroll()
  }
})
