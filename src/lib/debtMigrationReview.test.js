// D7 - MIGRATION REVIEW, AS TEXT ONLY. Reads supabase/p16_debts.sql, supabase/p17_debt_payments.sql and the matching sections of
// supabase/schema.sql and checks the security and integrity properties the Debt module relies on. Nothing here runs SQL, opens a
// connection or reads the live project: it only reads the files in the repository. What this CANNOT show is that the files were
// applied as written; that stays a statement about the live project, which D7 was told not to access.
import assert from 'node:assert'
import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { join } from 'node:path'

let passed = 0, failed = 0
function test(name, fn) {
  try { fn(); passed++; console.log(`  PASS  ${name}`) } catch (err) { failed++; console.log(`  FAIL  ${name}\n${String(err.message).split('\n').map((l) => '        ' + l).join('\n')}`) }
}
const SUPA = fileURLToPath(new URL('../../supabase/', import.meta.url))
const read = (f) => readFileSync(join(SUPA, f), 'utf8').replace(/\r\n/g, '\n')
/** Only the lines that would actually run: comment lines removed (the rollback block is commented out). */
export const executable = (sql) => sql.split('\n').filter((l) => !/^\s*--/.test(l)).map((l) => l.replace(/\s--.*$/, '')).join('\n')
const p16 = executable(read('p16_debts.sql')), p17 = executable(read('p17_debt_payments.sql'))
const schemaAll = read('schema.sql')
const section = (start, end) => { const a = schemaAll.indexOf(start); assert.ok(a >= 0, `schema.sql has "${start}"`); const b = end ? schemaAll.indexOf(end, a + 10) : schemaAll.length; return executable(schemaAll.slice(a, b < 0 ? schemaAll.length : b)) }
const sDebts = section('-- D2: Debt module data model - debts', '-- D4a: Debt module data model - debt_payments')
const sPay = section('-- D4a: Debt module data model - debt_payments', null)
const names = (sql) => [...sql.matchAll(/constraint\s+((?:debts|debt_payments|transactions)_[a-z_]+)/g)].map((m) => m[1]).sort()
const squash = (s) => s.replace(/\s+/g, ' ')

