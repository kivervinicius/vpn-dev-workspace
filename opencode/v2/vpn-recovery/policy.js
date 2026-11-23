// Política única de recuperação. É a única fonte de verdade sobre o que fazer
// com cada classe de limite — consumida pelo hook de servidor (v2), pelo
// plugin v1 e pela notificação da TUI.
//
// The server hook changes model only for model-scoped free-tier exhaustion.
// Provider limits never force a VPN restart. Recovery is allowed only after
// Gluetun confirms a stopped tunnel.
export const ACTION_NOTIFY = "notify"

export const QUOTA_CLASSES = [
  "free_tier_limit",
  "rate_limit",
  "account_limit",
  "credit_limit",
  "auth_limit",
]

export function decideAction({ eventClass } = {}) {
  const classified = QUOTA_CLASSES.includes(eventClass)
  const recoverStoppedTunnel = classified
  const reason = classified ? "provider_limit_diagnosis" : "unclassified"
  return { action: ACTION_NOTIFY, recoverStoppedTunnel, reason }
}
