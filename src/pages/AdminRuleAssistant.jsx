// Phase 39 — Admin Financial Rule Assistant.
//
// Gemini never writes an active rule. It proposes; the admin reviews and
// edits every field; only an explicit "Approve and activate" click
// writes to financial_rules, with verification_status forced to
// 'verified' by prepareRuleApproval() — never a value the AI response
// can set (RULE_PROPOSAL_SCHEMA has no such field at all).
//
// Access is enforced twice, independently: the RLS policies on
// admin_users/financial_rules (verified against a real Postgres — see
// supabase/phase39_admin_users.sql) are the actual gate; the check below
// only decides whether to show this page's UI at all, so a non-admin who
// somehow reached this route sees a plain message, not a form whose
// submit button would silently fail.
import { useEffect, useState } from 'react'
import { Sparkles } from 'lucide-react'
import { supabase } from '../lib/supabaseClient.js'
import { useAuth } from '../lib/AuthContext.jsx'
import { checkIsAdmin } from '../lib/adminAccess.js'
import {
  RULE_PROPOSAL_SCHEMA, buildRuleExtractionPrompt, validateRuleProposal,
  proposalIsReadyForApproval, prepareRuleApproval,
} from '../lib/adminRuleAssistant.js'
import { friendlyError } from '../lib/errorMessages.js'
import PageHeader from '../components/layout/PageHeader.jsx'
import AiDisclosure from '../components/ui/AiDisclosure.jsx'
import Button from '../components/ui/Button.jsx'
import Input from '../components/ui/Input.jsx'
import Select from '../components/ui/Select.jsx'

const EMPTY_FORM = { scheme: '', rule_key: '', value: '', unit: 'percent', effective_from: '', source_url: '', note: '' }

