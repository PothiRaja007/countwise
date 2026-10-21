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

## debts (Debt module, D2)
Added after v1. Holds the user's **opening figures** and the loan terms. Nothing here is a current balance. The current outstanding amount, interest paid, payoff date and repayment plans are always calculated by `src/lib/debtEngine.js`, the same principle as account balance and goal progress. A debt is not an account and never enters total balance.
| column | type | notes |
|---|---|---|
| id | uuid pk | unique together with user_id (`debts_id_user_key`), so a later payment link can prove it belongs to the same user |
| user_id | uuid | references auth.users, cascades on account deletion |
| name | text | required, 80 characters at most; unique per user among active debts, ignoring case (`debts_active_name_per_user`) |
| kind | text | 'term_loan' \| 'interest_free' \| 'credit_card'. A credit card is always shown as an estimate |
| lender | text | optional, display only |
| as_of_date | date | the date the two opening figures are true |
| as_of_outstanding | numeric | PRINCIPAL still owed on as_of_date; 0 means already cleared; at most 2 decimals |
| as_of_accrued_interest | numeric | interest owed but unpaid on as_of_date; default 0 (none known); at most 2 decimals |
| annual_rate_pct | numeric | 0 to 100, at most 2 decimals, no default; must be exactly 0 when kind is 'interest_free' |
| monthly_payment | numeric | optional; lender EMI or the user's chosen payment; above 0 |
| remaining_months | integer | optional, 1 to 600; months left ON as_of_date, a snapshot that is never counted down |
| due_day | integer | optional, 1 to 31; short months use their last day |
| status | text | 'active' \| 'closed'; a closed debt is kept for history |
| created_at / updated_at | timestamptz | updated_at is set by the app |

RLS: one policy, `own debts`, for all commands, to signed-in users only (`auth.uid() = user_id` for both reading and writing). Debt payments and their link to transactions are not part of this table; they are planned for D4. Standalone script with pre-flight checks and rollback: `supabase/p16_debts.sql`.

Used by the Debts screen (D3, `/debts`): it adds, edits, closes and reopens debts and exports them to CSV. It never deletes a row and never writes any other table. Closing sets status to 'closed'; reopening sets it back to 'active'.

## Notes
- No `credit_cards` ACCOUNT table in v1 — permanently excluded, not deferred to v2. Since the Debt module, a credit card can exist only as a `debts` row of kind 'credit_card': a labelled estimate, never an account and never part of total balance.
- No `currency` column anywhere in v1 — single implicit currency.
- Money Inbox parsing is rule-based and deterministic (`src/lib/dateParser.js`, `src/lib/categorization.js`) and works with no AI. The app also has a few optional, disclosed Gemini features (for example CTC document extraction, bank-statement help, the financial assist narration and the admin rule assistant), called through Supabase edge functions. AI only suggests; nothing is written to financial data without the user reviewing and confirming it. See the in-app AI notice page.
- Behavior score computation and flag detection run client-side against `transactions` + `goals` + `goal_contributions` + `learning_items`; only the result would be persisted to `behavior_scores`/`behavior_flags` (not yet wired up).

## debt_payments (Debt module, D4a)
Added after the `debts` table (see above). A row says "this expense transaction is a payment toward this debt". It stores **no amount and no date**: the app reads both live from the linked transaction, so balances still come from transactions only. Creating a link does not create, change or delete a transaction and does not touch any balance (the money left the account when the transaction was recorded). A debt is still not an account and never part of total balance.
| column | type | notes |
|---|---|---|
| id | uuid pk | |
| user_id | uuid | references auth.users, cascades on account deletion |
| debt_id | uuid | with user_id, references `debts (id, user_id)`, so a link can only point at the same user's debt; deleting the debt deletes its links |
| transaction_id | uuid | with user_id, references `transactions (id, user_id)`, so a link can only point at the same user's transaction; deleting the transaction deletes its link and the debt recalculates. Unique (`debt_payments_transaction_id_key`): one transaction is a payment toward at most one debt, once |
| created_at | timestamptz | |

- **Whole transactions only:** a transaction is linked in full to one debt. There are no partial amounts and no splits.
- **Expense only:** a trigger (`debt_payments_expense_only`, function `check_debt_payment_expense`) refuses a link to income or a transfer when the link is created or re-pointed. It does not watch the transactions table: if a linked expense is later edited into income or a transfer, the link stays and the app shows it as "not counted" with an Unlink action.
- **Existing table touched:** `transactions` gains one constraint, `transactions_id_user_key unique (id, user_id)`. The id is already the primary key, so it can never fail on existing data. It exists only so the composite foreign key above works (same pattern as `accounts_id_user_key` and `goals_id_user_key`). No column, policy or trigger of `transactions` changes.
- RLS: one policy, `own debt payments`, for all commands, to signed-in users only (`auth.uid() = user_id` for both reading and writing).
- Index on `debt_id` for the per-debt list.
- Applied by `supabase/p17_debt_payments.sql` (standalone, with pre-flight checks, post-checks and a rollback). The screen that uses the table is a later stage (D4b).
