import LegalPageLayout, { LegalSection } from '../components/layout/LegalPageLayout.jsx'

// Phase 23B. Written to accurately describe CountWise as it actually
// exists — not generic privacy-policy boilerplate.
//
// Updated 28 September 2026 (Phase 33b). Two statements written in 23B
// had become false once later phases shipped, and were corrected:
//   - "no AI or language-model provider (including Gemini) is
//     integrated" — Gemini is integrated (Phases 30, 31a, 34, 33b);
//   - "CTC Explorer, Salary, and PF/Pension are placeholders that store
//     nothing" — they store CTC and salary data (Phases 24-26).
// Phase 32.1: added the optional spending context on an expense to the
// data description below. It is stored with the transaction under the same
// per-user access rules and is never sent to any AI (see AIDataNotice.jsx).
//
// Maintenance rule: any change that alters what data is collected, or
// who receives it, must update this page in the same change.
//
// This is a good-faith, accurate draft appropriate for a student
// project / pre-launch app — not a substitute for real legal review if
// CountWise is ever meant for real public users at scale.
export default function PrivacyPolicy() {
  return (
    <LegalPageLayout title="Privacy Policy" lastUpdated="28 September 2026">
      <LegalSection heading="What this document is">
        <p>
          This Privacy Policy explains what information CountWise collects, how it's stored, and what
          control you have over it. It reflects the app as it actually works today — not a generic
          template. Where a section describes something that isn't built yet, it's marked clearly as
          forward-looking.
        </p>
      </LegalSection>

      <LegalSection heading="Information we collect">
        <p><strong>Account information.</strong> Your email address and password, handled entirely by Supabase Auth — CountWise's own code never sees or stores your password in plain text. You may optionally set a username, which is a display name only, shown back to you in greetings around the app — it isn't used to verify your identity.</p>
        <p><strong>Financial data you enter.</strong> Everything you type into Money Inbox or add manually: transactions (including, if you choose, a spending context on an expense — planned, routine, social or unplanned — which is a label you pick, never free text), accounts (wallet/bank, name and type only — never real account numbers), categories, budgets, goals and goal contributions, and Learning ROI items. CountWise never connects to a real bank or pulls this data from anywhere — you type it in, and only it is stored.</p>
        <p><strong>Preferences.</strong> Simple settings you control: dark mode, whether inactivity reminders are on and after how many days, and whether you get an email notification on sign-in. Also your life stage — student, employed, or both — and, if employed, whether you're a fresher or already working, which decides whether the work-related pages are shown.</p>
        <p>
          <strong>Employee-finance information (CTC, salary, PF/pension).</strong> If you use these
          pages you can enter a CTC exploration (a label, your total CTC, and its components — each a
          name, category and annual amount) and salary structures (a label and components, each a name,
          category and monthly amount). Components can be typed in, or proposed from an offer letter
          you choose to upload using the optional AI document extraction — see the AI &amp; Data
          Processing Notice — for you to review before anything is saved. This information is stored
          in Supabase like your other data, under the same per-user access rules, and is deleted with
          your account. The PF/Pension page calculates from your active salary structure and stores
          nothing of its own. The figures on these pages are estimates, not statements of what you
          will actually receive.
        </p>
        <p>
          <strong>What we don't collect.</strong> CountWise never asks for or stores real bank account
          numbers, card numbers, government ID numbers, your physical location, or any browsing activity
          outside the app.
        </p>
      </LegalSection>

      <LegalSection heading="How your data is stored and protected">
        <ul>
          <li>All data lives in Supabase (a managed Postgres database).</li>
          <li>
            Row Level Security is enabled on every table that holds personal data — the database itself
            enforces that you can only read or write your own rows, not just the application code.
          </li>
          <li>Passwords are never handled by CountWise's own code — Supabase Auth manages them entirely.</li>
          <li>
            The one operation that needs elevated (service-role) access — permanently deleting an
            account — runs inside a server-side Supabase Edge Function. That elevated key is never
            present in, or reachable from, the app running in your browser.
          </li>
        </ul>
      </LegalSection>

      <LegalSection heading="Third parties">
        <p>
          <strong>Resend</strong> — used only to send you a "new sign-in" notification email, and only if
          you've turned that on in Settings → Security. If that setting is off, no email is sent and
          Resend is never contacted for that sign-in.
        </p>
        <p>
          <strong>Google (Gemini API)</strong> — used only for the optional AI features described in the
          AI &amp; Data Processing Notice. Google receives data only when you click one of those
          features — for example an offer-letter file you choose to extract, or the figures behind an
          "Explain this" — and never your password, email address or username. CountWise currently uses
          Google's free (unpaid) Gemini quota; under Google's terms for that tier, submitted content may
          be used to improve Google's products and may be read by human reviewers. Please read the AI
          &amp; Data Processing Notice before using these features with anything sensitive.
        </p>
        <p>No other third-party service currently receives the data you enter into CountWise.</p>
      </LegalSection>

      <LegalSection heading="Your rights and controls">
        <ul>
          <li>
            <strong>Export.</strong> From Settings → Data &amp; Privacy, you can download your own
            transactions, accounts, goals, goal contributions, learning items, and categories as CSV
            files, at any time.
          </li>
          <li>
            <strong>Deletion.</strong> From Settings, you can permanently delete your account. This
            requires typing a confirmation phrase — it isn't a single accidental click. Deletion removes
            your row from the authentication system, which cascades automatically to remove every table
            of yours described above. This is irreversible.
          </li>
          <li>
            <strong>Access and correction.</strong> You can view, edit, or remove your own transactions,
            accounts, goals, budgets, and categories directly within the app at any time — there's no
            separate request process for data you can already see and change yourself.
          </li>
        </ul>
      </LegalSection>

      <LegalSection heading="Data retention">
        <p>
          Your data is kept for as long as your account exists. Deleting your account removes it
          entirely, not just deactivates it. Shared default categories (the starting set everyone gets,
          like "Food" or "Transport") aren't personal data and aren't affected by any individual
          account's deletion.
        </p>
      </LegalSection>

      <LegalSection heading="Changes to this policy">
        <p>
          This policy may be updated as CountWise's features change — particularly as the employee-finance
          and AI features on the roadmap are actually built. Material changes will be reflected here with
          an updated date at the top of this page.
        </p>
      </LegalSection>

      <LegalSection heading="Contact">
        <p>A contact address for privacy questions has not yet been established for this project.</p>
      </LegalSection>
    </LegalPageLayout>
  )
}
