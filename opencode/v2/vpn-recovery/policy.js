// Política única de recuperação. É a única fonte de verdade sobre o que fazer
// com cada classe de limite — consumida pelo hook de servidor (v2), pelo
// plugin v1 e pela notificação da TUI.
//
// Contrato (2026-11-22, override do maestro): quota continua **nunca** alterando
// modelo nem repetindo turno/ferramenta. A recuperação de VPN passou a ser
// opt-out (`OPENCODE_QUOTA_RECONNECT`, default ligado) e roda **somente na TUI**,
// pelo helper `opencode-quota-reconnect`. O hook de servidor continua vetando
// retry e nunca dispara reconexão.
export const ACTION_NOTIFY = "notify"

export const QUOTA_CLASSES = [
  "free_tier_limit",
  "rate_limit",
  "account_limit",
  "credit_limit",
  "auth_limit",
]

export function quotaReconnectEnabled() {
  const raw = String(process.env.OPENCODE_QUOTA_RECONNECT ?? "true").trim().toLowerCase()
  return !["0", "false", "no", "off"].includes(raw)
}

// `rotate` documenta a **permissão** de recuperação de VPN para a classe, não a
// execução: quem executa é o helper, chamado apenas pelos entrypoints TUI.
export function decideAction({ eventClass } = {}) {
  if (!eventClass) return { action: ACTION_NOTIFY, rotate: false, reason: "unclassified" }

  if (QUOTA_CLASSES.includes(eventClass)) {
    const reconnect = quotaReconnectEnabled()
    return {
      action: ACTION_NOTIFY,
      rotate: reconnect,
      reason: reconnect ? "quota_tui_reconnect" : "quota_status_only",
    }
  }
  return { action: ACTION_NOTIFY, rotate: false, reason: "unclassified" }
}

// O hook de servidor nunca age sobre quota: ele apenas veta o retry.
export function vetoDecision() {
  return { retry: false }
}
