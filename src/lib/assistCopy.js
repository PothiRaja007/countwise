// Financial Assist — wording (Phase 33a).
//
// Pure. Turns an observation from assistEngine.js into display text. The
// currency formatter is passed in (same approach as explainPF.js) so this
// file has no dependencies and every figure appears verbatim.
//
// Tone rules, enforced by assistCopy.test.js:
//   - Describe what the recorded data shows. Nothing more.
//   - Never advise ("should", "try to", "you could save"), never judge
//     ("overspent", "wasted", "careless"), never predict, and never guess
//     at causes. "Nothing recorded" is not "you spent nothing".

// Words and phrases that never belong in Financial Assist text: advice,
// judgment and alarm. One list, used both by assistCopy.test.js (to guard
// the templates) and by assistNarration.js (to check AI-written text
// before it is ever shown), so the two can never drift apart.
export const FORBIDDEN_PHRASES = [
  'should', 'must', 'overspend', 'overspent', 'waste', 'wasted', 'careless',
  'bad', 'guilty', 'try to', 'need to', 'you could save', 'warning', 'danger',
  'irresponsible', 'reckless', 'fail',
  // Inflected forms: the check matches whole words, so "overspend"
  // alone would let "overspending" through.
  'overspending', 'wasting', 'wasteful', 'failed', 'failing', 'fails',
  'worrying', 'concerning', 'alarming',
]

function pct(value) {
  return `${Math.round(Math.abs(value))}%`
}

// "₹3,000 spent so far this month, compared with ₹2,000 over the same
// days last month — ₹1,000 more (50%)."
function comparisonDetail(f, fmt) {
  const base = `${fmt(f.current)} spent so far this month, compared with ${fmt(f.previous)} over the same days last month`
  if (f.change === 0) return `${base} — no difference.`
  const direction = f.change > 0 ? 'more' : 'less'
  const percent = f.percentChange == null ? '' : ` (${pct(f.percentChange)})`
  return `${base} — ${fmt(Math.abs(f.change))} ${direction}${percent}.`
}

function comparisonPhrase(change) {
  if (change > 0) return 'higher than'
  if (change < 0) return 'lower than'
  return 'about the same as'
}

export function describeObservation(obs, fmt) {
  const f = obs.figures

  switch (obs.type) {
    case 'spend-vs-last-month':
      return {
        headline: `Spending is ${comparisonPhrase(f.change)} at this point last month`,
        detail: comparisonDetail(f, fmt),
      }

    case 'category-change':
      if (f.isNew) {
        return {
          headline: `${f.categoryName}: spending recorded this month`,
          detail: `${fmt(f.current)} spent so far this month, with nothing recorded in this category over the same days last month.`,
        }
      }
      return {
        headline: `${f.categoryName} spending is ${comparisonPhrase(f.change)} at this point last month`,
        detail: comparisonDetail(f, fmt),
      }

    case 'budget-status':
      if (f.over) {
        return {
          headline: `${f.categoryName} is over its budget`,
          detail: `${fmt(f.spent)} spent against a ${fmt(f.budgetAmount)} budget — ${fmt(Math.abs(f.remaining))} over.`,
        }
      }
      if (f.percentUsed >= 100) {
        return {
          headline: `${f.categoryName} has reached its budget`,
          detail: `${fmt(f.spent)} spent against a ${fmt(f.budgetAmount)} budget — nothing remaining.`,
        }
      }
      // Floor, not round: 99.6% must not read as "100%" while there is
      // still money left in the budget.
      return {
        headline: `${f.categoryName} is at ${Math.floor(f.percentUsed)}% of its budget`,
        detail: `${fmt(f.spent)} of ${fmt(f.budgetAmount)} used, ${fmt(f.remaining)} remaining.`,
      }

    default:
      return { headline: '', detail: '' }
  }
}
