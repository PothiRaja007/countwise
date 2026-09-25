import LegalPageLayout, { LegalSection, FutureNote } from '../components/layout/LegalPageLayout.jsx'

// Phase 23B. See PrivacyPolicy.jsx's header comment — same standard
// applies here: accurate to the app as it exists today, forward-looking
// sections flagged rather than written as if already true, and this is a
// good-faith draft, not a substitute for real legal review before any
// real public launch.
export default function TermsAndConditions() {
  return (
    <LegalPageLayout title="Terms & Conditions" lastUpdated="18 September 2026">
      <LegalSection heading="Acceptance of these terms">
        <p>
          By creating a CountWise account and using the app, you agree to these terms. If you don't
          agree with them, please don't use CountWise.
        </p>
      </LegalSection>

      <LegalSection heading="What CountWise is — and isn't">
        <p>
          CountWise is a personal finance tracking and planning tool. It helps you log transactions,
          understand your spending, set budgets and goals, and (on the roadmap) understand employee
          compensation concepts like CTC and take-home pay in general, educational terms.
        </p>
        <p>
          <strong>CountWise is not a bank, an investment platform, a tax-filing service, an insurance
          advisor, or a licensed financial adviser.</strong> Nothing in the app is personalized regulated
          financial, investment, tax, or insurance advice. Figures CountWise shows you are calculated
          from the data you entered, using deterministic, rule-based logic — never a guarantee, prediction,
          or professional recommendation.
        </p>
      </LegalSection>

      <LegalSection heading="Acceptable use">
        <ul>
          <li>Your account is for your own personal use — it isn't meant to be shared or transferred.</li>
          <li>Don't attempt to access, scrape, or interfere with another user's data or account.</li>
          <li>Don't use CountWise for any unlawful purpose.</li>
          <li>Don't attempt to disrupt, overload, or reverse-engineer the service.</li>
        </ul>
      </LegalSection>

      <LegalSection heading="Educational and informational disclaimer">
        <p>
          Every number CountWise shows you — balances, budget status, behavior score, category totals —
          is calculated directly from data you entered, using the app's own deterministic financial
          logic. These figures are for your own understanding and planning. They are not professional
          financial, tax, investment, or legal advice, and CountWise does not guarantee any financial
          outcome.
        </p>
        <FutureNote>
          The CTC Explorer, Salary, and PF/Pension sections of the app are currently placeholder pages
          with no real calculations behind them yet (see Phases 24–26 on the product roadmap). Once
          those features are actually built, this section needs a real, specific disclaimer covering
          them directly — for example, making clear that an estimated take-home figure is an estimate
          based on the values and assumptions you provided, not a guarantee from your employer or
          CountWise. Writing that disclaimer now, for a feature that doesn't exist yet, would itself be
          inaccurate — so this note stands in its place until those phases land.
        </FutureNote>
      </LegalSection>

      <LegalSection heading="Your account">
        <ul>
          <li>You're responsible for keeping your password secure and for activity under your account.</li>
          <li>Please provide accurate information when creating your account.</li>
          <li>One account per person.</li>
        </ul>
      </LegalSection>

      <LegalSection heading="Termination and data deletion">
        <p>
          You can permanently delete your own account at any time from Settings — this requires typed
          confirmation and removes your data entirely, as described in the Privacy Policy. CountWise may
          also suspend or terminate an account that violates these terms.
        </p>
      </LegalSection>

      <LegalSection heading="No warranty; limitation of liability">
        <p>
          CountWise is provided "as is," without warranty of any kind, express or implied, including
          any warranty of uninterrupted availability or fitness for a particular purpose. To the fullest
          extent permitted by law, CountWise and its developer(s) are not liable for any financial
          decision you make based on information shown in the app, or for any loss or damage arising
          from your use of it.
        </p>
      </LegalSection>

      <LegalSection heading="Governing law">
        <p>
          The jurisdiction and governing law for these terms have not yet been determined — this is a
          genuinely open item, left as a placeholder here rather than an invented answer, and should be
          filled in as part of real legal review before any public launch.
        </p>
      </LegalSection>

      <LegalSection heading="Changes to these terms">
        <p>
          These terms may be updated as CountWise's features change. Material changes will be reflected
          here with an updated date at the top of this page.
        </p>
      </LegalSection>
    </LegalPageLayout>
  )
}
