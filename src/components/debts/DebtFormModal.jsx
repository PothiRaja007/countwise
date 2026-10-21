import { useRef, useState } from 'react'
import { X } from 'lucide-react'
import Modal from '../ui/Modal.jsx'
import Button from '../ui/Button.jsx'
import Input from '../ui/Input.jsx'
import Select from '../ui/Select.jsx'
import { KINDS, EMPTY_FORM, validateDebtForm, openingFiguresChanged, todayISO } from '../../lib/debtForm.js'

const FIELD = 'w-full bg-paper dark:bg-charcoal rounded-lg px-3 py-2 text-sm'

function Field({ id, label, hint, error, children }) {
  return (
    <div>
      <label htmlFor={id} className="block text-xs font-medium text-muted dark:text-mutedDark mb-1">{label}</label>
      {children}
      {hint && !error && <p className="text-xs text-muted dark:text-mutedDark mt-1">{hint}</p>}
      {error && <p className="text-xs text-badText mt-1" role="alert">{error}</p>}
    </div>
  )
}

// Add / edit form. `existing` is the stored row when editing. Changing the opening figures asks for a confirmation
// before anything is written. onSubmit(values) resolves to an error sentence, or null when saved.
export default function DebtFormModal({ title, submitLabel, initial = EMPTY_FORM, existing = null, onClose, onSubmit }) {
  const [f, setF] = useState({ ...EMPTY_FORM, ...initial })
  const [errors, setErrors] = useState({})
  const [saving, setSaving] = useState(false)
  const [formError, setFormError] = useState(null)
  const [pending, setPending] = useState(null) // validated values waiting for the user's confirmation
  const inFlight = useRef(false)

  const set = (k) => (e) => setF((prev) => ({ ...prev, [k]: e.target.value }))
  const setKind = (e) => {
    const kind = e.target.value
    setF((prev) => ({ ...prev, kind, ratePct: kind === 'interest_free' ? '0' : prev.ratePct }))
  }

  const write = async (values) => {
    setSaving(true)
    setFormError(null)
    const err = await onSubmit(values)
    setSaving(false)
    if (err) { setFormError(err); setPending(null) }
  }

  const handleSave = async () => {
    if (inFlight.current) return
    inFlight.current = true
    try {
      const res = validateDebtForm(f, todayISO())
      if (!res.ok) { setErrors(res.errors); setFormError(null); return }
      setErrors({})
      if (existing && openingFiguresChanged(existing, res.values)) { setPending(res.values); return }
      await write(res.values)
    } finally {
      inFlight.current = false
    }
  }

  const handleConfirm = async () => {
    if (inFlight.current || !pending) return
    inFlight.current = true
    try {
      await write(pending)
    } finally {
      inFlight.current = false
    }
  }

  return (
    <Modal onClose={onClose} titleId="debt-form-title" className="fixed inset-0 bg-black/40 flex items-end sm:items-center justify-center">
      <div
        className="bg-surface dark:bg-charcoalSurface rounded-t-2xl sm:rounded-2xl border border-line dark:border-lineDark w-full sm:w-96 p-5 space-y-4 max-h-[90vh] overflow-y-auto"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between">
          <h2 id="debt-form-title" className="font-display text-lg font-semibold tracking-tight">{title}</h2>
          <button onClick={onClose} className="text-muted dark:text-mutedDark hover:text-ink dark:hover:text-offwhite" aria-label="Close">
            <X size={18} />
          </button>
        </div>

        {pending ? (
          <div className="space-y-4" data-testid="debt-confirm">
            <p className="text-sm text-ink dark:text-offwhite">This changes the starting point for every figure on this debt.</p>
            <p className="text-xs text-muted dark:text-mutedDark">Principal, unpaid interest, the date or the rate decides all the numbers shown for it. Save the change?</p>
            {formError && <p className="text-xs text-badText">{formError}</p>}
            <div className="flex justify-end gap-2">
              <Button variant="secondary" onClick={() => setPending(null)} className="px-3 py-2 rounded-lg">Go back</Button>
              <Button onClick={handleConfirm} disabled={saving} className="px-4 py-2 rounded-lg">{saving ? 'Saving...' : 'Confirm and save'}</Button>
            </div>
          </div>
        ) : (
          <>
            <div className="space-y-3">
              <Field id="debt-name" label="Name" error={errors.name}>
                <Input id="debt-name" value={f.name} onChange={set('name')} placeholder="e.g. Education loan" className={FIELD} />
              </Field>
              <Field id="debt-kind" label="Type" error={errors.kind}>
                <Select id="debt-kind" value={f.kind} onChange={setKind} className={FIELD}>
                  {KINDS.map((k) => <option key={k.value} value={k.value}>{k.label}</option>)}
                </Select>
              </Field>
              <Field id="debt-lender" label="Lender (optional)" error={errors.lender}>
                <Input id="debt-lender" value={f.lender} onChange={set('lender')} className={FIELD} />
              </Field>
              <Field id="debt-asof" label="Date these figures are true" hint="The last day you know the amounts below. It cannot be in the future." error={errors.asOfDate}>
                <Input id="debt-asof" type="date" value={f.asOfDate} onChange={set('asOfDate')} className={`${FIELD} font-mono`} />
              </Field>
              <Field id="debt-principal" label="Principal owed" hint="Up to 2 decimals. Enter 0 if it is already cleared." error={errors.principal}>
                <Input id="debt-principal" inputMode="decimal" value={f.principal} onChange={set('principal')} className={`${FIELD} font-mono`} />
              </Field>
              <Field id="debt-accrued" label="Unpaid interest (optional)" hint="Interest already owed on that date. Up to 2 decimals." error={errors.accruedInterest}>
                <Input id="debt-accrued" inputMode="decimal" value={f.accruedInterest} onChange={set('accruedInterest')} className={`${FIELD} font-mono`} />
              </Field>
              <Field id="debt-rate" label="Interest rate, % a year" hint="Required. Up to 2 decimals, 0 to 100." error={errors.ratePct}>
                <Input
                  id="debt-rate" inputMode="decimal" value={f.ratePct} onChange={set('ratePct')}
                  disabled={f.kind === 'interest_free'} className={`${FIELD} font-mono`}
                />
              </Field>
              <Field id="debt-payment" label="Monthly payment (optional)" hint="Up to 2 decimals." error={errors.monthlyPayment}>
                <Input id="debt-payment" inputMode="decimal" value={f.monthlyPayment} onChange={set('monthlyPayment')} className={`${FIELD} font-mono`} />
              </Field>
              <Field id="debt-months" label="Months remaining (optional)" hint="As on the date above. It is not counted down." error={errors.remainingMonths}>
                <Input id="debt-months" inputMode="numeric" value={f.remainingMonths} onChange={set('remainingMonths')} className={`${FIELD} font-mono`} />
              </Field>
              <Field id="debt-due" label="Due day of the month (optional)" hint="1 to 31. In shorter months the last day is used." error={errors.dueDay}>
                <Input id="debt-due" inputMode="numeric" value={f.dueDay} onChange={set('dueDay')} className={`${FIELD} font-mono`} />
              </Field>

              {formError && <p className="text-xs text-badText">{formError}</p>}
            </div>

            <div className="flex justify-end gap-2">
              <Button variant="secondary" onClick={onClose} className="px-3 py-2 rounded-lg">Cancel</Button>
              <Button onClick={handleSave} disabled={saving} className="px-4 py-2 rounded-lg">{saving ? 'Saving...' : submitLabel}</Button>
            </div>
          </>
        )}
      </div>
    </Modal>
  )
}
