import { useSearchParams } from 'react-router-dom'
import Button from '../components/ui/Button.jsx'
import Footer from '../components/Footer.jsx'
import { cleanVia } from '../lib/accessFlow.js'
import { useInstallState } from '../lib/installPrompt.js'

// Phase 41 - the Thank You page.
// It says only what is TRUE:
//   pwa        "Install started" - upgraded to "installed" ONLY after the browser's own
//              appinstalled event
//   installed  the app was already running installed
//   ios        steps were shown; completion cannot be detected
//   browser    nothing was installed
// It never claims a native app was installed.
function copyFor(via, installedEvent) {
  switch (via) {
    case 'pwa':
      return installedEvent
        ? {
            title: 'CountWise is installed.',
            body: 'Look for CountWise in your apps, Start menu or home screen.',
          }
        : {
            title: 'Install started.',
            body: 'If your browser asked you to confirm, please do. When it finishes, you will find CountWise among your apps.',
          }
    case 'installed':
      return {
        title: 'CountWise is installed on this device.',
        body: 'You are already using the installed app.',
      }
    case 'ios':
      return {
        title: 'Almost there.',
        body: 'Finish the Add to Home Screen steps, then open CountWise from your home screen.',
      }
    default:
      return {
        title: 'You are ready.',
        body: 'CountWise runs right in your browser. You can install it later from Install CountWise in the app menu.',
      }
  }
}

export default function ThankYou({ mode, onContinue, busy = false, error = null }) {
  const [params] = useSearchParams()
  const via = cleanVia(params.get('via'))
  const { installed } = useInstallState()
  const { title, body } = copyFor(via, installed)

  return (
    <div className="min-h-screen flex flex-col bg-paper dark:bg-charcoal text-ink dark:text-offwhite">
      <main className="flex-1 w-full max-w-2xl mx-auto px-6 sm:px-8 py-10 sm:py-14">
        <div className="font-display text-lg font-semibold tracking-tight">
          <span className="text-ink dark:text-offwhite">Count</span>
          <span className="text-goldText">Wise</span>
        </div>

        <h1 className="font-display text-4xl sm:text-5xl font-semibold tracking-tight mt-16">{title}</h1>
        <p className="mt-4 max-w-xl text-muted dark:text-mutedDark leading-relaxed" role="status">
          {body}
        </p>
        <p className="mt-6 text-xs uppercase tracking-[0.14em] text-muted dark:text-mutedDark">Every expense counts</p>

        {error && <p className="mt-6 text-sm text-badText">{error}</p>}

        <div className="mt-8">
          <Button onClick={() => onContinue(via)} disabled={busy} className="px-5 py-2.5 rounded-lg">
            {busy ? 'Please wait...' : mode === 'first-run' ? 'Use CountWise as a website' : 'Open CountWise'}
          </Button>
        </div>
      </main>
      <Footer />
    </div>
  )
}
