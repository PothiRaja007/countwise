// V1.2.5 — Estimate/Provenance Visual Hierarchy.
//
// One shared primitive for the certainty/provenance model locked in the
// product-direction review:
//   Financial state:   actual | planned
//   Calculation state: calculated | estimated
//   Suggestion state:  suggested
//   Confidence:        certain | uncertain (its own axis, shown only when
//                       genuinely uncertain — not part of `kind`)
//   Provenance:         source / effective date / assumptions — metadata
//                       riding on a value, never its own badge
//
// Visual language is deliberately NOT new: it extends the dashed-gold
// treatment already used for parser-suggested values in Money Inbox's
// ReviewDrawer.jsx (`border border-dashed border-gold text-gold` on a
// select, plus a small adjacent "suggested" label) into one reusable
// component, instead of that pattern being redefined ad hoc per page.
//
// 'actual' is the default, unmarked state — per spec, it gets no visual
// treatment at all. Passing no props beyond `children` renders the value
// exactly as given, with nothing extra in the DOM. Marking everything
// would defeat the purpose: nothing would stand out.

const KIND_LABEL = {
  planned: 'Planned',
  calculated: 'Calculated',
  estimated: 'Estimated',
  suggested: 'Suggested',
}

// Small expandable disclosure for source / effective date / assumptions —
// genuinely attached to the value it describes (rendered inline, right
// next to it), not a floating tooltip or a separate always-visible block.
// A native <details>/<summary> is used deliberately: keyboard-accessible
// and togglable with zero extra JS state, and modal/complex-a11y work is
// explicitly out of scope for this task.
function ProvenanceDetail({ source, sourceUrl, effectiveDate, assumptions }) {
  const assumptionLines = Array.isArray(assumptions) ? assumptions : assumptions ? [assumptions] : []
  const hasContent = source || sourceUrl || effectiveDate || assumptionLines.length > 0
  if (!hasContent) return null

  return (
    <details className="inline-block align-middle">
      <summary
        className="inline-flex items-center justify-center w-3.5 h-3.5 rounded-full border border-gold/60 text-gold text-[9px] leading-none cursor-pointer select-none list-none marker:content-none [&::-webkit-details-marker]:hidden"
        aria-label="Show source and assumptions"
      >
        i
      </summary>
      <div className="mt-1.5 max-w-xs text-[11px] leading-relaxed text-muted dark:text-mutedDark border border-line dark:border-lineDark rounded-md bg-surface dark:bg-charcoalSurface p-2.5 space-y-1">
        {source && <p>{source}</p>}
        {effectiveDate && <p>{effectiveDate}</p>}
        {assumptionLines.map((line, i) => (
          <p key={i}>{line}</p>
        ))}
        {sourceUrl && (
          <a href={sourceUrl} target="_blank" rel="noreferrer" className="text-gold hover:underline inline-block">
            Official source
          </a>
        )}
      </div>
    </details>
  )
}

/**
 * @param {'actual'|'planned'|'calculated'|'estimated'|'suggested'} [kind='actual']
 * @param {string} [label] - override the kind's default chip text (e.g. a Budget Recipe reason string)
 * @param {'uncertain'} [confidence] - only ever pass this when genuinely uncertain; omit otherwise
 * @param {{source?: string, sourceUrl?: string, effectiveDate?: string, assumptions?: string|string[]}} [provenance]
 * @param {*} [children] - the value this badge is attached to. Optional — omit for a
 *   standalone chip (e.g. marking a suggestion row that has no single boxable value).
 */
export default function ValueBadge({ kind = 'actual', label, confidence, provenance, children }) {
  const isMarkedKind = kind !== 'actual'
  const isUncertain = confidence === 'uncertain'
  const hasProvenance = !!provenance

  // True default state: nothing to flag. Render the value exactly as
  // given — no wrapper span, no extra markup at all.
  if (!isMarkedKind && !isUncertain && !hasProvenance) {
    return children ?? null
  }

  const chipText = label || KIND_LABEL[kind] || kind

  return (
    <span className="inline-flex items-center gap-1.5 flex-wrap">
      {children != null ? (
        isMarkedKind ? (
          <span className="inline-flex border border-dashed border-gold rounded-md px-1.5 py-0.5">{children}</span>
        ) : (
          children
        )
      ) : (
        isMarkedKind && (
          <span className="inline-flex border border-dashed border-gold rounded-md px-1.5 py-0.5 text-[11px] font-medium text-gold whitespace-nowrap">
            {chipText}
          </span>
        )
      )}
      {children != null && (isMarkedKind || isUncertain) && (
        <span className="inline-flex items-center gap-1 text-[11px] font-medium text-gold whitespace-nowrap">
          {isMarkedKind && chipText}
          {isUncertain && <span>{isMarkedKind ? '· uncertain' : 'Uncertain'}</span>}
        </span>
      )}
      {children == null && isUncertain && (
        <span className="text-[11px] font-medium text-gold whitespace-nowrap">Uncertain</span>
      )}
      {hasProvenance && <ProvenanceDetail {...provenance} />}
    </span>
  )
}
