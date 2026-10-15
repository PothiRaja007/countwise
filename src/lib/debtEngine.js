// D1 - debt calculations. Pure: no network, no database, no clock, no randomness.
// "Today" is always a parameter ('YYYY-MM-DD'). Nothing here imports another file.
//
// Money rules
//   - All arithmetic is done in INTEGER PAISE. Inputs and outputs are rupee numbers (at most 2 decimals).
//   - One rounding rule, half away from zero on positive values, once per month:
//       interest = round(principalPaise * annualRatePct / 1200)
//   - Dates are 'YYYY-MM-DD' strings, validated as real calendar dates. Months are read from the string.
//
// Every figure returned by buildSchedule, replayDebt and planDebts is a CALCULATED scenario from the stated
// inputs and the stated model (basis: 'calculated'). Nothing here can describe a figure as confirmed by a
// third party. A supplied payment figure is only an input.
//
// Bad input never throws and never returns NaN or Infinity: it returns { ok: false, reason }.

const MAX_MONTHS = 600

// ---------- small helpers ----------

const isNum = (x) => typeof x === 'number' && Number.isFinite(x)
const isPosInt = (x) => Number.isInteger(x) && x >= 1
const toPaise = (rupees) => Math.round(rupees * 100)
const fromPaise = (paise) => paise / 100
const fail = (reason, extra) => ({ ok: false, reason, ...(extra || {}) })

// interest on a paise balance for one month. Integer path when the rate has at most 2 decimals (exact);
// otherwise a plain float path.
function interestPaise(balancePaise, annualRatePct) {
  if (balancePaise <= 0 || annualRatePct <= 0) return 0
  const bp = annualRatePct * 100
  const bpInt = Math.round(bp)
  if (Math.abs(bp - bpInt) < 1e-9) return Math.floor((balancePaise * bpInt + 60000) / 120000)
  return Math.round((balancePaise * annualRatePct) / 1200)
}

const validRate = (r) => isNum(r) && r >= 0 && r <= 100

// 'YYYY-MM-DD' -> { y, m, d } or null (real calendar dates only)
function parseISO(s) {
  if (typeof s !== 'string') return null
  const g = /^(\d{4})-(\d{2})-(\d{2})$/.exec(s)
  if (!g) return null
  const y = Number(g[1])
  const m = Number(g[2])
  const d = Number(g[3])
  if (m < 1 || m > 12 || d < 1 || d > daysInMonth(y, m)) return null
  return { y, m, d }
}
function daysInMonth(y, m) {
  if (m === 2) return (y % 4 === 0 && y % 100 !== 0) || y % 400 === 0 ? 29 : 28
  return [4, 6, 9, 11].includes(m) ? 30 : 31
}
const monthIndex = (p) => p.y * 12 + (p.m - 1)
function monthLabel(idx) {
  const y = Math.floor(idx / 12)
  const m = (idx % 12) + 1
  return `${String(y).padStart(4, '0')}-${String(m).padStart(2, '0')}`
}
const pad2 = (n) => String(n).padStart(2, '0')

// ---------- EMI ----------

export function computeEmi({ principal, annualRatePct, months } = {}) {
  if (!isNum(principal) || principal <= 0 || !isPosInt(months) || !validRate(annualRatePct)) return fail('invalid-input')
  const P = toPaise(principal)
  if (annualRatePct === 0) return { ok: true, emi: fromPaise(Math.round(P / months)) }
  const r = annualRatePct / 1200
  const f = Math.pow(1 + r, months)
  const emi = Math.round((P * r * f) / (f - 1))
  if (!Number.isFinite(emi)) return fail('invalid-input')
  return { ok: true, emi: fromPaise(emi) }
}

// ---------- schedule ----------

