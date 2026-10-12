-- =====================================================================================
-- P15 (PROPOSED, NOT APPLIED) - database integrity for findings N-11 and N-6.
-- Nothing in this file has been run. Review it, run it yourself in the Supabase SQL
-- editor, in this order: STEP 0 (checks), STEP 1 (migration). STEP 2 undoes STEP 1.
-- Run STEP 1 inside one transaction (BEGIN ... COMMIT) so a failure changes nothing.
-- =====================================================================================

-- ---------- STEP 0: pre-flight checks. EVERY row must show 0 before STEP 1. ----------
select 'tx_account_cross_user' as check_name, count(*) from transactions t join accounts a on a.id = t.account_id where a.user_id <> t.user_id
union all select 'tx_to_account_cross_user', count(*) from transactions t join accounts a on a.id = t.to_account_id where a.user_id <> t.user_id
union all select 'tx_category_cross_user', count(*) from transactions t join categories c on c.id = t.category_id where c.user_id is not null and c.user_id <> t.user_id
union all select 'gc_account_cross_user', count(*) from goal_contributions g join accounts a on a.id = g.account_id where a.user_id <> g.user_id
union all select 'gc_goal_cross_user', count(*) from goal_contributions g join goals o on o.id = g.goal_id where o.user_id <> g.user_id
union all select 'budget_category_cross_user', count(*) from budgets b join categories c on c.id = b.category_id where c.user_id is not null and c.user_id <> b.user_id
union all select 'active_goal_duplicate_names', count(*) from (select user_id, lower(name) from goals where status = 'active' group by 1, 2 having count(*) > 1) d
union all select 'open_learning_duplicate_names', count(*) from (select user_id, lower(name) from learning_items where status <> 'completed' group by 1, 2 having count(*) > 1) d;
-- Result on the live project when this was written (read-only run): all 0.

-- ---------- STEP 1: migration ----------
begin;

-- N-11a. A transaction / contribution may only point at an account or goal that belongs to the same user.
alter table accounts add constraint accounts_id_user_key unique (id, user_id);
alter table goals    add constraint goals_id_user_key    unique (id, user_id);

alter table transactions drop constraint transactions_account_id_fkey;
alter table transactions add  constraint transactions_account_user_fkey
  foreign key (account_id, user_id) references accounts (id, user_id) on delete cascade;

-- N-11b. Same for the transfer destination. It also gets a delete rule: before this, an account that was
-- the destination of a transfer could not be deleted at all. CASCADE matches what already happens to the
-- SOURCE account (its transactions are deleted with it). If you would rather keep the block, change
-- "on delete cascade" to "on delete restrict" and the behaviour stays as it is today.
alter table transactions drop constraint transactions_to_account_id_fkey;
alter table transactions add  constraint transactions_to_account_user_fkey
  foreign key (to_account_id, user_id) references accounts (id, user_id) on delete cascade;

alter table goal_contributions drop constraint goal_contributions_account_id_fkey;
alter table goal_contributions add  constraint goal_contributions_account_user_fkey
  foreign key (account_id, user_id) references accounts (id, user_id) on delete cascade;

alter table goal_contributions drop constraint goal_contributions_goal_id_fkey;
alter table goal_contributions add  constraint goal_contributions_goal_user_fkey
  foreign key (goal_id, user_id) references goals (id, user_id) on delete cascade;

-- N-11c. Categories may be shared defaults (user_id is NULL), so a composite key does not fit.
-- A trigger checks: the category is a default (user_id null) or belongs to the same user.
create or replace function public.check_category_owner() returns trigger
language plpgsql set search_path = public as $$
begin
  if new.category_id is not null and not exists (
    select 1 from categories c where c.id = new.category_id and (c.user_id is null or c.user_id = new.user_id)
  ) then
    raise exception 'category does not belong to this user' using errcode = '23503';
  end if;
  return new;
end $$;

create trigger transactions_category_owner before insert or update of category_id, user_id on transactions
  for each row execute function public.check_category_owner();
create trigger budgets_category_owner before insert or update of category_id, user_id on budgets
  for each row execute function public.check_category_owner();

-- N-6 (database side). Two clicks in the same instant could create two identical goals / learning items.
-- A partial unique index turns the second one into a clean error that the app already shows.
-- Transactions are NOT given a unique rule: paying the same amount twice in a day is legitimate, so a
-- plain unique index would reject real data. See the note in the P15 report (an idempotency key is the
-- only exact fix and needs an app change).
create unique index goals_active_name_per_user on goals (user_id, lower(name)) where status = 'active';
create unique index learning_open_name_per_user on learning_items (user_id, lower(name)) where status <> 'completed';

commit;

-- ---------- STEP 2: rollback (puts everything back as it was) ----------
-- begin;
-- drop index if exists goals_active_name_per_user;
-- drop index if exists learning_open_name_per_user;
-- drop trigger if exists transactions_category_owner on transactions;
-- drop trigger if exists budgets_category_owner on budgets;
-- drop function if exists public.check_category_owner();
-- alter table goal_contributions drop constraint goal_contributions_goal_user_fkey;
-- alter table goal_contributions add  constraint goal_contributions_goal_id_fkey    foreign key (goal_id)    references goals (id)    on delete cascade;
-- alter table goal_contributions drop constraint goal_contributions_account_user_fkey;
-- alter table goal_contributions add  constraint goal_contributions_account_id_fkey foreign key (account_id) references accounts (id) on delete cascade;
-- alter table transactions drop constraint transactions_to_account_user_fkey;
-- alter table transactions add  constraint transactions_to_account_id_fkey foreign key (to_account_id) references accounts (id);
-- alter table transactions drop constraint transactions_account_user_fkey;
-- alter table transactions add  constraint transactions_account_id_fkey   foreign key (account_id)    references accounts (id) on delete cascade;
-- alter table goals    drop constraint goals_id_user_key;
-- alter table accounts drop constraint accounts_id_user_key;
-- commit;
