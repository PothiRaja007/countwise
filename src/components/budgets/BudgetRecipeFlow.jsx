import { useEffect, useMemo, useRef, useState } from 'react'
import { parseRecipeInput, mergeByCategory, suggestFromHistory, suggestFromProfile, recentIncomeTotal } from '../../lib/budgetRecipe.js'
import { saveBudgetRow } from '../../lib/budgetSave.js'
import { formatCurrency } from '../../lib/format.js'
import { categoryPillClasses } from '../../lib/categoryColors.js'
import { friendlyError } from '../../lib/errorMessages.js'
import ValueBadge from '../ui/ValueBadge.jsx'
import Button from '../ui/Button.jsx'
import Input from '../ui/Input.jsx'
import Select from '../ui/Select.jsx'

// Phase 17.1 (revised) — Budget Inbox. Pool -> Cook -> Curated Budget ->
// Done -> Missing Items -> Confirm additions. Embedded directly on the
// Budgets page (never hidden behind a button), the same philosophy as
// Money Inbox: the user sees it, and uses it.
//
// Scope reconfirmed: no income-aware suggested ranges, no life-stage
// engine, no elaborate confidence scoring (source is just
// 'user' | 'history' | 'profile'). See budgetRecipe.js for detail.

const COOKING_MESSAGES = ['Gathering your expenses', 'Organizing your monthly ingredients', 'Checking your spending history', 'Preparing your budget']
const COOKING_STEP_MS = 900
const MAX_MISSING_SUGGESTIONS = 6
const THIRTY_DAYS_MS = 30 * 24 * 60 * 60 * 1000

function monthRangeFor(monthValue) {
  const [year, month] = monthValue.split('-').map(Number)
  const start = new Date(year, month - 1, 1)
  const end = new Date(year, month, 0)
  const toISO = (d) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
  return { period_start: toISO(start), period_end: toISO(end) }
}

function findCategoryIdByName(categories, name) {
  const match = categories.find((c) => c.name.toLowerCase() === name.toLowerCase())
  return match ? match.id : null
}

let rowIdCounter = 0
function nextRowId() {
  rowIdCounter += 1
  return `row-${rowIdCounter}`
}

