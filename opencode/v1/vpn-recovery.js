import { spawn } from "node:child_process"

const ERROR_CLASSES = new Map([
  ["FreeUsageLimitError", "free_tier_limit"],
  ["free_tier_limit", "free_tier_limit"],
  ["GoUsageLimitError", "account_limit"],
  ["account_rate_limit", "account_limit"],
  ["account_limit", "account_limit"],
  ["CreditLimitExceeded", "credit_limit"],
  ["InsufficientFunds", "credit_limit"],
  ["credit_limit", "credit_limit"],
  ["rate_limit", "rate_limit"],
  ["provider.auth", "auth_limit"],
  ["auth_limit", "auth_limit"],
])

function object(value) {
  return value !== null && typeof value === "object" && !Array.isArray(value)
}

function hasHttp429(value) {
  if (!object(value)) return false
  const pending = [value]
  const seen = new Set()
  while (pending.length) {
    const current = pending.pop()
    if (!object(current) || seen.has(current)) continue
    seen.add(current)
    if (current.status === 429 || current.statusCode === 429) return true
    for (const [key, child] of Object.entries(current)) {
      if (["message", "detail", "details"].includes(key)) continue
      if (["body", "responseBody"].includes(key) && typeof child === "string") {
        try {
          const parsed = JSON.parse(child)
          if (object(parsed)) pending.push(parsed)
        } catch {
          // Provider prose is not interpreted as an HTTP status.
        }
      } else if (object(child)) pending.push(child)
    }
  }
  return false
}

function structuredClass(value) {
  if (!object(value)) return undefined
  const pending = [value]
  const seen = new Set()
  let hasFreeTier = false
  let hasAccount = false
  let hasCredit = false
  let hasRateLimit = false
  let hasAuth = false
  let has402 = false
  let has429 = false

  while (pending.length) {
    const current = pending.pop()
    if (!object(current) || seen.has(current)) continue
    seen.add(current)
    for (const key of ["name", "type", "code", "errorType"]) {
      if (typeof current[key] !== "string") continue
      const found = ERROR_CLASSES.get(current[key])
      if (found === "free_tier_limit") hasFreeTier = true
      else if (found === "account_limit") hasAccount = true
      else if (found === "credit_limit") hasCredit = true
      else if (found === "rate_limit") hasRateLimit = true
      else if (found === "auth_limit") hasAuth = true
    }
    for (const key of ["status", "statusCode"]) {
      if (current[key] === 402) has402 = true
      if (current[key] === 429) has429 = true
    }
    for (const [key, child] of Object.entries(current)) {
      if (["message", "detail", "details"].includes(key)) continue
      if (key === "responseBody" || key === "body") {
        if (object(child)) pending.push(child)
        else if (typeof child === "string") {
          try {
            const parsed = JSON.parse(child)
            if (object(parsed)) pending.push(parsed)
          } catch {
            // Provider prose is intentionally not interpreted.
          }
        }
        continue
      }
      if (object(child)) pending.push(child)
    }
  }

  if (hasFreeTier) return "free_tier_limit"
  if (hasAccount) return "account_limit"
  if (hasCredit) return "credit_limit"
  if (hasRateLimit) return "rate_limit"
  if (hasAuth) return "auth_limit"
  if (has402) return "credit_limit"
  if (has429) return "rate_limit"
  return undefined
}

function classifyV1Error(error) {
  if (!object(error) || !object(error.data)) return undefined
  return structuredClass(error.data)
}

function messageFor(eventClass) {
  const base = (() => {
    switch (eventClass) {
      case "free_tier_limit": return "Limite gratuito do Zen detectado"
      case "rate_limit": return "Limite de requisições detectado"
      case "account_limit": return "Limite da conta detectado"
      case "credit_limit": return "Limite de crédito detectado"
      default: return "Limite do provider detectado"
    }
  })()
  return `${base}; verificando o túnel VPN. O turno não será repetido automaticamente.`
}

