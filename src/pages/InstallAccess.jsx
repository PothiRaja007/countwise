import { useState } from 'react'
import { Link } from 'react-router-dom'
import Button from '../components/ui/Button.jsx'
import Footer from '../components/Footer.jsx'
import { WebInstall, NativeStatus, currentOS } from '../components/InstallOptionBlock.jsx'
import { PLATFORMS } from '../lib/platforms.js'

// Phase 41 - "How do you want to use CountWise?"
// One page, two uses:
//   mode 'first-run'  inside the new-user flow (/welcome/install)
//   mode 'public'     /install, reachable without an account
// The honest install/native blocks live in components/InstallOptionBlock.jsx.
export default function InstallAccess({ mode, onInstalled, onUseBrowser }) {
  const [os] = useState(currentOS)

  const backLink =
    mode === 'first-run' ? (
      <Link to="/welcome" className="text-sm text-muted dark:text-mutedDark hover:text-gold transition-colors">
        ← Back to features
      </Link>
    ) : (
      <Link to="/" className="text-sm text-muted dark:text-mutedDark hover:text-gold transition-colors">
        ← Back to CountWise
      </Link>
    )

  return (
    <div className="min-h-screen flex flex-col bg-paper dark:bg-charcoal text-ink dark:text-offwhite">
      <div className="flex-1 w-full max-w-4xl mx-auto px-6 sm:px-8 py-10 sm:py-14">
        <div className="flex items-center justify-between">
          <div className="font-display text-lg font-semibold tracking-tight">
            <span className="text-ink dark:text-offwhite">Count</span>
            <span className="text-gold">Wise</span>
          </div>
          {backLink}
        </div>

        <h1 className="font-display text-3xl sm:text-4xl font-semibold tracking-tight mt-10">
          Install CountWise
        </h1>
        <p className="mt-3 max-w-xl text-muted dark:text-mutedDark leading-relaxed">
          Today, CountWise installs as an app straight from your browser, on the device you are using now. Native apps
          for each system are planned but not available yet.
        </p>

        <div className="mt-8 grid gap-4 sm:grid-cols-2">
          {PLATFORMS.map((p) => (
            <section
              key={p.id}
              aria-labelledby={`os-${p.id}`}
              className={`rounded-xl border bg-surface dark:bg-charcoalSurface p-5 ${
                p.id === os ? 'border-gold' : 'border-line dark:border-lineDark'
              }`}
            >
              <div className="flex items-center justify-between gap-3">
                <h2 id={`os-${p.id}`} className="font-display text-lg font-semibold">
                  {p.label}
                </h2>
                {p.id === os && <span className="text-xs uppercase tracking-[0.14em] text-gold">This device</span>}
              </div>

              <div className="mt-3 text-sm leading-relaxed text-muted dark:text-mutedDark">
                <p className="text-xs uppercase tracking-[0.14em] mb-1">Web app</p>
                <WebInstall platform={p} deviceOs={os} onInstalled={onInstalled} />
              </div>

              <div className="mt-4 pt-3 border-t border-line dark:border-lineDark text-sm text-muted dark:text-mutedDark">
                <p className="text-xs uppercase tracking-[0.14em] mb-1">Native {p.label} app</p>
                <NativeStatus platform={p} />
              </div>
            </section>
          ))}
        </div>

        <div className="mt-10 border-t border-line dark:border-lineDark pt-6">
          <p className="text-sm text-muted dark:text-mutedDark">Prefer not to install anything?</p>
          <Button
            variant="secondary"
            onClick={onUseBrowser}
            className="mt-3 px-5 py-2.5 rounded-lg border border-line dark:border-lineDark"
          >
            Use CountWise in browser
          </Button>
        </div>
      </div>
      <Footer />
    </div>
  )
}
