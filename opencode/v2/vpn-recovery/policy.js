// Política única de recuperação. É a única fonte de verdade sobre o que fazer
// com cada classe de limite — consumida pelo hook de servidor (v2), pelo
// plugin v1 e pela notificação da TUI.
//
// Provider limits never change the model, rotate the VPN, or replay work. The
// TUI may reconnect only after Gluetun confirms that the tunnel is stopped.
// The server hook only vetoes retries.
export const ACTION_NOTIFY = "notify"

export const QUOTA_CLASSES = [
  "free_tier_limit",
  "rate_limit",
  "account_limit",
  "credit_limit",
  "auth_limit",
]

export function decideAction({ eventClass } = {}) {
  const reason = QUOTA_CLASSES.includes(eventClass) ? "provider_limit_diagnosis" : "unclassified"
  return { action: ACTION_NOTIFY, rotate: false, reason }
}

// O hook de servidor nunca age sobre quota: ele apenas veta o retry.
export function vetoDecision() {
  return { retry: false }
}