export default function BudgetRecipeFlow({ userId, incomeType, categories, categoryRules, transactions, budgetedCategoryIdsThisMonth, targetMonth, onSaved }) {
  const [step, setStep] = useState('input') // input | cooking | curated | missing
  const [inputText, setInputText] = useState('')
  const [cookingIndex, setCookingIndex] = useState(0)

  // Curated step state - one row per resolved-or-needs-review candidate.
  const [rows, setRows] = useState([])
  const [amountText, setAmountText] = useState({}) // rowId -> raw string
  const [categoryChoice, setCategoryChoice] = useState({}) // rowId -> categoryId
  const [curatedSaving, setCuratedSaving] = useState(false)
  const [rowStatus, setRowStatus] = useState({}) // rowId -> 'duplicate' | 'error'

  // Missing-items step state.
  const [missingRows, setMissingRows] = useState([])
  const [missingSelected, setMissingSelected] = useState({}) // rowId -> boolean
  const [missingAmountText, setMissingAmountText] = useState({}) // rowId -> raw string
  const [missingSaving, setMissingSaving] = useState(false)
  const [missingRowStatus, setMissingRowStatus] = useState({})

  // Unlike every other user-facing error in this file (which come from
  // saveBudgetRow()'s own {error} return and are already handled per-row),
  // this component makes no Supabase calls of its own — it works entirely
  // from props already fetched by Budgets.jsx. The one real risk here is
  // buildCuratedBudget()/buildMissingSuggestions() throwing a runtime
  // error while parsing input or building suggestions, which would
  // otherwise leave the user stuck on the "cooking" animation forever
  // with no explanation. buildError exists to catch exactly that.
  const [buildError, setBuildError] = useState(null)

  const cookingTimer = useRef(null)

  const { period_start: targetPeriodStart, period_end: targetPeriodEnd } = useMemo(() => monthRangeFor(targetMonth), [targetMonth])
  const monthLabel = useMemo(() => new Date(targetPeriodStart).toLocaleDateString('en-IN', { month: 'long' }), [targetPeriodStart])

  const categoryNameById = useMemo(() => {
    const map = new Map()
    categories.forEach((c) => map.set(c.id, c.name))
    return map
  }, [categories])

  useEffect(() => {
    return () => clearTimeout(cookingTimer.current)
  }, [])

  const startCooking = () => {
    if (!inputText.trim()) return
    setBuildError(null)
    setStep('cooking')
    setCookingIndex(0)

    const advance = (i) => {
      if (i >= COOKING_MESSAGES.length - 1) {
        cookingTimer.current = setTimeout(() => {
          try {
            buildCuratedBudget()
          } catch (err) {
            setBuildError(friendlyError(err, "Couldn't put together a budget from that. Please try again."))
            setStep('input')
          }
        }, COOKING_STEP_MS)
        return
      }
      cookingTimer.current = setTimeout(() => {
        setCookingIndex(i + 1)
        advance(i + 1)
      }, COOKING_STEP_MS)
    }
    advance(0)
  }

  const buildCuratedBudget = () => {
    const parsed = parseRecipeInput(inputText, categoryRules)
    const merged = mergeByCategory(parsed).map((c) => ({
      ...c,
      categoryName: c.categoryId ? categoryNameById.get(c.categoryId) || null : null,
    }))

    const nextRows = merged.map((c) => ({ ...c, id: nextRowId() }))
    const nextAmountText = {}
    nextRows.forEach((r) => {
      nextAmountText[r.id] = r.amount === null ? '' : String(r.amount)
    })

    setRows(nextRows)
    setAmountText(nextAmountText)
    setCategoryChoice({})
    setRowStatus({})
    setStep('curated')
  }

  const rowAmount = (row) => {
    const text = amountText[row.id]
    if (text === undefined || text === '') return null
    const n = Number(text)
    return Number.isNaN(n) ? null : n
  }
  const rowCategoryId = (row) => categoryChoice[row.id] ?? row.categoryId

  const readyRows = rows.filter((r) => rowAmount(r) > 0 && !!rowCategoryId(r))
  const incompleteCount = rows.length - readyRows.length
  const curatedTotal = readyRows.reduce((sum, r) => sum + rowAmount(r), 0)

  const income = useMemo(() => {
    const now = new Date()
    const start = new Date(now.getTime() - THIRTY_DAYS_MS)
    const toISO = (d) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
    return recentIncomeTotal(transactions, toISO(start), toISO(now))
  }, [transactions])

  const buildMissingSuggestions = (savedCategoryIds) => {
    const excludedIds = new Set([...budgetedCategoryIdsThisMonth, ...savedCategoryIds])
    const history = suggestFromHistory(transactions, [...excludedIds]).map((c) => ({
      ...c,
      categoryName: categoryNameById.get(c.categoryId) || null,
    }))

    const namesCovered = [...history.map((c) => c.categoryName).filter(Boolean), ...[...excludedIds].map((id) => categoryNameById.get(id)).filter(Boolean)]

    const profile = incomeType
      ? suggestFromProfile(incomeType, namesCovered).map((c) => ({
          ...c,
          categoryId: findCategoryIdByName(categories, c.categoryName),
        }))
      : []

    const combined = [...history, ...profile].slice(0, MAX_MISSING_SUGGESTIONS).map((c) => ({ ...c, id: nextRowId() }))

    const nextSelected = {}
    const nextAmountText = {}
    combined.forEach((c) => {
      nextSelected[c.id] = false // every suggestion, history or profile, starts unselected - the user actively adds it
      nextAmountText[c.id] = c.amount === null ? '' : String(c.amount)
    })

    setMissingRows(combined)
    setMissingSelected(nextSelected)
    setMissingAmountText(nextAmountText)
    setMissingRowStatus({})
  }

  const handleDone = async () => {
    setCuratedSaving(true)
    const nextStatus = {}
    const savedCategoryIds = []

    for (const row of readyRows) {
      const { error } = await saveBudgetRow({
        userId,
        categoryId: rowCategoryId(row),
        amount: rowAmount(row),
        periodStart: targetPeriodStart,
        periodEnd: targetPeriodEnd,
      })
      if (error) {
        nextStatus[row.id] = error
      } else {
        savedCategoryIds.push(rowCategoryId(row))
      }
    }

    setRowStatus(nextStatus)
    setCuratedSaving(false)
    if (savedCategoryIds.length > 0) await onSaved()

    try {
      buildMissingSuggestions(savedCategoryIds)
      setStep('missing')
    } catch (err) {
      const savedNote = savedCategoryIds.length > 0 ? ' Your budget was saved — ' : ' '
      setBuildError(
        friendlyError(err, `Couldn't load more suggestions.${savedNote}you can add more directly from the Budgets page.`)
      )
      setStep('input')
    }
  }

  const missingRowAmount = (row) => {
    const text = missingAmountText[row.id]
    if (text === undefined || text === '') return null
    const n = Number(text)
    return Number.isNaN(n) ? null : n
  }

  const selectedMissingRows = missingRows.filter((r) => missingSelected[r.id] && missingRowAmount(r) > 0 && !!r.categoryId)

  const handleAddSelected = async () => {
    if (selectedMissingRows.length === 0) {
      resetToInput()
      return
    }
    setMissingSaving(true)
    const nextStatus = {}
    let anySaved = false

    for (const row of selectedMissingRows) {
      const { error } = await saveBudgetRow({
        userId,
        categoryId: row.categoryId,
        amount: missingRowAmount(row),
        periodStart: targetPeriodStart,
        periodEnd: targetPeriodEnd,
      })
      if (error) {
        nextStatus[row.id] = error
      } else {
        anySaved = true
      }
    }

    setMissingRowStatus(nextStatus)
    setMissingSaving(false)
    if (anySaved) await onSaved()

    // Remove the ones that saved successfully from the list; keep any
    // duplicate/error rows visible so the user can resolve them without
    // the successful ones being retried.
    setMissingRows((prev) => prev.filter((r) => nextStatus[r.id]))
    if (Object.keys(nextStatus).length === 0) resetToInput()
  }

  const resetToInput = () => {
    setStep('input')
    setInputText('')
    setRows([])
    setAmountText({})
    setCategoryChoice({})
    setRowStatus({})
    setMissingRows([])
    setMissingSelected({})
    setMissingAmountText({})
    setMissingRowStatus({})
  }

  return (
    <div className="bg-surface dark:bg-charcoalSurface rounded-2xl border border-line dark:border-lineDark p-5 space-y-4">
      {step === 'input' && (
        <div className="space-y-3">
          <h2 className="font-display text-lg font-semibold tracking-tight">Pool your monthly expenses</h2>
          {buildError && <p className="text-sm text-bad">{buildError}</p>}
          <Input
            as="textarea"
            autoFocus
            rows={3}
            value={inputText}
            onChange={(e) => setInputText(e.target.value)}
            placeholder="rent 8k, fuel 2k, groceries 2.5k, netflix 149..."
            className="w-full bg-paper dark:bg-charcoal rounded-lg px-3 py-2.5 text-sm resize-none"
          />
          <div className="flex justify-end">
            <Button
              onClick={startCooking}
              disabled={!inputText.trim()}
              className="px-4 py-2 rounded-lg"
            >
              Build Budget →
            </Button>
          </div>
        </div>
      )}

      {step === 'cooking' && (
        <div className="py-6 text-center">
          <p className="text-sm text-muted dark:text-mutedDark">🍳 {COOKING_MESSAGES[cookingIndex]}...</p>
        </div>
      )}

      {step === 'curated' && (
        <CuratedStep
          rows={rows}
          amountText={amountText}
          setAmountText={setAmountText}
          categoryChoice={categoryChoice}
          setCategoryChoice={setCategoryChoice}
          categories={categories}
          rowStatus={rowStatus}
          rowAmount={rowAmount}
          rowCategoryId={rowCategoryId}
          monthLabel={monthLabel}
          total={curatedTotal}
          incompleteCount={incompleteCount}
          saving={curatedSaving}
          onDone={handleDone}
        />
      )}

      {step === 'missing' && (
        <MissingStep
          rows={missingRows}
          selected={missingSelected}
          setSelected={setMissingSelected}
          amountText={missingAmountText}
          setAmountText={setMissingAmountText}
          rowStatus={missingRowStatus}
          rowAmount={missingRowAmount}
          selectedCount={selectedMissingRows.length}
          saving={missingSaving}
          income={income}
          onConfirm={handleAddSelected}
          onSkip={resetToInput}
        />
      )}
    </div>
  )
}

