// P14 (O-1): on a phone, a second tap that lands just after a dialog closes can hit the
// bottom-bar "More" item that sits under the closed dialog. The Modal records when it closes;
// the bottom bar ignores a "More" tap that arrives within a short window after that.
// Pure and tiny on purpose: no storage, no network, nothing persisted.
export const MODAL_CLOSE_GUARD_MS = 350

let lastClosedAt = 0

export function markModalClosed(now = Date.now()) {
  lastClosedAt = now
}

export function justClosedModal(now = Date.now(), windowMs = MODAL_CLOSE_GUARD_MS) {
  return now - lastClosedAt >= 0 && now - lastClosedAt < windowMs
}

export function resetModalGuard() {
  lastClosedAt = 0
}
