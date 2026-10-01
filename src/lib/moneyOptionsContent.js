// Phase 36 — Money Options content, as pure data (see MoneyOptions.jsx for
// why this exists and the regulatory grounding behind it). Separated out
// so the regulatory constraints below are enforced by a real test
// (moneyOptionsContent.test.js), not just by having written it carefully.

export const MONEY_OPTIONS = [
  {
    name: 'Savings account',
    liquidity: 'Very high — withdraw anytime, instantly.',
    horizon: 'No fixed horizon. Day-to-day money.',
    stability: 'Very stable. Balance never falls on its own.',
    note: 'The default place money sits before it is needed, rather than a place people put money to grow it.',
  },
  {
    name: 'Fixed deposit (FD)',
    liquidity: 'Low during the term — early withdrawal usually costs a penalty.',
    horizon: 'Chosen upfront: commonly a few months to a few years.',
    stability: 'Very stable. The bank commits to the term and rate in advance.',
    note: 'A common choice for money that is not needed by a known date and where stability matters more than flexibility.',
  },
  {
    name: 'Recurring deposit (RD)',
    liquidity: 'Low during the term, similar to an FD.',
    horizon: 'Fixed term, built around a monthly contribution rather than one lump sum.',
    stability: 'Very stable, for the same reason an FD is.',
    note: 'Suits building up a sum gradually rather than depositing it all at once.',
  },
  {
    name: 'Public Provident Fund (PPF)',
    liquidity: 'Very low. A long government-set lock-in, with limited partial withdrawal after several years.',
    horizon: 'Long — the scheme runs for a fixed multi-year term.',
    stability: 'Government-backed, so considered very stable.',
    note: 'A long-horizon option some people use alongside, not instead of, more flexible savings.',
  },
  {
    name: 'Mutual funds (as a category)',
    liquidity: 'Varies by fund — commonly higher than an FD, but the value moves day to day.',
    horizon: 'Varies widely — some are built for a few years, others for decades.',
    stability: 'Not stable in the short term. Value can go up or down with the market.',
    note: 'A broad category covering many different funds with different goals — this page describes the category, not any specific fund.',
  },
  {
    name: 'Direct equity (stocks, as a category)',
    liquidity: 'Usually high — shares of listed companies can typically be sold on a trading day.',
    horizon: 'Can be used short-term or long-term, but short-term use carries more risk of loss.',
    stability: 'The least stable category here. Value can change significantly, in either direction, including below what was paid.',
    note: 'Choosing specific companies to invest in is itself a specialised skill — this page does not attempt it.',
  },
]

export const MONEY_OPTIONS_DIMENSIONS = [
  { key: 'liquidity', label: 'Liquidity' },
  { key: 'horizon', label: 'Time horizon' },
  { key: 'stability', label: 'Capital stability' },
]
