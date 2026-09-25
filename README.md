# CountWise

A lifestage personal finance tracker — "Every expense counts." Built with React, Vite, Tailwind, and Supabase.

CountWise adapts to who you are — student, employed, or both — rather than assuming one financial life stage fits everyone. Every transaction flows through a single natural-language entry point (Money Inbox), gets auto-categorized and account-detected, and is reviewed before it ever writes to your data — the app never silently guesses.

## Features

- **Money Inbox** — describe what happened in plain language ("coffee 80", "salary received 25000"); CountWise parses amount, account, and category, and asks for confirmation before saving anything
- **Life-stage aware** — student, employed, or mixed accounts each see relevant tools; work-related sections (CTC Explorer, Salary, PF/Pension) only appear for those who need them
- **CTC Explorer & Salary** — break down a CTC offer or a payslip into real monthly take-home
- **PF / Pension tracking**
- **Goals & Budgets**
- **Behavior Score** — a composite score with flag detection for spending patterns
- **Financial Rhythm chart, Calendar, Reports**
- **Account Security** — password recovery, login-notification toggle
- **Dark mode**

## Tech stack

React 18 · Vite · Tailwind CSS · Supabase (Postgres + Auth + Row Level Security)

## Local setup

```
npm install
cp .env.example .env
# fill in VITE_SUPABASE_URL and VITE_SUPABASE_ANON_KEY from your Supabase project settings
npm run dev
```

## Supabase setup

1. Create a free-tier project at supabase.com.
2. Open the SQL editor and run `supabase/schema.sql`, followed by every other `.sql` file in `supabase/` in filename order (each is a dated migration — they must be applied in sequence).
3. Confirm Row Level Security is enabled on every table before using real data.
4. Enable email auth under Authentication → Providers.
5. Copy the project URL and anon key into `.env`.

See `DATA_MODEL.md` for the full schema reference.

## Deploy

1. Push this repo to GitHub (already done if you're reading this on GitHub).
2. Import the repo in Vercel.
3. Add `VITE_SUPABASE_URL` and `VITE_SUPABASE_ANON_KEY` in Vercel's project Environment Variables.
4. In Supabase → Authentication → URL Configuration, add your Vercel URL to Site URL and Redirect URLs.
5. Every push to `main` auto-redeploys.

## Status

Actively developed. Core flows (Money Inbox, life-stage accounts, engines, goals, budgets, behavior scoring) are built and tested. See `DATA_MODEL.md` for the current schema.
