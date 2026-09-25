import { useState } from 'react'
import { AlertTriangle } from 'lucide-react'
import { supabase } from '../../lib/supabaseClient.js'
import { useAuth } from '../../lib/AuthContext.jsx'
import Button from '../ui/Button.jsx'

const CONFIRM_WORD = 'DELETE'

// Real confirmation friction per §6.10 — the button stays disabled until
// the exact word is typed, not a single click or a plain window.confirm().
// This is the one genuinely irreversible action in v1.1, so it gets its
// own section, its own explicit error handling, and never signs the user
// out unless the deletion actually succeeded server-side.
export default function AccountDeletionSection() {
  const { user, signOut } = useAuth()
  const [confirmText, setConfirmText] = useState('')
  const [deleting, setDeleting] = useState(false)
  const [error, setError] = useState(null)

  const canDelete = confirmText === CONFIRM_WORD && !deleting

  const handleDelete = async () => {
    if (!canDelete || !user) return
    setDeleting(true)
    setError(null)

    let response
    try {
      response = await supabase.functions.invoke('delete-account', {
        body: { userId: user.id },
      })
    } catch (invokeErr) {
      // eslint-disable-next-line no-console
      console.error(invokeErr)
      setDeleting(false)
      setError("Couldn't reach the account deletion service. Please check your connection and try again.")
      return
    }

    const { data, error: fnError } = response

    // functions.invoke() can fail two ways: a transport/HTTP-level error
    // (fnError), or a successful HTTP response whose JSON body itself
    // reports failure (data?.error) — both must be treated as failure,
    // and neither ever signs the user out. Their account still exists;
    // nothing was deleted.
    if (fnError || data?.error || !data?.success) {
      // eslint-disable-next-line no-console
      console.error(fnError || data?.error)
      setDeleting(false)
      setError(
        "Something went wrong and your account was not deleted. Please try again, or contact support if this keeps happening."
      )
      return
    }

    // Success: there is no account left to show anything to.
    await signOut()
    // No explicit navigation needed — App.jsx already renders <Login />
    // as soon as the auth listener reports session === null.
  }

  return (
    <div className="space-y-4 max-w-lg">
      <div className="flex gap-2.5 p-3 rounded-md border border-bad/30 bg-bad/5">
        <AlertTriangle size={16} className="text-bad shrink-0 mt-0.5" />
        <div className="text-sm text-ink dark:text-offwhite">
          <p className="font-medium">Delete your account</p>
          <p className="text-muted dark:text-mutedDark mt-1">
            This permanently deletes your account and every transaction, account, goal, budget, and setting
            associated with it. This cannot be undone.
          </p>
        </div>
      </div>

      <div>
        <label htmlFor="confirm-delete" className="block text-xs font-medium text-muted dark:text-mutedDark mb-1">
          Type <span className="font-mono text-ink dark:text-offwhite">{CONFIRM_WORD}</span> to confirm
        </label>
        <input
          id="confirm-delete"
          type="text"
          value={confirmText}
          onChange={(e) => {
            setConfirmText(e.target.value)
            setError(null)
          }}
          placeholder={CONFIRM_WORD}
          autoComplete="off"
          className="w-full text-sm py-2 px-3 rounded-md bg-surface dark:bg-charcoalSurface border border-line dark:border-lineDark outline-none focus:border-bad font-mono"
        />
      </div>

      {error && <p className="text-sm text-bad">{error}</p>}

      <Button
        variant="destructive"
        onClick={handleDelete}
        disabled={!canDelete}
        className="px-4 py-2 rounded-md"
      >
        {deleting ? 'Deleting account...' : 'Delete my account'}
      </Button>
    </div>
  )
}