export function buildSchedule({ principal, annualRatePct, payment, termMonths, maxMonths = MAX_MONTHS } = {}) {
  if (!isNum(principal) || principal <= 0 || !validRate(annualRatePct) || !isNum(payment) || payment <= 0) return fail('invalid-input')
  if (!Number.isInteger(maxMonths) || maxMonths < 1 || maxMonths > MAX_MONTHS) return fail('invalid-input')
  if (termMonths !== undefined && (!isPosInt(termMonths) || termMonths > maxMonths)) return fail('invalid-input')

  const P = toPaise(principal)
  const pay = toPaise(payment)
  const base = { ok: true, basis: 'calculated', regularPayment: fromPaise(pay) }

  if (pay <= interestPaise(P, annualRatePct)) {
    return {
      ...base, paysOff: false, endedBy: null, months: 0, totalInterest: 0, totalPaid: 0,
      finalPayment: 0, finalPaymentDifference: 0, remainingBalance: fromPaise(P), rows: [], reason: 'payment-not-above-interest',
    }
  }

  const rows = []
  let bal = P
  let totalInterest = 0
  let totalPaid = 0
  let endedBy = null
  let finalPaid = 0
  for (let n = 1; n <= maxMonths; n++) {
    const i = interestPaise(bal, annualRatePct)
    const due = bal + i
    let x = pay
    let adjusted = false
    if (due <= pay) {
      x = due
      endedBy = 'cleared-naturally'
    } else if (termMonths !== undefined && n === termMonths) {
      x = due
      adjusted = true
      endedBy = 'term-adjusted'
    }
    bal = due - x
    totalInterest += i
    totalPaid += x
    finalPaid = x
    rows.push({ n, interest: fromPaise(i), payment: fromPaise(x), principal: fromPaise(x - i), balance: fromPaise(bal), adjusted })
    if (bal === 0) break
  }
  const paysOff = bal === 0
  if (!paysOff) endedBy = 'max-months'
  return {
    ...base,
    paysOff,
    endedBy,
    months: rows.length,
    totalInterest: fromPaise(totalInterest),
    totalPaid: fromPaise(totalPaid),
    finalPayment: fromPaise(finalPaid),
    finalPaymentDifference: fromPaise(finalPaid - pay),
    remainingBalance: fromPaise(bal),
    rows,
    ...(paysOff ? {} : { reason: 'exceeds-max-months' }),
  }
}

// The rounded schedule is the only source of truth for payoff time.
export function payoffMonths({ principal, annualRatePct, payment } = {}) {
  const s = buildSchedule({ principal, annualRatePct, payment })
  if (!s.ok) return fail(s.reason)
  return { ok: true, paysOff: s.paysOff, months: s.paysOff ? s.months : null, ...(s.reason ? { reason: s.reason } : {}) }
}

// ---------- implied rate ----------

export function impliedAnnualRate({ principal, payment, months } = {}) {
  if (!isNum(principal) || principal <= 0 || !isNum(payment) || payment <= 0 || !isPosInt(months)) return fail('invalid-input')
  const lo = computeEmi({ principal, annualRatePct: 0, months })
  const hi = computeEmi({ principal, annualRatePct: 100, months })
  if (!lo.ok || !hi.ok) return fail('invalid-input')
  const pay = toPaise(payment)
  if (pay < toPaise(lo.emi) || pay > toPaise(hi.emi)) return fail('no-solution')
  if (pay === toPaise(lo.emi)) return { ok: true, annualRatePct: 0 }
  if (pay === toPaise(hi.emi)) return { ok: true, annualRatePct: 100 }

  const P = toPaise(principal)
  const unrounded = (rate) => {
    if (rate === 0) return P / months
    const r = rate / 1200
    const f = Math.pow(1 + r, months)
    return (P * r * f) / (f - 1)
  }
  if (unrounded(0) >= pay) return { ok: true, annualRatePct: 0 }
  if (unrounded(100) <= pay) return { ok: true, annualRatePct: 100 }
  let a = 0
  let b = 100
  for (let step = 0; step < 200 && b - a >= 1e-7; step++) {
    const mid = (a + b) / 2
    if (unrounded(mid) < pay) a = mid
    else b = mid
  }
  return { ok: true, annualRatePct: (a + b) / 2 }
}

// ---------- replay of recorded payments ----------

