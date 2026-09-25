-- CountWise — Phase 27: financial_rules (versioned statutory rates)
--
-- Standalone version of the block also appended directly to
-- supabase/schema.sql in this same commit — deliberately NOT left as a
-- separate unintegrated file with only a comment claiming it was merged.
-- That exact gap (a standalone .sql file existing while schema.sql, the
-- intended single source of truth, silently didn't have the block) is
-- documented in schema.sql's SUBPHASE 24.1 section as a real bug found
-- during Subphase 25.1's repo inspection. Don't repeat it.
--
-- ============================================================
-- RUN THIS AGAINST THE LIVE SUPABASE PROJECT. IT HAS NOT RUN ITSELF.
-- Writing this file (and appending the same block to schema.sql) does
-- NOT create the table in your live database. Until you run this,
-- Phase 26 (PF/Pension) — or anything else that ever queries
-- financial_rules — will fail with "relation does not exist", the exact
-- same class of bug already hit once with ctc_explorations/ctc_components.
-- ============================================================
--
-- This is shared reference data, not user-owned — unlike every other
-- table in this project, there is no user_id column and no per-row
-- ownership. RLS here means something different: readable by any
-- authenticated user, writable by nobody through the client at all (no
-- insert/update/delete policy exists — Postgres RLS defaults to deny for
-- any operation with no matching policy, so this is enforced by absence,
-- not by an explicit "deny" rule). Writes happen only via direct
-- database access for now — no admin workflow yet (that's Phase 33/39
-- territory per the roadmap), and this is intentional, not a gap.
--
-- The partial unique index is the actual enforcement mechanism behind
-- "never just take the latest rule": at most one row per (scheme,
-- rule_key) can have effective_to = null (i.e. be "currently open") at
-- any time. A rate change means closing the old row (set its
-- effective_to) and inserting a new one — never overwriting value in
-- place, never leaving two open rows for the same key.

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

-- Seeded rates. Sourced from the EPFO's own official FAQ page
-- (https://www.epfindia.gov.in/site_en/FAQ.php/FAQ.php), which states
-- plainly: "an employee contributes 12% of the Basic wages + Dearness
-- allowance + Retaining allowance in EPF. The employer also pays 12% of
-- pay out of which 8.33% of pay is diverted to Pension Fund and the rest
-- 3.67% is diverted to EPF." Cross-checked against numerous independent
-- payroll/compliance sources, all consistent with this split.
--
-- effective_from is set to the date this row was verified and entered
-- into CountWise (2026-09-01), NOT a claim about the historical date the
-- underlying government rate first took effect — that specific circular
-- date wasn't something a search could pin down with confidence, and
-- inventing one would be exactly the fabricated precision this table
-- exists to prevent. The 12%/3.67%/8.33% split itself has been the
-- standing EPS-95 arrangement for years; this row records "verified as
-- of now," not "in effect starting now."
--
-- Deliberately NOT seeded here: the EPS wage ceiling (₹15,000/month,
-- which caps the employer's 8.33% EPS contribution in practice). The
-- task scope for this phase was explicitly "at minimum" these three rate
-- values — the ceiling is a real, separate fact Phase 26's pfEngine.js
-- will need to compute EPS correctly, and is flagged in this phase's
-- handoff as a gap for that phase to seed, not silently added here.
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
