// Política única de recuperação. É a única fonte de verdade sobre o que fazer
// com cada classe de limite — consumida pelo hook de servidor (v2), pelo
// plugin v1 e pela notificação da TUI.
//
export const ACTION_NOTIFY = "notify"

// Decide a ação para um evento de limite.
export function decideAction({ eventClass } = {}) {
  if (!eventClass) return { action: ACTION_NOTIFY, rotate: false, reason: "unclassified" }

  // Provider quotas and rate limits are status-only. Network recovery is
  // handled separately after a confirmed transport failure; quota events never
  // mutate VPN state or replay a turn.
  if (["free_tier_limit", "rate_limit", "account_limit", "credit_limit", "auth_limit"].includes(eventClass)) {
    return { action: ACTION_NOTIFY, rotate: false, reason: "quota_status_only" }
  }
  return { action: ACTION_NOTIFY, rotate: false, reason: "unclassified" }
}

export function vetoDecision() {
  return { retry: false }
}
