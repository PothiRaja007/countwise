-- CountWise — v1 schema
-- DOCUMENTATION SYNC (this file previously described an older draft schema
-- that no longer matches what is live in Supabase — see DATA_MODEL.md for
-- the full history note). This version matches the actual Phase 1 schema,
-- verified live in Supabase, as of Phase 3 completion. The database itself
-- was never wrong; only this file was out of date.
--
-- Run in Supabase SQL editor. Assumes Supabase auth (auth.users) is enabled.
-- If your project already has the OLD version of this schema applied,
-- do not re-run this file blindly — it will conflict with existing tables.
-- Talk through a migration path instead of dropping/recreating live data.

create extension if not exists "uuid-ossp";

create table accounts (
  id uuid primary key default uuid_generate_v4(),
  user_id uuid not null references auth.users(id) on delete cascade,
  name text not null,
  type text not null check (type in ('wallet','bank')),
  is_default boolean not null default false,
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
  -- NOTE: deliberately no `balance` column. Balance is never stored —
  -- it is always computed live from `transactions`
  -- (income - expenses + transfers_in - transfers_out). See financialEngine.js.
);

create table profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  income_type text check (income_type in ('student','employed','mixed')),
  onboarding_complete boolean not null default false,
  default_account_id uuid references accounts(id),
  dark_mode boolean not null default false,
  created_at timestamptz not null default now()
);

create table categories (
  id uuid primary key default uuid_generate_v4(),
  user_id uuid references auth.users(id) on delete cascade,
  name text not null,
  kind text not null check (kind in ('income','expense')),
  icon text,
  is_default boolean not null default false
);

create table category_rules (
  id uuid primary key default uuid_generate_v4(),
  user_id uuid references auth.users(id) on delete cascade,
  keyword text not null,
  category_id uuid not null references categories(id) on delete cascade,
  priority int not null default 0
);

