// Phase 31b — Bank Statement Ingestion (CSV only, scoped deliberately).
//
// Pure, deterministic. No Gemini here: a CSV already has structured
// columns, so there is nothing for an LLM to usefully disambiguate, and
// keeping this deterministic means no new AI-disclosure surface and no
// new privacy-notice obligation. Reuses matchCategory and checkDuplicate
// from the existing pipeline rather than re-deriving category/duplicate
// logic — this is a new INPUT SOURCE, not a new transaction pipeline.
// Every row this produces still goes through the same ReviewDrawer,
// review-before-write path as every other transaction in the app.
//
// Supported column headers (case-insensitive, first match wins):
//   date:        'date', 'transaction date', 'value date'
//   description: 'description', 'narration', 'particulars', 'details'
//   either:
//     a single signed/typed amount: 'amount' (+ optional 'type'/'dr/cr' column), OR
//     two columns: 'debit'/'withdrawal' and 'credit'/'deposit'
//
// Deliberately NOT supported in this first version (stated, not hidden):
//   PDF/Excel/TXT statements, multi-currency, non-Indian date formats,
//   headerless files, running-balance reconciliation.

import { matchCategory } from './categorization.js'
import { checkDuplicate } from './moneyInbox.js'

// ---- tiny RFC4180-ish CSV parser (no new dependency) -----------------
export function parseCsv(text) {
  const rows = []
  let row = [], field = '', inQuotes = false
  const pushField = () => { row.push(field); field = '' }
  const pushRow = () => { pushField(); rows.push(row); row = [] }
  for (let i = 0; i < text.length; i++) {
    const c = text[i]
    if (inQuotes) {
      if (c === '"') {
        if (text[i + 1] === '"') { field += '"'; i++ } else inQuotes = false
      } else field += c
    } else if (c === '"') inQuotes = true
    else if (c === ',') pushField()
    else if (c === '\r') continue
    else if (c === '\n') pushRow()
    else field += c
  }
  if (field.length > 0 || row.length > 0) pushRow()
  return rows.filter((r) => r.length > 1 || (r.length === 1 && r[0].trim() !== ''))
}

const HEADER_ALIASES = {
  date: ['date', 'transaction date', 'value date', 'txn date'],
  description: ['description', 'narration', 'particulars', 'details', 'remarks'],
  amount: ['amount', 'txn amount'],
  type: ['type', 'dr/cr', 'cr/dr', 'transaction type'],
  debit: ['debit', 'withdrawal', 'withdrawal amt', 'debit amount'],
  credit: ['credit', 'deposit', 'deposit amt', 'credit amount'],
}

function findColumn(headerRow, aliases) {
  const lower = headerRow.map((h) => h.trim().toLowerCase())
  for (const alias of aliases) {
    const idx = lower.indexOf(alias)
    if (idx !== -1) return idx
  }
  return -1
}

/** Indian bank statement dates: DD/MM/YYYY, DD-MM-YYYY, YYYY-MM-DD. */
export function parseStatementDate(text) {
  const s = (text || '').trim()
  let m = s.match(/^(\d{4})-(\d{2})-(\d{2})$/)
  if (m) return s
  m = s.match(/^(\d{1,2})[/-](\d{1,2})[/-](\d{4})$/)
  if (m) {
    const [, d, mo, y] = m
    const day = Number(d), month = Number(mo)
    if (month > 12) return null // not a valid DD/MM date
    return `${y}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}`
  }
  return null
}

/**
 * @param {string} csvText
 * @param {{categoryRules: Array, existingTransactions?: Array}} opts
 * @returns {{candidates: Array, error: string|null}}
 *   error is set only for a structural problem (no header row, no
 *   recognizable date/amount columns) — per-row problems are instead
 *   reported on that row via needsReview, same as Money Inbox.
 */
export function parseBankStatement(csvText, { categoryRules = [], existingTransactions = [] } = {}) {
  const rows = parseCsv(csvText)
  if (rows.length < 2) return { candidates: [], error: 'The file has no data rows to import.' }

  const [header, ...dataRows] = rows
  const dateCol = findColumn(header, HEADER_ALIASES.date)
  const descCol = findColumn(header, HEADER_ALIASES.description)
  const amountCol = findColumn(header, HEADER_ALIASES.amount)
  const typeCol = findColumn(header, HEADER_ALIASES.type)
  const debitCol = findColumn(header, HEADER_ALIASES.debit)
  const creditCol = findColumn(header, HEADER_ALIASES.credit)

  if (dateCol === -1) return { candidates: [], error: 'No date column found. Expected a header like "Date".' }
  if (amountCol === -1 && debitCol === -1 && creditCol === -1) {
    return { candidates: [], error: 'No amount column found. Expected "Amount", or "Debit"/"Credit".' }
  }

  const candidates = dataRows
    .filter((r) => r.some((cell) => cell.trim() !== ''))
    .map((r, i) => {
      const raw = r[descCol >= 0 ? descCol : 0] || `row ${i + 2}`
      const date = parseStatementDate(r[dateCol])

      let amount = null, type = null
      if (amountCol !== -1) {
        const n = Number(String(r[amountCol]).replace(/[,₹\s]/g, ''))
        if (Number.isFinite(n) && n !== 0) {
          amount = Math.abs(n)
          const typeText = (typeCol !== -1 ? r[typeCol] : '').trim().toLowerCase()
          if (typeText.startsWith('cr') || typeText === 'credit') type = 'income'
          else if (typeText.startsWith('dr') || typeText === 'debit') type = 'expense'
          else type = n < 0 ? 'expense' : 'income' // signed amount, no separate type column
        }
      } else {
        const debit = Number(String(r[debitCol] ?? '').replace(/[,₹\s]/g, '')) || 0
        const credit = Number(String(r[creditCol] ?? '').replace(/[,₹\s]/g, '')) || 0
        if (debit > 0) { amount = debit; type = 'expense' }
        else if (credit > 0) { amount = credit; type = 'income' }
      }

      const candidate = {
        raw: raw.trim(),
        date: date || null,
        amount,
        type,
        assumedType: false, // a statement states the direction; never a guess
        account: null, // resolved by the caller to the one account being imported into
        accountConflict: [],
        fromAccount: null,
        toAccount: null,
        categoryId: type === 'expense' ? matchCategory(raw, categoryRules) : null,
        spendingContext: null,
        contextSource: null,
        contextMatched: null,
        contextConflict: [],
        needsReview: date === null || amount === null || type === null,
        source: 'bank_statement',
      }
      candidate.duplicate = checkDuplicate(candidate, existingTransactions)
      return candidate
    })

  return { candidates, error: null }
}
