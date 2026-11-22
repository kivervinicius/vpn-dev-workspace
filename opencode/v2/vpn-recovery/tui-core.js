import { classifyV2Error, extractRetryAfterSeconds } from "./classify.js"

// Quota events are status-only. Network recovery is handled by the supervisor
// after a confirmed transport failure, never by replaying a provider turn.
function humanizeSeconds(seconds) {
  const total = Math.max(1, Math.trunc(seconds))
  const hours = Math.trunc(total / 3600)
  const minutes = Math.trunc((total % 3600) / 60)
  if (hours > 0) return `${hours}h${String(minutes).padStart(2, "0")}m`
  return `${Math.max(1, minutes)}min`
}

function notification(eventClass, retryAfterSeconds) {
  switch (eventClass) {
    case "free_tier_limit":
      return retryAfterSeconds === undefined
        ? "Limite gratuito do Zen detectado; a VPN não foi alterada nem haverá repetição automática. Consulte o status do provider."
        : "Limite gratuito do Zen detectado; a VPN não foi alterada nem haverá repetição automática. Tente novamente após ~" + humanizeSeconds(retryAfterSeconds) + "."
    case "rate_limit": return "Limite de requisições detectado; a VPN não foi alterada e o turno não será repetido automaticamente."
    case "account_limit": return "Limite da conta detectado; a VPN não foi alterada."
    case "credit_limit": return "Limite de crédito detectado; a VPN não foi alterada."
    default: return "Limite do provider detectado; a VPN não foi alterada."
  }
}

export function setupTuiPlugin(ctx) {
  // The plugin config may be linked from the host. Keep VPN notifications
  // scoped to the VPN container too, so direct host OpenCode remains unaffected.
  if (process.env.VPN_WORKSPACE_CONTAINER !== "1") return () => {}

  const handled = new Set()
  const listener = async (event) => {
    const data = event?.data
    const sessionID = data?.sessionID
    if (!data || typeof sessionID !== "string" || !sessionID) return
    const eventClass = classifyV2Error(data.error)
    if (!eventClass) return
    const key = `${sessionID}:${eventClass}`
    if (handled.has(key)) return
    handled.add(key)
    if (handled.size > 512) handled.delete(handled.values().next().value)
    try {
      await ctx.ui.toast.show({
        sessionID,
        title: "VPN recovery",
        message: notification(eventClass, extractRetryAfterSeconds(data.error)),
        variant: "info",
        duration: 8000,
      })
    } catch {
      // A notification failure never starts another recovery.
    }
  }
  const unsubscribe = ctx.data.on("session.execution.failed", listener)
  return () => {
    if (typeof unsubscribe === "function") unsubscribe()
    else unsubscribe?.dispose?.()
  }
}
