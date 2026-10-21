-- =====================================================================================
-- D4a (NOT YET APPLIED) - the debt_payments table for the Debt module.
-- Nothing in this file has been run against your project. Review it, then run it yourself in
-- the Supabase SQL editor, in this order: STEP 0 (checks), STEP 1 (migration), STEP 2 (checks).
-- STEP 3 undoes STEP 1. It DELETES every payment link made (never a transaction, never a debt), so export
-- first if the table has been used.
--
-- Requires D2 (the debts table, supabase/p16_debts.sql) to be applied first.
--
-- What this adds:
--   1. ONE constraint on the existing transactions table: unique (id, user_id). id is already the primary key,
--      so this can never fail on existing data. It only lets debt_payments prove that a link and its
--      transaction belong to the same user. No column, policy or trigger of transactions changes, and no
--      transaction row is read or written.
--   2. ONE new table, debt_payments, with row-level security, and ONE trigger on it.
--
-- What a link is: a row saying "this expense transaction is a payment toward this debt". It stores no amount and
-- no date; the app reads both live from the transaction, so balances still come from transactions only.
-- Creating a link does not create, change or delete a transaction, and does not touch any balance.
-- Deleting a transaction deletes its link (the debt then recalculates). Closing a debt keeps its links.
-- =====================================================================================

-- ---------- STEP 0: pre-flight checks (read-only). Send me the result before STEP 1. ----------
-- Every row must show found = expected, except the INFO rows, which are informational only.
-- Write down the INFO fingerprint: STEP 2 shows it again and the two values must be identical.
select 'no_relation_named_debt_payments_in_public' as check_name, count(*)::text as found, '0' as expected
  from pg_class c join pg_namespace n on n.oid = c.relnamespace
  where n.nspname = 'public' and c.relname like 'debt\_payments%'
union all select 'debts_table_exists (run p16_debts.sql first if 0)', count(*)::text, '1'
  from pg_class c join pg_namespace n on n.oid = c.relnamespace
  where n.nspname = 'public' and c.relname = 'debts' and c.relkind = 'r'
union all select 'debts_id_user_key_exists', count(*)::text, '1'
  from pg_constraint k join pg_class c on c.oid = k.conrelid join pg_namespace n on n.oid = c.relnamespace
  where k.conname = 'debts_id_user_key' and n.nspname = 'public' and c.relname = 'debts'
union all select 'transactions_table_exists', count(*)::text, '1'
  from pg_class c join pg_namespace n on n.oid = c.relnamespace
  where n.nspname = 'public' and c.relname = 'transactions' and c.relkind = 'r'
union all select 'transactions_has_a_primary_key', count(*)::text, '1'
  from pg_constraint k join pg_class c on c.oid = k.conrelid join pg_namespace n on n.oid = c.relnamespace
  where k.contype = 'p' and n.nspname = 'public' and c.relname = 'transactions'
union all select 'transactions_id_user_key_not_there_yet', count(*)::text, '0'
  from pg_constraint where conname = 'transactions_id_user_key'
union all select 'trigger_function_name_is_free', count(*)::text, '0'
  from pg_proc p join pg_namespace n on n.oid = p.pronamespace
  where n.nspname = 'public' and p.proname = 'check_debt_payment_expense'
union all select 'uuid_generate_v4_function_exists', (count(*) >= 1)::text, 'true'
  from pg_proc where proname = 'uuid_generate_v4'
union all select 'auth_users_table_exists', count(*)::text, '1'
  from information_schema.tables where table_schema = 'auth' and table_name = 'users'
union all select 'auth_uid_function_exists', (count(*) >= 1)::text, 'true'
  from pg_proc p join pg_namespace n on n.oid = p.pronamespace where n.nspname = 'auth' and p.proname = 'uid'
union all select 'INFO_transactions_row_count_before', count(*)::text, 'info only: write this down'
  from transactions
union all select 'INFO_transactions_fingerprint_before', coalesce(md5(string_agg(t::text, '|' order by t.id::text)), 'empty'), 'info only: write this down'
  from transactions t
union all select 'INFO_transactions_trigger_count_before', count(*)::text, 'info only: write this down'
  from pg_trigger where tgrelid = 'public.transactions'::regclass and not tgisinternal
union all select 'INFO_p15_script_was_run (accounts_id_user_key exists)', count(*)::text, 'info only: 0 or 1 are both fine'
  from pg_constraint where conname = 'accounts_id_user_key';

-- ---------- STEP 1: migration. Runs as one transaction, so a failure changes nothing. ----------
begin;

