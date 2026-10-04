import Button from '../components/ui/Button.jsx'

// Phase 41 - shown when the app cannot find out whether an account is new or
// returning. It never guesses "new" (that would push a returning user through
// the first-time flow). Retry is the main action; "Continue to app" is there so a
// temporary database problem can never lock someone out of their own app.
export default function AccessError({ onRetry, onContinue }) {
  return (
    <div className="min-h-screen flex items-center justify-center p-6 bg-paper dark:bg-charcoal text-ink dark:text-offwhite">
      <div className="max-w-sm w-full text-center">
        <h1 className="font-display text-xl font-semibold">We could not load your account details.</h1>
        <p className="mt-2 text-sm text-muted dark:text-mutedDark">
          This is usually a short connection problem. Please try again.
        </p>
        <div className="mt-6 flex flex-col gap-3">
          <Button onClick={onRetry} className="w-full py-2.5 rounded-lg">
            Try again
          </Button>
          <button
            type="button"
            onClick={onContinue}
            className="text-sm text-muted dark:text-mutedDark hover:text-gold transition-colors"
          >
            Continue to app
          </button>
        </div>
      </div>
    </div>
  )
}
