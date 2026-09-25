import { useEffect, useState } from 'react'

// Time-based greeting + auto-updating date. Reusable across pages —
// Overview uses it first (Phase 5), other pages can adopt it later.
function greetingFor(date) {
  const hour = date.getHours()
  if (hour < 12) return 'Good morning'
  if (hour < 17) return 'Good afternoon'
  return 'Good evening'
}

function formatDate(date) {
  return date.toLocaleDateString('en-IN', {
    weekday: 'long',
    day: 'numeric',
    month: 'long',
  })
}

export default function PageHeader({ name }) {
  const [now, setNow] = useState(new Date())

  useEffect(() => {
    // Re-check once a minute so the greeting/date roll over on their own
    // during a long-open tab, without a full page reload.
    const id = setInterval(() => setNow(new Date()), 60 * 1000)
    return () => clearInterval(id)
  }, [])

  return (
    <div>
      <h1 className="font-display text-2xl font-semibold tracking-tight text-ink dark:text-offwhite">
        {greetingFor(now)}{name ? `, ${name}` : ''} 👋
      </h1>
      <p className="text-sm text-muted dark:text-mutedDark mt-1">{formatDate(now)}</p>
    </div>
  )
}
