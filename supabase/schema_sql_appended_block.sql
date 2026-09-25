-- ============================================
-- SUBPHASE 24.1: CTC Explorer data model
-- ============================================
-- Data-model only. No UI reads or writes these tables yet — see
-- supabase/phase24_1_ctc_explorer.sql for the standalone version and full
-- rationale. Typed columns (not JSONB), consistent with this project's
-- established convention. annual_amount on ctc_components is nullable on
-- purpose — an unconfirmed component stays null, never a guessed number.

create table if not exists ctc_explorations (
  id uuid primary key default uuid_generate_v4(),
  user_id uuid not null references auth.users(id) on delete cascade,
  label text not null default 'My CTC breakdown',
  ctc_annual numeric not null check (ctc_annual > 0),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- user_id denormalized here too, same precedent as goal_contributions,
-- for RLS policy simplicity rather than a join through exploration_id.
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