test('M1: both debt tables are owned by a user who exists, and are removed with that user (account deletion cascades)', () => {
  for (const sql of [p16, p17, sDebts, sPay]) assert.match(squash(sql), /user_id uuid not null references auth\.users\(id\) on delete cascade/)
})
test('M2: row-level security is enabled on both tables and each has exactly ONE policy, for authenticated users, own rows only', () => {
  for (const [sql, t, policy] of [[p16, 'debts', 'own debts'], [p17, 'debt_payments', 'own debt payments']]) {
    assert.match(sql, new RegExp(`alter table ${t} enable row level security;`))
    assert.strictEqual((sql.match(/create policy/g) || []).length, 1)
    assert.match(squash(sql), new RegExp(`create policy "${policy}" on ${t} for all to authenticated using \\(auth\\.uid\\(\\) = user_id\\) with check \\(auth\\.uid\\(\\) = user_id\\);`))
  }
  for (const [sql, t] of [[sDebts, 'debts'], [sPay, 'debt_payments']]) {
    assert.match(sql, new RegExp(`alter table ${t} enable row level security;`))
    assert.match(squash(sql), /for all to authenticated using \(auth\.uid\(\) = user_id\) with check \(auth\.uid\(\) = user_id\)/)
  }
})
test('M3: nothing in the executable SQL weakens access: no grant, no anon/public role, no disabled RLS, no security definer, no drop', () => {
  for (const [name, sql] of [['p16', p16], ['p17', p17], ['schema debts', sDebts], ['schema payments', sPay]]) {
    assert.ok(!/\bgrant\b/i.test(sql), `${name}: no grant`)
    assert.ok(!/\bto\s+(anon|public)\b/i.test(sql), `${name}: not granted to anon or public`)
    assert.ok(!/disable row level security|force row level security/i.test(sql), `${name}: RLS stays as set`)
    assert.ok(!/security definer/i.test(sql), `${name}: no function runs with the owner's rights`)
    assert.ok(!/\bdrop\b/i.test(sql), `${name}: no drop in the part that runs`)
  }
})
test('M4: the rollback blocks are commented out, so running a file never deletes data', () => {
  for (const f of ['p16_debts.sql', 'p17_debt_payments.sql']) {
    const lines = read(f).split('\n')
    const drops = lines.filter((l) => /\bdrop (table|function)|alter table transactions drop/i.test(l))
    assert.ok(drops.length >= 1)
    for (const l of drops) assert.match(l, /^\s*--/, `${f}: "${l.trim()}" is commented out`)
  }
})
test('M5: debts keeps only opening figures with strict checks (whole paise, bounded, valid status/kind, interest-free means 0%)', () => {
  const s = squash(p16)
  assert.ok(!/\bcurrent_balance\b|\boutstanding_now\b/.test(s), 'no current-balance column')
  for (const frag of ["kind in ('term_loan', 'interest_free', 'credit_card')", "status in ('active', 'closed')", 'as_of_outstanding = round(as_of_outstanding, 2)', 'as_of_accrued_interest = round(as_of_accrued_interest, 2)', 'annual_rate_pct >= 0 and annual_rate_pct <= 100', "kind <> 'interest_free' or annual_rate_pct = 0", 'constraint debts_id_user_key unique (id, user_id)', 'monthly_payment > 0']) assert.ok(s.includes(frag), frag)
  assert.match(s, /create unique index debts_active_name_per_user on debts \(user_id, lower\(name\)\) where status = 'active'/)
})
test('M6: a payment link proves the debt and the transaction belong to the same user, is removed with either parent, and is unique per transaction', () => {
  const s = squash(p17)
  assert.ok(s.includes('foreign key (debt_id, user_id) references debts (id, user_id) on delete cascade'))
  assert.ok(s.includes('foreign key (transaction_id, user_id) references transactions (id, user_id) on delete cascade'))
  assert.ok(s.includes('constraint debt_payments_transaction_id_key unique (transaction_id)'))
  assert.ok(!/\bamount\b|\btransaction_date\b/.test(s.slice(s.indexOf('create table debt_payments'), s.indexOf('create index'))), 'a link stores no amount and no date')
})
test('M7: the only change to an existing table is one uniqueness rule on transactions; no other existing table is altered', () => {
  const all = squash(p17).match(/alter table \w+ [^;]*;/g) || []
  assert.deepStrictEqual(all.filter((a) => !/alter table debt_payments enable row level security;/.test(a)), ['alter table transactions add constraint transactions_id_user_key unique (id, user_id);'])
  assert.deepStrictEqual((squash(p16).match(/alter table \w+ [^;]*;/g) || []), ['alter table debts enable row level security;'])
})
test('M8: only an expense can be linked (trigger), it runs with the caller\'s rights and a fixed search path', () => {
  const s = squash(p17)
  assert.ok(s.includes("if found and t <> 'expense' then raise exception 'a debt payment must be an expense transaction' using errcode = '23514';"))
  assert.ok(s.includes('set search_path = public'))
  assert.ok(s.includes('create trigger debt_payments_expense_only before insert or update of transaction_id, user_id on debt_payments'))
  // documented limit: the trigger does not watch transactions, so a later edit to income keeps the link; the app shows it as "not counted"
  assert.match(read('p17_debt_payments.sql'), /It does NOT watch the transactions table/)
})
test('M9: the repeatable forms in schema.sql carry the same constraints, policy and trigger as the standalone migrations', () => {
  assert.deepStrictEqual(names(sDebts), names(p16))
  assert.deepStrictEqual(names(sPay).filter((n) => n.startsWith('debt_payments_')), names(p17).filter((n) => n.startsWith('debt_payments_')))
  assert.ok(squash(sDebts).includes('create policy "own debts" on debts'))
  assert.ok(squash(sPay).includes('create policy "own debt payments" on debt_payments'))
  assert.ok(squash(sPay).includes('create trigger debt_payments_expense_only'))
  assert.ok(squash(sPay).includes("if found and t <> 'expense' then"))
})
test('M10: the account-deletion function relies on cascading deletes from auth.users and never names a debt table', () => {
  const fn = readFileSync(join(SUPA, 'functions/delete-account/index.ts'), 'utf8')
  assert.match(fn, /Every user-owned table cascades/)
  assert.ok(!/debt/i.test(fn), 'the function itself needs no debt-specific code')
})
test('M11: the review helper itself works (comment lines and trailing comments are removed)', () => {
  assert.strictEqual(executable('-- drop table x;\nselect 1; -- note\n  -- indented\nselect 2;'), 'select 1;\nselect 2;')
})

console.log(`\n${passed} passed, ${failed} failed`)
if (failed > 0) process.exit(1)
