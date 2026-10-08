import { useId, useState } from 'react'
import { useNavigate } from 'react-router-dom'
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
import QueryResultDialog from './QueryResultDialog.jsx'
import { requestFromResult, queryFromChoice, answerQuery, dataProblemAnswer, mayBeTruncated, QUERY_MESSAGES } from '../../lib/command/queries.js'
import { formatCurrency } from '../../lib/format.js'
import { navigationFromResult, navigationFromChoice } from '../../lib/command/handoff.js'
import { applyReferenceMemory } from '../../lib/command/commandContext.js'
import { memoryFor, putHandoff } from '../../lib/commandSession.js'
import { goalCommandView, resolveGoalCommandChoice, choiceNotice, GOAL_COMMAND_MESSAGES } from '../../lib/command/goalCommands.js'
import { learningCommandView, resolveLearningCommandChoice, learningChoiceNotice, LEARNING_COMMAND_MESSAGES } from '../../lib/command/learningCommands.js'
import { budgetCommandView, resolveBudgetCommandChoice, budgetChoiceNotice, BUDGET_COMMAND_MESSAGES } from '../../lib/command/budgetCommands.js'

const FIFTEEN_MINUTES_MS = 15 * 60 * 1000

// The command guard reads names from the user's own lists. A row without a usable
// id and name is left out, so one bad row can never switch the guard off.
const nameList = (rows) => (rows || [])
  .filter((r) => r && r.id != null && typeof r.name === 'string' && r.name.trim())
  .map((r) => ({ id: String(r.id), name: r.name }))

// The reads behind one question (P5). Select-only, for this user only, and only what
// that question needs. An error, or a result that may have been cut off at the row
// limit, ends as "I couldn't read all your data": a question never shows a figure it
// could not fully read.
const rowsOf = (res) => {
  if (res.error) throw res.error
  return res.data || []
}
async function readQueryData(request, userId) {
  const data = { transactions: [], accounts: [], budgets: [], goals: [], goalContributions: [], rowLimitHit: false }
  if (request.intent === 'QUERY_SPEND') {
    const base = supabase
      .from('transactions')
      .select('category_id, type, amount, transaction_date')
      .eq('user_id', userId)
      .gte('transaction_date', request.period.start)
      .lte('transaction_date', request.period.end)
    data.transactions = rowsOf(await (request.category ? base.eq('category_id', request.category.id) : base))
  } else if (request.intent === 'QUERY_BUDGET_LEFT') {
    data.budgets = rowsOf(await supabase
      .from('budgets')
      .select('category_id, amount, period_start, period_end')
      .eq('user_id', userId)
      .eq('category_id', request.category.id)
      .eq('period_start', request.period.start))
    const budget = data.budgets[0]
    if (budget) {
      data.transactions = rowsOf(await supabase
        .from('transactions')
        .select('category_id, type, amount, transaction_date')
        .eq('user_id', userId)
        .eq('category_id', budget.category_id)
        .gte('transaction_date', budget.period_start)
        .lte('transaction_date', budget.period_end))
    }
  } else if (request.intent === 'QUERY_GOAL_PROGRESS') {
    const [goalsRes, contributionsRes] = await Promise.all([
      supabase.from('goals').select('id, name, target_amount, status').eq('user_id', userId).eq('id', request.goal.id),
      supabase.from('goal_contributions').select('goal_id, account_id, amount, type').eq('user_id', userId).eq('goal_id', request.goal.id),
    ])
    data.goals = rowsOf(goalsRes)
    data.goalContributions = rowsOf(contributionsRes)
  } else {
    const [transactionsRes, accountsRes, contributionsRes] = await Promise.all([
      supabase.from('transactions').select('account_id, to_account_id, type, amount, transaction_date').eq('user_id', userId),
      supabase.from('accounts').select('id, name').eq('user_id', userId).eq('is_active', true),
      supabase.from('goal_contributions').select('goal_id, account_id, amount, type').eq('user_id', userId),
    ])
    data.transactions = rowsOf(transactionsRes)
    data.accounts = rowsOf(accountsRes)
    data.goalContributions = rowsOf(contributionsRes)
  }
  data.rowLimitHit = [data.transactions, data.budgets, data.goals, data.goalContributions, data.accounts].some(mayBeTruncated)
  return data
}

