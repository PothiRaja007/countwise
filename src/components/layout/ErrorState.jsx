import Button from '../ui/Button.jsx'

// Shared error state for data pages. Never renders the raw Supabase/DB
// error message to the user (it can contain table/column/constraint
// details) — that's logged to the console for debugging instead. onRetry
// is optional; pages that already have a reusable load() function pass it.
export default function ErrorState({ message, onRetry }) {
  if (message) {
    // eslint-disable-next-line no-console
    console.error(message)
  }

  return (
    <div className="py-3">
      <p className="text-sm text-bad">Something went wrong loading this page. Please try again.</p>
      {onRetry && (
        <Button variant="text" onClick={onRetry} className="mt-1.5 text-sm">
          Retry
        </Button>
      )}
    </div>
  )
}
