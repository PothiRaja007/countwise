import { useState } from 'react'
import { supabase } from '../lib/supabaseClient'
import { seedCategoriesForIncomeType } from '../lib/categorySeed'
import { seedDefaultAccounts } from '../lib/accountSeed'
import { useAuth } from '../lib/AuthContext.jsx'
import { needsEmployeeSubtypePrompt } from '../lib/lifeStage'
import { friendlyError } from '../lib/errorMessages.js'
import Button from '../components/ui/Button.jsx'

const EMPLOYEE_SUBTYPE_OPTIONS = [
  { value: 'fresher', label: 'Fresher' },
  { value: 'already_working', label: 'Already working' },
]

export default function Onboarding() {
  const [incomeType, setIncomeType] = useState(null)
  const [employeeSubtype, setEmployeeSubtype] = useState(null)
  // 'income_type' is the existing first step, unchanged except that
  // 'mixed' is now a selectable option alongside 'student' and 'employed'.
  // 'employee_subtype' is the Phase 23.2 step, only ever reached when
  // needsEmployeeSubtypePrompt() says so below — never for 'student', and
  // never for 'mixed' (needsEmployeeSubtypePrompt() already returns false
  // for 'mixed', so selecting it here submits directly, same as 'student').
  const [step, setStep] = useState('income_type')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState(null)
  const { user, refreshProfile } = useAuth()

  const submit = async (finalEmployeeSubtype) => {
    setLoading(true)
    setError(null)

    try {
      if (!user) throw new Error('No logged-in user found. Please log in again.')

      // Seed the two default accounts first so we have a Wallet id to write
      // as profiles.default_account_id in the same upsert below.
      const [walletAccount] = await seedDefaultAccounts(user.id)

      const { error: profileErr } = await supabase
        .from('profiles')
        .upsert({
          id: user.id,
          income_type: incomeType,
          employee_subtype: finalEmployeeSubtype,
          onboarding_complete: true,
          default_account_id: walletAccount.id,
        })

      if (profileErr) throw profileErr

      await seedCategoriesForIncomeType(user.id, incomeType)

      // Re-fetch profile in AuthContext — App.jsx will then automatically
      // switch from Onboarding to the main app, no manual navigation needed.
      await refreshProfile()
    } catch (err) {
      setError(friendlyError(err, 'Something went wrong. Please try again.'))
      setLoading(false)
    }
  }

  const handleIncomeTypeContinue = () => {
    if (needsEmployeeSubtypePrompt(incomeType, employeeSubtype)) {
      setStep('employee_subtype')
      return
    }
    // student, or anything else needsEmployeeSubtypePrompt() doesn't gate
    // on — submit immediately, exactly as before this subphase.
    submit(employeeSubtype)
  }

  const handleEmployeeSubtypeContinue = () => {
    submit(employeeSubtype)
  }

  if (step === 'employee_subtype') {
    return (
      <div className="min-h-screen flex items-center justify-center p-6 bg-paper dark:bg-charcoal">
        <div className="max-w-sm w-full text-center">
          <h1 className="font-display text-2xl font-semibold tracking-tight mb-2">
            Are you a fresher or already working?
          </h1>
          <p className="text-sm text-muted dark:text-mutedDark mb-6">
            Helps CountWise show the right tools later — fully editable later.
          </p>
          <div className="grid grid-cols-2 gap-3 mb-4">
            {EMPLOYEE_SUBTYPE_OPTIONS.map((opt) => (
              <button
                key={opt.value}
                onClick={() => setEmployeeSubtype(opt.value)}
                className={`py-4 rounded-xl border text-sm font-medium transition-colors ${
                  employeeSubtype === opt.value
                    ? 'border-gold bg-gold/10 text-gold'
                    : 'border-line dark:border-lineDark bg-surface dark:bg-charcoalSurface text-ink dark:text-offwhite hover:border-gold/50'
                }`}
              >
                {opt.label}
              </button>
            ))}
          </div>
          {error && <p className="text-sm text-bad mb-3">{error}</p>}
          <Button
            onClick={handleEmployeeSubtypeContinue}
            disabled={!employeeSubtype || loading}
            className="w-full py-2.5 rounded-lg"
          >
            {loading ? 'Setting up...' : 'Continue'}
          </Button>
        </div>
      </div>
    )
  }

  return (
    <div className="min-h-screen flex items-center justify-center p-6 bg-paper dark:bg-charcoal">
      <div className="max-w-sm w-full text-center">
        <h1 className="font-display text-2xl font-semibold tracking-tight mb-2">
          Are you a student or employed?
        </h1>
        <p className="text-sm text-muted dark:text-mutedDark mb-6">
          This sets sensible default categories and income patterns — fully editable later.
        </p>
        <div className="grid grid-cols-3 gap-3 mb-4">
          {['student', 'employed', 'mixed'].map((opt) => (
            <button
              key={opt}
              onClick={() => setIncomeType(opt)}
              className={`py-4 rounded-xl border text-sm capitalize font-medium transition-colors ${
                incomeType === opt
                  ? 'border-gold bg-gold/10 text-gold'
                  : 'border-line dark:border-lineDark bg-surface dark:bg-charcoalSurface text-ink dark:text-offwhite hover:border-gold/50'
              }`}
            >
              {opt}
            </button>
          ))}
        </div>
        {error && <p className="text-sm text-bad mb-3">{error}</p>}
        <Button
          onClick={handleIncomeTypeContinue}
          disabled={!incomeType || loading}
          className="w-full py-2.5 rounded-lg"
        >
          {loading ? 'Setting up...' : 'Continue'}
        </Button>
      </div>
    </div>
  )
}
