// P12 test stand-in for lib/supabaseClient.js: an in-memory database that lives inside the page.
// It is never connected to anything. It records every read and write so tests can count rows.
// window.__E2E = { db: 'kind', theme } is set by the test before the page loads.
const U = 'u1'
const row = (o) => ({ user_id: U, created_at: '2026-01-01T00:00:00Z', updated_at: '2026-01-01T00:00:00Z', ...o })
const cat = (id, name, kind) => ({ id, name, kind, user_id: null })
const bud = (id, category_id, amount, ym, last) => row({ id, category_id, amount, period_type: 'monthly', period_start: `${ym}-01`, period_end: `${ym}-${last}` })
const comp = (id, name, category, monthly_amount) => row({ id, structure_id: 's1', name, category, monthly_amount })
const rule = (rule_key, scheme, value) => row({ id: `r-${scheme}-${rule_key}`, scheme, rule_key, value, verification_status: 'verified', effective_from: '2020-01-01', effective_to: null })

function seed(kindList) {
  const kinds = String(kindList || 'base').split('+')
  const has = (k) => kinds.includes(k)
  const db = {
    profiles: [{ id: U, username: 'Tester', onboarding_complete: true, dark_mode: false, income_type: 'salaried' }],
    user_access: [row({ id: 'ua1', method: 'web' })],
    accounts: [row({ id: 'a1', name: 'SBI', type: 'bank', is_active: true, })],
    categories: [cat('c1', 'Food', 'expense'), cat('c2', 'Food delivery', 'expense'), cat('c3', 'Rent', 'expense'), cat('c5', 'Travel', 'expense'), cat('c6', 'Learning', 'expense'), cat('c4', 'Salary', 'income')],
    category_rules: [
      { keyword: 'rent', category_id: 'c3', priority: 1 }, { keyword: 'travel', category_id: 'c5', priority: 1 }, { keyword: 'fuel', category_id: 'c5', priority: 1 },
      { keyword: 'food', category_id: 'c1', priority: 1 }, { keyword: 'dinner', category_id: 'c1', priority: 1 }, { keyword: 'course', category_id: 'c6', priority: 1 }, { keyword: 'salary', category_id: 'c4', priority: 1 },
    ],
    budgets: [bud('b1', 'c3', 4500, '2026-10', '31'), bud('b2', 'c5', 1000, '2026-10', '31'), bud('b4', 'c2', 800, '2026-10', '31')],
    learning_items: [], goals: [], goal_contributions: [],
    transactions: [
      row({ id: 't1', type: 'income', amount: 100000, account_id: 'a1', to_account_id: null, category_id: 'c4', transaction_date: '2026-09-01', description: 't1', original_input: 't1' }),
      row({ id: 't2', type: 'expense', amount: 5000, account_id: 'a1', to_account_id: null, category_id: 'c1', transaction_date: '2026-10-01', description: 't2', original_input: 't2' }),
      row({ id: 't4', type: 'expense', amount: 4000, account_id: 'a1', to_account_id: null, category_id: 'c3', transaction_date: '2026-09-02', description: 't4', original_input: 't4' }),
    ],
    salary_structures: [], salary_components: [], financial_rules: [],
  }
  if (has('sal')) {
    db.salary_structures.push(row({ id: 's1', label: 'FY26 CTC', is_active: true }))
    db.salary_components.push(comp('k1', 'Basic', 'basic', 30000), comp('k2', 'HRA', 'allowance', 25000), comp('k3', 'PF', 'employee_deduction', 3000), comp('k4', 'Bonus', 'allowance', null))
    db.financial_rules.push(rule('employee_contribution_rate', 'epf', 12), rule('employer_contribution_rate', 'epf', 3.67), rule('employer_contribution_rate', 'eps', 8.33))
  }
  if (has('learn')) {
    db.learning_items.push(
      row({ id: 'l1', name: 'Power BI', cost: 8000, relevance_tag: null, target_date: null, progress_pct: 40, status: 'in_progress' }),
      row({ id: 'l2', name: 'SQL course', cost: 0, relevance_tag: null, target_date: null, progress_pct: 0, status: 'planned' }),
    )
  }
  if (has('goal2')) {
    db.goals.push(row({ id: 'g1', name: 'Laptop', target_amount: 50000, target_date: '2026-12-31', status: 'active' }), row({ id: 'g2', name: 'Laptop bag', target_amount: 3000, target_date: null, status: 'active' }))
    db.goal_contributions.push(row({ id: 'k1', goal_id: 'g1', account_id: 'a1', amount: 3000, type: 'contribution', contribution_date: '2026-10-02' }), row({ id: 'k2', goal_id: 'g2', account_id: 'a1', amount: 500, type: 'contribution', contribution_date: '2026-10-02' }))
  }
  if (has('goal')) {
    db.goals.push(row({ id: 'g1', name: 'Laptop', target_amount: 50000, target_date: '2026-12-31', status: 'active' }))
    db.goal_contributions.push(row({ id: 'k1', goal_id: 'g1', account_id: 'a1', amount: 3000, type: 'contribution', contribution_date: '2026-10-02' }))
  }
  return db
}