export function replayDebt({ asOfDate, asOfOutstanding, asOfAccruedInterest = 0, annualRatePct, payments, today } = {}) {
  const asOf = parseISO(asOfDate)
  const now = parseISO(today)
  if (!asOf || !now) return fail('invalid-input')
  if (!isNum(asOfOutstanding) || asOfOutstanding < 0 || !isNum(asOfAccruedInterest) || asOfAccruedInterest < 0) return fail('invalid-input')
  if (!validRate(annualRatePct) || !Array.isArray(payments)) return fail('invalid-input')
  for (const p of payments) {
    if (!p || typeof p !== 'object' || !parseISO(p.date) || !isNum(p.amount) || p.amount <= 0) return fail('invalid-input')
  }
  if (today < asOfDate) return fail('today-before-as-of')

  const asOfIdx = monthIndex(asOf)
  const nowIdx = monthIndex(now)
  const buckets = nowIdx - asOfIdx // buckets 1..buckets

  const paidIn = new Map()
  for (const p of payments) {
    if (p.date <= asOfDate || p.date > today) continue
    const idx = monthIndex(parseISO(p.date))
    const k = Math.max(1, idx - asOfIdx)
    if (k > buckets) continue
    paidIn.set(k, (paidIn.get(k) || 0) + toPaise(p.amount))
  }

  let principal = toPaise(asOfOutstanding)
  let accrued = toPaise(asOfAccruedInterest)
  let interestAccrued = 0
  let interestPaid = 0
  let principalRepaid = 0
  let overpaid = 0
  let overdueMonths = 0
  let belowInterestMonths = 0
  const months = []
  for (let k = 1; k <= buckets; k++) {
    const i = interestPaise(principal, annualRatePct)
    accrued += i
    interestAccrued += i
    const pay = paidIn.get(k) || 0
    const owedBefore = principal + accrued
    const toInterest = Math.min(pay, accrued)
    const toPrincipal = Math.min(pay - toInterest, principal)
    const over = pay - toInterest - toPrincipal
    accrued -= toInterest
    principal -= toPrincipal
    interestPaid += toInterest
    principalRepaid += toPrincipal
    overpaid += over
    const overdue = pay === 0 && owedBefore > 0 && asOfIdx + k < nowIdx
    if (overdue) overdueMonths++
    if (pay > 0 && accrued > 0) belowInterestMonths++
    months.push({
      month: monthLabel(asOfIdx + k),
      interest: fromPaise(i),
      paid: fromPaise(pay),
      interestPaid: fromPaise(toInterest),
      principalPaid: fromPaise(toPrincipal),
      principalAfter: fromPaise(principal),
      accruedAfter: fromPaise(accrued),
      overdue,
    })
  }
  return {
    ok: true,
    basis: 'calculated',
    outstandingPrincipal: fromPaise(principal),
    accruedInterest: fromPaise(accrued),
    totalOwed: fromPaise(principal + accrued),
    interestAccrued: fromPaise(interestAccrued),
    interestPaid: fromPaise(interestPaid),
    principalRepaid: fromPaise(principalRepaid),
    paymentsApplied: fromPaise(interestPaid + principalRepaid),
    overpaid: fromPaise(overpaid),
    months,
    overdueMonths,
    belowInterestMonths,
  }
}

// ---------- next due date ----------

export function nextDueDate({ dueDay, today } = {}) {
  const t = parseISO(today)
  if (!t || !Number.isInteger(dueDay) || dueDay < 1 || dueDay > 31) return fail('invalid-input')
  const thisDue = Math.min(dueDay, daysInMonth(t.y, t.m))
  if (t.d <= thisDue) return { ok: true, date: `${String(t.y).padStart(4, '0')}-${pad2(t.m)}-${pad2(thisDue)}` }
  const idx = monthIndex(t) + 1
  const y = Math.floor(idx / 12)
  const m = (idx % 12) + 1
  return { ok: true, date: `${String(y).padStart(4, '0')}-${pad2(m)}-${pad2(Math.min(dueDay, daysInMonth(y, m)))}` }
}

// ---------- planner ----------

const STRATEGIES = ['avalanche', 'snowball', 'none']

