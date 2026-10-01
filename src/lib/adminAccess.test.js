import assert from 'node:assert'
import { checkIsAdmin } from './adminAccess.js'

// A fake Supabase client exercising the exact query shape adminAccess.js builds.
function fakeSupabase({ row = null, error = null }) {
  return {
    from: (table) => {
      assert.strictEqual(table, 'admin_users')
      return {
        select: () => ({
          eq: (col, val) => {
            assert.strictEqual(col, 'user_id')
            return { maybeSingle: async () => ({ data: row, error }) }
          },
        }),
      }
    },
  }
}

async function main() {
  let passed = 0, failed = 0
  console.log('adminAccess tests\n')

  const cases = [
    ['a user with a row in admin_users is an admin', async () => assert.strictEqual(await checkIsAdmin(fakeSupabase({ row: { user_id: 'x' } }), 'x'), true)],
    ['a user with no row (RLS correctly returns none) is not an admin', async () => assert.strictEqual(await checkIsAdmin(fakeSupabase({ row: null }), 'y'), false)],
    ['a query error fails closed (not an admin), never fails open', async () => assert.strictEqual(await checkIsAdmin(fakeSupabase({ error: { message: 'boom' } }), 'z'), false)],
    ['no userId at all (not signed in) is safely false, no query attempted', async () => assert.strictEqual(await checkIsAdmin(fakeSupabase({ row: { user_id: 'x' } }), null), false)],
  ]
  for (const [name, fn] of cases) {
    try { await fn(); passed++; console.log(`  PASS  ${name}`) }
    catch (err) { failed++; console.log(`  FAIL  ${name}\n        ${err.message}`) }
  }
  console.log(`\n${passed} passed, ${failed} failed`)
  if (failed > 0) process.exit(1)
}
main()
