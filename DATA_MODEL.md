# Data Model — v1 (locked)

Backend: Supabase (Postgres + Row Level Security). Every table has `user_id uuid` referencing `auth.users`, and RLS restricts rows to `auth.uid() = user_id` (categories/category_rules use a split read policy — see below).

> **Documentation sync note (Phase 3):** this file previously described an earlier draft schema (an `accounts.balance` column, a `pots` table with `current_amount`, no transfer support on `transactions`). That draft was superseded during Phase 1 and the live Supabase schema was corrected — this file just hadn't been updated to match until now. The database itself was always right; only this doc was stale. `supabase/schema.sql` has been corrected the same way.

## profiles
| column | type | notes |
|---|---|---|
| id | uuid, pk, = auth.users.id | |
| income_type | text | 'student' \| 'employed' \| 'mixed' — set at onboarding, editable |
| onboarding_complete | boolean | default false |
| default_account_id | uuid | fk accounts, set during onboarding |
| dark_mode | boolean | default false |
| created_at | timestamptz | default now() |

## accounts
| column | type | notes |
|---|---|---|
| id | uuid pk | |
| user_id | uuid | |
| name | text | e.g. "Wallet", "Bank" |
| type | text | 'wallet' \| 'bank' — v1 has exactly these two types |
| is_default | boolean | onboarding seeds one default account |
| is_active | boolean | soft-disable instead of deleting |
| created_at / updated_at | timestamptz | |

**No `balance` column, by design.** Balance is never stored — always computed live from `transactions`: `income − expenses + transfers_in − transfers_out`. See `src/lib/financialEngine.js`.

## categories
| column | type | notes |
|---|---|---|
| id | uuid pk | |
| user_id | uuid | null for system default categories |
| name | text | e.g. "Food", "Transport", "Tuition income" |
| kind | text | 'income' \| 'expense' |
| icon | text | icon key for UI |
| is_default | boolean | seeded per income_type at onboarding |

## category_rules
Rule-based keyword auto-categorization (no LLM).
| column | type | notes |
|---|---|---|
| id | uuid pk | |
| user_id | uuid | null for system default rules |
| keyword | text | lowercase, matched as substring against entry text |
| category_id | uuid | fk categories |
| priority | int | higher wins on multi-match |

**RLS on categories/category_rules is a split policy, not a blanket one:** everyone can `select` shared default rows (`user_id is null`) or their own; only the owner can `insert`/`update`/`delete` their own rows. A blanket policy here was caught as a Phase 1 bug — it would have let any user delete the shared defaults.

## transactions
| column | type | notes |
|---|---|---|
| id | uuid pk | |
| user_id | uuid | |
| account_id | uuid | fk accounts — source account for all types |
| to_account_id | uuid | fk accounts, nullable — destination account, transfers only |
| category_id | uuid | fk categories, nullable until categorized |
| type | text | 'expense' \| 'income' \| 'transfer' — not null |
| amount | numeric | always positive (`check (amount > 0)`); sign/direction implied entirely by `type` |
| description | text | |
| transaction_date | date | |
| original_input | text | the raw Money Inbox text this row came from, for traceability |
| created_at / updated_at | timestamptz | |

**Transfers:** subtract from `account_id`, add to `to_account_id`; never counted as income or expense in any calculation; total balance across all accounts is unchanged.

## goals
Renamed from the original "pots" table (no data lost — table was empty at migration time).
| column | type | notes |
|---|---|---|
| id | uuid pk | |
| user_id | uuid | |
| name | text | |
| target_amount | numeric | |
| target_date | date | nullable |
| status | text | 'active' \| 'completed' \| 'archived' |
| created_at / updated_at | timestamptz | |

No `current_amount` column — goal progress is computed live from `goal_contributions`, the same way account balance is computed live from `transactions`.

## goal_contributions
| column | type | notes |
|---|---|---|
| id | uuid pk | |
| user_id | uuid | |
| goal_id | uuid | fk goals |
| account_id | uuid | fk accounts — which account funded/received this |
| amount | numeric | always positive |
| type | text | 'contribution' \| 'withdrawal' |
| contribution_date | date | |
| created_at | timestamptz | |

**A goal contribution is an allocation, not an expense.** It never touches `transactions`. It reduces an account's *available* (unallocated) amount — real balance is unchanged. Example: real balance ₹20,000, allocate ₹5,000 → real balance still ₹20,000, allocated ₹5,000, available ₹15,000.

## learning_items (Learning ROI)
| column | type | notes |
|---|---|---|
| id | uuid pk | |
| user_id | uuid | |
| name | text | course/cert/skill name |
| cost | numeric | |
| relevance_tag | text | free-form tag |
| target_date | date | |
| progress_pct | int | 0–100 |
| status | text | 'planned' \| 'in_progress' \| 'completed' \| 'dropped' |

No fabricated numeric "ROI %" — there's no real outcome metric to compute one from (v1, explicitly excluded).

## behavior_flags
| column | type | notes |
|---|---|---|
| id | uuid pk | |
| user_id | uuid | |
| flag_type | text | e.g. 'early_month_burn', 'no_savings_contribution' |
| description | text | human-readable, non-judgmental, e.g. "40% of income spent in first 3 days" |
| severity | int | 1–3 |
| period_start / period_end | date | |

## behavior_scores
Snapshot table for future performance optimization. **Not read from in v1** — Behavior Score is computed live from transactions/goals, not from this table yet.
| column | type | notes |
|---|---|---|
| id | uuid pk | |
| user_id | uuid | |
| period_start / period_end | date | |
| stars | numeric | 1.0–5.0 |
| flag_ids | uuid[] | flags that fed this score |

## Notes
- No `credit_cards` table in v1 — permanently excluded, not deferred to v2.
- No `currency` column anywhere in v1 — single implicit currency.
- No LLM/AI API anywhere — all Money Inbox parsing is rule-based/deterministic (`src/lib/dateParser.js`, `src/lib/categorization.js`).
- Behavior score computation and flag detection run client-side against `transactions` + `goals` + `goal_contributions` + `learning_items`; only the result would be persisted to `behavior_scores`/`behavior_flags` (not yet wired up).
