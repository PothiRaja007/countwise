// J8 — P11: a message that holds two kinds of thing is never half-done. It asks for one thing at a time,
// offers only "Edit my message" and Cancel, and writes nothing.
import { test, expect, NOTE_MIXED } from '../support/fixtures.js'

const MIXED = [
  'paid 8000 for a Power BI course sbi and add Power BI to learning',
  'salary received and pension estimate',
  'pension estimate and rent 4000 sbi',
  'show my pension estimate and create next month budget',
  'create a goal for a laptop and pension estimate',
  'how much did I spend on food and pension estimate',
  'rent 4000 sbi and create a goal for a laptop',
]

for (const text of MIXED) {
  test(`J8: "${text}" asks for one thing at a time`, async ({ app, page }) => {
    await app.open('/', 'sal')
    const start = await app.counts()
    await app.say(text)
    await expect(page.getByText(NOTE_MIXED)).toBeVisible()
    await expect(app.btn('Edit my message')).toBeVisible()
    await expect(app.btn('Cancel')).toBeVisible()
    await expect(page.getByRole('button', { name: /go on|continue|use|confirm/i })).toHaveCount(0)
    expect(await app.writes()).toEqual([])
    expect(app.delta(start, await app.counts())).toEqual({})
    expect(await app.path()).toBe('/')
    await app.btn('Edit my message').click()
    await expect(app.box()).toHaveValue(text)
    await app.say(text)
    await app.btn('Cancel').click()
    await expect(app.box()).toHaveValue('')
    expect(await app.writes()).toEqual([])
  })
}
