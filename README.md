# Finance Tracker — v1

Flexible-income budgeting + learning ROI tracker + behavior scoring. See `DATA_MODEL.md` for the locked schema.

## Local setup

```bash
npm install
cp .env.example .env
# fill in VITE_SUPABASE_URL and VITE_SUPABASE_ANON_KEY from your Supabase project settings
npm run dev
```

## Supabase setup

1. Create a free-tier project at supabase.com.
2. Open SQL editor, paste and run `supabase/schema.sql`.
3. Enable email auth (Authentication → Providers).
4. Copy the project URL + anon key into `.env`.

## What's wired vs. stubbed

Wired (real logic, no backend yet):
- `src/lib/categorization.js` — natural-language quick-entry parsing + rule-based auto-categorization
- `src/lib/behaviorScore.js` — composite behavior score + flag detection
- `src/components/QuickEntryModal.jsx` — uses the parser live

Stubbed (UI shell only, needs Supabase queries wired in):
- Overview page uses mock data matching the DATA_MODEL shapes — swap each mock array for a `supabase.from(...).select(...)` call
- Transactions / Goals / Learning / Behavior / Charts pages are placeholders
- Onboarding doesn't yet write to `profiles` or seed `category_rules`
- No auth screen yet (login/signup)

## Deploy

1. `git init && git add -A && git commit -m "v1 scaffold"`, push to a new GitHub repo.
2. Import the repo in Vercel, add the two `VITE_SUPABASE_*` env vars in Vercel's project settings.
3. Every push to `main` auto-redeploys.

## Next build session

Priority order to reach a usable v1:
1. Auth screen (Supabase email/password or magic link)
2. Wire Onboarding to `profiles` + seed default categories/rules
3. Wire Overview's mock data to real Supabase queries
4. Transactions page: list + manual category picker for unmatched entries
5. Pots/Goals CRUD
6. Learning ROI CRUD
7. Behavior Score: scheduled (or on-load) computation via `behaviorScore.js`, persisted to `behavior_scores`/`behavior_flags`