function CuratedStep({
  rows,
  amountText,
  setAmountText,
  categoryChoice,
  setCategoryChoice,
  categories,
  rowStatus,
  rowAmount,
  rowCategoryId,
  monthLabel,
  total,
  incompleteCount,
  saving,
  onDone,
}) {
  const setAmount = (id, value) => setAmountText((prev) => ({ ...prev, [id]: value }))
  const setCategory = (id, value) => setCategoryChoice((prev) => ({ ...prev, [id]: value }))

  return (
    <div className="space-y-3">
      <h2 className="font-display text-lg font-semibold tracking-tight">{monthLabel} Budget</h2>

      <div className="divide-y divide-line dark:divide-lineDark">
        {rows.map((row) => {
          const categoryId = rowCategoryId(row)
          const status = rowStatus[row.id]
          return (
            <div key={row.id} className="py-2.5 flex items-center gap-3">
              <div className="flex-1 min-w-0">
                {categoryId ? (
                  <span className={`text-sm font-medium px-2 py-0.5 rounded-full ${categoryPillClasses(row.categoryName)}`}>
                    {row.categoryName}
                  </span>
                ) : (
                  <Select
                    value=""
                    onChange={(e) => setCategory(row.id, e.target.value)}
                    className="text-sm py-1 px-2 rounded-md bg-paper dark:bg-charcoal"
                  >
                    <option value="" disabled>
                      Pick a category...
                    </option>
                    {categories.map((cat) => (
                      <option key={cat.id} value={cat.id}>
                        {cat.name}
                      </option>
                    ))}
                  </Select>
                )}
                {status === 'duplicate' && <p className="text-xs text-bad mt-1">Already budgeted this month.</p>}
                {status === 'error' && <p className="text-xs text-bad mt-1">Couldn't save. Try again.</p>}
              </div>
              <div className="flex items-center gap-1 font-mono text-sm shrink-0">
                <span className="text-muted dark:text-mutedDark">₹</span>
                <Input
                  type="text"
                  inputMode="numeric"
                  value={amountText[row.id] ?? ''}
                  onChange={(e) => setAmount(row.id, e.target.value.replace(/[^\d.]/g, ''))}
                  className="w-24 text-right py-1 px-2 rounded-md bg-paper dark:bg-charcoal"
                />
              </div>
            </div>
          )
        })}
      </div>

      <div className="border-t border-line dark:border-lineDark pt-2.5 flex items-center justify-between">
        <span className="text-sm font-medium text-ink dark:text-offwhite">Planned</span>
        <span className="font-mono text-lg text-ink dark:text-offwhite">{formatCurrency(total)}</span>
      </div>

      {incompleteCount > 0 && (
        <p className="text-xs text-muted dark:text-mutedDark">
          {incompleteCount} item{incompleteCount === 1 ? '' : 's'} still need{incompleteCount === 1 ? 's' : ''} an amount or category — left out until filled in.
        </p>
      )}

      <div className="flex justify-end">
        <Button
          onClick={onDone}
          disabled={saving}
          className="px-4 py-2 rounded-lg"
        >
          {saving ? 'Saving...' : 'Done'}
        </Button>
      </div>
    </div>
  )
}

const MISSING_SOURCE_LABEL = { history: 'Based on recent spending', profile: 'Suggested' }

function MissingStep({ rows, selected, setSelected, amountText, setAmountText, rowStatus, rowAmount, selectedCount, saving, income, onConfirm, onSkip }) {
  const toggle = (id) => setSelected((prev) => ({ ...prev, [id]: !prev[id] }))
  const setAmount = (id, value) => setAmountText((prev) => ({ ...prev, [id]: value }))

  if (rows.length === 0) {
    return (
      <div className="space-y-3">
        <p className="text-sm text-ink dark:text-offwhite">Your budget looks good.</p>
        <div className="flex justify-end">
          <Button onClick={onSkip} className="px-4 py-2 rounded-lg">
            Done
          </Button>
        </div>
      </div>
    )
  }

  return (
    <div className="space-y-3">
      <h2 className="font-display text-base font-semibold tracking-tight">Oops! A few things may be missing.</h2>

      {income > 0 && (
        <p className="text-xs text-muted dark:text-mutedDark">
          Recent income (last 30 days): <span className="font-mono text-ink dark:text-offwhite">{formatCurrency(income)}</span>
        </p>
      )}

      <div className="divide-y divide-line dark:divide-lineDark">
        {rows.map((row) => {
          const status = rowStatus[row.id]
          return (
            <div key={row.id} className="py-2.5 flex items-center gap-3">
              <input
                type="checkbox"
                checked={!!selected[row.id]}
                onChange={() => toggle(row.id)}
                className="accent-gold"
                aria-label={`Add ${row.categoryName}`}
              />
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2 flex-wrap">
                  <span className={`text-sm font-medium px-2 py-0.5 rounded-full ${categoryPillClasses(row.categoryName)}`}>{row.categoryName}</span>
                  <ValueBadge kind="suggested" label={MISSING_SOURCE_LABEL[row.source]} />
                </div>
                {status === 'duplicate' && <p className="text-xs text-bad mt-1">Already budgeted this month.</p>}
                {status === 'error' && <p className="text-xs text-bad mt-1">Couldn't save. Try again.</p>}
              </div>
              <div className="flex items-center gap-1 font-mono text-sm shrink-0">
                <span className="text-muted dark:text-mutedDark">₹</span>
                <Input
                  type="text"
                  inputMode="numeric"
                  value={amountText[row.id] ?? ''}
                  onChange={(e) => setAmount(row.id, e.target.value.replace(/[^\d.]/g, ''))}
                  placeholder="Amount"
                  className="w-24 text-right py-1 px-2 rounded-md bg-paper dark:bg-charcoal"
                />
              </div>
            </div>
          )
        })}
      </div>

      <div className="flex justify-end gap-2">
        <Button variant="secondary" onClick={onSkip} className="px-3 py-2 rounded-lg">
          Skip
        </Button>
        <Button
          onClick={onConfirm}
          disabled={saving}
          className="px-4 py-2 rounded-lg"
        >
          {saving ? 'Adding...' : `Add selected${selectedCount > 0 ? ` (${selectedCount})` : ''}`}
        </Button>
      </div>
    </div>
  )
}
