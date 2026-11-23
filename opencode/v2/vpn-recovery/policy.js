// Política única de recuperação. É a única fonte de verdade sobre o que fazer
// com cada classe de limite — consumida pelo hook de servidor (v2), pelo
// plugin v1 e pela notificação da TUI.
//
// Provider limits never change the model or replay work. A structured HTTP 429
// restarts the current tunnel from the TUI; other events only recover a tunnel
// that Gluetun confirms is stopped. The server hook only vetoes retries.
export const ACTION_NOTIFY = "notify"

export const QUOTA_CLASSES = [
  "free_tier_limit",
  "rate_limit",
  "account_limit",
  "credit_limit",
  "auth_limit",
]

export function decideAction({ eventClass, httpStatus } = {}) {
  const classified = QUOTA_CLASSES.includes(eventClass)
  const restartTunnel = classified && (eventClass === "rate_limit" || httpStatus === 429)
  const reason = restartTunnel
    ? "http_429_tunnel_restart"
    : classified ? "provider_limit_diagnosis" : "unclassified"
  return { action: ACTION_NOTIFY, restartTunnel, reason }
}

// O hook de servidor nunca age sobre quota: ele apenas veta o retry.
export function vetoDecision() {
  return { retry: false }
}
