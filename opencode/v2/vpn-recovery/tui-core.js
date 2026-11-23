import { spawn } from "node:child_process"
import { classifyV2Error, extractRetryAfterSeconds } from "./classify.js"
import { decideAction } from "./policy.js"

// Only the server plugin changes models for a model-scoped free quota. The TUI
// reports the final outcome and recovers a tunnel only when it is confirmed stopped.
function humanizeSeconds(seconds) {
  const total = Math.max(1, Math.trunc(seconds))
  const hours = Math.trunc(total / 3600)
  const minutes = Math.trunc((total % 3600) / 60)
  if (hours > 0) return `${hours}h${String(minutes).padStart(2, "0")}m`
  return `${Math.max(1, minutes)}min`
}

function spawnNetworkRecovery(eventClass, sessionID, showResult) {
  try {
    const bin = process.env.OPENCODE_NETWORK_RECOVER_BIN || "/usr/local/bin/opencode-network-recover"
    const args = ["--event", eventClass, "--session", sessionID || "unknown"]
    const child = spawn(bin, args, {
      stdio: ["ignore", "pipe", "ignore"],
      env: process.env,
    })
    let output = ""
    // Spawn falho emite "error" E "close" (Node >=15): sem trava, o callback
    // roda duas vezes e o usuário recebe dois toasts de falha conflitantes.
    let settled = false
    const once = (result) => {
      if (settled) return
      settled = true
      showResult(result)
    }
    child.stdout.setEncoding("utf8")
    child.stdout.on("data", (chunk) => { output += chunk })
    child.on("error", () => once({ status: "failed", reason: "helper_unavailable" }))
    child.on("close", () => {
      try { once(JSON.parse(output)) }
      catch { once({ status: "failed", reason: "invalid_helper_response" }) }
    })
  } catch {
    showResult({ status: "failed", reason: "helper_unavailable" })
  }
}

function notification(eventClass, retryAfterSeconds) {
  const tail = retryAfterSeconds === undefined
    ? ""
    : " Tente novamente após ~" + humanizeSeconds(retryAfterSeconds) + "."
  switch (eventClass) {
    case "free_tier_limit":
      return retryAfterSeconds === undefined
        ? "A cota deste modelo gratuito foi atingida e a execução não foi concluída. Consulte o catálogo de modelos e o status do provider."
        : "A cota deste modelo gratuito foi atingida e a execução não foi concluída." + tail
    case "rate_limit": {
      const message = "Limite de requisições do provider detectado. A troca de modelo só é automática para cota gratuita por modelo."
      return retryAfterSeconds === undefined ? message : message + tail
    }
    case "account_limit": return "Limite da conta detectado; verificando o túnel VPN."
    case "credit_limit": return "Limite de crédito detectado; verificando o túnel VPN."
    default: return "Limite do provider detectado; verificando o túnel VPN."
  }
}

function recoveryMessage(result) {
  if (result.status === "healthy") return "Túnel VPN confirmado saudável. O limite do provider permanece ativo."
  if (result.status === "reconnected") {
    return result.ip
      ? `Túnel VPN estava parado e foi reconectado. IP atual: ${result.ip}. O limite do provider pode continuar ativo.`
      : "Túnel VPN estava parado e foi reconectado. O limite do provider pode continuar ativo."
  }
  if (result.status === "lock_busy") return "O túnel VPN já está sendo alterado. Consulte vpn-status antes de tentar novamente."
  if (result.reason === "tunnel_state_unknown") return "Não foi possível confirmar o estado do túnel VPN; nenhuma alteração foi feita."
  return "Não foi possível verificar ou reconectar o túnel VPN. Consulte vpn-check."
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
  const runningModels = new Map()
  const ttlMs = Math.max(0, Number(process.env.OPENCODE_QUOTA_NOTIFY_TTL_SECONDS ?? 300)) * 1000
  const listener = async (event) => {
    const data = event?.data
    const sessionID = data?.sessionID
    if (!data || typeof sessionID !== "string" || !sessionID) return
    const eventClass = classifyV2Error(data.error)
    if (!eventClass) return
    const action = decideAction({ eventClass })
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
        message: notification(eventClass, extractRetryAfterSeconds(data.error)) + modelHint(ctx, data),
        variant: "info",
        duration: 8000,
      })
      shown = true
    } catch {
      // A notification failure never starts another recovery.
    }
    if (shown && action.recoverStoppedTunnel) spawnNetworkRecovery(eventClass, sessionID, (result) => {
      void ctx.ui.toast.show({
        sessionID,
        title: "VPN status",
        message: recoveryMessage(result),
        variant: result.status === "failed" ? "error" : "info",
        duration: 8000,
      }).catch(() => {})
    })
  }
  const currentModel = () => {
    try { return ctx.ui.model?.current?.() }
    catch { return undefined }
  }
  const started = ctx.data.on("session.execution.started", (event) => {
    const sessionID = event?.data?.sessionID
    if (typeof sessionID === "string") runningModels.set(sessionID, currentModel())
  })
  const succeeded = ctx.data.on("session.execution.succeeded", async (event) => {
    const data = event?.data
    const sessionID = data?.sessionID
    if (typeof sessionID !== "string") return
    const previous = runningModels.get(sessionID)
    const selected = currentModel()
    runningModels.delete(sessionID)
    if (!previous || !selected || previous.providerID === selected.providerID && (previous.id ?? previous.modelID) === (selected.id ?? selected.modelID)) return
    await ctx.ui.toast.show({
      sessionID,
      title: "Modelo alternativo",
      message: `A execução foi concluída após a cota de ${previous.providerID}/${previous.id ?? previous.modelID} ser atingida. OpenCode reenviou o turno com ${selected.providerID}/${selected.id ?? selected.modelID}.`,
      variant: "success",
      duration: 8000,
    }).catch(() => {})
  })
  const failed = ctx.data.on("session.execution.failed", async (event) => {
    const sessionID = event?.data?.sessionID
    if (typeof sessionID === "string") runningModels.delete(sessionID)
    await listener(event)
  })
  return () => {
    for (const unsubscribe of [started, succeeded, failed]) {
      if (typeof unsubscribe === "function") unsubscribe()
      else unsubscribe?.dispose?.()
    }
  }
}