export default function AdminRuleAssistant() {
  const { user, profile } = useAuth()
  const [adminChecked, setAdminChecked] = useState(false)
  const [isAdmin, setIsAdmin] = useState(false)

  const [rawText, setRawText] = useState('')
  const [extracting, setExtracting] = useState(false)
  const [extractError, setExtractError] = useState(null)
  const [form, setForm] = useState(EMPTY_FORM)

  const [existingRules, setExistingRules] = useState([])
  const [loadingRules, setLoadingRules] = useState(false)

  const [reviewing, setReviewing] = useState(null) // the prepareRuleApproval() result, once the admin asks to review
  const [reviewError, setReviewError] = useState(null)
  const [approving, setApproving] = useState(false)
  const [approveError, setApproveError] = useState(null)
  const [approvedMessage, setApprovedMessage] = useState(null)

  useEffect(() => {
    if (!user) return
    checkIsAdmin(supabase, user.id).then((ok) => {
      setIsAdmin(ok)
      setAdminChecked(true)
    })
  }, [user])

  const loadExistingRules = async () => {
    setLoadingRules(true)
    const { data, error } = await supabase.from('financial_rules').select('*').order('scheme').order('rule_key').order('effective_from')
    if (!error) setExistingRules(data || [])
    setLoadingRules(false)
  }

  useEffect(() => {
    if (isAdmin) loadExistingRules()
  }, [isAdmin])

  const handleExtract = async () => {
    setExtracting(true)
    setExtractError(null)
    try {
      const prompt = buildRuleExtractionPrompt(rawText)
      const { data, error: invokeErr } = await supabase.functions.invoke('gemini-explain', {
        body: { prompt, schema: RULE_PROPOSAL_SCHEMA },
      })
      if (invokeErr) {
        let serverMessage = null
        try {
          const body = await invokeErr.context?.json?.()
          serverMessage = body?.message || body?.error || null
        } catch {
          // no readable body
        }
        throw new Error(serverMessage || invokeErr.message)
      }
      const validated = validateRuleProposal(data?.data)
      setForm({
        scheme: validated.scheme || '',
        rule_key: validated.rule_key || '',
        value: validated.value ?? '',
        unit: validated.unit || 'percent',
        effective_from: validated.effective_from || '',
        source_url: validated.source_url || '',
        note: validated.note || '',
      })
    } catch (err) {
      setExtractError(friendlyError(err, "Couldn't extract a proposal right now. You can still fill in the fields yourself below."))
    } finally {
      setExtracting(false)
    }
  }

  const handleReview = () => {
    setReviewError(null)
    setApprovedMessage(null)
    const proposal = {
      scheme: (form.scheme || '').trim().toLowerCase().replace(/[^a-z0-9_]/g, '_'),
      rule_key: (form.rule_key || '').trim().toLowerCase().replace(/[^a-z0-9_]/g, '_'),
      value: form.value === '' ? null : Number(form.value),
      unit: (form.unit || '').trim(),
      effective_from: form.effective_from || null,
      source_url: form.source_url?.trim() || null,
    }
    if (!proposalIsReadyForApproval(proposal)) {
      setReviewError('Scheme, rule key, value, unit, and effective date are all required before this can be reviewed.')
      return
    }
    const existingActiveRule =
      existingRules.find((r) => r.scheme === proposal.scheme && r.rule_key === proposal.rule_key && r.effective_to === null) || null
    const prepared = prepareRuleApproval(proposal, existingActiveRule)
    if (prepared.error) {
      setReviewError(prepared.error)
      return
    }
    setReviewing(prepared)
  }

  const handleApprove = async () => {
    if (!reviewing) return
    setApproving(true)
    setApproveError(null)
    try {
      if (reviewing.updateOldRule) {
        const { error: updateErr } = await supabase
          .from('financial_rules')
          .update({ effective_to: reviewing.updateOldRule.effective_to })
          .eq('id', reviewing.updateOldRule.id)
        if (updateErr) throw updateErr
      }
      const { error: insertErr } = await supabase.from('financial_rules').insert(reviewing.insertNewRule)
      if (insertErr) throw insertErr

      setApprovedMessage('Rule activated.')
      setReviewing(null)
      setForm(EMPTY_FORM)
      setRawText('')
      loadExistingRules()
    } catch (err) {
      setApproveError(friendlyError(err, "Couldn't activate this rule. Please try again."))
    } finally {
      setApproving(false)
    }
  }

  if (!adminChecked) {
    return (
      <div className="p-6 sm:p-8 bg-paper dark:bg-charcoal min-h-screen">
        <PageHeader name={profile?.username} />
      </div>
    )
  }

  if (!isAdmin) {
    return (
      <div className="p-6 sm:p-8 bg-paper dark:bg-charcoal min-h-screen">
        <PageHeader name={profile?.username} />
        <p className="text-sm text-muted dark:text-mutedDark mt-6">This page is not available on this account.</p>
      </div>
    )
  }

  return (
    <div className="p-6 sm:p-8 space-y-6 bg-paper dark:bg-charcoal min-h-screen">
      <PageHeader name={profile?.username} />

      <div>
        <h1 className="font-serif text-2xl font-semibold">Admin: financial rule assistant</h1>
        <p className="text-sm text-muted dark:text-mutedDark mt-1 max-w-xl">
          Propose a change to a statutory rate (EPF, EPS, etc.). AI only ever proposes a structured draft —
          every field is reviewable and editable, and nothing is written to financial_rules until you
          explicitly approve it below.
        </p>
      </div>

      <div className="border border-line dark:border-lineDark rounded-lg p-4 space-y-3">
        <p className="text-sm font-medium">1. Describe the change (optional: let AI draft the fields)</p>
        <textarea
          value={rawText}
          onChange={(e) => setRawText(e.target.value)}
          placeholder="Paste or describe the notification, e.g. 'EPFO circular dated ... changes the employee contribution rate to 13% effective 1 June 2027. Source: https://...'"
          className="w-full h-24 rounded-lg border border-line dark:border-lineDark bg-paper dark:bg-charcoal p-2 text-sm outline-none focus:border-gold"
        />
        <Button variant="text" onClick={handleExtract} disabled={extracting || !rawText.trim()} className="inline-flex items-center gap-1.5 text-xs">
          <Sparkles size={12} />
          {extracting ? 'Asking...' : 'Extract with AI'}
        </Button>
        <AiDisclosure>Sends this text to Google's Gemini AI to draft the fields below.</AiDisclosure>
        {extractError && <p className="text-xs text-badText">{extractError}</p>}
      </div>

      <div className="border border-line dark:border-lineDark rounded-lg p-4 space-y-3">
        <p className="text-sm font-medium">2. Review and edit every field yourself</p>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          <Input placeholder="scheme (e.g. epf)" value={form.scheme} onChange={(e) => setForm({ ...form, scheme: e.target.value })} />
          <Input placeholder="rule_key (e.g. employee_contribution_rate)" value={form.rule_key} onChange={(e) => setForm({ ...form, rule_key: e.target.value })} />
          <Input type="number" placeholder="value" value={form.value} onChange={(e) => setForm({ ...form, value: e.target.value })} />
          <Select value={form.unit} onChange={(e) => setForm({ ...form, unit: e.target.value })} className="px-3 py-2 rounded-lg bg-paper dark:bg-charcoal text-sm">
            <option value="percent">percent</option>
            <option value="rupees">rupees</option>
            <option value="rupees_per_month">rupees_per_month</option>
          </Select>
          <Input type="date" value={form.effective_from} onChange={(e) => setForm({ ...form, effective_from: e.target.value })} />
          <Input placeholder="source URL (optional)" value={form.source_url} onChange={(e) => setForm({ ...form, source_url: e.target.value })} />
        </div>
        {form.note && <p className="text-xs text-muted dark:text-mutedDark italic">AI note: {form.note}</p>}
        <Button onClick={handleReview}>Review this proposal</Button>
        {reviewError && <p className="text-xs text-badText">{reviewError}</p>}
      </div>

      {reviewing && (
        <div className="border border-gold rounded-lg p-4 space-y-2">
          <p className="text-sm font-medium">3. Confirm — this is exactly what will be written</p>
          {reviewing.updateOldRule && (
            <p className="text-xs text-muted dark:text-mutedDark">
              Close existing rule: set its effective_to to <span className="font-mono">{reviewing.updateOldRule.effective_to}</span>.
            </p>
          )}
          <p className="text-xs text-muted dark:text-mutedDark">
            Insert new verified rule: {reviewing.insertNewRule.scheme} / {reviewing.insertNewRule.rule_key} ={' '}
            <span className="font-mono">
              {reviewing.insertNewRule.value} {reviewing.insertNewRule.unit}
            </span>
            , effective from <span className="font-mono">{reviewing.insertNewRule.effective_from}</span>.
          </p>
          <div className="flex gap-2 pt-1">
            <Button onClick={handleApprove} disabled={approving}>
              {approving ? 'Activating...' : 'Approve and activate'}
            </Button>
            <Button variant="text" onClick={() => setReviewing(null)}>
              Cancel
            </Button>
          </div>
          {approveError && <p className="text-xs text-badText">{approveError}</p>}
        </div>
      )}
      {approvedMessage && <p className="text-sm text-goodText">{approvedMessage}</p>}

      <div>
        <p className="text-sm font-medium mb-2">Existing rules</p>
        {loadingRules ? (
          <p className="text-xs text-muted dark:text-mutedDark">Loading...</p>
        ) : (
          <div className="border border-line dark:border-lineDark rounded-lg divide-y divide-line dark:divide-lineDark">
            {existingRules.map((r) => (
              <div key={r.id} className="p-2.5 text-xs flex justify-between gap-3">
                <span>
                  {r.scheme} / {r.rule_key} = {r.value} {r.unit}
                </span>
                <span className="text-muted dark:text-mutedDark">
                  {r.effective_from} → {r.effective_to || 'open'} · {r.verification_status}
                </span>
              </div>
            ))}
            {existingRules.length === 0 && <p className="p-2.5 text-xs text-muted dark:text-mutedDark">None yet.</p>}
          </div>
        )}
      </div>
    </div>
  )
}
