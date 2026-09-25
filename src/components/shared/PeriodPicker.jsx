// Extracted verbatim from Charts.jsx (Phase 19) — same markup, same
// classes, just parameterized so Reports.jsx can reuse it instead of
// building a second date-range control.
export default function PeriodPicker({ periods, periodKey, onChange, rangeLabel, label = 'Period' }) {
  return (
    <div className="flex flex-wrap items-center justify-between gap-3 border-b border-line dark:border-lineDark pb-3">
      <div>
        <p className="text-xs uppercase tracking-wide text-muted dark:text-mutedDark">{label}</p>
        <p className="text-sm text-ink dark:text-offwhite mt-0.5">{rangeLabel}</p>
      </div>
      <div className="flex items-center gap-1 rounded-md border border-line dark:border-lineDark p-1">
        {periods.map((item) => (
          <button
            key={item.key}
            type="button"
            onClick={() => onChange(item.key)}
            className={`px-3 py-1.5 text-xs font-medium rounded-sm transition-colors ${
              periodKey === item.key
                ? 'bg-gold text-white'
                : 'text-muted dark:text-mutedDark hover:text-ink dark:hover:text-offwhite'
            }`}
          >
            {item.label}
          </button>
        ))}
      </div>
    </div>
  )
}
