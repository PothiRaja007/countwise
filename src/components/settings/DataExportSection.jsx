import { useState } from 'react'
import { Download } from 'lucide-react'
import { supabase } from '../../lib/supabaseClient.js'
import { useAuth } from '../../lib/AuthContext.jsx'
import { toCsv, downloadCsv } from '../../lib/exportCsv.js'
import Button from '../ui/Button.jsx'

// Excel/PDF are explicitly out of scope for v1.1 (frozen spec §3.3) — CSV
// only. Each entry fetches its own table fresh at click time rather than
// reusing whatever another page happens to have in state, so an export is
// always current and doesn't depend on which other section was open.
const EXPORTS = [
  {
    key: 'transactions',
    label: 'Transactions',
    table: 'transactions',
    select: 'transaction_date, type, amount, description, account_id, to_account_id, category_id, original_input',
    columns: [
      { key: 'transaction_date', label: 'Date' },
      { key: 'type', label: 'Type' },
      { key: 'amount', label: 'Amount' },
      { key: 'description', label: 'Description' },
      { key: 'account_id', label: 'Account ID' },
      { key: 'to_account_id', label: 'To Account ID' },
      { key: 'category_id', label: 'Category ID' },
      { key: 'original_input', label: 'Original Input' },
    ],
  },
  {
    key: 'accounts',
    label: 'Accounts',
    table: 'accounts',
    select: 'name, type, is_default, is_active, created_at',
    columns: [
      { key: 'name', label: 'Name' },
      { key: 'type', label: 'Type' },
      { key: 'is_default', label: 'Default' },
      { key: 'is_active', label: 'Active' },
      { key: 'created_at', label: 'Created' },
    ],
  },
  {
    key: 'goals',
    label: 'Goals',
    table: 'goals',
    select: 'name, target_amount, target_date, status, created_at',
    columns: [
      { key: 'name', label: 'Name' },
      { key: 'target_amount', label: 'Target Amount' },
      { key: 'target_date', label: 'Target Date' },
      { key: 'status', label: 'Status' },
      { key: 'created_at', label: 'Created' },
    ],
  },
  {
    key: 'goal_contributions',
    label: 'Goal Contributions',
    table: 'goal_contributions',
    select: 'goal_id, account_id, amount, type, contribution_date',
    columns: [
      { key: 'goal_id', label: 'Goal ID' },
      { key: 'account_id', label: 'Account ID' },
      { key: 'amount', label: 'Amount' },
      { key: 'type', label: 'Type' },
      { key: 'contribution_date', label: 'Date' },
    ],
  },
  {
    key: 'learning_items',
    label: 'Learning ROI',
    table: 'learning_items',
    select: 'name, cost, relevance_tag, target_date, progress_pct, status',
    columns: [
      { key: 'name', label: 'Name' },
      { key: 'cost', label: 'Cost' },
      { key: 'relevance_tag', label: 'Relevance Tag' },
      { key: 'target_date', label: 'Target Date' },
      { key: 'progress_pct', label: 'Progress %' },
      { key: 'status', label: 'Status' },
    ],
  },
  {
    key: 'categories',
    label: 'Categories',
    table: 'categories',
    // Own categories only for export — shared defaults (user_id null)
    // aren't "your data" in the sense this export is for.
    select: 'name, kind, icon',
    columns: [
      { key: 'name', label: 'Name' },
      { key: 'kind', label: 'Kind' },
      { key: 'icon', label: 'Icon' },
    ],
  },
]

export default function DataExportSection() {
  const { user } = useAuth()
  const [exportingKey, setExportingKey] = useState(null)
  const [error, setError] = useState(null)

  const handleExport = async (item) => {
    setError(null)
    setExportingKey(item.key)

    let query = supabase.from(item.table).select(item.select).eq('user_id', user.id)

    const { data, error: fetchErr } = await query

    setExportingKey(null)

    if (fetchErr) {
      // eslint-disable-next-line no-console
      console.error(fetchErr)
      setError(`Couldn't export ${item.label.toLowerCase()}. Please try again.`)
      return
    }

    const csv = toCsv(data || [], item.columns)
    downloadCsv(`countwise-${item.table}.csv`, csv)
  }

  return (
    <div className="space-y-4 max-w-lg">
      <p className="text-sm text-muted dark:text-mutedDark">
        Download your data as CSV. Each file only contains your own rows.
      </p>

      {error && <p className="text-sm text-bad">{error}</p>}

      <div className="divide-y divide-line dark:divide-lineDark border-t border-b border-line dark:border-lineDark">
        {EXPORTS.map((item) => (
          <div key={item.key} className="flex items-center justify-between py-3">
            <span className="text-sm">{item.label}</span>
            <Button
              variant="text"
              onClick={() => handleExport(item)}
              disabled={exportingKey === item.key}
              className="flex items-center gap-1.5 text-sm font-medium disabled:opacity-40"
            >
              <Download size={14} />
              {exportingKey === item.key ? 'Exporting...' : 'Export CSV'}
            </Button>
          </div>
        ))}
      </div>
    </div>
  )
}
