// Pure functions — no Supabase calls, no DOM access except inside
// downloadCsv()'s browser-only trigger. Given already-fetched rows and a
// column definition, produce (and optionally download) a CSV string.

/**
 * @param {Array<Object>} rows - already-fetched plain objects
 * @param {Array<{key: string, label: string}>} columns
 * @returns {string} CSV text, header row first. An empty `rows` array still
 *   produces a header-only CSV (so the shape of what would have been
 *   exported is always visible, even with nothing to show yet) — this is
 *   the one behavior chosen and tested, not left undefined.
 */
export function toCsv(rows, columns) {
  const headerLine = columns.map((c) => escapeCsvField(c.label)).join(',')
  const dataLines = rows.map((row) => columns.map((c) => escapeCsvField(row[c.key])).join(','))
  return [headerLine, ...dataLines].join('\r\n')
}

function escapeCsvField(value) {
  const str = value === null || value === undefined ? '' : String(value)
  const needsQuoting = str.includes(',') || str.includes('"') || str.includes('\n') || str.includes('\r')
  if (!needsQuoting) return str
  return `"${str.replace(/"/g, '""')}"`
}

/**
 * Triggers a browser download of `csvString` as `filename`. Standard
 * client-side Blob + temporary <a> pattern — no new dependency.
 */
export function downloadCsv(filename, csvString) {
  const blob = new Blob([csvString], { type: 'text/csv;charset=utf-8;' })
  const url = URL.createObjectURL(blob)
  const link = document.createElement('a')
  link.href = url
  link.download = filename
  document.body.appendChild(link)
  link.click()
  document.body.removeChild(link)
  URL.revokeObjectURL(url)
}
