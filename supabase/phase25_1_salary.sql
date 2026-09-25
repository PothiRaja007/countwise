-- CountWise — Subphase 25.1: Salary data model (salary_structures, salary_components)
--
-- Standalone version of the block also appended directly to
-- supabase/schema.sql in this same subphase (not left as a separate
-- "appended block" file this time — see the note in schema.sql explaining
-- why that pattern caused a real drift gap for the CTC tables in 24.1).
--
-- Scope note: this is data-model + engine only. No UI reads or writes
-- these tables yet, and nothing here touches `transactions` or creates an
-- income row — that's Subphase 25.2, deliberately not this one.
--
-- Design decisions, consistent with this project's established
-- conventions:
--   - Typed columns, not JSONB (same as ctc_components, budgets, goals).
--   - monthly_amount is nullable on purpose — same "never invent an
--     amount" rule as ctc_components.annual_amount and budgetRecipe.js.
--   - user_id denormalized onto salary_components (not just reachable via
--     structure_id) — same precedent as goal_contributions and
--     ctc_components, for RLS policy simplicity.
--
-- Safe to re-run: `create table if not exists` / duplicate-checked
-- `create policy` make this idempotent.

create table if not exists salary_structures (
  id uuid primary key default uuid_generate_v4(),
  user_id uuid not null references auth.users(id) on delete cascade,
  label text not null default 'My salary structure',
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists salary_components (
  id uuid primary key default uuid_generate_v4(),
  structure_id uuid not null references salary_structures(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  name text not null,
  category text not null check (category in (
    'basic','allowance','employee_deduction','employer_contribution','other','needs_clarification'
  )),
  monthly_amount numeric,
  created_at timestamptz not null default now()
);

-- RLS: standard owner-only pattern, same shape as ctc_explorations/
-- ctc_components and budgets/user_preferences — user-owned data, no split
-- "own or default" policy needed (that pattern is only for shared
-- reference data like categories/category_rules).
alter table salary_structures enable row level security;
alter table salary_components enable row level security;

do $$
begin
  if not exists (
    select 1 from pg_policies
    where tablename = 'salary_structures' and policyname = 'own salary structures'
  ) then
    create policy "own salary structures" on salary_structures for all
      using (auth.uid() = user_id) with check (auth.uid() = user_id);
  end if;

  if not exists (
    select 1 from pg_policies
    where tablename = 'salary_components' and policyname = 'own salary components'
  ) then
    create policy "own salary components" on salary_components for all
      using (auth.uid() = user_id) with check (auth.uid() = user_id);
  end if;
end $$;
