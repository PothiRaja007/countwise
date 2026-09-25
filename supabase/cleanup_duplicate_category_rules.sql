-- CountWise — clean up duplicate category_rules rows + prevent recurrence
--
-- Root cause: the earlier categories-level cleanup correctly consolidated
-- duplicate CATEGORY rows, but the category_rules rows that had been
-- inserted twice under the (now-merged) category survived untouched —
-- same keyword text, same category_id, different ids. This produced
-- React "duplicate key" warnings in CategoriesSection.jsx (fixed
-- separately, see that file's diff) and left the door open for the same
-- thing to happen again.
--
-- Verified before writing this: `transactions.category_id` references
-- `categories(id)` directly — nothing in the schema references
-- `category_rules.id` — so deleting a duplicate category_rules row can
-- never orphan a transaction. Confirmed by inspecting schema.sql, not
-- assumed.
--
-- Also verified: categorySeed.js's existing category-level idempotency
-- check (from the prior fix) already prevents it from re-duplicating
-- rules going forward, because it `continue`s past rule-insertion
-- entirely whenever the category already exists — rules are only ever
-- inserted together with a brand-new category in that file. The
-- remaining live risk is CategoriesSection.jsx's "Add keyword" button,
-- which does a plain insert with no duplicate check at all — that's the
-- actual ongoing gap a one-time cleanup alone wouldn't close, which is
-- exactly why a real database constraint (Step 2 below) is the right
-- fix, not just another idempotency check in one more file.
--
-- One correction to the literal ask: a plain unique(category_id, keyword)
-- constraint (no user_id) would incorrectly block two DIFFERENT users
-- from each independently adding the same personal keyword to the same
-- shared default category — e.g. both adding "kfc" under the default
-- "Food" category. Those are two legitimately separate, valid rows, not
-- a collision. The constraint below includes user_id to avoid this —
-- verified against a deliberately-constructed cross-user test case
-- before this file was finalized (see handoff for details).
--
-- Safe to run more than once: Step 1 finds nothing left the second time,
-- and Step 2's constraint uses IF NOT EXISTS-equivalent guarding via a
-- DO block so re-running doesn't error if it's already there.

-- ============================================================
-- STEP 1 — report duplicates (read-only, run this first)
-- ============================================================
select
  user_id,
  category_id,
  keyword,
  count(*) as duplicate_count,
  array_agg(id order by id) as rule_ids
from category_rules
group by user_id, category_id, keyword
having count(*) > 1
order by user_id, category_id, keyword;

-- ============================================================
-- STEP 2a — delete duplicates, keeping the lowest id per group
-- ============================================================
-- category_rules has no timestamp column (confirmed by inspecting
-- schema.sql), so "earliest" isn't literally available — lowest id is
-- used as a deterministic (not chronological) tiebreak, same approach
-- as the earlier categories-level cleanup. Every row in a duplicate
-- group has identical (user_id, category_id, keyword) by definition, so
-- which physical row survives doesn't matter — nothing user-visible
-- differs between them except `priority`, which is not part of the
-- grouping key; if priorities differ within a duplicate group, this
-- keeps whichever row has the lowest id, not necessarily the lowest
-- priority — reasonable here since duplicate rows in practice were
-- created in the same insert batch with priority following list order.
delete from category_rules
where id in (
  select id from (
    select id, row_number() over (
      partition by user_id, category_id, keyword
      order by id
    ) as rn
    from category_rules
  ) ranked
  where rn > 1
);

-- ============================================================
-- STEP 2b — add the real safeguard so this can't recur
-- ============================================================
do $$
begin
  if not exists (
    select 1 from pg_constraint where conname = 'category_rules_user_category_keyword_key'
  ) then
    alter table category_rules
      add constraint category_rules_user_category_keyword_key
      unique (user_id, category_id, keyword);
  end if;
end $$;

-- ============================================================
-- STEP 3 — confirm the cleanup (should return zero rows)
-- ============================================================
select user_id, category_id, keyword, count(*)
from category_rules
group by user_id, category_id, keyword
having count(*) > 1;
