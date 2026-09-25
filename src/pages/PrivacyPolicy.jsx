import LegalPageLayout, { LegalSection, FutureNote } from '../components/layout/LegalPageLayout.jsx'

// Phase 23B. Written to accurately describe CountWise as it actually
// exists right now — not generic privacy-policy boilerplate. See the
// Phase 23B handoff for exactly which lines below are forward-looking
// (flagged inline too, via <FutureNote>) and need revisiting once those
// features actually ship.
//
// This is a good-faith, accurate draft appropriate for a student
// project / pre-launch app — not a substitute for real legal review if
// CountWise is ever meant for real public users at scale.
export default function PrivacyPolicy() {
  return (
    <LegalPageLayout title="Privacy Policy" lastUpdated="18 September 2026">
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
        <p><strong>Financial data you enter.</strong> Everything you type into Money Inbox or add manually: transactions, accounts (wallet/bank, name and type only — never real account numbers), categories, budgets, goals and goal contributions, and Learning ROI items. CountWise never connects to a real bank or pulls this data from anywhere — you type it in, and only it is stored.</p>
        <p><strong>Preferences.</strong> Simple settings you control: dark mode, whether inactivity reminders are on and after how many days, and whether you get an email notification on sign-in.</p>
        <p>
          <strong>Employee-finance information (CTC, salary, PF/pension).</strong> As of this document,
          the CTC Explorer, Salary, and PF/Pension pages are placeholders — they don't yet accept or
          store any input. This section will be filled in with real detail once those features are
          actually built.
        </p>
        <FutureNote>
          The paragraph above is forward-looking. CTC/salary/PF data collection doesn't exist in the
          app yet (Phases 24–26 on the roadmap). This policy needs a real update once those features
          land — it should not be read as describing anything currently active.
        </FutureNote>
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
          No other third-party service currently receives your data. In particular, no AI or language-model
          provider (including Gemini) is integrated into CountWise as of this document — see the separate
          AI &amp; Data Processing Notice for detail on this.
        </p>
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
