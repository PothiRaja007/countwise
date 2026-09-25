// Small shared Supabase-write helper for the `budgets` table. Extracted
// out of Budgets.jsx (Phase 17) so both Budgets.jsx's own create/edit
// modal and BudgetRecipeFlow.jsx (Phase 17.1) call the exact same
// insert/update + duplicate-constraint handling instead of each
// re-implementing it.
import { supabase } from './supabaseClient.js'

// unique(user_id, category_id, period_start) violation
export const DUPLICATE_BUDGET_CODE = '23505'

/**
 * Create or update one budget row. Pass `id` to update an existing
 * budget; omit it to insert a new one.
 *
 * Returns { error: null } on success, or { error: 'duplicate' | 'generic' }
 * on failure. The real Supabase error is always logged to the console;
 * callers turn 'duplicate'/'generic' into whatever contextual, friendly
 * message fits their own UI — this file never shows anything to a user
 * itself.
 */
export async function saveBudgetRow({ id, userId, categoryId, amount, periodStart, periodEnd }) {
  const payload = { amount, period_start: periodStart, period_end: periodEnd }

  const result = id
    ? await supabase.from('budgets').update(payload).eq('id', id)
    : await supabase.from('budgets').insert({
        user_id: userId,
        category_id: categoryId,
        period_type: 'monthly',
        ...payload,
      })

  if (result.error) {
    // eslint-disable-next-line no-console
    console.error(result.error)
    if (result.error.code === DUPLICATE_BUDGET_CODE) return { error: 'duplicate' }
    return { error: 'generic' }
  }

  return { error: null }
}
