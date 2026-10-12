// A date-only string such as '2026-08-01' is read by new Date() as UTC midnight, which
// shows the previous day for anyone west of UTC. This builds a LOCAL date instead.
export function dateFromISO(isoDate) {
  const [y, m, d] = String(isoDate).slice(0, 10).split('-').map(Number)
  return new Date(y, m - 1, d)
}
