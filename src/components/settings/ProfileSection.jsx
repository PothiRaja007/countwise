import { useState } from 'react'
import { supabase } from '../../lib/supabaseClient.js'
import { useAuth } from '../../lib/AuthContext.jsx'
import { shouldShowWorkSection } from '../../lib/lifeStage.js'
import Button from '../ui/Button.jsx'
import Input from '../ui/Input.jsx'

const EMPLOYEE_SUBTYPE_OPTIONS = [
  { value: 'fresher', label: 'Fresher' },
  { value: 'already_working', label: 'Already working' },
]

const INCOME_TYPE_OPTIONS = [
  { value: 'student', label: 'Student' },
  { value: 'employed', label: 'Employed' },
  { value: 'mixed', label: 'Mixed' },
]

// Username is a display name only — no uniqueness check, never touches
// Supabase Auth. Purely cosmetic, per §6.2.1 of the frozen v1.1 spec.
export default function ProfileSection() {
  const { user, profile, refreshProfile } = useAuth()
  const [username, setUsername] = useState(profile?.username || '')
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState(null)
  const [saved, setSaved] = useState(false)

  // Phase 23.3 — work status (employee_subtype). Kept as its own,
  // independently-saved block below rather than merged into the
  // username save, so saving one never touches the other. Visible only
  // for 'employed'/'mixed' via shouldShowWorkSection() — deliberately
  // NOT needsEmployeeSubtypePrompt(), which only fires for 'employed'
  // and is about forcing a prompt, not about whether this optional
  // Settings control should exist. A 'mixed' user can set this here even
  // though they're never forced through it at onboarding.
  const [employeeSubtype, setEmployeeSubtype] = useState(profile?.employee_subtype || null)
  const [subtypeSaving, setSubtypeSaving] = useState(false)
  const [subtypeError, setSubtypeError] = useState(null)
  const [subtypeSaved, setSubtypeSaved] = useState(false)

  // Life stage (income_type). Same independent-block pattern as
  // employee_subtype above — its own state, dirty flag, and save handler,
  // so saving this never touches the username or employee_subtype saves.
  // This is a profile field update only: it deliberately does NOT call
  // seedCategoriesForIncomeType() (that's onboarding-only, one-time — see
  // Onboarding.jsx) and it deliberately does NOT clear employee_subtype
  // when moving away from 'employed'/'mixed' back to 'student'. A stale
  // employee_subtype on a 'student' profile has no effect anywhere, since
  // shouldShowWorkSection()/needsEmployeeSubtypePrompt() both gate on
  // income_type first.
  const [incomeType, setIncomeType] = useState(profile?.income_type || null)
  const [incomeTypeSaving, setIncomeTypeSaving] = useState(false)
  const [incomeTypeError, setIncomeTypeError] = useState(null)
  const [incomeTypeSaved, setIncomeTypeSaved] = useState(false)

  const dirty = username !== (profile?.username || '')
  const subtypeDirty = employeeSubtype !== (profile?.employee_subtype || null)
  const incomeTypeDirty = incomeType !== (profile?.income_type || null)
  const showWorkSection = shouldShowWorkSection(profile?.income_type)

  const handleSave = async () => {
    if (!user) return
    setSaving(true)
    setError(null)
    setSaved(false)

    const { error: updateErr } = await supabase
      .from('profiles')
      .update({ username: username.trim() || null })
      .eq('id', user.id)

    setSaving(false)

    if (updateErr) {
      // eslint-disable-next-line no-console
      console.error(updateErr)
      setError("Couldn't save your username. Please try again.")
      return
    }

    await refreshProfile()
    setSaved(true)
  }

  const handleSubtypeSave = async () => {
    if (!user) return
    setSubtypeSaving(true)
    setSubtypeError(null)
    setSubtypeSaved(false)

    const { error: updateErr } = await supabase
      .from('profiles')
      .update({ employee_subtype: employeeSubtype })
      .eq('id', user.id)

    setSubtypeSaving(false)

    if (updateErr) {
      // eslint-disable-next-line no-console
      console.error(updateErr)
      setSubtypeError("Couldn't save this. Please try again.")
      return
    }

    await refreshProfile()
    setSubtypeSaved(true)
  }

  const handleIncomeTypeSave = async () => {
    if (!user) return
    setIncomeTypeSaving(true)
    setIncomeTypeError(null)
    setIncomeTypeSaved(false)

    const { error: updateErr } = await supabase
      .from('profiles')
      .update({ income_type: incomeType })
      .eq('id', user.id)

    setIncomeTypeSaving(false)

    if (updateErr) {
      // eslint-disable-next-line no-console
      console.error(updateErr)
      setIncomeTypeError("Couldn't save this. Please try again.")
      return
    }

    await refreshProfile()
    setIncomeTypeSaved(true)
  }

  return (
    <div className="space-y-5 max-w-sm">
      <div>
        <span className="block text-xs font-medium text-muted dark:text-mutedDark mb-1">Email</span>
        <div className="text-sm py-2 px-3 rounded-md bg-surface dark:bg-charcoalSurface border border-line dark:border-lineDark text-muted dark:text-mutedDark">
          {user?.email || '—'}
        </div>
        <p className="text-xs text-muted dark:text-mutedDark mt-1">
          Managed by your account sign-in — can't be changed here.
        </p>
      </div>

      <div>
        <label htmlFor="username" className="block text-xs font-medium text-muted dark:text-mutedDark mb-1">
          Display name
        </label>
        <Input
          id="username"
          type="text"
          value={username}
          onChange={(e) => {
            setUsername(e.target.value)
            setSaved(false)
          }}
          maxLength={50}
          placeholder="What should CountWise call you?"
          className="w-full text-sm py-2 px-3 rounded-md bg-surface dark:bg-charcoalSurface"
        />
        <p className="text-xs text-muted dark:text-mutedDark mt-1">
          Just a display name — not used for sign-in, doesn't need to be unique.
        </p>
      </div>

      {error && <p className="text-sm text-bad">{error}</p>}
      {saved && !dirty && <p className="text-sm text-good">Saved.</p>}

      <Button
        onClick={handleSave}
        disabled={!dirty || saving}
        className="px-4 py-2 rounded-md"
      >
        {saving ? 'Saving...' : 'Save'}
      </Button>

      <div className="pt-5 border-t border-line dark:border-lineDark space-y-3">
        <div>
          <span className="block text-xs font-medium text-muted dark:text-mutedDark mb-1">Life stage</span>
          <div className="grid grid-cols-3 gap-2">
            {INCOME_TYPE_OPTIONS.map((opt) => (
              <button
                key={opt.value}
                onClick={() => {
                  setIncomeType(opt.value)
                  setIncomeTypeSaved(false)
                }}
                className={`py-2.5 rounded-md border text-sm font-medium transition-colors ${
                  incomeType === opt.value
                    ? 'border-gold bg-gold/10 text-gold'
                    : 'border-line dark:border-lineDark bg-surface dark:bg-charcoalSurface text-ink dark:text-offwhite hover:border-gold/50'
                }`}
              >
                {opt.label}
              </button>
            ))}
          </div>
          <p className="text-xs text-muted dark:text-mutedDark mt-1">
            Change this anytime — your existing data stays intact.
          </p>
        </div>

        {incomeTypeError && <p className="text-sm text-bad">{incomeTypeError}</p>}
        {incomeTypeSaved && !incomeTypeDirty && <p className="text-sm text-good">Saved.</p>}

        <Button
          onClick={handleIncomeTypeSave}
          disabled={!incomeTypeDirty || incomeTypeSaving}
          className="px-4 py-2 rounded-md"
        >
          {incomeTypeSaving ? 'Saving...' : 'Save'}
        </Button>
      </div>

      {showWorkSection && (
        <div className="pt-5 border-t border-line dark:border-lineDark space-y-3">
          <div>
            <span className="block text-xs font-medium text-muted dark:text-mutedDark mb-1">Work status</span>
            <div className="grid grid-cols-2 gap-2">
              {EMPLOYEE_SUBTYPE_OPTIONS.map((opt) => (
                <button
                  key={opt.value}
                  onClick={() => {
                    setEmployeeSubtype(opt.value)
                    setSubtypeSaved(false)
                  }}
                  className={`py-2.5 rounded-md border text-sm font-medium transition-colors ${
                    employeeSubtype === opt.value
                      ? 'border-gold bg-gold/10 text-gold'
                      : 'border-line dark:border-lineDark bg-surface dark:bg-charcoalSurface text-ink dark:text-offwhite hover:border-gold/50'
                  }`}
                >
                  {opt.label}
                </button>
              ))}
            </div>
            <p className="text-xs text-muted dark:text-mutedDark mt-1">
              Helps CountWise show the right tools later — change this anytime.
            </p>
          </div>

          {subtypeError && <p className="text-sm text-bad">{subtypeError}</p>}
          {subtypeSaved && !subtypeDirty && <p className="text-sm text-good">Saved.</p>}

          <Button
            onClick={handleSubtypeSave}
            disabled={!subtypeDirty || subtypeSaving}
            className="px-4 py-2 rounded-md"
          >
            {subtypeSaving ? 'Saving...' : 'Save'}
          </Button>
        </div>
      )}
    </div>
  )
}
