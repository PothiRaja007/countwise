import LegalPageLayout, { LegalSection, FutureNote } from '../components/layout/LegalPageLayout.jsx'

// Phase 23B. The most important property of this page: it must not
// describe AI processing that doesn't exist yet. Every current-tense
// sentence here is verified against the actual codebase as of this
// phase (categorization.js / dateParser.js / moneyInbox.js — all
// deterministic, no network call, no LLM — confirmed by reading them,
// not assumed). The roadmap's Gemini plans (V1.3) are described only in
// the clearly-marked forward-looking section, at a conceptual level, and
// explicitly as not yet active.
export default function AIDataNotice() {
  return (
    <LegalPageLayout title="AI & Data Processing Notice" lastUpdated="18 September 2026">
      <LegalSection heading="Current state: no AI is used in CountWise">
        <p>
          As of this document, CountWise does not use artificial intelligence or a large language model
          anywhere in the app. This includes Money Inbox — the natural-language entry box where you type
          things like "coffee 80, bus 40" — which is entirely deterministic, rule-based code. It parses
          amounts, dates, transaction types, and categories using fixed logic that runs the same way every
          time for the same input; it does not call any external AI service, and no version of it ever
          has.
        </p>
        <p>
          Categorization (deciding which category a transaction like "coffee 80" belongs to) works the
          same way: a keyword-matching system you can see and edit yourself in Settings → Categories, not
          a model making a judgment call.
        </p>
      </LegalSection>

      <LegalSection heading="What this means for your data">
        <ul>
          <li>Nothing you type into CountWise is sent to an AI model or AI provider for interpretation.</li>
          <li>There is currently no AI feature to opt in or out of, because none is active.</li>
          <li>Every figure CountWise calculates and shows you comes from fixed, auditable logic — not a model's output.</li>
        </ul>
      </LegalSection>

      <LegalSection heading="Planned future state — not active today">
        <FutureNote>
          <p>
            CountWise's product roadmap (V1.3) includes a possible future AI layer, built on Google's
            Gemini, called through a server-side Supabase Edge Function — never with an API key exposed
            in the app itself. The plan, as currently scoped and not yet built:
          </p>
          <ul className="list-disc pl-5 space-y-1.5">
            <li>
              A Money Inbox fallback: the existing deterministic parser stays primary and handles entries
              as it does today; Gemini would only be consulted if that parser genuinely can't make sense
              of an entry, producing a draft for you to review — never a direct save.
            </li>
            <li>Possible future help reading uploaded bank statements, again producing draft transactions for your review, not automatic saves.</li>
            <li>Possible future advanced insights (spending patterns, budget observations) presented as suggestions, not silent changes.</li>
          </ul>
          <p>
            None of this is active in the app today. This section exists so the document has a place to
            be extended into once any of this actually ships — it is not a description of current
            behavior, and should not be read as one. When any AI feature actually goes live, this notice
            will be rewritten to describe it accurately, including what's sent to it and why, before that
            feature is used with real data.
          </p>
        </FutureNote>
      </LegalSection>

      <LegalSection heading="Review before write, always">
        <p>
          Even once an AI feature does exist, CountWise's standing rule (unchanged from the rest of the
          app) is that nothing an AI produces is saved directly to your financial data. Any AI-assisted
          suggestion would go through the same review step every Money Inbox entry already goes through
          today: parse, review, confirm, then save — never input straight to database.
        </p>
      </LegalSection>
    </LegalPageLayout>
  )
}
