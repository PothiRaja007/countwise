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

// D4b - CSV of the payments linked to debts: one row per link, with the stored transaction details and whether the
// figures count it. No ids and no user ids. Text cells get the same formula guard as above. Pure.
export const DEBT_PAYMENT_CSV_COLUMNS = [
  'debt_name', 'debt_status', 'transaction_date', 'amount', 'description', 'account', 'transaction_type', 'counted', 'not_counted_reason', 'linked_on',
]
const PAYMENT_TEXT_COLUMNS = new Set(['debt_name', 'debt_status', 'description', 'account', 'transaction_type', 'counted', 'not_counted_reason'])

export function buildDebtPaymentsCsv(rows) {
  const lines = [DEBT_PAYMENT_CSV_COLUMNS.join(',')]
  for (const r of rows || []) lines.push(DEBT_PAYMENT_CSV_COLUMNS.map((c) => cell(r[c], PAYMENT_TEXT_COLUMNS.has(c))).join(','))
  return lines.join('\r\n') + '\r\n'
}