const state = { writes: [], reads: [], requests: [], failRead: null, failWrite: null, latency: globalThis.__E2E?.latency ?? 150 }
let DB = seed(globalThis.__E2E?.db || 'base')
let seq = 100
globalThis.__mock = state
globalThis.__e2e = {
  counts: () => Object.fromEntries(Object.entries(DB).map(([k, v]) => [k, v.length])),
  rows: (t) => JSON.parse(JSON.stringify(DB[t] || [])),
  reset: (kind) => { DB = seed(kind); state.writes.length = 0; state.reads.length = 0 },
}

const cmp = {
  eq: (a, b) => a === b, neq: (a, b) => a !== b, gt: (a, b) => a > b, gte: (a, b) => a >= b, lt: (a, b) => a < b, lte: (a, b) => a <= b,
}

function builder(table) {
  const filters = []
  let order = null, lim = null
  let cols = '*', mode = 'select', payload = null, single = false, wantRows = false
  const api = {
    select(c) { if (mode === 'select') cols = c || '*'; else wantRows = true; return api },
    insert(x) { mode = 'insert'; payload = x; return api },
    update(x) { mode = 'update'; payload = x; return api },
    upsert(x) { mode = 'upsert'; payload = x; return api },
    delete() { mode = 'delete'; return api },
    maybeSingle() { single = true; return api },
    single() { single = true; return api },
    in(c, vs) { filters.push((r) => vs.includes(r[c])); return api },
    is(c, v) { filters.push((r) => (v === null ? r[c] == null : r[c] === v)); return api },
    like() { return api }, ilike() { return api }, or() { return api }, not() { return api }, match() { return api }, contains() { return api },
    order(c, o) { order = { c, asc: !(o && o.ascending === false) }; return api },
    limit(n) { lim = n; return api }, range() { return api },
    then(resolve, reject) { exec().then(resolve, reject) },
  }
  for (const [name, fn] of Object.entries(cmp)) api[name] = (c, v) => { filters.push((r) => fn(r[c], v)); return api }
  async function exec() {
    DB[table] = DB[table] || []
    if (mode === 'select') {
      state.reads.push({ table, cols })
      if (state.failRead === table) return { data: null, error: { message: 'stand-in read failure', code: 'X' } }
      let rows = DB[table].filter((r) => filters.every((f) => f(r)))
      if (order) rows = [...rows].sort((a, b) => (a[order.c] > b[order.c] ? 1 : a[order.c] < b[order.c] ? -1 : 0) * (order.asc ? 1 : -1))
      if (lim != null) rows = rows.slice(0, lim)
      if (cols !== '*') { const names = cols.split(',').map((s) => s.trim().split(/[\s(]/)[0]); rows = rows.map((r) => Object.fromEntries(names.map((n) => [n, r[n]]))) }
      return { data: single ? (rows[0] || null) : rows, error: null }
    }
    if (state.failWrite === table) return { data: null, error: { message: 'stand-in write failure', code: 'X' } }
    // A real save takes a moment. Without this a double click could never land while a save is still running.
    // The write is recorded and applied together, when the "save" completes.
    await new Promise((r) => setTimeout(r, state.latency))
    state.writes.push({ table, op: mode, x: JSON.parse(JSON.stringify(payload ?? null)) })
    let out = []
    if (mode === 'insert' || mode === 'upsert') {
      if (table === 'budgets') {
        const clash = (Array.isArray(payload) ? payload : [payload]).some((c) => DB.budgets.some((r) => r.category_id === c.category_id && r.period_start === c.period_start))
        if (clash) return { data: null, error: { message: 'duplicate', code: '23505' } }
      }
      out = (Array.isArray(payload) ? payload : [payload]).map((p) => ({ id: `n${++seq}`, created_at: '2026-10-15T00:00:00Z', updated_at: '2026-10-15T00:00:00Z', ...p }))
      DB[table].push(...out)
    } else if (mode === 'update') {
      out = DB[table].filter((r) => filters.every((f) => f(r))); out.forEach((r) => Object.assign(r, payload))
    } else if (mode === 'delete') {
      out = DB[table].filter((r) => filters.every((f) => f(r))); DB[table] = DB[table].filter((r) => !filters.every((f) => f(r)))
    }
    return { data: wantRows || single ? (single ? out[0] || null : out) : null, error: null }
  }
  return api
}

const noop = async () => ({ data: null, error: null })
export const supabase = {
  from: builder,
  rpc: noop,
  functions: { invoke: async () => ({ data: null, error: { message: 'not available in tests' } }) },
  auth: {
    getSession: async () => ({ data: { session: null }, error: null }),
    onAuthStateChange: () => ({ data: { subscription: { unsubscribe() {} } } }),
    signOut: noop, signInWithPassword: noop, signUp: noop, updateUser: noop, resetPasswordForEmail: noop, verifyOtp: noop, signInWithOAuth: noop,
  },
}
