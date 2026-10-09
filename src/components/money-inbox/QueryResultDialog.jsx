import { Link } from 'react-router-dom'
import Button from '../ui/Button.jsx'

// The answer to a question asked in Money Inbox (P5). Everything it shows comes
// from lib/command/queries.js: the number, the period, how many records it came
// from, and one line saying where the figure comes from. This component only draws
// it. It has no save, confirm or write control: a question changes nothing.
//
// The "See more" link is an ordinary link to the page that owns the figure. It
// carries nothing with it (handing work to a page is a later step).
export default function QueryResultDialog({ answer, onAskAgain, onClose }) {
  return (
    <div className="space-y-3" role="region" aria-live="polite" aria-label="Money Inbox answer">
      <h3 className="text-sm font-medium text-ink dark:text-offwhite">{answer.headline}</h3>

      {answer.rows.length > 0 && (
        <dl className="text-sm space-y-1">
          {answer.rows.map((row) => (
            <div key={row.label} className="flex items-baseline justify-between gap-3">
              <dt className="text-muted dark:text-mutedDark">{row.label}</dt>
              <dd className="font-mono text-ink dark:text-offwhite text-right">
                {row.value}
                {row.note && <span className="block text-xs font-sans text-muted dark:text-mutedDark">{row.note}</span>}
              </dd>
            </div>
          ))}
        </dl>
      )}

      <p className="text-xs text-muted dark:text-mutedDark">
        {answer.ok && <span className="font-medium text-ink dark:text-offwhite">Calculated. </span>}
        {answer.basis}
      </p>
      <p className="text-xs text-muted dark:text-mutedDark">{answer.note}</p>

      {answer.seeMore && (
        <p className="text-sm">
          <Link to={answer.seeMore.route} onClick={onClose} className="text-goldText hover:underline">
            {answer.seeMore.label}
          </Link>
        </p>
      )}

      <div className="flex flex-wrap justify-end gap-2">
        <Button type="button" variant="secondary" onClick={onClose} className="px-3 py-2 rounded-lg">
          Close
        </Button>
        <Button type="button" onClick={onAskAgain} className="px-3 py-2 rounded-lg">
          Ask something else
        </Button>
      </div>
    </div>
  )
}
