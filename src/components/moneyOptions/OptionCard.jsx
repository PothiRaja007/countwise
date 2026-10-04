import { MONEY_OPTIONS_DIMENSIONS } from '../../lib/moneyOptionsContent.js'

// One money option, built to be skimmed: name, one short line, three short
// labels. The full sentences are one tap away under "More details".
export default function OptionCard({ option }) {
  return (
    <li className="rounded-xl border border-line dark:border-lineDark bg-surface dark:bg-charcoalSurface p-5 flex flex-col gap-4">
      <div>
        <h2 className="font-serif text-lg font-semibold text-ink dark:text-offwhite">{option.name}</h2>
        <p className="text-sm text-muted dark:text-mutedDark mt-1">{option.summary}</p>
      </div>

      <dl className="space-y-2 sm:space-y-0 sm:grid sm:grid-cols-3 sm:gap-4">
        {MONEY_OPTIONS_DIMENSIONS.map((d) => (
          <div key={d.key} className="flex items-baseline justify-between gap-3 sm:block">
            <dt className="text-[11px] uppercase tracking-wide text-muted dark:text-mutedDark">{d.label}</dt>
            <dd className="text-sm font-medium text-ink dark:text-offwhite sm:mt-1 text-right sm:text-left">
              {option.quick[d.key]}
            </dd>
          </div>
        ))}
      </dl>

      <details className="border-t border-line dark:border-lineDark pt-3">
        <summary className="cursor-pointer select-none text-xs font-medium text-ink dark:text-offwhite underline underline-offset-2">
          More details
        </summary>
        <dl className="mt-3 space-y-3">
          {MONEY_OPTIONS_DIMENSIONS.map((d) => (
            <div key={d.key}>
              <dt className="text-xs text-muted dark:text-mutedDark">{d.term}</dt>
              <dd className="text-sm text-ink dark:text-offwhite mt-0.5">{option[d.key]}</dd>
            </div>
          ))}
        </dl>
        <p className="mt-3 text-xs text-muted dark:text-mutedDark italic">{option.note}</p>
      </details>
    </li>
  )
}
