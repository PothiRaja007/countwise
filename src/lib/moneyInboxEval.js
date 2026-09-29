// Money Inbox parser evaluation (Phase G0).
//
// Pure: runs the parser over moneyInboxCorpus.js and scores it. No React, no
// Supabase, no network. The scoring is deliberately strict and boring:
//   - an ITEM passes only if it produced the right NUMBER of entries and every
//     evaluated field of every entry is right;
//   - a field is evaluated only where the corpus states an expectation, so
//     "not specified" never counts for or against the parser.
//
// Headline numbers exclude entries tagged 'ambiguous' (more than one
// defensible reading) and 'gap' (a capability the parser deliberately does
// not have yet). Those are reported on their own line so nothing is hidden.

import { buildReviewCandidates } from './moneyInbox.js'
import { DEFAULT_RULE_KEYWORDS } from './categorization.js'
import { MONEY_INBOX_CORPUS, CORPUS_ACCOUNTS, CORPUS_REFERENCE_DATE } from './moneyInboxCorpus.js'

// The app's default keyword rules, keyed by category NAME so expectations read naturally.
const RULES = Object.entries(DEFAULT_RULE_KEYWORDS).flatMap(([category, keywords]) =>
  keywords.map((keyword) => ({ keyword, category_id: category }))
)

export function parseForEval(text) {
  return buildReviewCandidates(text, {
    accountNames: CORPUS_ACCOUNTS,
    categoryRules: RULES,
    referenceDate: CORPUS_REFERENCE_DATE,
  })
}

/** Which evaluated fields of one parsed entry disagree with the expectation. */
export function checkEntry(candidate, expected) {
  const fails = []
  if (candidate.amount !== expected.amount) fails.push('amount')
  if (candidate.type !== expected.type) fails.push('type')

  if (expected.type === 'transfer') {
    if (expected.from !== undefined && candidate.fromAccount !== expected.from) fails.push('from')
    if (expected.to !== undefined && candidate.toAccount !== expected.to) fails.push('to')
  } else {
    if (candidate.account !== expected.account) fails.push('account')
    if (expected.cat !== undefined && candidate.categoryId !== expected.cat) fails.push('category')
  }
  // Context only ever exists on an expense (the database enforces it), so it is only judged there.
  if (expected.type === 'expense' && (candidate.spendingContext ?? null) !== (expected.ctx ?? null)) fails.push('context')
  if (expected.review !== undefined && candidate.needsReview !== expected.review) fails.push('review')
  if (expected.date !== undefined && candidate.date !== expected.date) fails.push('date')
  if (expected.conflict !== undefined && JSON.stringify(candidate.accountConflict ?? []) !== JSON.stringify(expected.conflict)) {
    fails.push('accountConflict')
  }
  return fails
}

export function evaluateCorpus(corpus = MONEY_INBOX_CORPUS, parse = parseForEval) {
  return corpus.map((item) => {
    const got = parse(item.text)
    const countOk = got.length === item.entries.length
    const fails = []
    if (countOk) {
      item.entries.forEach((expected, i) => {
        const f = checkEntry(got[i], expected)
        if (f.length) fails.push({ entry: i, fields: f })
      })
    }
    return {
      id: item.id, slice: item.slice, text: item.text, tag: item.tag ?? null,
      want: item.entries.length, got: got.length, countOk, fails,
      ok: countOk && fails.length === 0,
      parsed: got, expected: item.entries,
    }
  })
}

const pct = (right, total) => (total === 0 ? null : (100 * right) / total)

