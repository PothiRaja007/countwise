// P3 (Money Inbox command layer) — the DETERMINISTIC INTERPRETER.
//
// Reads one typed sentence and says what it is:
//
//   { kind: 'transaction' }                      leave it to the existing parser
//   { kind: 'command',  pending, asks, notes }   a pending action (CREATE_* / MODIFY_*)
//   { kind: 'query',    pending, asks, notes }   a pending action (QUERY_*)
//   { kind: 'navigate', pending, asks, notes }   a pending action (NAVIGATE)
//   { kind: 'clarify',  clarification, asks, notes }
//
// It SAVES NOTHING and OPENS NOTHING. It only describes what the user seems to want,
// using the P1 contracts, so the owning feature can confirm and write. When two
// meanings are possible it asks; it never picks one for the user.
//
// The order of decisions (first match wins):
//   1 empty text            → transaction
//   2 a bare word           → clarify (bare_word)
//   3 mixed input           → clarify (mixed_input, "edit" only)
//   4 a question            → query
//   5 an "open ..." request → navigate (six allowed pages only)
//   6 a command             → command (an owned noun is REQUIRED: goal, budget, learning)
//   7 "I need 50000 for X"  → clarify (competing_meaning)
//   8 anything else         → transaction
//
// What it never does: build a calculated, estimated or suggested value (only the
// owning engines may), read a clock, generate an id, or fetch anything. The caller
// passes the user's own goals, categories, learning items and accounts in `context`,
// and the id of the pending action.
//
// PURE. Imports only its sibling modules. No database, React or router.

import { deepFreeze, getContract } from './intents.js'
import { createPendingAction, createClarification } from './pendingAction.js'
import { readPeriod, currentMonthPeriod } from './periodParser.js'
import { resolveName, ambiguityFromResolution, normalizeName } from './entityResolver.js'
import { readAmount } from './amountReader.js'

export class InterpreterError extends Error {
  constructor(code, message) {
    super(message)
    this.name = 'InterpreterError'
    this.code = code
  }
}
const fail = (code, message) => { throw new InterpreterError(code, message) }

// ---------- the words it knows ----------
const GOAL_N = /\bgoals?\b/i
const BUDGET_N = /\bbudgets?\b/i
const LEARN_N = /\b(?:learning|courses?|certifications?|certificates?)\b/i
const PENSION_N = /\b(?:pension|pf|epf|provident fund)\b/i
const OWNED_NOUN = /\b(?:goals?|budgets?|learning|courses?|certifications?|certificates?|pension|pf|epf|provident fund)\b/i
const REF_ONLY = /^(?:it|that|this|that one|the same|the same one|that goal|this goal|the goal)$/i

