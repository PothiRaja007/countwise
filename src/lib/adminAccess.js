// Phase 39 — admin access check. Not pure (queries Supabase), same
// documented pattern as financialRules.js's getActiveRule/getVerifiedRule:
// the actual gate is the RLS policy on admin_users/financial_rules
// (verified against a real Postgres — see phase39_admin_users.sql's
// header comment), this function only decides whether to SHOW the admin
// UI at all. A non-admin who somehow reached the page would still be
// blocked at the database level, not just hidden from the nav.
export async function checkIsAdmin(supabase, userId) {
  if (!userId) return false
  const { data, error } = await supabase.from('admin_users').select('user_id').eq('user_id', userId).maybeSingle()
  if (error) {
    // eslint-disable-next-line no-console
    console.error(error)
    return false
  }
  return !!data
}
