-- CountWise — Phase 32.1: Spending Context (transactions.spending_context)
--
-- Standalone version of the block also appended to supabase/schema.sql,
-- for running once directly against the live Supabase project — the same
-- dual-file convention as every other phase migration here.
--
-- RUN THIS BEFORE deploying the app code that reads the column. The
-- Transactions page selects `spending_context` explicitly; if the code
-- goes live first, that query fails ("column does not exist") and the page
-- breaks. Run this, run the check query at the bottom, then deploy.
--
-- What it adds: one optional label on an EXPENSE saying why it was spent —
-- one of a closed set (planned / routine / social / unplanned). No free
-- text, by design: this is a tag, not a journal. It records context and
-- never changes a balance, an income figure or an expense total.
--
-- Safe to re-run: `add column if not exists` and the guarded constraint
-- blocks below do nothing the second time.
--
-- Additive only. Nullable, no default — every existing transaction keeps
-- spending_context = null. No existing row is rewritten, and the new
-- constraints are satisfied by null, so adding them cannot fail on
-- existing data.
--
-- Two constraints, both deliberate:
--   transactions_spending_context_valid   only the four allowed values
--   transactions_context_only_expense     context may exist ONLY on an
--                                         expense — never on income or a
--                                         transfer. This is why the app
--                                         must send null when a user edits
--                                         an expense into another type.
--
-- No RLS change needed: transactions' existing "own transactions" policy
-- is row-level (`using (auth.uid() = user_id)`), not column-level, so it
-- already covers this column. Verified against a real Postgres, not
-- assumed.
--
-- The list of allowed values below must match src/lib/spendingContext.js;
-- src/lib/spendingContext.test.js fails if they ever drift apart.
--
-- Rollback (loses only the tags, nothing else):
--   alter table transactions drop column spending_context;
--   (dropping the column also drops both constraints)

alter table transactions add column if not exists spending_context text;

do $$
begin
  if not exists (
    select 1 from pg_constraint
    where conname = 'transactions_spending_context_valid'
      and conrelid = 'public.transactions'::regclass
  ) then
    alter table transactions add constraint transactions_spending_context_valid
      check (spending_context in ('planned','routine','social','unplanned'));
  end if;

  if not exists (
    select 1 from pg_constraint
    where conname = 'transactions_context_only_expense'
      and conrelid = 'public.transactions'::regclass
  ) then
    alter table transactions add constraint transactions_context_only_expense
      check (spending_context is null or type = 'expense');
  end if;
end
$$;

-- ---------------------------------------------------------------------
-- CHECK QUERY — run after the block above; expect 1 row for the column
-- and 2 rows for the constraints:
--
--   select column_name, data_type, is_nullable
--   from information_schema.columns
--   where table_name = 'transactions' and column_name = 'spending_context';
--
--   select conname from pg_constraint
--   where conrelid = 'public.transactions'::regclass
--     and conname in ('transactions_spending_context_valid', 'transactions_context_only_expense');
-- ---------------------------------------------------------------------
