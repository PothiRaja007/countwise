import LegalPageLayout, { LegalSection, FutureNote } from '../components/layout/LegalPageLayout.jsx'

// Phase 23B wrote this page when no AI existed. It was rewritten on
// 28 September 2026 (Phase 33b) after review found it still claimed "no AI
// is used anywhere" while Gemini was live in four places. The original
// page promised to be rewritten before any AI feature touched real data;
// that promise had been broken since Phase 31a.
//
// Every present-tense statement below was checked against the code:
//   - what each feature sends  -> gemini-explain callers in CTCExplorer.jsx,
//     PFPension.jsx, Salary.jsx, FinancialAssistCard.jsx and the prompt
//     builders in explainCTC/explainPF/explainSalary/assistNarration.js
//   - nothing AI-produced is stored -> component state only; CTC
//     components are saved only by the existing Save button, after review
//   - Money Inbox and categorization are still deterministic (Phase 35,
//     the optional AI fallback, is deliberately not built)
//   - the account details sent -> none: gemini-explain forwards only the
//     prompt (and an uploaded file) to Google
//   - "free (unpaid) quota" -> the Gemini key is a free-tier key
//
// Maintenance rule: any new AI feature, or any change to what an existing
// one sends, must update this page in the same change.
export default function AIDataNotice() {
  return (
    <LegalPageLayout title="AI & Data Processing Notice" lastUpdated="28 September 2026">
      <LegalSection heading="Where AI is used">
        <p>
          CountWise uses AI in a small number of optional places. In each one, nothing is sent until you
          click the button for it. The AI provider is Google, through its Gemini API.
        </p>
        <ul>
          <li>
            <strong>CTC Explorer → "Extract from a document".</strong> You choose an offer-letter file
            (PDF, PNG, JPEG or WEBP). The AI reads it and proposes salary components for you to review.
          </li>
          <li>
            <strong>"Explain this" on CTC Explorer, Salary and PF / Pension.</strong> The AI writes a
            plain-language explanation of figures CountWise has already calculated.
          </li>
          <li>
            <strong>"Summarise in plain words" in Financial Assist</strong> (on the Behavior Score page).
            The AI writes a short summary of the observations shown above it.
          </li>
        </ul>
        <p>
          Everything else works without any AI. That includes Money Inbox and categorization: fixed,
          rule-based code that runs the same way every time and never contacts an AI service. Every figure
          CountWise calculates comes from that fixed code. Amounts the AI reads from an uploaded document
          are shown to you as proposals to check, not as facts.
        </p>
      </LegalSection>

      <LegalSection heading="What is sent, and when">
        <ul>
          <li>
            <strong>Extract from a document:</strong> the file you selected, plus fixed instructions. Sent
            only when you click "Extract from document".
          </li>
          <li>
            <strong>Explain this:</strong> the figures shown for that item — for example amounts, rates,
            effective dates, category totals and the assumptions displayed alongside them — plus fixed
            instructions. Sent only when you click "Explain this".
          </li>
          <li>
            <strong>Summarise in plain words:</strong> the observation sentences shown on the page —
            category names, spending amounts, budget amounts and percentages — plus fixed instructions.
            Your individual transactions are not sent. Sent only when you click the button.
          </li>
        </ul>
      </LegalSection>

      <LegalSection heading="What is not sent">
        <ul>
          <li>Your password, email address or username.</li>
          <li>
            Your list of transactions. Financial Assist works out its observations from your transactions
            in your browser, and only the resulting observation sentences are sent — never the transactions
            themselves.
          </li>
          <li>Anything you type into Money Inbox.</li>
        </ul>
        <p>
          Requests are made by a CountWise server function that requires you to be signed in. It passes
          only the text above (and any file you chose) to Google — not your account details.
        </p>
      </LegalSection>

      <LegalSection heading="What CountWise stores">
        <p>
          CountWise does not store the AI's responses, and does not keep a copy of any file you upload.
          Explanations and summaries disappear when you leave the page. If you save a CTC exploration,
          what is saved is the components you reviewed and confirmed — the same as if you had typed them in.
          The API key used to reach Google lives on the server and is never present in the app running in
          your browser.
        </p>
      </LegalSection>

      <LegalSection heading="How Google handles this data — please read">
        <p>
          CountWise currently uses Google's free (unpaid) Gemini API quota. Google's terms for unpaid
          services say that Google may use the content submitted, and the responses generated, to provide,
          improve and develop its products and machine-learning technologies, and that human reviewers may
          read and annotate that content after it has been disconnected from the account, API key and
          project it came from. Google's own terms also advise against submitting sensitive, confidential
          or personal information to unpaid services.
        </p>
        <p>
          In practice: treat these features like any free online tool. If you're unsure, don't use them,
          or use sample figures instead of a real offer letter or your real spending. CountWise works fully
          without them. You can read Google's terms at{' '}
          <a
            href="https://ai.google.dev/gemini-api/terms"
            target="_blank"
            rel="noopener noreferrer"
            className="underline hover:text-gold"
          >
            ai.google.dev/gemini-api/terms
          </a>
          .
        </p>
      </LegalSection>

      <LegalSection heading="AI can be wrong">
        <p>
          Explanations and summaries are generated text and can be incomplete or mistaken. The figures on
          the page are the source of truth — check the text against them. For the Financial Assist summary,
          CountWise also checks the AI's text before showing it, and discards it if it contains a number
          that wasn't provided or wording that gives advice, judges your spending, or guesses at causes.
          That check is a safeguard, not a guarantee.
        </p>
        <p>
          When reading an uploaded document, amounts the AI can't determine are left blank rather than
          guessed, but it can still misread a document. Check every extracted amount before saving.
        </p>
      </LegalSection>

      <LegalSection heading="Review before write, always">
        <p>
          Nothing an AI produces is saved to your financial data automatically. Extracted CTC components
          appear in the same review screen as manual entry, and nothing is saved until you click Save.
          Explanations and summaries are never saved.
        </p>
      </LegalSection>

      <LegalSection heading="Your choices">
        <p>
          Every AI feature is optional and runs only when you click it. You can use CountWise fully
          without any of them.
        </p>
      </LegalSection>

      <LegalSection heading="Planned, not active today">
        <FutureNote>
          <p>Two possible additions are not built and do not run today:</p>
          <ul className="list-disc pl-5 space-y-1.5">
            <li>
              An AI fallback for Money Inbox. The rule-based parser would stay primary; AI would only be
              consulted for entries it can't make sense of, producing a draft for your review — never a
              direct save.
            </li>
            <li>Help reading uploaded bank statements, again producing drafts for your review, not automatic saves.</li>
          </ul>
          <p>
            If either ships, this notice will be updated in the same change, before it is used with real data.
          </p>
        </FutureNote>
      </LegalSection>
    </LegalPageLayout>
  )
}
