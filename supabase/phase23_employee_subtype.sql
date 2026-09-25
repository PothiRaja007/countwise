-- CountWise — Phase 23.1: add profiles.employee_subtype
--
-- Standalone version of the block now also appended to supabase/schema.sql,
-- for running once directly against the live Supabase project — same
-- dual-file convention as this project's other migration files (see
-- migrate_fuel_category.sql for another example of the same pattern).
--
-- Safe to re-run: `add column if not exists` is idempotent, so running
-- this twice (or running it on a project that already has the column
-- from a re-run of the full schema.sql) does nothing the second time.
--
-- Additive only. Nullable, no default — every existing profile keeps
-- employee_subtype = null until a user is prompted for it (Subphase 23.2)
-- or sets it themselves later (Subphase 23.3). No existing row is
-- touched, no existing data is at risk.
--
-- No RLS change needed or included here: profiles' existing "own profile"
-- policy is row-level (`using (auth.uid() = id)`), not column-level, so
-- it already covers this new column automatically.

alter table profiles add column if not exists employee_subtype text
  check (employee_subtype in ('fresher','already_working'));
