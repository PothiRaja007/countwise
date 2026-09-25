-- CountWise — Subphase 24.1: CTC data model (ctc_explorations, ctc_components)
--
-- Standalone version of the block now also appended to supabase/schema.sql,
-- for running once directly against the live Supabase project — same
-- dual-file convention as this project's other migration files (see
-- phase23_employee_subtype.sql for another example of the same pattern).
--
-- Scope note: this is data-model only. No UI reads or writes these tables
-- yet — CTCExplorer.jsx (Phase 23.5's placeholder) is explicitly left
-- untouched; the real UI is Subphase 24.2, not this one.
--
-- Design decision: typed columns, not a JSONB blob. Consistent with this
-- project's established convention (transactions, goals, budgets are all
-- explicit typed columns, never JSONB) — CTC components are a reasonably
-- well-known fixed-ish set, not truly arbitrary data.
--
-- Safe to re-run: `create table if not exists` / `create policy` guarded
-- by a duplicate check below make this idempotent.

-- 1. CTC_EXPLORATIONS: one row per saved CTC breakdown a user is working
--    through. label lets a user keep more than one (e.g. comparing two
--    offers) without the data model assuming there's only ever one.
create table if not exists ctc_explorations (
  id uuid primary key default uuid_generate_v4(),
  user_id uuid not null references auth.users(id) on delete cascade,
  label text not null default 'My CTC breakdown',
  ctc_annual numeric not null check (ctc_annual > 0),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- 2. CTC_COMPONENTS: the individual line items (Basic, HRA, Employer PF,
--    etc.) the user typed in for one exploration.
--
--    annual_amount is nullable ON PURPOSE — a component the user couldn't
--    confidently fill in stays null (and/or category = 'needs_clarification')
--    rather than getting a guessed number. This is the same
--    "never silently invent an amount" rule already enforced in
--    budgetRecipe.js (Phase 17.1) applied to a new domain.
--
--    user_id is denormalized onto this child table rather than relying on
--    a join through exploration_id for its RLS policy — same precedent as
--    goal_contributions (denormalized user_id alongside goal_id), chosen
--    for RLS policy simplicity and consistency with that existing pattern.
create table if not exists ctc_components (
  id uuid primary key default uuid_generate_v4(),
  exploration_id uuid not null references ctc_explorations(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  name text not null,
  category text not null check (category in (
    'basic','hra','special_allowance','employer_pf','gratuity','variable_pay','other','needs_clarification'
  )),
  annual_amount numeric,
  is_recurring_monthly boolean not null default true,
  notes text,
  created_at timestamptz not null default now()
);

-- RLS: standard owner-only pattern, both tables. This is user-owned data,
-- not shared reference data (unlike the future financial_rules table in
-- Phase 27) — no split "own or default" policy needed here, matching
-- budgets/user_preferences rather than categories/category_rules.
alter table ctc_explorations enable row level security;
alter table ctc_components enable row level security;

do $$
begin
  if not exists (
    select 1 from pg_policies
    where tablename = 'ctc_explorations' and policyname = 'own ctc explorations'
  ) then
    create policy "own ctc explorations" on ctc_explorations for all
      using (auth.uid() = user_id) with check (auth.uid() = user_id);
  end if;

  if not exists (
    select 1 from pg_policies
    where tablename = 'ctc_components' and policyname = 'own ctc components'
  ) then
    create policy "own ctc components" on ctc_components for all
      using (auth.uid() = user_id) with check (auth.uid() = user_id);
  end if;
end $$;
