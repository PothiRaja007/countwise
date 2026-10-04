// Learning ROI — "possible job areas" for a learning item.
//
// Pure data + one pure lookup. No AI, no network, no database change: a
// learning item is matched to this catalogue by its name (and tag), so adding
// a certificate for every user is one new entry here and nothing else. The
// existing Learning ROI numbers (cost, progress, status) are not touched.
//
// Wording rule: these are AREAS a skill can support, never a promise. No
// pay figures, no hiring claims, no company names. A test
// (learningCareerAreas.test.js) fails if guarantee-style words creep in.
//
// Matching: names are lower-cased and punctuation becomes spaces, then a
// keyword must match as whole words ("PL-300" -> "pl 300"). Entries are
// checked in order and the FIRST match wins, so keep specific certificates
// above generic skills (Google Data Analytics must come before plain "sql").

export const CAREER_AREAS_LABEL = 'Possible job areas'
export const CAREER_AREAS_NOTE =
  'Job areas are general possibilities this learning can support. They are not a promise of any job, hiring or pay.'

export const CAREER_AREA_CATALOGUE = [
  {
    id: 'google-data-analytics',
    keywords: ['google data analytics'],
    areas: [
      'Data analysis',
      'Business intelligence and reporting',
      'Operations analytics',
      'Marketing analytics',
      'Financial data analysis',
      'Entry-level data and BI roles',
    ],
  },
  {
    id: 'microsoft-pl-300',
    keywords: ['pl 300', 'pl300', 'power bi data analyst'],
    areas: [
      'Business intelligence and dashboards',
      'Reporting analysis',
      'Data analysis',
      'Finance and operations reporting',
    ],
  },
  {
    id: 'nism-v-a',
    keywords: ['nism v a', 'nism va', 'nism series v a', 'nism series 5a', 'mutual fund distributors'],
    areas: [
      'Mutual fund distribution',
      'Investor servicing and operations',
      'Banking and wealth relationship roles',
      'Financial product support',
    ],
  },
  {
    id: 'hackerrank-sql',
    keywords: ['hackerrank sql'],
    areas: [
      'Data analysis',
      'Reporting and BI',
      'Database querying and support',
      'Entry-level data engineering',
    ],
  },
  {
    id: 'cfa',
    keywords: ['cfa', 'chartered financial analyst'],
    areas: ['Equity and investment research', 'Portfolio and asset management', 'Valuation and financial analysis', 'Risk analysis'],
  },
  {
    id: 'frm',
    keywords: ['frm', 'financial risk manager'],
    areas: ['Market and credit risk analysis', 'Risk management', 'Treasury and compliance support'],
  },
  {
    id: 'tableau',
    keywords: ['tableau'],
    areas: ['Data visualisation', 'Business intelligence and dashboards', 'Reporting analysis'],
  },
  {
    id: 'power-bi',
    keywords: ['power bi'],
    areas: ['Business intelligence and dashboards', 'Reporting analysis', 'Data analysis', 'Finance and operations reporting'],
  },
  {
    id: 'python',
    keywords: ['python'],
    areas: ['Data analysis', 'Automation and scripting', 'Entry-level data science', 'Software development'],
  },
  {
    id: 'sql',
    keywords: ['sql'],
    areas: ['Data analysis', 'Reporting and BI', 'Database querying and support'],
  },
  {
    id: 'excel',
    keywords: ['excel', 'advanced excel'],
    areas: ['Data and MIS reporting', 'Business and financial analysis', 'Accounting and finance support', 'Operations support'],
  },
]

/** "PL-300 (Power BI)" -> "pl 300 power bi". Letters/digits only, single spaces. */
export function normalizeForMatch(text) {
  return String(text ?? '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, ' ')
    .trim()
}

/**
 * @param {{ name?: string, relevance_tag?: string }} item a learning item
 * @returns {{ id: string, areas: string[] } | null} the first matching catalogue
 *   entry, or null when nothing matches (the UI then shows nothing, never a guess).
 */
export function careerAreasFor(item) {
  if (!item) return null
  const haystack = ` ${normalizeForMatch(`${item.name ?? ''} ${item.relevance_tag ?? ''}`)} `
  if (haystack.trim() === '') return null
  for (const entry of CAREER_AREA_CATALOGUE) {
    if (entry.keywords.some((k) => haystack.includes(` ${normalizeForMatch(k)} `))) {
      return { id: entry.id, areas: [...entry.areas] }
    }
  }
  return null
}