export default function MoneyInboxInput({ onClose, embedded = false, onSaved, initialDate, initialText = '' }) {
  const { user } = useAuth()
  const navigate = useNavigate()
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
  // The user's own goal, category and account names the guard was built from, so a
  // choice that starts a question (P5) can be turned into that question.
  const [guardLists, setGuardLists] = useState(null)
  // A calculated answer to a question (P5), shown in place of the text box.
  const [answer, setAnswer] = useState(null)

  // Answers one complete question. It never falls back to the entry flow: a question
  // that cannot be read gives the "couldn't read your data" answer and no number.
  const answerFor = async (request) => {
    try {
      const data = await readQueryData(request, user.id)
      return answerQuery(request, data, Date.now(), { formatMoney: formatCurrency })
    } catch {
      return dataProblemAnswer()
    }
  }

  // Opens one of the six approved pages (P6). The route comes from the page table in
  // lib/command/handoff.js, never from the typed text. Nothing is saved, so this does
  // not call onSaved; Money Inbox is simply reset (and the floating panel closed).
  const goTo = (destination) => {
    navigate(destination.route)
    setReviewState(null)
    setGuard(null)
    setGuardLists(null)
    setAnswer(null)
    setNotice(null)
    setText('')
    onClose?.()
  }

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
        supabase.from('learning_items').select('id, name, status').eq('user_id', user.id),
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
        let lists = null
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
          // A "which goal?" that a fresh remembered goal can answer (P6). Changes nothing else.
          // Only ACTIVE goals can take a contribution (P7), so only they can be "it".
          const activeGoals = nameList((goalsRes.error ? [] : goalsRes.data || []).filter((g) => g.status === 'active'))
          interpreted = applyReferenceMemory(interpreted, memoryFor(user.id), activeGoals, user.id, Date.now())
          // P8 — the user's learning items WITH their status, for the buttons of a learning command.
          const learningWithStatus = (learningRes.error ? [] : learningRes.data || []).filter((r) => r && r.id != null && typeof r.name === 'string' && r.name.trim()).map((r) => ({ id: String(r.id), name: r.name, status: r.status }))
          // P9 — spending categories only, for the buttons of a budget command.
          const expenseCategories = nameList(categories.filter((c) => c && c.kind === 'expense'))
          lists = { goals, activeGoals, learningItems: learningWithStatus, expenseCategories, categories: nameList(categories), accounts: nameList(accounts) }
        } catch {
          interpreted = null
        }
        if (interpreted && interpreted.kind !== 'transaction') {
          // A complete request to open a page (P6) goes straight there.
          const destination = navigationFromResult(interpreted)
          if (destination) {
            goTo(destination)
            return
          }
          // A complete question that is built (P5) is answered here; anything else
          // stays in the guard panel.
          let request = null
          try {
            request = requestFromResult(interpreted)
          } catch {
            request = null
          }
          if (request) {
            setAnswer(await answerFor(request))
            return
          }
          setGuard(interpreted)
          setGuardLists(lists)
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
    setGuardLists(null)
    setAnswer(null)
    setNotice(null)
    setText('')
    onSaved?.()
    onClose?.()
  }

  // What a button on the guard panel does (decided in lib/command/guardView.js).
  const handleGuardChoice = async (choiceId) => {
    // The buttons of a goal command (P7) are decided in lib/command/goalCommands.js. Continue only
    // PREPARES the handoff and opens the Goals page; the Goals page confirms and saves. Nothing is
    // written here. Edit, Cancel and every other kind of result are not its business ('pass').
    const goalOutcome = resolveGoalCommandChoice(guard, choiceId, guardLists?.activeGoals, Date.now())
    if (goalOutcome.action === 'hand_off') {
      let destination = null
      try {
        const handoff = putHandoff(goalOutcome.pending, user.id, Date.now())
        destination = navigationFromChoice(`open_${handoff.page}`)
      } catch {
        destination = null
      }
      if (destination) {
        goTo(destination)
        return
      }
      setGuard(null)
      setNotice(GOAL_COMMAND_MESSAGES.expired)
      return
    }
    if (goalOutcome.action === 'pick_goal') {
      setNotice(null)
      setGuard(goalOutcome.result)
      return
    }
    if (goalOutcome.action === 'expired' || goalOutcome.action === 'unavailable') {
      setGuard(null)
      setNotice(goalOutcome.message)
      return
    }
    if (goalOutcome.action === 'unknown') {
      setGuard(null)
      return
    }
    // The buttons of a learning command (P8) are decided in lib/command/learningCommands.js, the same way:
    // Continue only PREPARES the handoff and opens the Learning page, which confirms and saves.
    const learningOutcome = resolveLearningCommandChoice(guard, choiceId, guardLists?.learningItems, Date.now())
    if (learningOutcome.action === 'hand_off') {
      let destination = null
      try {
        const handoff = putHandoff(learningOutcome.pending, user.id, Date.now())
        destination = navigationFromChoice(`open_${handoff.page}`)
      } catch {
        destination = null
      }
      if (destination) {
        goTo(destination)
        return
      }
      setGuard(null)
      setNotice(LEARNING_COMMAND_MESSAGES.expired)
      return
    }
    if (learningOutcome.action === 'pick_item') {
      setNotice(null)
      setGuard(learningOutcome.result)
      return
    }
    if (learningOutcome.action === 'expired' || learningOutcome.action === 'unavailable') {
      setGuard(null)
      setNotice(learningOutcome.message)
      return
    }
    if (learningOutcome.action === 'unknown') {
      setGuard(null)
      return
    }
    // The buttons of a budget command (P9) are decided in lib/command/budgetCommands.js, the same way:
    // Continue only PREPARES the handoff and opens the Budgets page, which confirms and saves.
    const budgetOutcome = resolveBudgetCommandChoice(guard, choiceId, guardLists?.expenseCategories, Date.now())
    if (budgetOutcome.action === 'hand_off') {
      let destination = null
      try {
        const handoff = putHandoff(budgetOutcome.pending, user.id, Date.now())
        destination = navigationFromChoice(`open_${handoff.page}`)
      } catch {
        destination = null
      }
      if (destination) {
        goTo(destination)
        return
      }
      setGuard(null)
      setNotice(BUDGET_COMMAND_MESSAGES.expired)
      return
    }
    if (budgetOutcome.action === 'pick_category') {
      setNotice(null)
      setGuard(budgetOutcome.result)
      return
    }
    if (budgetOutcome.action === 'expired' || budgetOutcome.action === 'unavailable') {
      setGuard(null)
      setNotice(budgetOutcome.message)
      return
    }
    if (budgetOutcome.action === 'unknown') {
      setGuard(null)
      return
    }
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
    } else if (outcome.action === 'start') {
      // One of the built questions (P5). Anything that can no longer be found says so.
      setNotice(null)
      // "Create a goal" / "Add money to X" buttons carry no details, so there is nothing to hand over (P7).
      const goalNotice = outcome.intent === 'CREATE_GOAL' || outcome.intent === 'MODIFY_GOAL_CONTRIBUTE' ? choiceNotice(outcome.choiceId, guardLists?.goals) : null
      if (goalNotice) {
        setNotice(goalNotice)
        return
      }
      // "Add a learning item" / "Change the status of X" buttons carry no details either (P8).
      const learningNotice = outcome.intent === 'CREATE_LEARNING_ITEM' || outcome.intent === 'MODIFY_LEARNING_STATUS' ? learningChoiceNotice(outcome.choiceId, guardLists?.learningItems) : null
      if (learningNotice) {
        setNotice(learningNotice)
        return
      }
      // "Create a monthly budget" / "Set a budget amount" buttons carry no details either (P9).
      const budgetNotice = outcome.intent === 'CREATE_BUDGET_MONTH' || outcome.intent === 'MODIFY_BUDGET_AMOUNT' ? budgetChoiceNotice(outcome.choiceId) : null
      if (budgetNotice) {
        setNotice(budgetNotice)
        return
      }
      const destination = outcome.intent === 'NAVIGATE' ? navigationFromChoice(outcome.choiceId) : null
      if (destination) {
        goTo(destination)
        return
      }
      const request = queryFromChoice(outcome.choiceId, guardLists, initialDate ? new Date(initialDate) : new Date())
      if (!request) {
        setNotice(QUERY_MESSAGES.choiceGone)
        return
      }
      setLoading(true)
      setAnswer(await answerFor(request))
      setLoading(false)
    } else {
      setNotice(outcome.message || null)
    }
  }

  // The answer view's two buttons (P5). Neither saves anything.
  const handleAskAgain = () => {
    setAnswer(null)
    setText('')
  }
  const handleAnswerClose = () => {
    setAnswer(null)
    setText('')
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

      {answer ? (
        <QueryResultDialog answer={answer} onAskAgain={handleAskAgain} onClose={handleAnswerClose} />
      ) : guard ? (
        <CommandGuardPanel view={budgetCommandView(learningCommandView(goalCommandView(buildGuardView(guard), guard, guardLists?.activeGoals, Date.now()), guard, guardLists?.learningItems, Date.now()), guard, guardLists?.expenseCategories, Date.now())} onChoose={handleGuardChoice} />
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
