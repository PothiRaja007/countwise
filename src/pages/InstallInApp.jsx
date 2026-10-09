import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import PageHeader from '../components/layout/PageHeader.jsx'
import { useAuth } from '../lib/AuthContext.jsx'
import { WebInstall, NativeStatus, currentOS } from '../components/InstallOptionBlock.jsx'
import { PLATFORMS } from '../lib/platforms.js'
import { useInstallState } from '../lib/installPrompt.js'

// Phase 41 - "Install CountWise" INSIDE the app (route /get-app, reached from the
// sidebar / More menu). The visitor's own device is selected for them; they can
// switch to read about another system. The sidebar entry is hidden for people who
// already run the installed app; if one opens this address anyway, they get a note.
//
// `initialOs` exists only so tests can pretend to be a specific device.
export default function InstallInApp({ initialOs }) {
  const { profile } = useAuth()
  const navigate = useNavigate()
  const { standalone } = useInstallState()
  const [detected] = useState(() => initialOs ?? currentOS())
  const [selectedId, setSelectedId] = useState(detected === 'other' ? PLATFORMS[0].id : detected)
  const platform = PLATFORMS.find((p) => p.id === selectedId) || PLATFORMS[0]

  return (
    <div className="min-h-screen bg-paper dark:bg-charcoal p-6 sm:p-8 text-ink dark:text-offwhite">
      <PageHeader name={profile?.username} />

      <div className="mt-10 max-w-3xl">
        <p className="text-xs uppercase tracking-[0.14em] text-muted dark:text-mutedDark">Get the app</p>
        <h1 className="font-display text-3xl sm:text-4xl font-semibold tracking-tight mt-2">Install CountWise</h1>
        <p className="mt-3 max-w-xl text-sm text-muted dark:text-mutedDark leading-relaxed">
          Today, CountWise installs as an app straight from your browser, on the device you are using now. Native apps
          for each system are planned but not available yet.
        </p>

        {standalone ? (
          <p className="mt-8 text-sm text-goodText">You are already using the installed CountWise app.</p>
        ) : (
          <>
            {detected === 'other' && (
              <p className="mt-6 text-sm text-muted dark:text-mutedDark">
                We could not tell which device you are on. Please choose yours below.
              </p>
            )}

            <div className="mt-6 flex flex-wrap gap-2" role="group" aria-label="Choose your device">
              {PLATFORMS.map((p) => {
                const active = p.id === selectedId
                return (
                  <button
                    key={p.id}
                    type="button"
                    aria-pressed={active}
                    onClick={() => setSelectedId(p.id)}
                    className={`px-3 py-1.5 rounded-lg text-sm border transition-colors ${
                      active
                        ? 'border-gold bg-gold/10 text-goldText font-medium'
                        : 'border-line dark:border-lineDark text-muted dark:text-mutedDark hover:bg-surface dark:hover:bg-charcoalSurface'
                    }`}
                  >
                    {p.label}
                    {p.id === detected && <span className="ml-1.5 text-[11px] uppercase tracking-[0.1em]">· This device</span>}
                  </button>
                )
              })}
            </div>

            <section
              aria-labelledby="selected-os"
              className="mt-5 rounded-xl border border-line dark:border-lineDark bg-surface dark:bg-charcoalSurface p-5"
            >
              <h2 id="selected-os" className="font-display text-lg font-semibold">
                {platform.label}
              </h2>

              <div className="mt-3 text-sm leading-relaxed text-muted dark:text-mutedDark">
                <p className="text-xs uppercase tracking-[0.14em] mb-1">Web app</p>
                <WebInstall
                  key={platform.id}
                  platform={platform}
                  deviceOs={detected}
                  onInstalled={(via) => navigate(`/thank-you?via=${via}`)}
                />
              </div>

              <div className="mt-4 pt-3 border-t border-line dark:border-lineDark text-sm text-muted dark:text-mutedDark">
                <p className="text-xs uppercase tracking-[0.14em] mb-1">Native {platform.label} app</p>
                <NativeStatus platform={platform} />
              </div>
            </section>
          </>
        )}
      </div>
    </div>
  )
}
