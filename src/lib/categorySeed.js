import { supabase } from './supabaseClient';

// Extra categories layered on top of the shared defaults.
// Keep this list short — the goal is realistic default coverage, not exhaustive taxonomy.
// Note (Phase 17.1): 'Rent' used to live here as an employed-only extra.
// It's now a shared default category (see schema.sql's Phase 17.1 block)
// since students pay rent too — "student first, not student only."
// Removed from here so an employed user's onboarding never creates a
// second, duplicate 'Rent' category alongside the shared default one.
const STUDENT_EXTRA = [
  { name: 'Tuition Fees', kind: 'expense', icon: 'book-open',
    rules: ['tuition', 'semester fee', 'college fee'] },
  { name: 'Hostel/Mess', kind: 'expense', icon: 'home',
    rules: ['hostel', 'mess', 'pg rent'] },
  { name: 'Course Fees', kind: 'expense', icon: 'graduation-cap',
    rules: ['course fee', 'certification', 'exam fee', 'nism', 'coursera', 'udemy'] },
];

const EMPLOYED_EXTRA = [
  { name: 'EMI/Loan', kind: 'expense', icon: 'credit-card',
    rules: ['emi', 'loan', 'installment'] },
  { name: 'Investments', kind: 'expense', icon: 'trending-up',
    rules: ['sip', 'mutual fund', 'stocks', 'investment'] },
];

// 'mixed' gets both sets — small enough lists that overlap isn't clutter.
// Safe to call more than once for the same user: existing category names
// are fetched first and skipped, so a repeat onboarding run (or any other
// accidental re-invocation) never creates duplicate rows.
export async function seedCategoriesForIncomeType(userId, incomeType) {
  const extras =
    incomeType === 'student' ? STUDENT_EXTRA :
    incomeType === 'employed' ? EMPLOYED_EXTRA :
    [...STUDENT_EXTRA, ...EMPLOYED_EXTRA]; // 'mixed'

  const { data: existing, error: existingErr } = await supabase
    .from('categories')
    .select('name')
    .eq('user_id', userId);

  if (existingErr) throw existingErr;
  const existingNames = new Set((existing || []).map((c) => c.name));

  for (const cat of extras) {
    if (existingNames.has(cat.name)) continue; // already seeded — skip, don't duplicate

    const { data: category, error: catErr } = await supabase
      .from('categories')
      .insert({ user_id: userId, name: cat.name, kind: cat.kind, icon: cat.icon, is_default: false })
      .select()
      .single();

    if (catErr) throw catErr;

    const ruleRows = cat.rules.map((keyword, i) => ({
      user_id: userId,
      keyword,
      category_id: category.id,
      priority: i,
    }));

    const { error: ruleErr } = await supabase.from('category_rules').insert(ruleRows);
    if (ruleErr) throw ruleErr;
  }
}