create table transactions (
  id uuid primary key default uuid_generate_v4(),
  user_id uuid not null references auth.users(id) on delete cascade,
  account_id uuid not null references accounts(id) on delete cascade,
  to_account_id uuid references accounts(id) on delete cascade, -- transfers only
  category_id uuid references categories(id) on delete set null,
  type text not null check (type in ('expense','income','transfer')),
  amount numeric not null check (amount > 0), -- always positive; sign implied by `type`
  description text,
  transaction_date date not null default current_date,
  original_input text, -- raw Money Inbox text this row came from, for traceability
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- Renamed from the original "pots" table. No data was lost - the table
-- was empty at migration time. `current_amount` was removed: goal progress
-- is computed live from goal_contributions, not stored (same principle as
-- account balance).
create table goals (
  id uuid primary key default uuid_generate_v4(),
  user_id uuid not null references auth.users(id) on delete cascade,
  name text not null,
  target_amount numeric not null,
  target_date date,
  status text not null default 'active' check (status in ('active','completed','archived')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- New table. A goal contribution is an allocation, not an expense - it
-- never touches `transactions`. It reduces an account's *available*
-- (unallocated) amount without changing its real balance.
create table goal_contributions (
  id uuid primary key default uuid_generate_v4(),
  user_id uuid not null references auth.users(id) on delete cascade,
  goal_id uuid not null references goals(id) on delete cascade,
  account_id uuid not null references accounts(id) on delete cascade,
  amount numeric not null check (amount > 0),
  type text not null check (type in ('contribution','withdrawal')),
  contribution_date date not null default current_date,
  created_at timestamptz not null default now()
);

create table learning_items (
  id uuid primary key default uuid_generate_v4(),
  user_id uuid not null references auth.users(id) on delete cascade,
  name text not null,
  cost numeric not null default 0,
  relevance_tag text,
  target_date date,
  progress_pct int not null default 0 check (progress_pct between 0 and 100),
  status text not null default 'planned' check (status in ('planned','in_progress','completed','dropped'))
);

create table behavior_flags (
  id uuid primary key default uuid_generate_v4(),
  user_id uuid not null references auth.users(id) on delete cascade,
  flag_type text not null,
  description text not null,
  severity int not null check (severity between 1 and 3),
  period_start date not null,
  period_end date not null
);

-- Snapshot table for future performance optimization. Not read from in v1 -
-- Behavior Score is computed live from transactions/goals. Kept so a later
-- phase can start persisting computed scores without a schema change.
create table behavior_scores (
  id uuid primary key default uuid_generate_v4(),
  user_id uuid not null references auth.users(id) on delete cascade,
  period_start date not null,
  period_end date not null,
  stars numeric not null check (stars between 1 and 5),
  flag_ids uuid[] default '{}'
);

-- Row Level Security: every table scoped to owning user
alter table profiles enable row level security;
alter table accounts enable row level security;
alter table categories enable row level security;
alter table category_rules enable row level security;
alter table transactions enable row level security;
alter table goals enable row level security;
alter table goal_contributions enable row level security;
alter table learning_items enable row level security;
alter table behavior_flags enable row level security;
alter table behavior_scores enable row level security;

create policy "own profile" on profiles for all using (auth.uid() = id) with check (auth.uid() = id);
create policy "own accounts" on accounts for all using (auth.uid() = user_id) with check (auth.uid() = user_id);

-- categories/category_rules: precise split policy. Everyone can READ shared
-- default rows (user_id is null); only the owner can insert/update/delete
-- their own rows. A blanket policy here was caught as a bug in Phase 1 -
-- it would have let any user delete the shared default categories.
create policy "own or default categories" on categories for select using (user_id is null or auth.uid() = user_id);
create policy "insert own categories" on categories for insert with check (auth.uid() = user_id);
create policy "update own categories" on categories for update using (auth.uid() = user_id);
create policy "delete own categories" on categories for delete using (auth.uid() = user_id);

create policy "own or default rules" on category_rules for select using (user_id is null or auth.uid() = user_id);
create policy "insert own rules" on category_rules for insert with check (auth.uid() = user_id);
create policy "update own rules" on category_rules for update using (auth.uid() = user_id);
create policy "delete own rules" on category_rules for delete using (auth.uid() = user_id);

create policy "own transactions" on transactions for all using (auth.uid() = user_id) with check (auth.uid() = user_id);
create policy "own goals" on goals for all using (auth.uid() = user_id) with check (auth.uid() = user_id);
create policy "own goal contributions" on goal_contributions for all using (auth.uid() = user_id) with check (auth.uid() = user_id);
create policy "own learning items" on learning_items for all using (auth.uid() = user_id) with check (auth.uid() = user_id);
create policy "own behavior flags" on behavior_flags for all using (auth.uid() = user_id) with check (auth.uid() = user_id);
create policy "own behavior scores" on behavior_scores for all using (auth.uid() = user_id) with check (auth.uid() = user_id);

-- Seed default categories (kind, name, icon) - shared, user_id null
insert into categories (name, kind, icon, is_default) values
  ('Food', 'expense', 'utensils', true),
  ('Transport', 'expense', 'bus', true),
  ('Fuel', 'expense', 'fuel', true),
  ('Entertainment', 'expense', 'film', true),
  ('Bills & Utilities', 'expense', 'file-text', true),
  ('Education', 'expense', 'book', true),
  ('Shopping', 'expense', 'shopping-bag', true),
  ('Health', 'expense', 'heart', true),
  ('Other', 'expense', 'more-horizontal', true),
  ('Salary', 'income', 'briefcase', true),
  ('Tuition/Freelance income', 'income', 'user', true),
  ('Allowance', 'income', 'gift', true),
  ('Other income', 'income', 'plus-circle', true);

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

-- ============================================
-- PHASE 13: v1.1 database foundation
-- ============================================
-- Begins CountWise v1.1. v1 (Phases 1–12 plus two post-launch fixes) is
-- complete, tested, and frozen — this is a pure schema-addition phase,
-- no existing table or application code is touched.

-- 1. PROFILES: add username as a display name only.
--    Explicitly NOT unique, NOT used for auth/login — purely cosmetic.
alter table profiles add column if not exists username text;

-- 2. BUDGETS: monthly-only category spending limits.
create table if not exists budgets (
  id uuid primary key default uuid_generate_v4(),
  user_id uuid not null references auth.users(id) on delete cascade,
  category_id uuid not null references categories(id) on delete cascade,
  amount numeric not null check (amount > 0),
  period_type text not null default 'monthly' check (period_type in ('monthly')),
  period_start date not null,
  period_end date not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (user_id, category_id, period_start)
);

alter table budgets enable row level security;
create policy "own budgets" on budgets for all
  using (auth.uid() = user_id) with check (auth.uid() = user_id);

-- 3. USER_PREFERENCES: notification settings + timezone.
--    One row per user. No dashboard_preferences column — that feature
--    was cut from v1.1, don't add a column for it speculatively.
create table if not exists user_preferences (
  user_id uuid primary key references auth.users(id) on delete cascade,
  notification_enabled boolean not null default true,
  reminder_after_days int not null default 2 check (reminder_after_days > 0),
  timezone text not null default 'UTC',
  last_reminder_sent_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table user_preferences enable row level security;
create policy "own preferences" on user_preferences for all
  using (auth.uid() = user_id) with check (auth.uid() = user_id);

-- Subphase 23A.2: successful-login notification toggle. Its own column,
-- deliberately not a reuse of notification_enabled above (that one means
-- "inactivity reminders on/off" from Phase 20 — a different, independently
-- toggleable concern). Defaults true, matching notification_enabled's own
-- default. See supabase/phase23a2_login_notifications.sql for the
-- standalone version of this same statement.
alter table user_preferences add column if not exists login_notifications_enabled boolean not null default true;

-- 4. CATEGORY_RULES: prevent duplicate (user_id, category_id, keyword) rows.
--    Fixes a real gap — CategoriesSection.jsx's "Add keyword" had no
--    duplicate check, and a fresh project should never be able to hit
--    this bug at all. Scoped by user_id (not just category_id+keyword)
--    so two different users can each independently add the same personal
--    keyword to the same shared default category without colliding.
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

-- ============================================
-- PHASE 17.1: Budget Recipe / Budget Inbox category corrections
-- ============================================
-- The default category set was missing several categories common enough
-- that budgeting for them as their own line item (not lumped into a
-- broader bucket) is the whole point of a monthly budget: Rent, Mobile
-- Recharge, Wi-Fi/Internet, Groceries, Juice/Refreshments, Subscriptions.
--
-- Where a keyword already existed under a broader category and now
-- belongs under one of these more specific ones, it's removed from its
-- old category first, then re-added under the new one — the same
-- non-duplicating approach already used for the earlier Fuel/Transport
-- split above. Safe to re-run: every insert stays guarded with
-- `where not exists (...)`, and each delete only targets the exact
-- shared-default (user_id is null) keyword rows being moved.

-- 'rent' and 'wifi' move from Bills & Utilities to their own categories.
delete from category_rules
where user_id is null
  and keyword in ('rent', 'wifi')
  and category_id in (select id from categories where name = 'Bills & Utilities' and is_default = true);

-- 'subscription' moves from Bills & Utilities to the new Subscriptions category.
delete from category_rules
where user_id is null
  and keyword = 'subscription'
  and category_id in (select id from categories where name = 'Bills & Utilities' and is_default = true);

-- 'netflix'/'spotify' move from Entertainment to Subscriptions — Entertainment
-- keeps 'movie'/'game'/'party'/'outing', which are genuinely a different kind
-- of spending than a recurring subscription payment.
delete from category_rules
where user_id is null
  and keyword in ('netflix', 'spotify')
  and category_id in (select id from categories where name = 'Entertainment' and is_default = true);

insert into categories (name, kind, icon, is_default)
select v.name, v.kind, v.icon, true
from (values
  ('Rent', 'expense', 'home'),
  ('Mobile Recharge', 'expense', 'smartphone'),
  ('Wi-Fi/Internet', 'expense', 'wifi'),
  ('Groceries', 'expense', 'shopping-cart'),
  ('Juice/Refreshments', 'expense', 'cup-soda'),
  ('Subscriptions', 'expense', 'repeat')
) as v(name, kind, icon)
where not exists (
  select 1 from categories c where c.name = v.name and c.is_default = true
);

-- Rent
insert into category_rules (user_id, keyword, category_id, priority)
select null, k.keyword, c.id, k.priority
from categories c,
  unnest(
    array['rent','house rent','room rent'],
    array[0,0,0]
  ) as k(keyword, priority)
where c.name = 'Rent' and c.is_default = true
  and not exists (
    select 1 from category_rules cr
    where cr.user_id is null and cr.category_id = c.id and cr.keyword = k.keyword
  );

-- Mobile Recharge
insert into category_rules (user_id, keyword, category_id, priority)
select null, k.keyword, c.id, k.priority
from categories c,
  unnest(
    array['mobile recharge','phone recharge','mobile bill','phone bill','recharge','mobile'],
    array[0,0,0,0,0,0]
  ) as k(keyword, priority)
where c.name = 'Mobile Recharge' and c.is_default = true
  and not exists (
    select 1 from category_rules cr
    where cr.user_id is null and cr.category_id = c.id and cr.keyword = k.keyword
  );

-- Wi-Fi/Internet
insert into category_rules (user_id, keyword, category_id, priority)
select null, k.keyword, c.id, k.priority
from categories c,
  unnest(
    array['wifi','wi-fi','internet','broadband'],
    array[0,0,0,0]
  ) as k(keyword, priority)
where c.name = 'Wi-Fi/Internet' and c.is_default = true
  and not exists (
    select 1 from category_rules cr
    where cr.user_id is null and cr.category_id = c.id and cr.keyword = k.keyword
  );

-- Groceries
insert into category_rules (user_id, keyword, category_id, priority)
select null, k.keyword, c.id, k.priority
from categories c,
  unnest(
    array['grocery','groceries','supermarket'],
    array[0,0,0]
  ) as k(keyword, priority)
where c.name = 'Groceries' and c.is_default = true
  and not exists (
    select 1 from category_rules cr
    where cr.user_id is null and cr.category_id = c.id and cr.keyword = k.keyword
  );

-- Juice/Refreshments — deliberately doesn't reuse 'snack' (singular),
-- which stays a Food keyword, to avoid the same word routing to two
-- categories depending on plurality.
insert into category_rules (user_id, keyword, category_id, priority)
select null, k.keyword, c.id, k.priority
from categories c,
  unnest(
    array['juice','refreshment','refreshments'],
    array[0,0,0]
  ) as k(keyword, priority)
where c.name = 'Juice/Refreshments' and c.is_default = true
  and not exists (
    select 1 from category_rules cr
    where cr.user_id is null and cr.category_id = c.id and cr.keyword = k.keyword
  );

-- Subscriptions
insert into category_rules (user_id, keyword, category_id, priority)
select null, k.keyword, c.id, k.priority
from categories c,
  unnest(
    array['subscription','subscriptions','netflix','spotify'],
    array[0,0,0,0]
  ) as k(keyword, priority)
where c.name = 'Subscriptions' and c.is_default = true
  and not exists (
    select 1 from category_rules cr
    where cr.user_id is null and cr.category_id = c.id and cr.keyword = k.keyword
  );

-- Food: add the literal phrase "eating out" (existing keywords like
-- 'restaurant'/'zomato'/'swiggy' already cover dining out implicitly, but
-- that exact phrase wasn't itself a keyword yet).
insert into category_rules (user_id, keyword, category_id, priority)
select null, k.keyword, c.id, k.priority
from categories c,
  unnest(
    array['eating out'],
    array[0]
  ) as k(keyword, priority)
where c.name = 'Food' and c.is_default = true
  and not exists (
    select 1 from category_rules cr
    where cr.user_id is null and cr.category_id = c.id and cr.keyword = k.keyword
  );

-- ============================================
-- PHASE 23.1: Life-Stage Architecture — employee_subtype
-- ============================================
-- Additive only, same pattern as every prior single-column addition to
-- profiles (username in Phase 13's block above). Nullable, no default,
-- zero risk to existing rows — an existing profile simply has
-- employee_subtype = null until the user is prompted (Subphase 23.2) or
-- sets it themselves (Subphase 23.3).
--
-- Reuses the existing profiles.income_type ('student'/'employed'/'mixed')
-- rather than introducing a separate life_stage classification table —
-- employee_subtype only ever has meaning alongside an income_type of
-- 'employed' or 'mixed'; see src/lib/lifeStage.js for the decision logic
-- that governs when a user is actually prompted for it.
--
-- No RLS change needed: the existing "own profile" policy
-- (`for all using (auth.uid() = id) with check (auth.uid() = id)`) is a
-- row-level policy, not a column-level one, so it already covers reads
-- and writes to this new column exactly as it does every other column on
-- profiles. Confirmed by inspection, not assumed.
alter table profiles add column if not exists employee_subtype text
  check (employee_subtype in ('fresher','already_working'));

-- ============================================
-- SUBPHASE 24.1: CTC Explorer data model
-- ============================================
-- Documentation-sync note (found and fixed during Subphase 25.1's repo
-- inspection): this block was written to supabase/phase24_1_ctc_explorer.sql
-- and supabase/schema_sql_appended_block.sql, with a comment claiming it
-- was "also appended to schema.sql" — but that merge never actually
-- happened until now. If ctc_explorations/ctc_components were run live
-- from phase24_1_ctc_explorer.sql directly, the live database was likely
-- fine; only this file (the intended single source of truth for the
-- schema) was missing them. Same class of gap as the original
-- schema.sql/DATA_MODEL.md drift from early in this project — worth a
-- quick live check per this subphase's own instructions, not assumed fixed
-- just because this file now has it.
--
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

-- ============================================
-- SUBPHASE 25.1: Salary data model
-- ============================================
-- See supabase/phase25_1_salary.sql for the standalone version and full
-- rationale. Appended here directly in this same subphase — deliberately
-- not left as a separate unintegrated "appended block" file, since that
-- pattern is what caused the ctc_explorations/ctc_components gap found
-- and fixed above.

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

-- ============================================
-- PHASE 27: Versioned Financial Rules (financial_rules)
-- ============================================
-- Appended here directly, in this same subphase — not left as only a
-- standalone file with a comment claiming it was merged. That exact gap
-- (see SUBPHASE 24.1's note above) is what caused the
-- ctc_explorations/ctc_components table-not-found bug once already.
-- Full rationale in supabase/phase27_financial_rules.sql.
--
-- Shared reference data, not user-owned — no user_id column. RLS: any
-- authenticated user can SELECT; no insert/update/delete policy exists
-- at all, so those are blocked by default (Postgres RLS denies any
-- operation with no matching policy) — writes happen only via direct
-- database access for now, no admin workflow yet.
--
-- The partial unique index (one row per (scheme, rule_key) with
-- effective_to is null) is what actually enforces "never just take the
-- latest rule" — see src/lib/financialRules.js for the read-side logic
-- this makes possible.

create table if not exists financial_rules (
  id uuid primary key default uuid_generate_v4(),
  scheme text not null,
  rule_key text not null,
  value numeric not null,
  unit text not null,
  effective_from date not null,
  effective_to date,
  source_url text,
  retrieved_at timestamptz,
  verification_status text not null default 'needs_review' check (verification_status in ('needs_review','verified')),
  created_at timestamptz not null default now()
);

create unique index if not exists financial_rules_one_active_per_key
  on financial_rules (scheme, rule_key) where effective_to is null;

alter table financial_rules enable row level security;

do $$
begin
  if not exists (
    select 1 from pg_policies
    where tablename = 'financial_rules' and policyname = 'financial_rules readable by authenticated users'
  ) then
    create policy "financial_rules readable by authenticated users" on financial_rules
      for select to authenticated using (true);
  end if;
end $$;

-- Seeded rates — sourced from the EPFO's own FAQ page
-- (https://www.epfindia.gov.in/site_en/FAQ.php/FAQ.php): employee EPF
-- contribution 12%, employer's 12% split into 3.67% EPF + 8.33% EPS.
-- effective_from records when this row was verified and entered into
-- CountWise, not a claimed historical circular date (not something a
-- search could pin down with confidence — see the standalone file for
-- the full note). EPS wage ceiling (₹15,000/month) deliberately NOT
-- seeded here — flagged as a Phase 26 gap in this phase's handoff.
insert into financial_rules (scheme, rule_key, value, unit, effective_from, effective_to, source_url, retrieved_at, verification_status)
select v.scheme, v.rule_key, v.value, v.unit, v.effective_from, null, v.source_url, now(), 'verified'
from (values
  ('epf', 'employee_contribution_rate', 12.00, 'percent', date '2026-09-01', 'https://www.epfindia.gov.in/site_en/FAQ.php/FAQ.php'),
  ('epf', 'employer_contribution_rate', 3.67,  'percent', date '2026-09-01', 'https://www.epfindia.gov.in/site_en/FAQ.php/FAQ.php'),
  ('eps', 'employer_contribution_rate', 8.33,  'percent', date '2026-09-01', 'https://www.epfindia.gov.in/site_en/FAQ.php/FAQ.php')
) as v(scheme, rule_key, value, unit, effective_from, source_url)
where not exists (
  select 1 from financial_rules fr
  where fr.scheme = v.scheme and fr.rule_key = v.rule_key and fr.effective_to is null
);
