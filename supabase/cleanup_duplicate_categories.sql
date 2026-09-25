-- CountWise — clean up duplicate onboarding-extra categories
--
-- Root cause: categorySeed.js's seedCategoriesForIncomeType() had no
-- existence check before inserting, so any user whose onboarding ran more
-- than once (confirmed to have happened on the test account) ended up
-- with genuinely duplicate rows for the same STUDENT_EXTRA/EMPLOYED_EXTRA
-- category name. The code itself is now fixed (categorySeed.js checks
-- existing names first) — this file is the one-time data cleanup for
-- rows that were already duplicated before that fix landed.
--
-- Scoped precisely to the six known extra-category names. Never touches
-- any other category name, any default category, or any other user's
-- non-duplicated rows — a user only appears in this script's effects if
-- they genuinely have more than one row with the same name.
--
-- `categories` has no created_at column (confirmed by inspecting
-- schema.sql), so "keep the earliest" isn't literally possible — the
-- survivor is chosen by lowest `id` instead. Since ids are random UUIDs
-- (uuid_generate_v4()), this is an arbitrary but fully deterministic
-- tiebreak, not a true chronological choice. It doesn't matter which
-- physical row survives — both duplicate rows have identical name/kind,
-- so nothing user-visible changes.
--
-- Safe to run more than once: the second run finds no duplicates and
-- does nothing.

-- ============================================================
-- STEP 1 — report what will be affected (read-only, run this first)
-- ============================================================
select
  user_id,
  name,
  count(*) as duplicate_count,
  array_agg(id order by id) as category_ids
from categories
where name in ('Tuition Fees', 'Hostel/Mess', 'Course Fees', 'Rent', 'EMI/Loan', 'Investments')
  and user_id is not null
group by user_id, name
having count(*) > 1
order by user_id, name;

-- ============================================================
-- STEP 2 — merge duplicates (only affects rows Step 1 reported)
-- ============================================================
do $$
declare
  dup record;
  survivor_id uuid;
  loser record;
  rules_moved int;
  transactions_moved int;
begin
  for dup in
    select user_id, name
    from categories
    where name in ('Tuition Fees', 'Hostel/Mess', 'Course Fees', 'Rent', 'EMI/Loan', 'Investments')
      and user_id is not null
    group by user_id, name
    having count(*) > 1
  loop
    select id into survivor_id
    from categories
    where user_id = dup.user_id and name = dup.name
    order by id
    limit 1;

    for loser in
      select id from categories
      where user_id = dup.user_id and name = dup.name and id <> survivor_id
    loop
      update category_rules set category_id = survivor_id where category_id = loser.id;
      get diagnostics rules_moved = row_count;

      update transactions set category_id = survivor_id where category_id = loser.id;
      get diagnostics transactions_moved = row_count;

      delete from categories where id = loser.id;

      raise notice 'user %: merged "%" — removed category %, reassigned % rule(s) and % transaction(s) to survivor %',
        dup.user_id, dup.name, loser.id, rules_moved, transactions_moved, survivor_id;
    end loop;
  end loop;
end $$;

-- ============================================================
-- STEP 3 — confirm the cleanup (should return zero rows)
-- ============================================================
select user_id, name, count(*)
from categories
where name in ('Tuition Fees', 'Hostel/Mess', 'Course Fees', 'Rent', 'EMI/Loan', 'Investments')
  and user_id is not null
group by user_id, name
having count(*) > 1;
