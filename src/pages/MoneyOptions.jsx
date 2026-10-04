// Phase 36 — Money Options.
//
// Grounded in a real regulatory check before writing a word of content
// (SEBI's Investment Advisers Regulations, as amended December 2024, plus
// the January 2025 circular drawing a bright line between education and
// advice for unregistered entities). Two findings shaped every decision
// below:
//   1. "Investment advice" under SEBI's framework is specifically advice
//      on SECURITIES (stocks, bonds, mutual funds, derivatives). General
//      education about product CATEGORIES — what a fixed deposit is, how
//      liquidity differs from a savings account — is not advice, as long
//      as nothing here names a specific security or is personalized.
//   2. SEBI's 2025 enforcement focus specifically targets unregistered
//      people/platforms making RETURN CLAIMS. Even a historical, clearly-
//      labelled "past returns were X%" is a return claim. So this page
//      states NO percentage, NO rupee projection, and NO "historically"
//      framing anywhere — not as an abundance of caution, but because
//      that is specifically the thing current enforcement is aimed at.
//
// Consequences, enforced by how this file is written, not by a disclaimer
// alone papering over something riskier underneath:
//   - 100% static JSX. No Gemini, no Supabase read of the user's own
//     financial data, nothing computed. This is the one feature-ish page
//     in the app that touches none of the user's numbers at all.
//   - No specific fund/stock/scheme names — only product CATEGORIES.
//   - No "recommended for you" framing — every section is phrased as
//     "people sometimes consider this when..." not "you should."
//   - CountWise is not a SEBI-registered Investment Adviser or Research
//     Analyst, and the page says so, prominently, not buried in the Terms.
import PageHeader from '../components/layout/PageHeader.jsx'
import OptionCard from '../components/moneyOptions/OptionCard.jsx'
import { useAuth } from '../lib/AuthContext.jsx'
import {
  MONEY_OPTIONS, MONEY_OPTIONS_INTRO, MONEY_OPTIONS_DISCLAIMER, MONEY_OPTIONS_FOOTER,
} from '../lib/moneyOptionsContent.js'

export default function MoneyOptions() {
  const { profile } = useAuth()

  return (
    <div className="p-6 sm:p-8 bg-paper dark:bg-charcoal min-h-screen">
      <PageHeader name={profile?.username} />

      <div className="mt-6 max-w-3xl xl:max-w-5xl space-y-8">
        <header className="space-y-2">
          <h1 className="font-serif text-2xl font-semibold text-ink dark:text-offwhite">Money options</h1>
          <p className="text-sm text-muted dark:text-mutedDark max-w-lg">{MONEY_OPTIONS_INTRO}</p>
        </header>

        {/* The one sentence that matters stays visible; the rest is one tap away. */}
        <aside
          aria-label="Important notice"
          className="max-w-2xl rounded-lg border border-line dark:border-lineDark p-4"
        >
          <p className="text-sm text-ink dark:text-offwhite">{MONEY_OPTIONS_DISCLAIMER.headline}</p>
          <details className="mt-2">
            <summary className="cursor-pointer select-none text-xs text-ink dark:text-offwhite underline underline-offset-2">
              {MONEY_OPTIONS_DISCLAIMER.moreLabel}
            </summary>
            <ul className="mt-2 space-y-1.5 list-disc pl-4 text-xs text-muted dark:text-mutedDark">
              {MONEY_OPTIONS_DISCLAIMER.more.map((line) => (
                <li key={line}>{line}</li>
              ))}
            </ul>
          </details>
        </aside>

        <ul className="grid grid-cols-1 xl:grid-cols-2 gap-5">
          {MONEY_OPTIONS.map((option) => (
            <OptionCard key={option.name} option={option} />
          ))}
        </ul>

        <p className="text-xs text-muted dark:text-mutedDark max-w-2xl">{MONEY_OPTIONS_FOOTER}</p>
      </div>
    </div>
  )
}
