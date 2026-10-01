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
import { useAuth } from '../lib/AuthContext.jsx'
import { MONEY_OPTIONS, MONEY_OPTIONS_DIMENSIONS } from '../lib/moneyOptionsContent.js'

export default function MoneyOptions() {
  const { profile } = useAuth()

  return (
    <div className="p-6 sm:p-8 space-y-6 bg-paper dark:bg-charcoal min-h-screen">
      <PageHeader name={profile?.username} />

      <div>
        <h1 className="font-serif text-2xl font-semibold">Money options</h1>
        <p className="text-sm text-muted dark:text-mutedDark mt-1 max-w-xl">
          General, educational information about common ways people in India hold or grow money — described
          by their general characteristics, not a recommendation for you specifically.
        </p>
      </div>

      <div className="border border-line dark:border-lineDark rounded-lg p-4 bg-paper dark:bg-charcoal">
        <p className="text-sm font-medium text-ink dark:text-offwhite mb-1">Please read before this page is useful to you</p>
        <ul className="text-xs text-muted dark:text-mutedDark space-y-1.5 list-disc pl-4">
          <li>
            CountWise is not a SEBI-registered Investment Adviser or Research Analyst, and nothing on this
            page is personalized investment advice.
          </li>
          <li>
            This page describes general product categories only — it never names a specific fund, stock, or
            scheme, and it never states or implies what any option has returned or will return.
          </li>
          <li>
            It does not use any of your CountWise data, and it is not computed, suggested, or written by AI.
          </li>
          <li>For advice on your own situation, a SEBI-registered Investment Adviser is the right person to ask.</li>
        </ul>
      </div>

      <div className="space-y-4">
        {MONEY_OPTIONS.map((opt) => (
          <div key={opt.name} className="border border-line dark:border-lineDark rounded-lg p-4">
            <p className="font-serif text-base font-semibold mb-2">{opt.name}</p>
            <dl className="grid grid-cols-1 sm:grid-cols-3 gap-3 mb-2">
              {MONEY_OPTIONS_DIMENSIONS.map((d) => (
                <div key={d.key}>
                  <dt className="text-xs uppercase tracking-wide text-muted dark:text-mutedDark">{d.label}</dt>
                  <dd className="text-sm text-ink dark:text-offwhite mt-0.5">{opt[d.key]}</dd>
                </div>
              ))}
            </dl>
            <p className="text-xs text-muted dark:text-mutedDark italic">{opt.note}</p>
          </div>
        ))}
      </div>

      <p className="text-xs text-muted dark:text-mutedDark pt-2">
        This list is not exhaustive and not ranked — the order above carries no meaning. Every option here
        involves its own rules, charges, and conditions that this page does not fully cover; check the
        provider's or scheme's own terms before acting on anything.
      </p>
    </div>
  )
}
