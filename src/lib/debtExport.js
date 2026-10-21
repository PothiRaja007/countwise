// D3 - CSV copy of the debts table (stored columns only, no calculated figures). Pure.
export const DEBT_CSV_COLUMNS = [
  'name', 'kind', 'lender', 'status', 'as_of_date', 'as_of_outstanding', 'as_of_accrued_interest',
  'annual_rate_pct', 'monthly_payment', 'remaining_months', 'due_day', 'created_at', 'updated_at',
]

// A spreadsheet treats a cell that starts with = + - @ (or a tab / carriage return) as a formula. Text cells that
// start that way get a leading apostrophe so opening the file can never run anything.
function cell(value, isText) {
  if (value == null) return ''
  let t = String(value)
  if (isText && /^[=+\-@\t\r]/.test(t)) t = `'${t}`
  return /[",\r\n]/.test(t) ? `"${t.replace(/"/g, '""')}"` : t
}

const TEXT_COLUMNS = new Set(['name', 'kind', 'lender', 'status'])

export function buildDebtsCsv(rows) {
  const lines = [DEBT_CSV_COLUMNS.join(',')]
  for (const r of rows || []) lines.push(DEBT_CSV_COLUMNS.map((c) => cell(r[c], TEXT_COLUMNS.has(c))).join(','))
  return lines.join('\r\n') + '\r\n'
}