function spawnNetworkRecovery(eventClass, sessionID, showResult, forceRestart = false) {
  try {
    const bin = process.env.OPENCODE_NETWORK_RECOVER_BIN || "/usr/local/bin/opencode-network-recover"
    const args = ["--event", eventClass, "--session", sessionID || "unknown", "--quiet"]
    if (forceRestart) args.push("--force-restart")
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

function createV1Plugin() {
  return async ({ client, directory }) => {
    // The config directory can be shared with the host. Keep this integration
    // scoped to the VPN container; outside it, no VPN recovery is triggered.
    if (process.env.VPN_WORKSPACE_CONTAINER !== "1") return {}

    // Dedupe com TTL: depois do reset da cota a mesma sessão+classe precisa
    // poder notificar de novo. TTL default 300s.
    const handled = new Map()
    const ttlMs = Math.max(0, Number(process.env.OPENCODE_QUOTA_NOTIFY_TTL_SECONDS ?? 300)) * 1000
    const dedupeExpired = (key, now) => {
      const expires = handled.get(key)
      if (expires === undefined) return true
      if (expires <= now) {
        handled.delete(key)
        return true
      }
      return false
    }
    const remember = (key, now) => {
      handled.set(key, now + ttlMs)
      if (handled.size > 512) {
        const oldest = handled.keys().next().value
        if (oldest !== undefined && handled.get(oldest) <= now) handled.delete(oldest)
      }
    }

    const notify = async (message, variant = "info") => {
      try {
        await client.tui.showToast({
          body: { title: "OpenCode provider status", message, variant, duration: 8000 },
        })
        return true
      } catch {
        // Notification failures never start another request.
        return false
      }
    }
    const handle = async (sessionID, eventClass, cancelRetry, forceRestart = false) => {
      const now = Date.now()
      const key = `${sessionID}:${eventClass}`
      if (!dedupeExpired(key, now)) return
      remember(key, now)

      if (cancelRetry) {
        try {
          const aborted = await client.session.abort({
            path: { id: sessionID }, query: { directory }, throwOnError: true,
          })
          if (aborted?.data !== true) {
            await notify("Não foi possível confirmar o cancelamento da repetição; a VPN não foi alterada.", "error")
            return
          }
        } catch {
          await notify("Não foi possível cancelar a repetição; a VPN não foi alterada.", "error")
          return
        }
      }
      const shown = await notify(messageFor(eventClass))
      // 429 recovery must not depend on whether the first toast was displayed.
      if (shown || forceRestart) spawnNetworkRecovery(eventClass, sessionID, (result) => {
        const message = result.status === "reconnected"
          ? result.reason === "http_429_tunnel_restarted"
            ? `HTTP 429 recebido; túnel VPN reiniciado${result.ip ? `. IP atual: ${result.ip}` : ""}. O limite do provider pode continuar ativo.`
            : `Túnel VPN estava parado e foi reconectado${result.ip ? `. IP atual: ${result.ip}` : ""}. O limite do provider pode continuar ativo.`
          : result.status === "healthy"
            ? "Túnel VPN confirmado saudável. O limite do provider permanece ativo."
            : result.status === "lock_busy"
              ? "O túnel VPN já está sendo alterado. Consulte vpn-status antes de tentar novamente."
              : "Não foi possível confirmar ou reconectar o túnel VPN. Consulte vpn-check."
        void notify(message, result.status === "failed" ? "error" : "info")
      }, forceRestart)
    }

    return {
      event: ({ event }) => {
        if (!object(event) || !object(event.properties)) return
        const properties = event.properties
        if (typeof properties.sessionID !== "string" || !properties.sessionID) return

        if (event.type === "session.status") {
          const status = properties.status
          if (!object(status) || status.type !== "retry") return
          const reason = status.action?.reason
          const eventClass = ERROR_CLASSES.get(reason)
          if (eventClass) void handle(properties.sessionID, eventClass, true, eventClass === "rate_limit" || hasHttp429(status.action))
          return
        }

        if (event.type !== "session.error") return
        const error = properties.error
        if (!object(error) || error.name !== "APIError") return
        const eventClass = classifyV1Error(error)
        if (eventClass) void handle(properties.sessionID, eventClass, false, eventClass === "rate_limit" || hasHttp429(error.data))
      },
    }
  }
}

export const VpnRecovery = createV1Plugin()
