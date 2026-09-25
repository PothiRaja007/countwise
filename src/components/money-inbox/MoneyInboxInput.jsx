import { useId, useState } from 'react'
import { X } from 'lucide-react'
import { supabase } from '../../lib/supabaseClient.js'
import { useAuth } from '../../lib/AuthContext.jsx'
import { buildReviewCandidates, checkDuplicate } from '../../lib/moneyInbox.js'
import { friendlyError } from '../../lib/errorMessages.js'
import Modal from '../ui/Modal.jsx'
import Button from '../ui/Button.jsx'
import Input from '../ui/Input.jsx'
import ReviewDrawer from './ReviewDrawer.jsx'

const FIFTEEN_MINUTES_MS = 15 * 60 * 1000

export default function MoneyInboxInput({ onClose, embedded = false, onSaved, initialDate, initialText = '' }) {
  const { user } = useAuth()
  const titleId = useId()
  const [text, setText] = useState(initialText)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState(null)

  // Set once parsing succeeds; while this is non-null we show the review
  // drawer instead of the text panel.
  const [reviewState, setReviewState] = useState(null)

  const handleParse = async () => {
    if (!text.trim() || !user) return
    setLoading(true)
    setError(null)

    try {
      const [accountsRes, rulesRes, categoriesRes, recentRes] = await Promise.all([
        supabase.from('accounts').select('id, name, type').eq('user_id', user.id).eq('is_active', true),
        supabase.from('category_rules').select('keyword, category_id, priority').or(`user_id.eq.${user.id},user_id.is.null`),
        supabase.from('categories').select('id, name, kind').or(`user_id.eq.${user.id},user_id.is.null`),
        supabase
          .from('transactions')
          .select('amount, description, original_input, created_at')
          .eq('user_id', user.id)
          .gte('created_at', new Date(Date.now() - FIFTEEN_MINUTES_MS).toISOString()),
      ])

      if (accountsRes.error) throw accountsRes.error
      if (rulesRes.error) throw rulesRes.error
      if (categoriesRes.error) throw categoriesRes.error
      if (recentRes.error) throw recentRes.error

      const accounts = accountsRes.data || []
      const categoryRules = rulesRes.data || []
      const categories = categoriesRes.data || []
      const recentTransactions = recentRes.data || []

      const candidates = buildReviewCandidates(text, {
        accountNames: accounts.map((a) => a.name),
        categoryRules,
        // initialDate is a fallback default only, used as the same single
        // reference-date anchor parseDate() already takes — an explicit
        // date word in the text (e.g. "yesterday") still resolves relative
        // to it and wins, exactly as it always has relative to "now".
        // Every existing call site that doesn't pass initialDate keeps
        // getting new Date(), unchanged.
        referenceDate: initialDate ? new Date(initialDate) : new Date(),
      }).map((candidate) => ({
        ...candidate,
        duplicate: checkDuplicate(candidate, recentTransactions),
      }))

      setReviewState({ candidates, accounts, categories })
    } catch (err) {
      setError(friendlyError(err, 'Could not parse that entry. Please try again.'))
    } finally {
      setLoading(false)
    }
  }

  // ReviewDrawer calls onClose() once every row is saved or dismissed.
  // In the floating-modal case that's fine as-is, since the parent
  // trigger unmounts this whole component on close. But this component
  // stays permanently mounted when embedded (Overview never toggles it
  // off), so without clearing reviewState here too, a finished review
  // would keep rendering ReviewDrawer forever. Resetting locally first,
  // then notifying the parent, handles both cases correctly.
  const handleFlowClose = () => {
    setReviewState(null)
    setText('')
    onSaved?.()
    onClose?.()
  }

  if (reviewState) {
    return (
      <ReviewDrawer
        candidates={reviewState.candidates}
        accounts={reviewState.accounts}
        categories={reviewState.categories}
        onBack={() => setReviewState(null)}
        onClose={handleFlowClose}
      />
    )
  }

  // Shared panel content — identical in both modes, just wrapped differently.
  const panel = (
    <div
      className={
        embedded
          ? 'space-y-4'
          : 'bg-surface dark:bg-charcoalSurface rounded-t-2xl sm:rounded-2xl border border-line dark:border-lineDark w-full sm:w-[32rem] p-5 space-y-4'
      }
      onClick={embedded ? undefined : (e) => e.stopPropagation()}
    >
      <div className="flex items-center justify-between">
        <h2 id={embedded ? undefined : titleId} className="font-display text-lg font-semibold tracking-tight">Money Inbox</h2>
        {!embedded && (
          <button onClick={handleFlowClose} className="text-muted dark:text-mutedDark hover:text-ink dark:hover:text-offwhite" aria-label="Close">
            <X size={18} />
          </button>
        )}
      </div>

      <p className="text-sm text-muted dark:text-mutedDark">
        Tell CountWise what happened with your money, all in one message.
      </p>

      <Input
        as="textarea"
        autoFocus={!embedded}
        rows={3}
        value={text}
        onChange={(e) => setText(e.target.value)}
        placeholder="coffee 80, bus 40, salary 25000..."
        className="w-full bg-paper dark:bg-charcoal rounded-lg px-3 py-2.5 text-sm resize-none"
      />

      {error && <p className="text-sm text-bad">{error}</p>}

      {/* Money-Inbox-entry-points rebuild: this is the embedded panel's
          own Review button (reached directly on Overview, not through the
          floating trigger) — rebuilt as a plain, unambiguous button/click
          wiring, with handleParse itself left completely untouched. */}
      <div className="flex justify-end gap-2">
        {!embedded && (
          <Button type="button" variant="secondary" onClick={handleFlowClose} className="px-3 py-2 rounded-lg">
            Cancel
          </Button>
        )}
        <Button
          type="button"
          onClick={handleParse}
          disabled={!text.trim() || loading}
          className="px-4 py-2 rounded-lg"
        >
          {loading ? 'Reading...' : 'Review'}
        </Button>
      </div>
    </div>
  )

  if (embedded) {
    return (
      <div className="bg-surface dark:bg-charcoalSurface rounded-2xl border border-line dark:border-lineDark p-5">
        {panel}
      </div>
    )
  }

  return (
    <Modal onClose={handleFlowClose} titleId={titleId} className="fixed inset-0 bg-black/40 flex items-end sm:items-center justify-center">
      {panel}
    </Modal>
  )
}
