-- CountWise — Phase 39: Admin Financial Rule Assistant
--
-- financial_rules currently has ONLY a SELECT policy — there is no
-- INSERT or UPDATE policy at all, for anyone. With RLS enabled and no
-- policy for an operation, Postgres denies that operation outright. This
-- migration adds the minimum needed to let exactly one admin propose and
-- approve rule changes from the app, without opening the table to every
-- user (which a blanket "authenticated" policy would do — these are
-- statutory financial rules every user's PF/tax calculations depend on).
--
-- Design: a tiny admin_users allowlist table, rather than hardcoding a
-- UUID into the policy text itself — easier to audit, and adding/removing
-- an admin later is one row, not a policy rewrite.
--
-- RUN THIS ONCE, then run the "add yourself as the one admin" block at
-- the bottom with your own real sign-in email.

create table if not exists admin_users (
  user_id uuid primary key references auth.users(id) on delete cascade,
  created_at timestamptz not null default now()
);

alter table admin_users enable row level security;

do $$
begin
  if not exists (
    select 1 from pg_policies
    where tablename = 'admin_users' and policyname = 'admin_users: a user can check their own admin status'
  ) then
    -- Deliberately narrow: lets the app ask "am I an admin?" (to decide
    -- whether to show the admin nav item) without letting any user list
    -- who else is an admin.
    create policy "admin_users: a user can check their own admin status" on admin_users
      for select to authenticated using (auth.uid() = user_id);
  end if;
end $$;

do $$
begin
  if not exists (
    select 1 from pg_policies
    where tablename = 'financial_rules' and policyname = 'financial_rules: admins can insert'
  ) then
    create policy "financial_rules: admins can insert" on financial_rules
      for insert to authenticated
      with check (exists (select 1 from admin_users where user_id = auth.uid()));
  end if;

  if not exists (
    select 1 from pg_policies
    where tablename = 'financial_rules' and policyname = 'financial_rules: admins can update'
  ) then
    create policy "financial_rules: admins can update" on financial_rules
      for update to authenticated
      using (exists (select 1 from admin_users where user_id = auth.uid()));
  end if;
end $$;

-- ---------------------------------------------------------------------
-- RUN THIS SECOND, after the block above, replacing the email with your
-- own real CountWise sign-in email (this is the one and only step that
-- actually makes you an admin — everything above just builds the gate):
--
--   insert into admin_users (user_id)
--   select id from auth.users where email = 'your-sign-in-email@example.com'
--   on conflict (user_id) do nothing;
--
-- CHECK QUERY — confirms it worked:
--   select u.email from admin_users a join auth.users u on u.id = a.user_id;
-- ---------------------------------------------------------------------