export function planDebts({ debts, monthlyBudget, strategy, lumpSum, maxMonths = MAX_MONTHS } = {}) {
  if (!Array.isArray(debts) || !isNum(monthlyBudget) || !STRATEGIES.includes(strategy)) return fail('invalid-input')
  if (!Number.isInteger(maxMonths) || maxMonths < 1 || maxMonths > MAX_MONTHS) return fail('invalid-input')
  for (const d of debts) {
    if (!d || typeof d !== 'object' || d.id === undefined || d.id === null || d.id === '' || typeof d.name !== 'string' || d.name === '') return fail('invalid-input')
    if (!isNum(d.balance) || d.balance < 0 || !validRate(d.annualRatePct) || !isNum(d.minPayment) || d.minPayment <= 0) return fail('invalid-input')
  }
  if (lumpSum !== undefined && lumpSum !== null) {
    if (typeof lumpSum !== 'object' || !isPosInt(lumpSum.month) || !isNum(lumpSum.amount) || lumpSum.amount <= 0) return fail('invalid-input')
  }
  const live = debts.filter((d) => toPaise(d.balance) > 0)
  if (live.length === 0) return fail('no-debts')

  const state = live.map((d) => ({
    id: d.id,
    name: d.name,
    rate: d.annualRatePct,
    minP: toPaise(d.minPayment),
    startP: toPaise(d.balance),
    bal: toPaise(d.balance),
    interest: 0,
    payoffMonth: null,
  }))
  for (const s of state) {
    if (s.minP <= interestPaise(s.bal, s.rate)) return fail('minimum-below-interest', { debtId: s.id })
  }
  const budgetP = toPaise(monthlyBudget)
  if (strategy !== 'none') {
    const sumMin = state.reduce((a, s) => a + s.minP, 0)
    if (sumMin > budgetP) return fail('budget-below-minimums', { shortfall: fromPaise(sumMin - budgetP) })
  }
  const lumpP = lumpSum && strategy !== 'none' ? toPaise(lumpSum.amount) : 0
  const lumpMonth = lumpSum && strategy !== 'none' ? lumpSum.month : 0

  const byName = (a, b) => (a.name < b.name ? -1 : a.name > b.name ? 1 : String(a.id) < String(b.id) ? -1 : String(a.id) > String(b.id) ? 1 : 0)
  const order = (list) => {
    const l = list.filter((s) => s.bal > 0)
    if (strategy === 'avalanche') return l.sort((a, b) => b.rate - a.rate || byName(a, b))
    return l.sort((a, b) => a.bal - b.bal || byName(a, b)) // snowball: balance left after interest and minimums
  }

  let totalInterest = 0
  let totalPaid = 0
  let months = 0
  while (months < maxMonths && state.some((s) => s.bal > 0)) {
    months++
    for (const s of state) {
      if (s.bal <= 0) continue
      const i = interestPaise(s.bal, s.rate)
      s.bal += i
      s.interest += i
      totalInterest += i
    }
    let left = budgetP
    for (const s of state) {
      if (s.bal <= 0) continue
      const x = Math.min(s.minP, s.bal)
      s.bal -= x
      totalPaid += x
      left -= x
    }
    if (strategy !== 'none') {
      if (months === lumpMonth) left += lumpP
      for (const s of order(state)) {
        if (left <= 0) break
        const x = Math.min(left, s.bal)
        s.bal -= x
        totalPaid += x
        left -= x
      }
    }
    for (const s of state) {
      if (s.bal === 0 && s.payoffMonth === null) s.payoffMonth = months
    }
  }
  const remaining = state.reduce((a, s) => a + s.bal, 0)
  return {
    ok: true,
    basis: 'calculated',
    paysOff: remaining === 0,
    months,
    totalInterest: fromPaise(totalInterest),
    totalPaid: fromPaise(totalPaid),
    remainingPrincipal: fromPaise(remaining),
    perDebt: state.map((s) => ({ id: s.id, payoffMonth: s.payoffMonth, interest: fromPaise(s.interest), remaining: fromPaise(s.bal) })),
  }
}

export function comparePlans({ debts, monthlyBudget, lumpSum } = {}) {
  const baseline = planDebts({ debts, monthlyBudget, strategy: 'none', maxMonths: MAX_MONTHS })
  if (!baseline.ok) return fail(baseline.reason, { failedPlan: 'baseline', ...pickExtra(baseline) })
  const avalanche = planDebts({ debts, monthlyBudget, strategy: 'avalanche', lumpSum })
  if (!avalanche.ok) return fail(avalanche.reason, { failedPlan: 'avalanche', ...pickExtra(avalanche) })
  const snowball = planDebts({ debts, monthlyBudget, strategy: 'snowball', lumpSum })
  if (!snowball.ok) return fail(snowball.reason, { failedPlan: 'snowball', ...pickExtra(snowball) })
  const diff = (a, b) => Math.round((a - b) * 100) / 100
  return {
    ok: true,
    baseline,
    avalanche,
    snowball,
    savingsVsBaseline: { avalanche: diff(baseline.totalInterest, avalanche.totalInterest), snowball: diff(baseline.totalInterest, snowball.totalInterest) },
    avalancheVsSnowballInterest: diff(snowball.totalInterest, avalanche.totalInterest),
  }
}

function pickExtra(r) {
  const o = {}
  if (r.shortfall !== undefined) o.shortfall = r.shortfall
  if (r.debtId !== undefined) o.debtId = r.debtId
  return o
}