const POLITE = /^(?:please|pls|plz|kindly|can you|could you|would you|will you|i want to|i would like to|i'd like to|i wanna|let's|lets|help me)\s+/i
const QUESTION_START = /^(?:how much|how many|how's|how is|what is|what's|whats|what are|what was|what were|where is|where's|which|show me how much|tell me how much|tell me what|did i|have i|do i have)\b/i
const COMMAND_START = /^(?:create|add|make|set|increase|decrease|raise|reduce|lower|change|update|mark|start|new|put|contribute|cut|bump|track|move|open|go|take|show)\b/i
const VERB_LED = /^(?:create|add|make|set|increase|decrease|raise|reduce|lower|change|update|mark|start|new|put|contribute|cut|bump|track|move|delete|remove|archive|rename|edit|cancel|close|complete|finish|drop)\b/i
const TX_VERB = /\b(?:spent|paid|bought|received|got|sent|earned|gave|credited|debited|transferred|moved|had)\b/i

const SPEND_W = /\b(?:spend|spent|spending|expenses?|paid|pay|cost)\b/i
const BALANCE_W = /\b(?:balance|accounts?|wallet|bank|savings)\b|\bhow much (?:money |cash )?(?:do i have|have i got|is (?:in|there))\b/i

// Words that stand for a feature on their own ("goal", "salary").
const DOMAIN_WORDS = {
  goal: 'goal', goals: 'goal', budget: 'budget', budgets: 'budget',
  learning: 'learning', course: 'learning', courses: 'learning', certification: 'learning', certificate: 'learning',
  pension: 'pension', pf: 'pension', epf: 'pension', salary: 'salary', balance: 'balance',
}
const FILLER_WORDS = new Set(['my', 'our', 'the', 'a', 'an'])

const PAGE_ALIASES = {
  transactions: ['transactions', 'transaction', 'transaction list', 'transaction history'],
  goals: ['goal', 'goals', 'savings goals', 'savings goal'],
  budgets: ['budget', 'budgets'],
  learning: ['learning', 'learning roi', 'learning list', 'course', 'courses'],
  salary: ['salary'],
  pension: ['pension', 'pf', 'pf pension', 'epf', 'provident fund'],
}
const EXCLUDED_PAGES = ['settings', 'setting', 'charts', 'chart', 'reports', 'report', 'insights', 'insight', 'ctc explorer', 'ctc', 'money options', 'money option', 'admin']
const PAGE_LABEL = { transactions: 'Transactions', goals: 'Goals', budgets: 'Budgets', learning: 'Learning', salary: 'Salary', pension: 'PF / Pension' }

const STATUS_WORDS = {
  planned: ['planned', 'plan', 'to do', 'todo', 'not started'],
  in_progress: ['in progress', 'inprogress', 'started', 'ongoing', 'begun'],
  completed: ['completed', 'complete', 'done', 'finished', 'finish'],
  dropped: ['dropped', 'drop', 'abandoned', 'quit', 'discarded'],
}
const STATUS_TAIL = /\s+(completed|complete|done|finished|dropped|abandoned|planned|started|ongoing)$/i

// ---------- reading the text ----------
function prepare(text) {
  let s = text.trim().replace(/\s+/g, ' ').replace(/[’]/g, "'")
  const hadQ = s.includes('?')
  s = s.replace(/[?!.\s]+$/, '')
  let before
  do { before = s; s = s.replace(POLITE, '') } while (s !== before)
  return { s, hadQ }
}

function readContext(context) {
  const c = context === undefined ? {} : context
  if (!c || typeof c !== 'object' || Array.isArray(c)) fail('invalid_context', 'context must be an object')
  for (const key of Object.keys(c)) {
    if (!['id', 'referenceDate', 'goals', 'categories', 'learningItems', 'accounts'].includes(key)) fail('invalid_context', `Unknown context key "${key}"`)
  }
  const list = (name) => {
    if (c[name] === undefined) return []
    if (!Array.isArray(c[name])) fail('invalid_context', `${name} must be a list`)
    return c[name]
  }
  return { id: c.id, referenceDate: c.referenceDate, goals: list('goals'), categories: list('categories'), learningItems: list('learningItems'), accounts: list('accounts') }
}

const removeText = (str, pieces) => pieces.reduce((acc, p) => (p ? acc.split(p).join(' ') : acc), str).replace(/\s+/g, ' ').trim()
const money = (n) => `₹${n}`

// ---------- detection (no building yet) ----------
function matchPage(phrase) {
  const p = normalizeName(phrase.replace(/[/\-_]+/g, ' ')).replace(/^(?:my|our|the)\s+/, '').replace(/\s+(?:page|tab|screen|section)$/, '')
  if (EXCLUDED_PAGES.includes(p)) return { excluded: true }
  for (const [id, aliases] of Object.entries(PAGE_ALIASES)) if (aliases.includes(p)) return { page: id }
  return null
}

const NAV = /^(?:open|go to|goto|take me to|show|view|see|visit|navigate to|switch to|bring up)\s+(?:me\s+)?(.+)$/i
function detectNavigate(s) {
  if (/\d/.test(s)) return null
  const m = NAV.exec(s)
  return m ? matchPage(m[1]) : null
}

function detectQuery(s, hadQ) {
  const isQuestion = QUESTION_START.test(s) || (hadQ && !COMMAND_START.test(s))
  if (!isQuestion) return null
  if (PENSION_N.test(s)) return { intent: 'QUERY_PENSION_ESTIMATE' }
  if (BUDGET_N.test(s)) return { intent: 'QUERY_BUDGET_LEFT' }
  if (GOAL_N.test(s)) return { intent: 'QUERY_GOAL_PROGRESS' }
  if (SPEND_W.test(s)) return { intent: 'QUERY_SPEND' }
  if (BALANCE_W.test(s)) return { intent: 'QUERY_BALANCE' }
  return null
}

const CONTRIB = /^(?:add|put|contribute|transfer|move|deposit|save|allocate|set aside|invest)\s+(.+?)\s+(?:to|into|towards?)\s+(.+)$/i
const BUDGET_ADD = /^(?:add|put)\s+(.+?)\s+(?:to|into)\s+(.+?)\s+budgets?\b/i
const LEARN_ADD_A = /^(?:add|create|new|start|track|put|include|list)\s+(.+?)\s+(?:to|in|into|on|under)\s+(?:my\s+|the\s+)?(?:learning(?:\s+(?:roi|list|plan|tracker))?|courses?)$/i
const LEARN_ADD_B = /^(?:add|create|new|start|track)\s+(?:a\s+|an\s+)?(?:new\s+)?(?:learning item|learning|course|certification|certificate)\s*(?:called|named|for|on)?\s*(.*)$/i
const GOAL_CREATE_A = /^(?:create|make|add|start|begin|set up|setup|new)\s+(?:me\s+)?(?:a\s+|an\s+|my\s+|the\s+)?(?:new\s+)?(?:savings?\s+)?goals?\b(.*)$/i
const GOAL_CREATE_B = /^(?:create|make|add|start|begin|set up|setup)\s+(?:me\s+)?(?:a\s+|an\s+)?(?:new\s+)?(.+?)\s+goal\b(.*)$/i
const BUDGET_CREATE = /^(?:create|add|start|begin|new|set up|setup|plan|draft|make\s+(?:me\s+)?(?:a|an|new|next))\b/i
const BUDGET_MODIFY = /^(set|increase|decrease|raise|reduce|lower|change|update|cut|bump(?:\s+up)?|adjust|revise|make|put)\s+(.+)$/i
const LEARN_STATUS = /^(?:mark|set|change|update|move|flag)\s+(.+)$/i

const statusOf = (phrase) => {
  const p = phrase.trim().toLowerCase().replace(/^being\s+/, '')
  for (const [status, words] of Object.entries(STATUS_WORDS)) if (words.includes(p)) return status
  return null
}

function detectCommand(s) {
  let m = CONTRIB.exec(s)
  if (m) {
    const parts = m[2].split(/\s+from\s+/i)
    const goalPhrase = parts[0].trim()
    if (GOAL_N.test(goalPhrase) || REF_ONLY.test(goalPhrase)) {
      return { intent: 'MODIFY_GOAL_CONTRIBUTE', goalPhrase, accountPhrase: parts.length > 1 ? parts.slice(1).join(' from ').trim() : null }
    }
  }
  m = BUDGET_ADD.exec(s)
  if (m) return { intent: 'MODIFY_BUDGET_AMOUNT', mode: 'add', categoryPhrase: m[2] }

  m = LEARN_ADD_A.exec(s)
  if (m && !GOAL_N.test(m[1]) && !BUDGET_N.test(m[1])) return { intent: 'CREATE_LEARNING_ITEM', rawName: m[1] }

  m = GOAL_CREATE_A.exec(s)
  if (m) return { intent: 'CREATE_GOAL', rest: m[1] }
  m = GOAL_CREATE_B.exec(s)
  if (m && !BUDGET_N.test(m[1])) return { intent: 'CREATE_GOAL', rawName: m[1], rest: m[2] }

  if (BUDGET_N.test(s) && BUDGET_CREATE.test(s)) return { intent: 'CREATE_BUDGET_MONTH' }
  m = BUDGET_MODIFY.exec(s)
  if (m && BUDGET_N.test(m[2])) return { intent: 'MODIFY_BUDGET_AMOUNT', verb: m[1].toLowerCase().replace(/\s+up$/, ''), body: m[2] }

  m = LEARN_STATUS.exec(s)
  if (m && LEARN_N.test(m[1]) && !GOAL_N.test(m[1]) && !BUDGET_N.test(m[1])) {
    const body = m[1]
    const split = /^(.+)\s+(?:as|to)\s+(.+)$/i.exec(body)
    if (split) {
      const status = statusOf(split[2])
      return status ? { intent: 'MODIFY_LEARNING_STATUS', itemPhrase: split[1], status } : guardFor(s)
    }
    const tail = STATUS_TAIL.exec(body)
    if (tail) return { intent: 'MODIFY_LEARNING_STATUS', itemPhrase: body.slice(0, tail.index), status: statusOf(tail[1]) }
    return { intent: 'MODIFY_LEARNING_STATUS', itemPhrase: body, status: null }
  }

  m = LEARN_ADD_B.exec(s)
  if (m) return { intent: 'CREATE_LEARNING_ITEM', rawName: m[1] }

  if (VERB_LED.test(s) && OWNED_NOUN.test(s) && !PENSION_N.test(s)) return guardFor(s)
  return null
}

// A command-shaped sentence that this version cannot do (delete a goal, change a course's cost):
// never a silent transaction, so the layer says so and offers the page.
function guardFor(s) {
  const page = GOAL_N.test(s) ? 'goals' : BUDGET_N.test(s) ? 'budgets' : 'learning'
  return { intent: 'UNSUPPORTED', page }
}

function splitClauses(s) {
  const masked = s.replace(/(\d),(?=\d)/g, '$1\u0001')
  return masked
    .split(/\s*(?:,|;|\band then\b|\bthen\b|\band\b|\balso\b|\bplus\b|\bbut\b)\s*/i)
    .map((p) => p.replace(/\u0001/g, ',').trim())
    .filter(Boolean)
}

function clauseKind(clause) {
  const { s } = prepare(clause)
  if (!s) return null
  if (detectNavigate(s)) return 'N'
  const c = detectCommand(s)
  if (c) return `C:${c.intent}`
  const q = detectQuery(s, false)
  if (q) return `Q:${q.intent}`
  if (!OWNED_NOUN.test(s) && (readAmount(s).status !== 'none' || TX_VERB.test(s))) return 'T'
  return null
}

function isMixed(s) {
  const kinds = splitClauses(s).map(clauseKind).filter(Boolean)
  if (kinds.length < 2) return false
  return new Set(kinds).size >= 2 || kinds[0] === 'N' || kinds[0].startsWith('C:')
}

// ---------- bare words ----------
function detectBare(s, ctx) {
  if (/\d/.test(s)) return null
  const tokens = normalizeName(s).split(' ').filter(Boolean)
  if (tokens.length === 0 || tokens.length > 3) return null
  const core = tokens.filter((t) => !FILLER_WORDS.has(t))
  if (core.length === 0) return null
  if (core.length === 1 && DOMAIN_WORDS[core[0]]) return { domain: DOMAIN_WORDS[core[0]] }
  const found = {}
  for (const [key, kind, list] of [['goal', 'goal', ctx.goals], ['category', 'category', ctx.categories], ['learningItem', 'learningItem', ctx.learningItems]]) {
    const r = resolveName(s, list, { kind })
    if (r.status === 'single' || r.status === 'multiple') found[key] = r
  }
  return Object.keys(found).length ? { entities: found } : null
}

const DOMAIN_CHOICES = {
  goal: [{ id: 'create_goal', label: 'Create a goal', intent: 'CREATE_GOAL' }, { id: 'open_goals', label: 'Open Goals', intent: 'NAVIGATE' }],
  budget: [{ id: 'create_budget', label: 'Create a monthly budget', intent: 'CREATE_BUDGET_MONTH' }, { id: 'open_budgets', label: 'Open Budgets', intent: 'NAVIGATE' }],
  learning: [{ id: 'add_learning', label: 'Add a learning item', intent: 'CREATE_LEARNING_ITEM' }, { id: 'open_learning', label: 'Open Learning', intent: 'NAVIGATE' }],
  pension: [{ id: 'pension_estimate', label: 'Show my pension estimate', intent: 'QUERY_PENSION_ESTIMATE' }, { id: 'open_pension', label: 'Open PF / Pension', intent: 'NAVIGATE' }],
  salary: [{ id: 'record_salary', label: 'Record salary received', intent: 'RECORD_TRANSACTION' }, { id: 'open_salary', label: 'Open Salary', intent: 'NAVIGATE' }],
  balance: [{ id: 'total_balance', label: 'Show my total balance', intent: 'QUERY_BALANCE' }],
}

function entityChoices(entities, typed) {
  const actions = []
  const { goal, category, learningItem } = entities
  if (goal) {
    if (goal.status === 'single') {
      const g = goal.matches[0]
      actions.push({ id: `goal_progress_${g.id}`, label: `How much have I put into ${g.name}?`, intent: 'QUERY_GOAL_PROGRESS' })
      actions.push({ id: `goal_add_${g.id}`, label: `Add money to ${g.name}`, intent: 'MODIFY_GOAL_CONTRIBUTE' })
    } else actions.push({ id: 'open_goals', label: 'Open Goals', intent: 'NAVIGATE' })
  }
  if (category && category.status === 'single') {
    const c = category.matches[0]
    actions.push({ id: `spend_${c.id}`, label: `How much did I spend on ${c.name}?`, intent: 'QUERY_SPEND' })
    actions.push({ id: `budget_left_${c.id}`, label: `How much is left in my ${c.name} budget?`, intent: 'QUERY_BUDGET_LEFT' })
  }
  if (learningItem) {
    if (learningItem.status === 'single') {
      const l = learningItem.matches[0]
      actions.push({ id: `learning_status_${l.id}`, label: `Change the status of ${l.name}`, intent: 'MODIFY_LEARNING_STATUS' })
    } else actions.push({ id: 'open_learning', label: 'Open Learning', intent: 'NAVIGATE' })
  }
  const record = { id: 'record_expense', label: `Record “${typed}” as an expense`, intent: 'RECORD_TRANSACTION' }
  return [...actions.slice(0, 3), record]
}

// ---------- building ----------
class Builder {
  constructor(intent, id, source, ctx, now) {
    this.intent = intent
    this.contract = getContract(intent)
    this.id = id
    this.source = source
    this.ctx = ctx
    this.now = now
    this.fields = {}
    this.ambiguities = []
    this.asks = []
    this.notes = []
    const ref = ctx.referenceDate === undefined ? new Date(now) : ctx.referenceDate
    this.ref = ref
    // A typed value is a record (actual) or a plan (planned), exactly as the contract says it becomes.
    this.kind = this.contract.becomes === 'none' ? 'actual' : this.contract.becomes
  }

  typed(name, value, note) {
    this.fields[name] = { value, kind: this.kind, origin: 'typed', ...(note ? { note } : {}) }
  }

  matched(name, match) {
    this.fields[name] = { value: { id: match.id, name: match.name }, kind: this.kind, origin: 'matched' }
  }

  ask(...names) {
    const name = names.find((n) => this.contract.askWhen.includes(n))
    if (name && !this.asks.includes(name)) this.asks.push(name)
  }

  note(text) { if (!this.notes.includes(text)) this.notes.push(text) }

  ambiguity(field, options) { this.ambiguities.push({ field, options }) }

  // The caller's own list, offered as the choices when the phrase did not narrow it down.
  offerAll(field, candidates) {
    if (candidates.length >= 2) this.ambiguity(field, candidates.map((c) => ({ id: c.id, label: c.name })))
  }

  amount(field, text, { required = false } = {}) {
    const a = readAmount(text)
    if (a.status === 'found') this.typed(field, a.value)
    else if (a.status === 'ambiguous') {
      this.ambiguity(field, a.candidates.map((c) => ({ id: String(c.value), label: money(c.value) })))
      this.note('More than one amount was typed, so please pick the right one.')
    }
    return a
  }

  entity(field, phrase, kind, candidates, { required }) {
    const r = resolveName(phrase, candidates, { kind })
    const ASKS = {
      goal: { multiple: ['goal_ambiguous'], none: ['goal_ambiguous'], reference: ['goal_reference_unresolved'], empty: ['goal_reference_unresolved'] },
      category: { multiple: ['category_ambiguous', 'category_unknown'], none: ['category_unknown'], reference: ['category_unknown'], empty: ['category_unknown'] },
      learningItem: { multiple: ['item_ambiguous'], none: ['item_not_found'], reference: ['item_ambiguous'], empty: ['item_ambiguous'] },
      account: { multiple: ['account_unclear'], none: ['account_unclear'], reference: ['account_unclear'], empty: ['account_unclear'] },
    }
    const LABEL = { goal: 'goal', category: 'category', learningItem: 'learning item', account: 'account' }
    if (r.status === 'single') { this.matched(field, r.matches[0]); return r }
    if (r.status === 'multiple') {
      this.ambiguities.push(ambiguityFromResolution(field, r))
      this.ask(...ASKS[kind].multiple)
      return r
    }
    if (!required && (r.status === 'empty' || r.status === 'reference')) return r
    this.ask(...ASKS[kind][r.status])
    if (r.status === 'none') this.note(`No ${LABEL[kind]} matched “${phrase.trim()}”.`)
    if (r.status === 'reference') this.note('There is nothing to say which one “it” or “that” means yet.')
    this.offerAll(field, candidates)
    return r
  }

  // A month phrase. mode 'month' stores the whole month; mode 'date' stores its last day.
  period(field, text, { prefer, required = false, defaultToCurrent = false, mode = 'month', options = ['this month', 'last month'] }) {
    const r = readPeriod(text, this.ref, { prefer })
    const value = (p) => (mode === 'date' ? p.end : { month: p.month, start: p.start, end: p.end, label: p.label })
    const noteFor = (p) => {
      if (mode === 'date') return `Using the last day of ${p.label}${p.assumption ? `. ${p.assumption}` : ''}`
      return p.assumption || undefined
    }
    if (r.status === 'found') {
      this.typed(field, value(r.period), noteFor(r.period))
    } else if (r.status === 'none') {
      if (defaultToCurrent) {
        const p = currentMonthPeriod(this.ref)
        this.fields[field] = { value: value(p), kind: this.kind, origin: 'default', note: 'Using the current calendar month' }
      } else if (required) this.ask('month_unclear', 'period_unclear')
    } else if (r.status === 'ambiguous') {
      this.ambiguity(field, r.candidates.map((p) => ({ id: p.month, label: p.label })))
      this.note('More than one month was mentioned, so please pick one.')
      this.ask('period_unclear', 'month_unclear')
    } else if (mode === 'date') {
      this.note(`Only whole months can be read, so “${r.unsupported.join('”, “')}” was not used as a date.`)
    } else {
      const opts = options.map((phrase) => readPeriod(phrase, this.ref).period).map((p) => ({ id: p.month, label: p.label }))
      this.ambiguity(field, opts)
      this.note(`Only whole months can be used, so “${r.unsupported.join('”, “')}” needs a month.`)
      this.ask('period_unclear', 'month_unclear')
    }
    return r
  }

  finish(kind) {
    if (typeof this.id !== 'string' || !this.id.trim()) fail('id_required', 'context.id is required to build a pending action (the caller supplies it)')
    const pending = createPendingAction({ id: this.id, intent: this.intent, source: this.source, fields: this.fields, ambiguities: this.ambiguities }, this.now)
    return deepFreeze({ kind, pending, asks: [...this.asks], notes: [...this.notes] })
  }
}

function periodTexts(r) {
  if (r.status === 'found') return [r.period.matchedText]
  if (r.status === 'ambiguous') return r.candidates.map((p) => p.matchedText)
  return []
}

// "for a laptop worth ..." → "laptop"
const NAME_STOP = /\s+(?:worth|costing|costs?|target(?:ing)?|of|by|before|until|till|with|at)\b|\s+for\s+(?:₹|rs\.?\s*\d|\d)|\s*₹/i
function cleanName(raw) {
  if (!raw) return null
  let name = raw.split(NAME_STOP)[0]
  name = name.replace(/\s+\d[\d,]*(?:\.\d+)?\s*(?:k|lakhs?|lacs?|l)?$/i, '')
  name = name.replace(/^(?:a|an|the|my|new)\s+/i, '').replace(/^(?:a|an|the|my|new)\s+/i, '').replace(/[\s,.:;-]+$/, '').trim()
  return /\p{L}/u.test(name) ? name : null
}

function goalNameFrom(c) {
  if (c.rawName) return cleanName(c.rawName)
  const rest = (c.rest || '').trim()
  let m = /^(?:called|named|titled)\s+(.+)$/i.exec(rest)
  if (!m) m = /^(?:for|to buy|to get|to save for|to purchase|to afford)\s+(.+)$/i.exec(rest)
  if (m) return cleanName(m[1])
  if (/^(?:worth|of|by|before|until|till|with|at|for\s+(?:₹|rs|\d))/i.test(rest) || /^[₹\d]/.test(rest)) return null
  return cleanName(rest)
}

function buildCommand(c, s, original, ctx, id, now) {
  const b = new Builder(c.intent, id, original, ctx, now)
  switch (c.intent) {
    case 'MODIFY_GOAL_CONTRIBUTE': {
      b.amount('amount', s)
      b.entity('goal', c.goalPhrase, 'goal', ctx.goals, { required: true })
      if (c.accountPhrase) b.entity('account', c.accountPhrase, 'account', ctx.accounts, { required: false })
      break
    }
    case 'CREATE_GOAL': {
      const name = goalNameFrom(c)
      if (name) b.typed('name', name)
      b.amount('targetAmount', s)
      b.period('targetDate', s, { prefer: 'future', mode: 'date' })
      break
    }
    case 'CREATE_BUDGET_MONTH': {
      b.period('month', s, { prefer: 'future', required: true, options: ['this month', 'next month'] })
      break
    }
    case 'MODIFY_BUDGET_AMOUNT': {
      const r = readPeriod(s, b.ref, { prefer: 'future' })
      let cleaned = removeText(s, periodTexts(r))
      let categoryPhrase = c.categoryPhrase
      const amount = readAmount(s)
      if (r.status === 'found') b.typed('month', { month: r.period.month, start: r.period.start, end: r.period.end, label: r.period.label }, r.period.assumption || undefined)
      else if (r.status === 'ambiguous') { b.period('month', s, { prefer: 'future' }) } else if (r.status === 'unsupported') b.period('month', s, { prefer: 'future', options: ['this month', 'next month'] })
      if (c.mode !== 'add') {
        const body = removeText(c.body, periodTexts(r))
        const A = /^(.*?)\bbudgets?\b/i.exec(body)
        categoryPhrase = A ? A[1].trim() : ''
        if (!/\p{L}/u.test(categoryPhrase.replace(/\b(?:my|our|the|a|an)\b/gi, ''))) {
          const B = /\bbudgets?\s+(?:for|of|on)\s+(.+?)(?:\s+(?:to|by|at)\s+.*)?$/i.exec(body)
          if (B) categoryPhrase = B[1].trim()
        }
        cleaned = body
      }
      b.entity('category', categoryPhrase, 'category', ctx.categories, { required: true })
      const prepMatch = /\b(to|by|at)\s+(?:₹|rs\.?\s*)?\d/i.exec(cleaned)
      const prep = prepMatch ? prepMatch[1].toLowerCase() : null
      const direction = c.mode === 'add' ? 'increase' : ({ increase: 'increase', raise: 'increase', bump: 'increase', decrease: 'decrease', reduce: 'decrease', lower: 'decrease', cut: 'decrease' })[c.verb] || null
      if (amount.status === 'ambiguous') {
        b.ambiguity('newAmount', amount.candidates.map((x) => ({ id: String(x.value), label: money(x.value) })))
        b.note('More than one amount was typed, so please pick the right one.')
      } else if (amount.status === 'found') {
        const v = amount.value
        if (c.mode === 'add' || (prep === 'by' && direction)) b.typed('relativeChange', { direction, amount: v })
        else if (prep === 'by') b.note('Please say whether to increase or decrease the budget by that amount.')
        else if (prep === 'to' || prep === 'at' || (!prep && !direction)) b.typed('newAmount', v)
        else {
          b.ambiguity('newAmount', [
            { id: `to:${v}`, label: `Set it to ${money(v)}` },
            { id: `${direction}:${v}`, label: `${direction === 'increase' ? 'Increase' : 'Decrease'} it by ${money(v)}` },
          ])
        }
      }
      break
    }
    case 'CREATE_LEARNING_ITEM': {
      const name = cleanName(c.rawName)
      if (name) b.typed('name', name)
      const a = readAmount(s)
      if (a.status === 'found') b.typed('cost', a.value)
      else if (a.status === 'ambiguous') b.amount('cost', s)
      b.period('targetDate', s, { prefer: 'future', mode: 'date' })
      break
    }
    case 'MODIFY_LEARNING_STATUS': {
      b.entity('item', c.itemPhrase, 'learningItem', ctx.learningItems, { required: true })
      if (c.status) b.typed('newStatus', c.status)
      break
    }
    default: fail('unknown_command', c.intent)
  }
  return b.finish('command')
}

function buildQuery(q, s, original, ctx, id, now) {
  const b = new Builder(q.intent, id, original, ctx, now)
  switch (q.intent) {
    case 'QUERY_PENSION_ESTIMATE': break
    case 'QUERY_SPEND': {
      const r = b.period('period', s, { prefer: 'past', defaultToCurrent: true })
      let rest = removeText(s, periodTexts(r))
      const verb = /\b(?:spend|spent|spending|pay|paid|expenses?)\b(.*)$/i.exec(rest)
      rest = verb ? verb[1] : ''
      rest = rest.replace(/\b(?:in total|overall|altogether|so far|till now|to date|total)\b/gi, ' ').replace(/\s+/g, ' ').trim()
      const cat = /^(?:on|for|in|towards)\s+(.+)$/i.exec(rest)
      if (cat && /\p{L}/u.test(cat[1])) b.entity('category', cat[1], 'category', ctx.categories, { required: false })
      if (/\baccounts?\b/i.test(s)) b.note('Spending is not split by account yet, so this covers all accounts.')
      break
    }
    case 'QUERY_BUDGET_LEFT': {
      const r = b.period('month', s, { prefer: 'past', defaultToCurrent: true })
      const body = removeText(s, periodTexts(r))
      const m = /\b(?:in|of|on|for|from|under)\s+(?:my\s+|the\s+|our\s+)?(.+?)\s+budgets?\b/i.exec(body) || /\bmy\s+(.+?)\s+budgets?\b/i.exec(body) || /\bbudgets?\s+(?:for|of|on)\s+(.+)$/i.exec(body)
      b.entity('category', m ? m[1] : '', 'category', ctx.categories, { required: true })
      break
    }
    case 'QUERY_GOAL_PROGRESS': {
      const m = /\b(?:into|in|to|for|on|towards?|of)\s+(?:my\s+|the\s+|our\s+)?(.+?)\s+goals?\b/i.exec(s) || /\b(?:my|the|our)\s+(.+?)\s+goals?\b/i.exec(s) || /\bgoals?\s+(?:for|called|named)\s+(.+)$/i.exec(s)
      b.entity('goal', m ? m[1] : '', 'goal', ctx.goals, { required: true })
      break
    }
    case 'QUERY_BALANCE': {
      const m = /\bin\s+(?:my\s+|the\s+)?(.+)$/i.exec(s) || /\bmy\s+(.+?)\s+(?:account|balance)\b/i.exec(s)
      const phrase = m ? m[1].replace(/\b(?:total|overall|current|whole|all|available)\b/gi, ' ').replace(/\s+/g, ' ').trim() : ''
      if (/\p{L}/u.test(phrase)) b.entity('account', phrase, 'account', ctx.accounts, { required: false })
      break
    }
    default: fail('unknown_query', q.intent)
  }
  return b.finish('query')
}

function buildNavigate(page, original, ctx, id, now) {
  const b = new Builder('NAVIGATE', id, original, ctx, now)
  b.typed('page', page)
  return b.finish('navigate')
}

function clarifyResult(reason, original, choices, now, notes = []) {
  const clarification = createClarification({ reason, source: original, choices }, now)
  return deepFreeze({ kind: 'clarify', clarification, asks: [], notes })
}

const TRANSACTION = deepFreeze({ kind: 'transaction' })

/**
 * Say what a typed sentence is.
 *
 * @param {string} text the typed sentence
 * @param {{id?: string, referenceDate?: Date, goals?: {id,name}[], categories?: {id,name}[], learningItems?: {id,name}[], accounts?: {id,name}[]}} [context]
 * @param {number} now milliseconds; never read from a clock here
 */
export function interpret(text, context, now) {
  if (typeof text !== 'string') fail('text_required', 'interpret needs the typed text')
  if (typeof now !== 'number' || !Number.isFinite(now)) fail('now_required', 'A numeric `now` (milliseconds) must be passed in; this module never reads the clock.')
  const ctx = readContext(context)
  if (ctx.referenceDate !== undefined && (!(ctx.referenceDate instanceof Date) || Number.isNaN(ctx.referenceDate.getTime()))) fail('invalid_context', 'referenceDate must be a valid Date')
  const original = text.trim()
  const { s, hadQ } = prepare(text)
  if (!s) return TRANSACTION

  // 2. a bare word
  const bare = detectBare(s, ctx)
  if (bare) {
    const choices = bare.domain ? DOMAIN_CHOICES[bare.domain] : entityChoices(bare.entities, original)
    return clarifyResult('bare_word', original, choices, now)
  }

  // 3. mixed input
  if (isMixed(s)) {
    return clarifyResult('mixed_input', original, [{ id: 'edit', label: 'Edit my message' }], now, ['Please do one thing at a time: a command, a question, or an entry.'])
  }

  // 4. a question
  const q = detectQuery(s, hadQ)
  if (q) return buildQuery(q, s, original, ctx, ctx.id, now)

  // 5. open a page
  const nav = detectNavigate(s)
  if (nav) {
    if (nav.excluded) {
      return clarifyResult('missing_required', original, ['transactions', 'goals', 'budgets', 'learning'].map((p) => ({ id: `open_${p}`, label: `Open ${PAGE_LABEL[p]}`, intent: 'NAVIGATE' })), now, ['That page cannot be opened from here.'])
    }
    return buildNavigate(nav.page, original, ctx, ctx.id, now)
  }

  // 6. a command (an owned noun is required)
  const cmd = detectCommand(s)
  if (cmd) {
    if (cmd.intent === 'UNSUPPORTED') {
      const choices = [{ id: `open_${cmd.page}`, label: `Open ${PAGE_LABEL[cmd.page]}`, intent: 'NAVIGATE' }]
      if (readAmount(s).status !== 'none') {
        choices.push({ id: 'record_expense', label: 'Record it as an expense', intent: 'RECORD_TRANSACTION' })
        return clarifyResult('competing_meaning', original, choices, now, ['That cannot be done from here yet.'])
      }
      return clarifyResult('missing_required', original, choices, now, ['That cannot be done from here yet.'])
    }
    const hasAmount = readAmount(s).status !== 'none'
    if (cmd.intent === 'CREATE_BUDGET_MONTH' && hasAmount) {
      return clarifyResult('competing_meaning', original, [
        { id: 'set_budget_amount', label: 'Set a budget amount', intent: 'MODIFY_BUDGET_AMOUNT' },
        { id: 'create_budget', label: 'Create a monthly budget', intent: 'CREATE_BUDGET_MONTH' },
      ], now)
    }
    return buildCommand(cmd, s, original, ctx, ctx.id, now)
  }

  // 7. "I need 50000 for a laptop": a wish, not a record
  if (/^(?:i\s+)?(?:need|want|require)\b/i.test(s) && /\bfor\b/i.test(s) && !OWNED_NOUN.test(s) && readAmount(s).status === 'found') {
    return clarifyResult('competing_meaning', original, [
      { id: 'record_expense', label: 'Record it as an expense', intent: 'RECORD_TRANSACTION' },
      { id: 'create_goal', label: 'Create a goal for it', intent: 'CREATE_GOAL' },
    ], now)
  }

  // 8. anything else is a transaction
  return TRANSACTION
}
