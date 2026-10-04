// Phase 36 — Money Options content, as pure data (see MoneyOptions.jsx for
// why this exists and the regulatory grounding behind it). Separated out
// so the regulatory constraints are enforced by a real test
// (moneyOptionsContent.test.js), not just by having written it carefully.
//
// Reading-load design (4 Oct 2026): the page used to show ~500 words at once.
// Each option now has a one-line `summary` and three short `quick` labels that
// are visible by default; the full sentences (`liquidity`, `horizon`,
// `stability`, `note`) sit behind a "More details" toggle, so nothing was
// removed — it is just not all shown at once. The warning text lives here too
// (not in the JSX) so the same safety scan covers it.

export const MONEY_OPTIONS_INTRO =
  'A simple look at common ways people in India keep money, and how they differ.'

export const MONEY_OPTIONS_DISCLAIMER = {
  headline: 'General information only. CountWise is not a SEBI-registered adviser, and this is not advice for you.',
  moreLabel: 'More about this page',
  more: [
    'It describes types of options only. It never names a fund, stock or scheme, and it makes no claim about money made from any option.',
    'It does not use your CountWise data, and no AI writes it.',
    'For advice about your own money, ask a SEBI-registered Investment Adviser.',
  ],
}

export const MONEY_OPTIONS_FOOTER =
  "This list is not complete, and the order means nothing. Each option has its own rules and charges, so read the provider's terms first."

// The only words allowed in the short `quick` labels — keeps every card
// readable the same way and stops a long phrase sneaking back in.
export const QUICK_LABELS = {
  liquidity: ['Very easy', 'Easy', 'Limited', 'Very limited', 'Varies'],
  horizon: ['No fixed time', 'Fixed term', 'Long term', 'Varies'],
  stability: ['Very steady', 'Moves with market', 'Least steady'],
}

export const MONEY_OPTIONS = [
  {
    name: 'Savings account',
    summary: 'Everyday money you can use anytime.',
    quick: { liquidity: 'Very easy', horizon: 'No fixed time', stability: 'Very steady' },
    liquidity: 'Very high — withdraw anytime, instantly.',
    horizon: 'No fixed horizon. Day-to-day money.',
    stability: 'Very stable. Balance never falls on its own.',
    note: 'The default place money sits before it is needed, rather than a place people put money to grow it.',
  },
  {
    name: 'Fixed deposit (FD)',
    summary: 'Money kept away for a set time.',
    quick: { liquidity: 'Limited', horizon: 'Fixed term', stability: 'Very steady' },
    liquidity: 'Low during the term — early withdrawal usually costs a penalty.',
    horizon: 'Chosen upfront: commonly a few months to a few years.',
    stability: 'Very stable. The bank commits to the term and rate in advance.',
    note: 'A common choice for money that is not needed by a known date and where stability matters more than flexibility.',
  },
  {
    name: 'Recurring deposit (RD)',
    summary: 'Put aside a fixed amount each month.',
    quick: { liquidity: 'Limited', horizon: 'Fixed term', stability: 'Very steady' },
    liquidity: 'Low during the term, similar to an FD.',
    horizon: 'Fixed term, built around a monthly contribution rather than one lump sum.',
    stability: 'Very stable, for the same reason an FD is.',
    note: 'Suits building up a sum gradually rather than depositing it all at once.',
  },
  {
    name: 'Public Provident Fund (PPF)',
    summary: 'A long-term government savings scheme.',
    quick: { liquidity: 'Very limited', horizon: 'Long term', stability: 'Very steady' },
    liquidity: 'Very low. A long government-set lock-in, with limited partial withdrawal after several years.',
    horizon: 'Long — the scheme runs for a fixed multi-year term.',
    stability: 'Government-backed, so considered very stable.',
    note: 'A long-horizon option some people use alongside, not instead of, more flexible savings.',
  },
  {
    name: 'Mutual funds (as a category)',
    summary: 'Many investments pooled into one fund.',
    quick: { liquidity: 'Varies', horizon: 'Varies', stability: 'Moves with market' },
    liquidity: 'Varies by fund — commonly higher than an FD, but the value moves day to day.',
    horizon: 'Varies widely — some are built for a few years, others for decades.',
    stability: 'Not stable in the short term. Value can go up or down with the market.',
    note: 'A broad category covering many different funds with different goals — this page describes the category, not any specific fund.',
  },
  {
    name: 'Direct equity (stocks, as a category)',
    summary: 'Owning shares of listed companies.',
    quick: { liquidity: 'Easy', horizon: 'Varies', stability: 'Least steady' },
    liquidity: 'Usually high — shares of listed companies can typically be sold on a trading day.',
    horizon: 'Can be used short-term or long-term, but short-term use carries more risk of loss.',
    stability: 'The least stable category here. Value can change significantly, in either direction, including below what was paid.',
    note: 'Choosing specific companies to invest in is itself a specialised skill — this page does not attempt it.',
  },
]

// `label` is the plain-words name shown on the card; `term` is the finance
// word, shown in "More details" so people still learn it.
export const MONEY_OPTIONS_DIMENSIONS = [
  { key: 'liquidity', label: 'Getting money out', term: 'Liquidity' },
  { key: 'horizon', label: 'How long', term: 'Time horizon' },
  { key: 'stability', label: 'Ups and downs', term: 'Capital stability' },
]