-- The only change to an existing table: a uniqueness rule that is already true (id is the primary key).
-- It exists so a composite foreign key can prove "this link and this transaction belong to the same user".
alter table transactions add constraint transactions_id_user_key unique (id, user_id);

create table debt_payments (
  id uuid primary key default uuid_generate_v4(),
  user_id uuid not null references auth.users(id) on delete cascade,
  debt_id uuid not null,
  transaction_id uuid not null,
  created_at timestamptz not null default now(),

  -- Both parents must belong to the SAME user as the link. Deleting either parent deletes the link.
  constraint debt_payments_debt_user_fkey
    foreign key (debt_id, user_id) references debts (id, user_id) on delete cascade,
  constraint debt_payments_transaction_user_fkey
    foreign key (transaction_id, user_id) references transactions (id, user_id) on delete cascade,
  -- One transaction is a payment toward at most one debt, once. This also stops a same-instant double click.
  -- The constraint name is what the app turns into a plain message.
  constraint debt_payments_transaction_id_key unique (transaction_id)
);

create index debt_payments_debt_id_idx on debt_payments (debt_id);

-- Only an expense can be a debt payment. Income and transfers are refused. If the transaction does not exist
-- (or is another user's), this lets the row through so the foreign key reports it (error 23503).
-- It runs only when a link is created or re-pointed. It does NOT watch the transactions table, so a transaction
-- that is later edited into income or a transfer keeps its link; the app then shows it as "not counted".
create or replace function public.check_debt_payment_expense() returns trigger
language plpgsql set search_path = public as $$
declare
  t text;
begin
  select tx.type into t from transactions tx where tx.id = new.transaction_id and tx.user_id = new.user_id;
  if found and t <> 'expense' then
    raise exception 'a debt payment must be an expense transaction' using errcode = '23514';
  end if;
  return new;
end $$;

create trigger debt_payments_expense_only before insert or update of transaction_id, user_id on debt_payments
  for each row execute function public.check_debt_payment_expense();

alter table debt_payments enable row level security;

-- One policy for every command, the same shape as the other user tables, limited to signed-in users.
create policy "own debt payments" on debt_payments for all to authenticated
  using (auth.uid() = user_id) with check (auth.uid() = user_id);

commit;

-- ---------- STEP 2: post-checks (read-only). Every row must show found = expected, except INFO rows. ----------
select 'column_count' as check_name, count(*)::text as found, '5' as expected
  from information_schema.columns where table_schema = 'public' and table_name = 'debt_payments'
union all select 'row_security_enabled', relrowsecurity::text, 'true'
  from pg_class where oid = 'public.debt_payments'::regclass
union all select 'policy_count', count(*)::text, '1'
  from pg_policies where schemaname = 'public' and tablename = 'debt_payments'
union all select 'policy_applies_to_authenticated_only', (roles = '{authenticated}'::name[])::text, 'true'
  from pg_policies where schemaname = 'public' and tablename = 'debt_payments' and policyname = 'own debt payments'
union all select 'constraint_count', count(*)::text, '5'
  from pg_constraint where conrelid = 'public.debt_payments'::regclass
union all select 'index_count', count(*)::text, '3'
  from pg_indexes where schemaname = 'public' and tablename = 'debt_payments'
union all select 'trigger_count (user triggers only)', count(*)::text, '1'
  from pg_trigger where tgrelid = 'public.debt_payments'::regclass and not tgisinternal
union all select 'transactions_id_user_key_exists', count(*)::text, '1'
  from pg_constraint where conname = 'transactions_id_user_key' and conrelid = 'public.transactions'::regclass
union all select 'row_count', count(*)::text, '0' from debt_payments
union all select 'INFO_transactions_row_count_after', count(*)::text, 'must equal the STEP 0 value'
  from transactions
union all select 'INFO_transactions_trigger_count_after', count(*)::text, 'must equal the STEP 0 value'
  from pg_trigger where tgrelid = 'public.transactions'::regclass and not tgisinternal
union all select 'INFO_transactions_fingerprint_after', coalesce(md5(string_agg(t::text, '|' order by t.id::text)), 'empty'), 'must equal the STEP 0 value'
  from transactions t;

-- ---------- STEP 3: rollback. DESTRUCTIVE for payment links: deletes the table and every link in it. ----------
-- It never deletes or changes a transaction or a debt. Export first if the table has been used.
-- It removes only what STEP 1 created and leaves transactions exactly as it was before D4a.
-- begin;
-- drop table debt_payments;
-- drop function public.check_debt_payment_expense();
-- alter table transactions drop constraint transactions_id_user_key;
-- commit;
