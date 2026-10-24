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
      { id: 'r1', keyword: 'rent', category_id: 'c3', priority: 1 }, { id: 'r2', keyword: 'travel', category_id: 'c5', priority: 1 }, { id: 'r3', keyword: 'fuel', category_id: 'c5', priority: 1 },
      { id: 'r4', keyword: 'food', category_id: 'c1', priority: 1 }, { id: 'r5', keyword: 'dinner', category_id: 'c1', priority: 1 }, { id: 'r6', keyword: 'course', category_id: 'c6', priority: 1 }, { id: 'r7', keyword: 'salary', category_id: 'c4', priority: 1 },
    ],
    budgets: [bud('b1', 'c3', 4500, '2026-10', '31'), bud('b2', 'c5', 1000, '2026-10', '31'), bud('b4', 'c2', 800, '2026-10', '31')],
    learning_items: [], goals: [], goal_contributions: [], debts: [], debt_payments: [],
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
  // D3: the debts table. 'debt' = one active loan and one closed debt; 'debt20' = twenty active debts (the UI limit).
  const debt = (o) => row({ kind: 'term_loan', lender: null, as_of_date: '2026-10-01', as_of_outstanding: 100000, as_of_accrued_interest: 0, annual_rate_pct: 10, monthly_payment: null, remaining_months: null, due_day: null, status: 'active', ...o })
  if (has('debt') || has('debtpay') || has('debtlinked') || has('debtmany') || has('debtbig')) {
    db.debts.push(
      debt({ id: 'd1', name: 'Education loan', lender: 'SBI', as_of_outstanding: 250000, annual_rate_pct: 9.5, monthly_payment: 5000, remaining_months: 60, due_day: 5 }),
      debt({ id: 'd2', name: 'Old phone EMI', kind: 'interest_free', as_of_outstanding: 0, annual_rate_pct: 0, status: 'closed' }),
    )
  }
  // D4b: payments. 'debtpay' = the 'debt' seed + a second loan (Bike loan, figures from 1 Aug 2026) + a spread of
  // transactions to pick from; 'debtlinked' = 'debtpay' with two EMI expenses already linked to the Bike loan;
  // 'debtmany' = 'debtpay' + 230 more expenses (the picker shows the 200 newest). The fixed "today" is 15 Oct 2026.
  if (has('debtpay') || has('debtlinked') || has('debtmany') || has('debtbig')) {
    db.accounts.push(row({ id: 'a2', name: 'HDFC', type: 'bank', is_active: true }))
    db.categories.push(cat('c7', 'EMI/Loan', 'expense'))
    db.debts.push(debt({ id: 'd3', name: 'Bike loan', lender: 'HDFC', as_of_date: '2026-08-01', as_of_outstanding: 60000, annual_rate_pct: 12, monthly_payment: 3000, remaining_months: 24, due_day: 10 }))
    const tx = (id, type, amount, date, description, category_id, to_account_id = null) => row({ id, type, amount, account_id: 'a1', to_account_id, category_id, transaction_date: date, description, original_input: description })
    db.transactions.push(
      tx('p1', 'expense', 5000, '2026-09-05', 'Bike loan EMI Sep', 'c7'),
      tx('p2', 'expense', 5000, '2026-10-05', 'Bike loan EMI Oct', 'c7'),
      tx('p3', 'expense', 1200, '2026-10-08', 'Groceries', 'c1'),
      tx('p4', 'expense', 700, '2026-10-12', 'Taxi', 'c5'),
      tx('p5', 'income', 3000, '2026-10-09', 'Refund', 'c4'),
      tx('p6', 'transfer', 2000, '2026-10-11', 'Move to HDFC', null, 'a2'),
      tx('p7', 'expense', 800, '2026-08-01', 'Same day as the figures', 'c1'),
      tx('p8', 'expense', 900, '2026-10-20', 'Future dated', 'c1'),
      tx('p9', 'expense', 600, '2026-07-20', 'Before the figures', 'c1'),
      tx('p10', 'expense', 70000, '2026-10-14', 'Lump sum', 'c1'),
    )
  }
  if (has('debtlinked')) {
    db.debt_payments.push(row({ id: 'lk1', debt_id: 'd3', transaction_id: 'p1' }), row({ id: 'lk2', debt_id: 'd3', transaction_id: 'p2' }))
  }
  // D5: the planner. 'debtplan' (used together with 'debtlinked') adds a credit card with a big balance and a debt with no
  // monthly payment, so the planner has a mix: Education loan, Bike loan (figures from its two linked payments), Card
  // (estimate), and two debts left out (Old phone EMI is closed, Friend loan has no payment figure).
  if (has('debtplan')) {
    db.debts.push(
      debt({ id: 'd4', name: 'Card', kind: 'credit_card', as_of_outstanding: 80000, annual_rate_pct: 36, monthly_payment: 3000 }),
      debt({ id: 'd5', name: 'Friend loan', kind: 'interest_free', as_of_outstanding: 10000, annual_rate_pct: 0, monthly_payment: null }),
    )
  }
  if (has('debtmany') || has('debtbig')) {
    for (let i = 1; i <= 230; i++) db.transactions.push(row({ id: `bm${String(i).padStart(3, '0')}`, type: 'expense', amount: 100 + i, account_id: 'a1', to_account_id: null, category_id: 'c1', transaction_date: `2026-09-${String(1 + (i % 28)).padStart(2, '0')}`, description: `Bulk ${i}`, original_input: `Bulk ${i}` }))
  }
  // 'debtbig' = 'debtmany' with 130 of the bulk expenses already linked to the Bike loan (reads must be paged in 100s).
  if (has('debtbig')) for (let i = 1; i <= 130; i++) db.debt_payments.push(row({ id: `bl${i}`, debt_id: 'd3', transaction_id: `bm${String(i).padStart(3, '0')}` }))
  if (has('debt20')) for (let i = 1; i <= 20; i++) db.debts.push(debt({ id: `m${i}`, name: `Debt ${i}`, as_of_outstanding: 1000 * i }))
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
  // Test-only: what the user does on the Transactions page (edit / delete a transaction), and the database's cascade.
  // These are not app writes, so they are not recorded in __mock.writes.
  add: (table, r) => { (DB[table] = DB[table] || []).push(row(r)) },
  mutate: (table, id, patch) => { const r = (DB[table] || []).find((x) => x.id === id); if (r) Object.assign(r, patch) },
  remove: (table, id) => {
    DB[table] = (DB[table] || []).filter((x) => x.id !== id)
    if (table === 'transactions') DB.debt_payments = DB.debt_payments.filter((l) => l.transaction_id !== id)
    if (table === 'debts') DB.debt_payments = DB.debt_payments.filter((l) => l.debt_id !== id)
  },
}