export function summarize(results, corpus = MONEY_INBOX_CORPUS) {
  const headline = results.filter((r) => !r.tag)
  const right = headline.filter((r) => r.ok).length

  // Field accuracy: over entries of items whose entry COUNT was right (a wrong count
  // is already a failure of its own and would otherwise be counted many times over).
  const fields = {}
  const bump = (field, ok) => {
    fields[field] ||= { right: 0, total: 0 }
    fields[field].total++
    if (ok) fields[field].right++
  }
  for (const r of headline.filter((x) => x.countOk)) {
    r.expected.forEach((exp, i) => {
      const failed = new Set(r.fails.find((f) => f.entry === i)?.fields ?? [])
      const evaluated = ['amount', 'type']
      if (exp.type === 'transfer') {
        if (exp.from !== undefined) evaluated.push('from')
        if (exp.to !== undefined) evaluated.push('to')
      } else {
        evaluated.push('account')
        if (exp.cat !== undefined) evaluated.push('category')
      }
      if (exp.type === 'expense') evaluated.push('context')
      if (exp.review !== undefined) evaluated.push('review')
      if (exp.date !== undefined) evaluated.push('date')
      if (exp.conflict !== undefined) evaluated.push('accountConflict')
      for (const f of evaluated) bump(f, !failed.has(f))
    })
  }

  // Context suggestions: precision (when it speaks, is it right?) and recall (when there was a cue, did it speak?).
  let predicted = 0, expectedPos = 0, truePos = 0
  for (const r of headline.filter((x) => x.countOk)) {
    r.expected.forEach((exp, i) => {
      if (exp.type !== 'expense') return
      const got = r.parsed[i].spendingContext ?? null
      if (got) predicted++
      if (exp.ctx) expectedPos++
      if (got && got === exp.ctx) truePos++
    })
  }

  const slices = {}
  for (const r of headline) {
    slices[r.slice] ||= { right: 0, total: 0 }
    slices[r.slice].total++
    if (r.ok) slices[r.slice].right++
  }

  const tagged = (tag) => {
    const list = results.filter((r) => r.tag === tag)
    return { total: list.length, right: list.filter((r) => r.ok).length }
  }

  return {
    headline: { right, total: headline.length, accuracy: pct(right, headline.length) },
    entryCount: {
      right: headline.filter((r) => r.countOk).length, total: headline.length,
      accuracy: pct(headline.filter((r) => r.countOk).length, headline.length),
    },
    fields: Object.fromEntries(Object.entries(fields).map(([k, v]) => [k, { ...v, accuracy: pct(v.right, v.total) }])),
    context: {
      predicted, expectedPos, truePos,
      precision: pct(truePos, predicted), recall: pct(truePos, expectedPos),
    },
    slices: Object.fromEntries(Object.entries(slices).map(([k, v]) => [k, { ...v, accuracy: pct(v.right, v.total) }])),
    gaps: tagged('gap'),
    ambiguous: tagged('ambiguous'),
    failures: headline.filter((r) => !r.ok).map((r) => ({ id: r.id, slice: r.slice, text: r.text, want: r.want, got: r.got, fails: r.fails })),
  }
}

const f1 = (n) => (n === null ? 'n/a' : `${n.toFixed(1)}%`)

export function formatSummary(s, title = 'Money Inbox parser evaluation') {
  const lines = [title, '-'.repeat(title.length)]
  lines.push(`Items fully correct:   ${s.headline.right}/${s.headline.total}  (${f1(s.headline.accuracy)})`)
  lines.push(`Right number of entries: ${s.entryCount.right}/${s.entryCount.total}  (${f1(s.entryCount.accuracy)})`)
  lines.push('')
  lines.push('By slice (items fully correct):')
  for (const [k, v] of Object.entries(s.slices)) lines.push(`  ${k.padEnd(10)} ${String(v.right).padStart(3)}/${String(v.total).padEnd(3)} ${f1(v.accuracy)}`)
  lines.push('')
  lines.push('By field (over items with the right entry count):')
  for (const [k, v] of Object.entries(s.fields)) lines.push(`  ${k.padEnd(14)} ${String(v.right).padStart(3)}/${String(v.total).padEnd(3)} ${f1(v.accuracy)}`)
  lines.push('')
  lines.push(`Context suggestions: precision ${f1(s.context.precision)} (${s.context.truePos}/${s.context.predicted}), recall ${f1(s.context.recall)} (${s.context.truePos}/${s.context.expectedPos})`)
  lines.push(`Known gaps (not headline): ${s.gaps.right}/${s.gaps.total} pass.  Ambiguous (not headline): ${s.ambiguous.right}/${s.ambiguous.total} agree.`)
  return lines.join('\n')
}
