import { spawn } from "node:child_process"
import { classifyV2Error, extractRetryAfterSeconds } from "./classify.js"

// Quota events are status-only for retry/model: the turn is never replayed.
// Network recovery is opt-out via OPENCODE_QUOTA_RECONNECT (default on) and runs
// only from the TUI after the notification is actually shown.
function humanizeSeconds(seconds) {
  const total = Math.max(1, Math.trunc(seconds))
  const hours = Math.trunc(total / 3600)
  const minutes = Math.trunc((total % 3600) / 60)
  if (hours > 0) return `${hours}h${String(minutes).padStart(2, "0")}m`
  return `${Math.max(1, minutes)}min`
}

function quotaReconnectEnabled() {
  const raw = String(process.env.OPENCODE_QUOTA_RECONNECT ?? "true").trim().toLowerCase()
  return !["0", "false", "no", "off"].includes(raw)
}

function spawnQuotaReconnect(eventClass, sessionID) {
  try {
    // Detached: a TUI pode fechar antes do fim; o túnel não pode ficar parado.
    const bin = process.env.OPENCODE_QUOTA_RECONNECT_BIN || "/usr/local/bin/opencode-quota-reconnect"
    const child = spawn(bin, ["--event", eventClass, "--session", sessionID || "unknown", "--quiet"], {
      detached: true,
      stdio: "ignore",
      env: process.env,
    })
    child.on("error", () => {})
    child.unref()
  } catch {
    // A notificação de quota nunca depende do sucesso do helper.
  }
}

function notification(eventClass, retryAfterSeconds, reconnecting) {
  const tail = retryAfterSeconds === undefined
    ? ""
    : " Tente novamente após ~" + humanizeSeconds(retryAfterSeconds) + "."
  if (reconnecting) {
    switch (eventClass) {
      case "free_tier_limit":
        return `Limite gratuito do Zen detectado; solicitando tentativa de rotação da VPN. O turno não será repetido automaticamente.${tail}`
      case "rate_limit":
        return `Limite de requisições detectado; solicitando tentativa de rotação da VPN. O turno não será repetido automaticamente.${tail}`
      case "account_limit":
        return `Limite da conta detectado; solicitando tentativa de rotação da VPN.`
      case "credit_limit":
        return `Limite de crédito detectado; solicitando tentativa de rotação da VPN.`
      default:
        return `Limite do provider detectado; solicitando tentativa de rotação da VPN.`
    }
  }
  switch (eventClass) {
    case "free_tier_limit":
      return retryAfterSeconds === undefined
        ? "Limite gratuito do Zen detectado; a VPN não foi alterada nem haverá repetição automática. Consulte o status do provider."
        : "Limite gratuito do Zen detectado; a VPN não foi alterada nem haverá repetição automática." + tail
    case "rate_limit": {
      const message = "Limite de requisições detectado; a VPN não foi alterada e o turno não será repetido automaticamente."
      return retryAfterSeconds === undefined ? message : message + tail
    }
    case "account_limit": return "Limite da conta detectado; a VPN não foi alterada."
    case "credit_limit": return "Limite de crédito detectado; a VPN não foi alterada."
    default: return "Limite do provider detectado; a VPN não foi alterada."
  }
}

function suggestedModels(catalog, current) {
  if (!Array.isArray(catalog)) return []
  const choices = new Set()
  for (const model of catalog) {
    if (model?.enabled === false || !model?.providerID || !model?.modelID) continue
    if (typeof model.providerID !== "string" || typeof model.modelID !== "string") continue
    if (model.providerID === current?.providerID && model.modelID === (current.modelID ?? current.id)) continue
    choices.add(`${model.providerID}/${model.modelID}`)
    if (choices.size === 3) break
  }
  return [...choices]
}

function modelHint(ctx, data) {
  const manualHint = " Consulte `opencode2 models` no terminal VPN para escolher outro modelo."
  try {
    const catalog = ctx.data.location?.model?.list(ctx.location)
    const choices = suggestedModels(catalog, data.model)
    return choices.length
      ? ` Escolha manualmente um modelo no OpenCode: ${choices.join(", ")}.`
      : manualHint
  } catch {
    return manualHint
  }
}

export function setupTuiPlugin(ctx) {
  // The plugin config may be linked from the host. Keep VPN notifications
  // scoped to the VPN container too, so direct host OpenCode remains unaffected.
  if (process.env.VPN_WORKSPACE_CONTAINER !== "1") return () => {}

  // Dedupe com TTL: depois do reset da cota a mesma sessão+classe precisa
  // poder notificar de novo. TTL default 300s.
  const handled = new Map()
  const ttlMs = Math.max(0, Number(process.env.OPENCODE_QUOTA_NOTIFY_TTL_SECONDS ?? 300)) * 1000
  const reconnecting = quotaReconnectEnabled()
  const listener = async (event) => {
    const data = event?.data
    const sessionID = data?.sessionID
    if (!data || typeof sessionID !== "string" || !sessionID) return
    const eventClass = classifyV2Error(data.error)
    if (!eventClass) return
    const now = Date.now()
    const key = `${sessionID}:${eventClass}`
    const expires = handled.get(key)
    if (expires !== undefined && expires > now) return
    handled.set(key, now + ttlMs)
    if (handled.size > 512) {
      const oldest = handled.keys().next().value
      if (oldest !== undefined && (handled.get(oldest) ?? 0) <= now) handled.delete(oldest)
    }
    let shown = false
    try {
      await ctx.ui.toast.show({
        sessionID,
        title: "VPN recovery",
        message: notification(eventClass, extractRetryAfterSeconds(data.error), reconnecting) + modelHint(ctx, data),
        variant: "info",
        duration: 8000,
      })
      shown = true
    } catch {
      // A notification failure never starts another recovery.
    }
    // TUI only: o gatilho existe junto com a notificação.
    if (shown && reconnecting) spawnQuotaReconnect(eventClass, sessionID)
  }
  const unsubscribe = ctx.data.on("session.execution.failed", listener)
  return () => {
    if (typeof unsubscribe === "function") unsubscribe()
    else unsubscribe?.dispose?.()
  }
}
