-- =====================================================================================
-- D2 (NOT YET APPLIED) - the debts table for the Debt module.
-- Nothing in this file has been run against your project. Review it, then run it yourself in
-- the Supabase SQL editor, in this order: STEP 0 (checks), STEP 1 (migration), STEP 2 (checks).
-- STEP 3 undoes STEP 1, but it DELETES every debt entered, so use it only on a database with no
-- data you want to keep (export first if the table has been used).
--
-- What this adds: ONE table, debts, with row-level security. It changes no existing table, policy,
-- function or trigger. Debt payments and transaction links are not part of D2 (they arrive in D4).
--
-- What debts stores: the user's OPENING figures (principal and unpaid interest on as_of_date) and the
-- loan terms. It never stores a current balance. The current outstanding amount is calculated by
-- src/lib/debtEngine.js from the opening figures and the payments linked in D4. A debt is not an
-- account and is never part of total balance.
-- =====================================================================================

-- ---------- STEP 0: pre-flight checks (read-only). Send me the result before STEP 1. ----------
-- Every row must show found = expected, except the INFO row, which is informational only.
select 'no_relation_named_debt_in_public' as check_name, count(*)::text as found, '0' as expected
  from pg_class c join pg_namespace n on n.oid = c.relnamespace
  where n.nspname = 'public' and c.relname like 'debt%'
union all select 'uuid_generate_v4_function_exists', (count(*) >= 1)::text, 'true'
  from pg_proc where proname = 'uuid_generate_v4'
union all select 'auth_users_table_exists', count(*)::text, '1'
  from information_schema.tables where table_schema = 'auth' and table_name = 'users'
union all select 'auth_uid_function_exists', (count(*) >= 1)::text, 'true'
  from pg_proc p join pg_namespace n on n.oid = p.pronamespace where n.nspname = 'auth' and p.proname = 'uid'
union all select 'INFO_p15_script_was_run (accounts_id_user_key exists)', count(*)::text, 'info only: 0 or 1 are both fine'
  from pg_constraint where conname = 'accounts_id_user_key';

-- ---------- STEP 1: migration. Runs as one transaction, so a failure changes nothing. ----------
begin;

create table debts (
  id uuid primary key default uuid_generate_v4(),
  user_id uuid not null references auth.users(id) on delete cascade,
  name text not null,
  kind text not null,
  lender text,
  as_of_date date not null,                      -- the date the two opening figures below are true
  as_of_outstanding numeric not null,            -- PRINCIPAL owed on as_of_date (0 = already cleared)
  as_of_accrued_interest numeric not null default 0, -- interest owed but unpaid on as_of_date (0 = none known)
  annual_rate_pct numeric not null,              -- no default on purpose: a rate is never silently 0
  monthly_payment numeric,                       -- lender EMI or the user's chosen payment
  remaining_months integer,                      -- months left ON as_of_date (a snapshot, never counted down)
  due_day integer,                               -- day of month; short months use their last day
  status text not null default 'active',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),

  constraint debts_name_valid check (btrim(name) <> '' and char_length(name) <= 80),
  constraint debts_kind_valid check (kind in ('term_loan', 'interest_free', 'credit_card')),
  constraint debts_lender_valid check (lender is null or char_length(lender) <= 80),
  -- Money: whole paise only (at most 2 decimals) so nothing is silently rounded, and an upper limit that keeps
  -- every figure exact in the engine. NaN and Infinity fail the upper-limit test.
  constraint debts_as_of_outstanding_valid check (
    as_of_outstanding >= 0 and as_of_outstanding <= 100000000000 and as_of_outstanding = round(as_of_outstanding, 2)),
  constraint debts_as_of_accrued_interest_valid check (
    as_of_accrued_interest >= 0 and as_of_accrued_interest <= 100000000000 and as_of_accrued_interest = round(as_of_accrued_interest, 2)),
  constraint debts_annual_rate_pct_valid check (
    annual_rate_pct >= 0 and annual_rate_pct <= 100 and annual_rate_pct = round(annual_rate_pct, 2)),
  constraint debts_monthly_payment_valid check (
    monthly_payment is null or (monthly_payment > 0 and monthly_payment <= 100000000000 and monthly_payment = round(monthly_payment, 2))),
  constraint debts_remaining_months_valid check (remaining_months is null or remaining_months between 1 and 600),
  constraint debts_due_day_valid check (due_day is null or due_day between 1 and 31),
  constraint debts_status_valid check (status in ('active', 'closed')),
  constraint debts_interest_free_rate_zero check (kind <> 'interest_free' or annual_rate_pct = 0),
  -- Lets D4 add a composite foreign key that proves a payment link and its debt belong to the same user.
  constraint debts_id_user_key unique (id, user_id)
);

-- No two ACTIVE debts with the same name for one user (ignoring case). Also stops a same-instant double click.
-- The index name is what the app will turn into a plain message (same approach as goals).
create unique index debts_active_name_per_user on debts (user_id, lower(name)) where status = 'active';

alter table debts enable row level security;

-- One policy for every command, the same shape as the other user tables, limited to signed-in users.
create policy "own debts" on debts for all to authenticated
  using (auth.uid() = user_id) with check (auth.uid() = user_id);

commit;

-- ---------- STEP 2: post-checks (read-only). Every row must show found = expected. ----------
select 'column_count' as check_name, count(*)::text as found, '15' as expected
  from information_schema.columns where table_schema = 'public' and table_name = 'debts'
union all select 'row_security_enabled', relrowsecurity::text, 'true'
  from pg_class where oid = 'public.debts'::regclass
union all select 'policy_count', count(*)::text, '1'
  from pg_policies where schemaname = 'public' and tablename = 'debts'
union all select 'policy_applies_to_authenticated_only', (roles = '{authenticated}'::name[])::text, 'true'
  from pg_policies where schemaname = 'public' and tablename = 'debts' and policyname = 'own debts'
union all select 'constraint_count', count(*)::text, '14'
  from pg_constraint where conrelid = 'public.debts'::regclass
union all select 'index_count', count(*)::text, '3'
  from pg_indexes where schemaname = 'public' and tablename = 'debts'
union all select 'row_count', count(*)::text, '0' from debts;

-- ---------- STEP 3: rollback. DESTRUCTIVE: deletes the table and every debt in it. ----------
-- Only for a database that holds no debts you want to keep. Export first if the table has been used.
-- It removes only what STEP 1 created; nothing else in the database depends on debts in D2.
-- begin;
-- drop table debts;
-- commit;
