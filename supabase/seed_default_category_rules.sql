-- CountWise — default category_rules seed
--
-- Root cause: DEFAULT_RULE_KEYWORDS (src/lib/categorization.js) was written
-- but never used anywhere to actually populate category_rules. schema.sql
-- seeded the shared default `categories` rows but never the matching
-- `category_rules` rows, so matchCategory() always had nothing to match
-- against for a fresh/default category — the parsing/matching code itself
-- is correct and untouched by this fix.
--
-- Safe to re-run: every insert is guarded with `where not exists (...)`,
-- so running this against a database that already has some or all of
-- these rows (e.g. from earlier ad-hoc testing) will not create
-- duplicates. No unique constraint was added for this — category_rules
-- has none today, and adding one isn't necessary for a NOT EXISTS guard,
-- so this stays a pure data change, not a schema structure change.
--
-- Each block pairs keywords with a priority via unnest(array[...], array[...]).
-- Priority is 0 for every keyword except one: 'tuition fee' (Education,
-- expense) is set to priority 1 because it overlaps with the bare keyword
-- 'tuition' (Tuition/Freelance income, income) — the text "tuition fee 5000"
-- contains both as substrings, and matchCategory() resolves ties by taking
-- the highest priority, so this makes "tuition fee ..." resolve to
-- Education (an expense) rather than the income category. Bare "tuition"
-- with no "fee" still correctly resolves to Tuition/Freelance income.

-- Food (expense)
insert into category_rules (user_id, keyword, category_id, priority)
select null, k.keyword, c.id, k.priority
from categories c,
  unnest(
    array['coffee','lunch','dinner','breakfast','snack','restaurant','zomato','swiggy','tea','canteen'],
    array[0,0,0,0,0,0,0,0,0,0]
  ) as k(keyword, priority)
where c.name = 'Food' and c.is_default = true
  and not exists (
    select 1 from category_rules cr
    where cr.user_id is null and cr.category_id = c.id and cr.keyword = k.keyword
  );

-- Transport (expense)
insert into category_rules (user_id, keyword, category_id, priority)
select null, k.keyword, c.id, k.priority
from categories c,
  unnest(
    array['uber','ola','bus','metro','auto','taxi','train'],
    array[0,0,0,0,0,0,0]
  ) as k(keyword, priority)
where c.name = 'Transport' and c.is_default = true
  and not exists (
    select 1 from category_rules cr
    where cr.user_id is null and cr.category_id = c.id and cr.keyword = k.keyword
  );

-- Fuel (expense) — split out from Transport so petrol/diesel spending is
-- distinguishable from bus/uber/metro spending in reports
insert into category_rules (user_id, keyword, category_id, priority)
select null, k.keyword, c.id, k.priority
from categories c,
  unnest(
    array['petrol','diesel','fuel','gas station'],
    array[0,0,0,0]
  ) as k(keyword, priority)
where c.name = 'Fuel' and c.is_default = true
  and not exists (
    select 1 from category_rules cr
    where cr.user_id is null and cr.category_id = c.id and cr.keyword = k.keyword
  );

-- Entertainment (expense)
insert into category_rules (user_id, keyword, category_id, priority)
select null, k.keyword, c.id, k.priority
from categories c,
  unnest(
    array['movie','netflix','spotify','game','party','outing'],
    array[0,0,0,0,0,0]
  ) as k(keyword, priority)
where c.name = 'Entertainment' and c.is_default = true
  and not exists (
    select 1 from category_rules cr
    where cr.user_id is null and cr.category_id = c.id and cr.keyword = k.keyword
  );

-- Bills & Utilities (expense)
insert into category_rules (user_id, keyword, category_id, priority)
select null, k.keyword, c.id, k.priority
from categories c,
  unnest(
    array['recharge','electricity','rent','wifi','phone bill','subscription'],
    array[0,0,0,0,0,0]
  ) as k(keyword, priority)
where c.name = 'Bills & Utilities' and c.is_default = true
  and not exists (
    select 1 from category_rules cr
    where cr.user_id is null and cr.category_id = c.id and cr.keyword = k.keyword
  );

-- Education (expense) — 'tuition fee' gets priority 1, see note above
insert into category_rules (user_id, keyword, category_id, priority)
select null, k.keyword, c.id, k.priority
from categories c,
  unnest(
    array['book','course','certification','exam fee','tuition fee','stationery'],
    array[0,0,0,0,1,0]
  ) as k(keyword, priority)
where c.name = 'Education' and c.is_default = true
  and not exists (
    select 1 from category_rules cr
    where cr.user_id is null and cr.category_id = c.id and cr.keyword = k.keyword
  );

-- Shopping (expense)
insert into category_rules (user_id, keyword, category_id, priority)
select null, k.keyword, c.id, k.priority
from categories c,
  unnest(
    array['amazon','flipkart','clothes','shoes'],
    array[0,0,0,0]
  ) as k(keyword, priority)
where c.name = 'Shopping' and c.is_default = true
  and not exists (
    select 1 from category_rules cr
    where cr.user_id is null and cr.category_id = c.id and cr.keyword = k.keyword
  );

-- Health (expense)
insert into category_rules (user_id, keyword, category_id, priority)
select null, k.keyword, c.id, k.priority
from categories c,
  unnest(
    array['pharmacy','doctor','medicine','gym'],
    array[0,0,0,0]
  ) as k(keyword, priority)
where c.name = 'Health' and c.is_default = true
  and not exists (
    select 1 from category_rules cr
    where cr.user_id is null and cr.category_id = c.id and cr.keyword = k.keyword
  );

-- Salary (income)
insert into category_rules (user_id, keyword, category_id, priority)
select null, k.keyword, c.id, k.priority
from categories c,
  unnest(
    array['salary','stipend'],
    array[0,0]
  ) as k(keyword, priority)
where c.name = 'Salary' and c.is_default = true
  and not exists (
    select 1 from category_rules cr
    where cr.user_id is null and cr.category_id = c.id and cr.keyword = k.keyword
  );

-- Tuition/Freelance income (income)
insert into category_rules (user_id, keyword, category_id, priority)
select null, k.keyword, c.id, k.priority
from categories c,
  unnest(
    array['tuition','freelance','client payment'],
    array[0,0,0]
  ) as k(keyword, priority)
where c.name = 'Tuition/Freelance income' and c.is_default = true
  and not exists (
    select 1 from category_rules cr
    where cr.user_id is null and cr.category_id = c.id and cr.keyword = k.keyword
  );

-- Allowance (income)
insert into category_rules (user_id, keyword, category_id, priority)
select null, k.keyword, c.id, k.priority
from categories c,
  unnest(
    array['allowance','pocket money'],
    array[0,0]
  ) as k(keyword, priority)
where c.name = 'Allowance' and c.is_default = true
  and not exists (
    select 1 from category_rules cr
    where cr.user_id is null and cr.category_id = c.id and cr.keyword = k.keyword
  );
