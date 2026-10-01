// Phase 31b — Bank Statement Ingestion (CSV).
//
// Deliberately a thin wrapper: parseBankStatement() does the real work,
// and once it produces candidates, this hands off to the EXISTING
// ReviewDrawer — the same review-before-write screen Money Inbox uses.
// No new transaction-writing code path exists anywhere in this file.
import { useId, useRef, useState } from 'react'
import { supabase } from '../../lib/supabaseClient.js'
import { useAuth } from '../../lib/AuthContext.jsx'
import { parseBankStatement } from '../../lib/bankStatementParser.js'
import { friendlyError } from '../../lib/errorMessages.js'
import Modal from '../ui/Modal.jsx'
import Button from '../ui/Button.jsx'
import Select from '../ui/Select.jsx'
import ReviewDrawer from '../money-inbox/ReviewDrawer.jsx'

const NINETY_DAYS_MS = 90 * 24 * 60 * 60 * 1000

export default function StatementImportModal({ accounts, categories, onClose }) {
  const { user } = useAuth()
  const titleId = useId()
  const fileInputRef = useRef(null)
  const [accountId, setAccountId] = useState(accounts[0]?.id || '')
  const [fileName, setFileName] = useState(null)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState(null)
  const [reviewCandidates, setReviewCandidates] = useState(null)

  const handleFile = async (file) => {
    if (!file || !user) return
    setFileName(file.name)
    setError(null)
    setLoading(true)
    try {
      const text = await file.text()
      const account = accounts.find((a) => a.id === accountId)
      if (!account) throw new Error('Choose which account this statement is for first.')

      const [rulesRes, recentRes] = await Promise.all([
        supabase.from('category_rules').select('keyword, category_id, priority').or(`user_id.eq.${user.id},user_id.is.null`),
        supabase
          .from('transactions')
          .select('amount, description, original_input')
          .eq('user_id', user.id)
          .eq('account_id', account.id)
          .gte('transaction_date', new Date(Date.now() - NINETY_DAYS_MS).toISOString().slice(0, 10)),
      ])
      if (rulesRes.error) throw rulesRes.error
      if (recentRes.error) throw recentRes.error

      const { candidates, error: parseError } = parseBankStatement(text, {
        categoryRules: rulesRes.data || [],
        existingTransactions: recentRes.data || [],
      })
      if (parseError) {
        setError(parseError)
        return
      }
      if (candidates.length === 0) {
        setError('No transactions were found in that file.')
        return
      }
      // Same resolution path every Money Inbox candidate goes through —
      // ReviewDrawer turns an account NAME into an accountId itself.
      setReviewCandidates(candidates.map((c) => ({ ...c, account: account.name })))
    } catch (err) {
      setError(friendlyError(err, "Couldn't read that file. Please check it's a CSV export from your bank."))
    } finally {
      setLoading(false)
    }
  }

  if (reviewCandidates) {
    return (
      <ReviewDrawer
        candidates={reviewCandidates}
        accounts={accounts}
        categories={categories}
        onBack={() => setReviewCandidates(null)}
        onClose={onClose}
      />
    )
  }

  return (
    <Modal
      onClose={onClose}
      titleId={titleId}
      className="fixed inset-0 bg-black/40 flex items-end sm:items-center justify-center"
    >
      <div className="bg-paper dark:bg-charcoal rounded-t-2xl sm:rounded-2xl w-full sm:max-w-md p-6">
        <h2 id={titleId} className="font-serif text-lg font-semibold mb-1">
          Import bank statement
        </h2>
        <p className="text-sm text-muted dark:text-mutedDark mb-4">
          CSV only, for now. Nothing is saved until you review and confirm each row — same as Money Inbox.
        </p>

        <label className="text-xs font-medium text-muted dark:text-mutedDark">Which account is this statement for?</label>
        <Select value={accountId} onChange={(e) => setAccountId(e.target.value)} className="w-full mt-1 mb-4">
          {accounts.map((a) => (
            <option key={a.id} value={a.id}>
              {a.name}
            </option>
          ))}
        </Select>

        <input
          ref={fileInputRef}
          type="file"
          accept=".csv,text/csv"
          className="hidden"
          onChange={(e) => handleFile(e.target.files?.[0])}
        />
        <Button variant="secondary" onClick={() => fileInputRef.current?.click()} disabled={loading || !accountId} className="w-full">
          {loading ? 'Reading file...' : fileName ? `Chosen: ${fileName}` : 'Choose CSV file'}
        </Button>

        {error && <p className="text-sm text-bad mt-3">{error}</p>}

        <p className="text-xs text-muted dark:text-mutedDark mt-4">
          Expects a Date column, a Description/Narration column, and either Debit/Credit columns or a single signed
          Amount column — the format most Indian bank CSV exports already use.
        </p>

        <div className="flex justify-end mt-5">
          <Button variant="text" onClick={onClose}>
            Cancel
          </Button>
        </div>
      </div>
    </Modal>
  )
}