const cmp = {
  eq: (a, b) => a === b, neq: (a, b) => a !== b, gt: (a, b) => a > b, gte: (a, b) => a >= b, lt: (a, b) => a < b, lte: (a, b) => a <= b,
}

function builder(table) {
  const filters = []
  const orders = []
  let lim = null, rng = null
  const inSizes = []
  let cols = '*', mode = 'select', payload = null, single = false, wantRows = false
  const api = {
    select(c) { if (mode === 'select') cols = c || '*'; else wantRows = true; return api },
    insert(x) { mode = 'insert'; payload = x; return api },
    update(x) { mode = 'update'; payload = x; return api },
    upsert(x) { mode = 'upsert'; payload = x; return api },
    delete() { mode = 'delete'; return api },
    maybeSingle() { single = true; return api },
    single() { single = true; return api },
    in(c, vs) { inSizes.push(vs.length); filters.push((r) => vs.includes(r[c])); return api },
    is(c, v) { filters.push((r) => (v === null ? r[c] == null : r[c] === v)); return api },
    like() { return api }, ilike() { return api }, or() { return api }, not() { return api }, match() { return api }, contains() { return api },
    order(c, o) { orders.push({ c, asc: !(o && o.ascending === false) }); return api },
    limit(n) { lim = n; return api }, range(a, b) { rng = [a, b]; return api },
    then(resolve, reject) { exec().then(resolve, reject) },
  }
  for (const [name, fn] of Object.entries(cmp)) api[name] = (c, v) => { filters.push((r) => fn(r[c], v)); return api }
  async function exec() {
    DB[table] = DB[table] || []
    if (mode === 'select') {
      state.reads.push({ table, cols, range: rng, inSizes: inSizes.slice() })
      if (state.failRead === table) return { data: null, error: { message: 'stand-in read failure', code: 'X' } }
      let rows = DB[table].filter((r) => filters.every((f) => f(r)))
      if (orders.length) rows = [...rows].sort((a, b) => { for (const o of orders) { const d = (a[o.c] > b[o.c] ? 1 : a[o.c] < b[o.c] ? -1 : 0) * (o.asc ? 1 : -1); if (d) return d } return 0 })
      if (rng) rows = rows.slice(rng[0], rng[1] + 1)
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
      // The real database refuses a second ACTIVE goal / open learning item with the same name (P15 unique indexes).
      const dupName = (Array.isArray(payload) ? payload : [payload]).find((c) =>
        (table === 'goals' && c.status === 'active' && DB.goals.some((r) => r.status === 'active' && String(r.name).toLowerCase() === String(c.name).toLowerCase())) ||
        (table === 'learning_items' && c.status !== 'completed' && DB.learning_items.some((r) => r.status !== 'completed' && String(r.name).toLowerCase() === String(c.name).toLowerCase())))
      if (dupName) return { data: null, error: { message: `duplicate key value violates unique constraint "${table === 'goals' ? 'goals_active_name_per_user' : 'learning_open_name_per_user'}"`, code: '23505' } }
      // D3: the same refusal for a second ACTIVE debt with the same name (debts_active_name_per_user, supabase/p16_debts.sql).
      if ((Array.isArray(payload) ? payload : [payload]).some((c) => table === 'debts' && c.status === 'active' && DB.debts.some((r) => r.status === 'active' && String(r.name).toLowerCase() === String(c.name).toLowerCase()))) {
        return { data: null, error: { message: 'duplicate key value violates unique constraint "debts_active_name_per_user"', code: '23505' } }
      }
      // D4b: the rules of debt_payments (supabase/p17_debt_payments.sql). The whole statement saves, or none of it.
      if (table === 'debt_payments') {
        const batch = Array.isArray(payload) ? payload : [payload]
        const seen = new Set()
        for (const c of batch) {
          const tx = DB.transactions.find((r) => r.id === c.transaction_id && r.user_id === c.user_id)
          const debt = DB.debts.find((r) => r.id === c.debt_id && r.user_id === c.user_id)
          if (!tx || !debt) return { data: null, error: { message: 'insert or update on table "debt_payments" violates foreign key constraint', code: '23503' } }
          if (tx.type !== 'expense') return { data: null, error: { message: 'a debt payment must be an expense transaction', code: '23514' } }
          if (seen.has(c.transaction_id) || DB.debt_payments.some((r) => r.transaction_id === c.transaction_id)) {
            return { data: null, error: { message: 'duplicate key value violates unique constraint "debt_payments_transaction_id_key"', code: '23505' } }
          }
          seen.add(c.transaction_id)
        }
      }
      out = (Array.isArray(payload) ? payload : [payload]).map((p) => ({ id: `n${++seq}`, created_at: '2026-10-15T00:00:00Z', updated_at: '2026-10-15T00:00:00Z', ...p }))
      DB[table].push(...out)
    } else if (mode === 'update') {
      out = DB[table].filter((r) => filters.every((f) => f(r)))
      // D3: an update may not leave two ACTIVE debts with the same name (renaming one, or reopening a closed one).
      if (table === 'debts' && out.some((r) => { const n = { ...r, ...payload }; return n.status === 'active' && DB.debts.some((o) => o !== r && o.status === 'active' && String(o.name).toLowerCase() === String(n.name).toLowerCase()) })) {
        return { data: null, error: { message: 'duplicate key value violates unique constraint "debts_active_name_per_user"', code: '23505' } }
      }
      out.forEach((r) => Object.assign(r, payload))
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
