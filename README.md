# CountWise

**Every expense counts.**

CountWise is a personal finance tracker built around a single idea: money should be easy to track and honest to look at. You type what happened in plain language — *"coffee 80, bus 40, salary 25000"* — and CountWise turns it into reviewable transactions. Nothing is guessed silently. Nothing is written to your ledger without you seeing it first.

**Live app:** [countwise-one.vercel.app](https://countwise-one.vercel.app)
**Positioning:** Student first. Not student only — the same app grows with you from tracking pocket money to understanding a salary slip, CTC breakdown, and EPF contributions.

---

## What it actually does

- **Money Inbox** — the core loop. Type a sentence, get back parsed transaction candidates (amount, account, category, date), review and correct them, confirm, and only then are they saved.
- **Accounts, Transactions, Goals, Budgets** — the usual ledger primitives, but with account balances always *computed* from transaction history, never stored as a separate number that can drift out of sync.
- **Calendar & Reports** — a monthly view of activity, and exportable summaries (CSV).
- **Learning ROI & Behavior Score** — lightweight, non-financial insight features that reflect on habits without moralizing about them.
- **Life-stage awareness** — the app adapts to whether you're a student or employed, without ever losing the student-first identity for people who don't need the extra features.
- **CTC Explorer, Salary, PF/Pension** — for employed users: a plain-language breakdown of what a CTC offer actually means, a place to log real salary structures, and a PF/EPF/EPS calculator that always cites the statutory rate and effective date it used — never a silently stale number.

## Why the financial logic is more careful than it looks

A finance app is only as trustworthy as its arithmetic. CountWise enforces a small set of rules everywhere, without exception:

- **Income** increases balance. **Expense** decreases it. A **transfer** moves money between your own accounts and affects neither income, expense, nor total balance — it's not a third kind of income.
- **Account balance is never stored.** It's computed live from the full transaction history every time. There is no cached number that can quietly fall out of sync with reality.
- **A goal contribution is an allocation, not an expense.** Putting ₹500 toward a laptop fund doesn't reduce your real bank balance — it reduces what's *available* to spend, which is a different, deliberately separate number.
- **Every calculation has exactly one home.** Income/expense/balance math lives in one module (`financialEngine.js`) and nothing else is allowed to reimplement it. This rule was violated twice during development by accident — once in a charts page, once in a category-matching feature — and both times the fix was to delete the duplicate and route through the real engine instead. That's a pattern worth being honest about, not hiding.
- **Estimates are never disguised as facts.** CTC take-home, PF projections, and budget suggestions are all visually and textually marked as estimates, with their source and assumptions shown alongside them — never presented with the same confidence as a transaction that actually happened.

## A short case study: the bug that took three days

Worth including here, because it's a better demonstration of engineering judgment than any feature list.

Midway through development, the Money Inbox trigger — the button most core to the entire app — silently stopped responding to clicks. No console error. No visual glitch. It simply did nothing.

The debugging process ruled out, in order: browser extensions, Incognito mode, a stale Vite cache, a registered Service Worker, keyboard-triggered activation, and even a JavaScript-dispatched `element.click()` that bypasses the mouse entirely. Every one of them came back clean, which was itself useful information — it meant the bug wasn't where it looked like it should be.

The investigation eventually reached the point of starting a clean rebuild of the affected component from scratch, in an entirely new project, to rule out anything hidden in the old codebase. **The identical bug reappeared in the brand-new code within the same day.** Two unrelated codebases showing the same invisible symptom was the actual turning point — it meant the cause had never been in either app's code at all.

That observation led to the real root cause: a documented interaction between **React 18's Strict Mode** (which deliberately mounts, tears down, and remounts every component once in development, specifically to catch exactly this class of bug) and the native `<dialog>` element's `showModal()` API, which has strict internal state rules that don't tolerate being invoked twice in quick succession. The fix was small — guard the call with `if (!dialog.open)` — but finding it required treating "no error and no obvious cause" as a signal to keep investigating systematically, not a reason to guess.

The lesson that stuck: **when two independent systems fail identically, stop suspecting either system individually.**

## Tech stack

- **Frontend:** React + Vite + Tailwind CSS
- **Backend:** Supabase (PostgreSQL, Auth, Row-Level Security)
- **Charts:** Recharts
- **Deployment:** Vercel, via GitHub

No paid services anywhere in the stack — this was a deliberate constraint from day one, not a limitation discovered later.

## Design

Warm, restrained fintech aesthetic — whitespace and typography carry the hierarchy, not cards or gradients. Fraunces for headings, Inter for interface text, IBM Plex Mono for every number that represents money (so amounts always line up in a column, the way a real ledger does). Full dark mode support, not a bolted-on afterthought.

## Engineering practices

- Every pure calculation (financial engine, date parsing, category matching, budget math, CTC/salary/PF calculations) has its own unit tests — over 200 assertions across the core logic layer, run with a plain Node test runner, no framework overhead.
- Every feature phase went through independent verification — real test runs, real production builds, and for security-sensitive work (account deletion, password recovery), a genuine end-to-end test against a real throwaway account rather than a code review alone.
- Row-Level Security policies were verified against a real Postgres instance using a restricted (non-superuser) role, to confirm user data isolation actually holds — not just that the policy text looked correct.

## Running it locally

```bash
git clone https://github.com/PothiRaja007/countwise.git
cd countwise
npm install
npm run dev
```

You'll need your own Supabase project — see `supabase/schema.sql` for the full database schema and RLS policies.

## What's next

CountWise's next planned phase (V1.3) introduces AI assistance for two specific things: interpreting uploaded CTC/offer-letter documents, and eventually a fallback parser for Money Inbox inputs the deterministic parser can't handle. Both are designed around the same non-negotiable rule the rest of the app already follows: AI can suggest, but nothing gets written to your financial data without you reviewing and confirming it first.

## Author

Built by **Pothi Raja D** — B.Com Fintech with AI student, building toward a career in financial data analysis.

---

*This is a portfolio project — it has no real users and isn't intended for production financial use.*
