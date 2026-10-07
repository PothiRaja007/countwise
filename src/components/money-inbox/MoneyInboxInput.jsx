import { useId, useState } from 'react'
import { X } from 'lucide-react'
import { supabase } from '../../lib/supabaseClient.js'
import { useAuth } from '../../lib/AuthContext.jsx'
import { buildReviewCandidates, checkDuplicate } from '../../lib/moneyInbox.js'
import { contextCueHints } from '../../lib/spendingContext.js'
import { friendlyError } from '../../lib/errorMessages.js'
import Modal from '../ui/Modal.jsx'
import Button from '../ui/Button.jsx'
import Input from '../ui/Input.jsx'
import ReviewDrawer from './ReviewDrawer.jsx'
import CommandGuardPanel from './CommandGuardPanel.jsx'
import { interpret } from '../../lib/command/interpreter.js'
import { buildGuardView, resolveGuardChoice } from '../../lib/command/guardView.js'

const FIFTEEN_MINUTES_MS = 15 * 60 * 1000

// The command guard reads names from the user's own lists. A row without a usable
// id and name is left out, so one bad row can never switch the guard off.
const nameList = (rows) => (rows || [])
  .filter((r) => r && r.id != null && typeof r.name === 'string' && r.name.trim())
  .map((r) => ({ id: String(r.id), name: r.name }))

export default function MoneyInboxInput({ onClose, embedded = false, onSaved, initialDate, initialText = '' }) {
  const { user } = useAuth()
  const titleId = useId()
  const [text, setText] = useState(initialText)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState(null)

  // Set once parsing succeeds; while this is non-null we show the review
  // drawer instead of the text panel.
  const [reviewState, setReviewState] = useState(null)

  // Command guard (P4): set when the message was a command, question, page
  // request or unclear, instead of an entry. `notice` explains, in plain words,
  // why the user is back at the text box (not available yet, or timed out).
  const [guard, setGuard] = useState(null)
  const [notice, setNotice] = useState(null)

  // `options.skipGuard` is only used when the user explicitly chose "record it as an
  // expense"; the button passes a click event here, which has no such property.
  const handleParse = async (options) => {
    const skipGuard = options?.skipGuard === true
    if (!text.trim() || !user) return
    setLoading(true)
    setError(null)
    setNotice(null)

    try {
      const [accountsRes, rulesRes, categoriesRes, recentRes, goalsRes, learningRes] = await Promise.all([
        supabase.from('accounts').select('id, name, type').eq('user_id', user.id).eq('is_active', true),
        supabase.from('category_rules').select('keyword, category_id, priority').or(`user_id.eq.${user.id},user_id.is.null`),
        supabase.from('categories').select('id, name, kind').or(`user_id.eq.${user.id},user_id.is.null`),
        supabase
          .from('transactions')
          .select('amount, description, original_input, created_at')
          .eq('user_id', user.id)
          .gte('created_at', new Date(Date.now() - FIFTEEN_MINUTES_MS).toISOString()),
        // Read-only, for the command guard only. A failure here is ignored: the
        // normal entry flow never needs these lists.
        supabase.from('goals').select('id, name, status').eq('user_id', user.id),
        supabase.from('learning_items').select('id, name').eq('user_id', user.id),
      ])

      if (accountsRes.error) throw accountsRes.error
      if (rulesRes.error) throw rulesRes.error
      if (categoriesRes.error) throw categoriesRes.error
      if (recentRes.error) throw recentRes.error

      const accounts = accountsRes.data || []
      const categoryRules = rulesRes.data || []
      const categories = categoriesRes.data || []
      const recentTransactions = recentRes.data || []

      // Command guard (P4): decide first whether this is an entry at all. Only
      // "transaction" continues below, exactly as before. If the guard itself fails,
      // fall back to the normal flow (which still needs confirmation) rather than block it.
      if (!skipGuard) {
        let interpreted = null
        try {
          const goals = nameList((goalsRes.error ? [] : goalsRes.data || []).filter((g) => g.status !== 'archived'))
          const learningItems = nameList(learningRes.error ? [] : learningRes.data)
          interpreted = interpret(
            text,
            {
              id: typeof crypto !== 'undefined' && crypto.randomUUID ? crypto.randomUUID() : `guard-${Date.now()}`,
              referenceDate: initialDate ? new Date(initialDate) : new Date(),
              goals,
              categories: nameList(categories),
              learningItems,
              accounts: nameList(accounts),
            },
            Date.now(),
          )
        } catch {
          interpreted = null
        }
        if (interpreted && interpreted.kind !== 'transaction') {
          setGuard(interpreted)
          return
        }
      }

      const candidates = buildReviewCandidates(text, {
        // Full {id, name, type} objects — type is what lets a generic word
        // like "cash" or "UPI" resolve to the right account when no
        // account is named literally (G0.1).
        accounts,
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
    setGuard(null)
    setNotice(null)
    setText('')
    onSaved?.()
    onClose?.()
  }

  // What a button on the guard panel does (decided in lib/command/guardView.js).
  const handleGuardChoice = (choiceId) => {
    let outcome
    try {
      outcome = resolveGuardChoice(guard, choiceId, Date.now())
    } catch {
      setGuard(null)
      return
    }
    setGuard(null)
    if (outcome.action === 'cancel') {
      setNotice(null)
      setText('')
    } else if (outcome.action === 'edit') {
      setNotice(null)
    } else if (outcome.action === 'continue_as_transaction') {
      setNotice(null)
      handleParse({ skipGuard: true })
    } else {
      setNotice(outcome.message || null)
    }
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

      {guard ? (
        <CommandGuardPanel view={buildGuardView(guard)} onChoose={handleGuardChoice} />
      ) : (
        <>
      <p className="text-sm text-muted dark:text-mutedDark">
        Tell CountWise what happened with your money, all in one message.
      </p>

      <Input
        as="textarea"
        autoFocus={!embedded}
        rows={3}
        value={text}
        onChange={(e) => setText(e.target.value)}
        placeholder="dinner with friends 500 bank, bus 40 wallet, salary 25000..."
        className="w-full bg-paper dark:bg-charcoal rounded-lg px-3 py-2.5 text-sm resize-none"
      />

      {/* What the parser understands, so nobody has to guess. The context
          list is generated from the same rules the parser uses, so it
          cannot go out of date. Native <details>: no extra state. */}
      <details className="text-xs text-muted dark:text-mutedDark">
        <summary className="cursor-pointer hover:text-ink dark:hover:text-offwhite">What CountWise understands</summary>
        <div className="mt-2 space-y-2 leading-5">
          <p>
            Write it the way you'd say it: what it was, how much, how you paid (use the account's name, like "bank"
            or "wallet"), and, if you like, the circumstances. Use a comma between different items.
          </p>
          <div>
            <p className="text-ink dark:text-offwhite">Spending context, suggested from phrases like:</p>
            <ul className="mt-1 space-y-0.5">
              {contextCueHints().map((h) => (
                <li key={h.value}>
                  <span className="font-medium text-ink dark:text-offwhite">{h.label}</span> — {h.examples.join(' · ')}
                </li>
              ))}
            </ul>
          </div>
          <p>Nothing is saved until you confirm on the next screen, where you can change anything.</p>
        </div>
      </details>

      {notice && <p className="text-sm text-muted dark:text-mutedDark">{notice}</p>}

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
        </>
      )}
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
