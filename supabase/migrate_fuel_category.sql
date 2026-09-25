-- CountWise — migrate existing database for the Fuel category split
--
-- This is ONLY for a database that was already seeded before this change
-- (i.e. already ran the original supabase/schema.sql or
-- seed_default_category_rules.sql, which lumped petrol/fuel keywords into
-- Transport). A brand-new project running the current schema.sql from
-- scratch gets Fuel right from the start and never needs this file.
--
-- Two separate steps, run in order. Both are safe to re-run.

-- ============================================================
-- STEP 1 — add the new 'Fuel' category (if it isn't there yet)
-- ============================================================
insert into categories (name, kind, icon, is_default)
select 'Fuel', 'expense', 'fuel', true
where not exists (
  select 1 from categories where name = 'Fuel' and is_default = true
);

-- ============================================================
-- STEP 2 — migrate category_rules to point at Fuel instead of Transport
-- ============================================================

-- 2a. Existing 'petrol' / 'fuel' rows that were seeded against Transport:
-- update them in place to point at the new Fuel category, rather than
-- delete+reinsert, so the row (and its id) is preserved. The WHERE clause
-- only matches rows that actually exist and still point at Transport, so
-- this is a no-op — not an error — on a database where the original seed
-- was never applied, or where this migration already ran once.
update category_rules cr
set category_id = fuel.id
from categories transport, categories fuel
where cr.user_id is null
  and cr.keyword in ('petrol', 'fuel')
  and cr.category_id = transport.id
  and transport.name = 'Transport'
  and transport.is_default = true
  and fuel.name = 'Fuel'
  and fuel.is_default = true;

-- 2b. New keywords for Fuel that never existed under Transport at all
-- ('diesel', 'gas station') — plain guarded insert, same pattern as every
-- other category block in seed_default_category_rules.sql.
insert into category_rules (user_id, keyword, category_id, priority)
select null, k.keyword, c.id, k.priority
from categories c,
  unnest(
    array['diesel','gas station'],
    array[0,0]
  ) as k(keyword, priority)
where c.name = 'Fuel' and c.is_default = true
  and not exists (
    select 1 from category_rules cr
    where cr.user_id is null and cr.category_id = c.id and cr.keyword = k.keyword
  );

-- Sanity check after running both steps — should show exactly 4 rows,
-- all pointing at Fuel: petrol, fuel, diesel, gas station.
-- select cr.keyword, cr.priority from category_rules cr
-- join categories c on c.id = cr.category_id
-- where c.name = 'Fuel' and cr.user_id is null;
