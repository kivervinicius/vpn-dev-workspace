import { spawn } from "node:child_process"

const ERROR_CLASSES = new Map([
  ["FreeUsageLimitError", "free_tier_limit"],
  ["free_tier_limit", "free_tier_limit"],
  ["GoUsageLimitError", "account_limit"],
  ["account_rate_limit", "account_limit"],
  ["account_limit", "account_limit"],
  ["CreditLimitExceeded", "credit_limit"],
  ["InsufficientFunds", "credit_limit"],
  ["rate_limit", "rate_limit"],
  ["credit_limit", "credit_limit"],
])
const RECOVERABLE = new Set(["free_tier_limit", "rate_limit"])

function object(value) {
  return value !== null && typeof value === "object" && !Array.isArray(value)
}

function structuredClass(value) {
  if (!object(value)) return undefined
  const pending = [value]
  const seen = new Set()
  let hasFreeTier = false
  let hasAccount = false
  let hasCredit = false
  let hasRateLimit = false
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
  if (has402) return "credit_limit"
  if (has429) return "rate_limit"
  return undefined
}

function classifyV1Error(error) {
  if (!object(error)) return undefined
  const data = object(error.data) ? error.data : undefined
  return structuredClass(data)
}

function messageFor(eventClass) {
  switch (eventClass) {
    case "free_tier_limit":
      return "Limite do plano gratuito detectado."
    case "rate_limit":
      return "Limite de requisições detectado (HTTP 429)."
    case "account_limit":
      return "Limite da conta detectado; a VPN não foi alterada."
    case "credit_limit":
      return "Limite de crédito detectado; a VPN não foi alterada."
    default:
      return "Evento de limite detectado; a VPN não foi alterada."
  }
}

function recoveryMessage(result) {
  if (result.status === "changed") {
    return `IP de saída mudou após solicitar ${result.target}. Reenvie a mensagem manualmente.`
  }
  if (result.status === "skipped") {
    return `Recuperação VPN ignorada (${result.reason}). Nenhuma mensagem foi reenviada.`
  }
  return `Recuperação VPN falhou (${result.reason}). Nenhuma mensagem foi reenviada.`
}

function runRecovery(eventClass) {
  return new Promise((resolve, reject) => {
    const recoveryBin = process.env.OPENCODE_LIMIT_RECOVER_BIN || "/usr/local/bin/opencode-limit-recover"
    const child = spawn(recoveryBin, ["--event", eventClass], {
      shell: false,
      stdio: ["ignore", "pipe", "pipe"],
    })
    let stdout = ""
    let stderr = ""
    let settled = false
    const finish = (error, value) => {
      if (settled) return
      settled = true
      clearTimeout(timer)
      if (error) reject(error)
      else resolve(value)
    }
    const timer = setTimeout(() => {
      child.kill("SIGKILL")
      finish(new Error("recovery timeout"))
    }, 600_000)
    child.stdout.setEncoding("utf8")
    child.stderr.setEncoding("utf8")
    child.stdout.on("data", (chunk) => { stdout += chunk })
    child.stderr.on("data", (chunk) => { stderr += chunk })
    child.on("error", () => finish(new Error("recovery process failed")))
    child.on("close", (code) => {
      let result
      try {
        result = JSON.parse(stdout)
      } catch {
        finish(new Error("invalid recovery response"))
        return
      }
      const expectedKeys = ["status", "reason", "before_ip", "after_ip", "target"]
      if (!object(result) || Object.keys(result).length !== expectedKeys.length ||
          expectedKeys.some((key) => !Object.hasOwn(result, key)) ||
          !["changed", "skipped", "failed"].includes(result.status) ||
          typeof result.reason !== "string" || !result.reason ||
          typeof result.before_ip !== "string" || typeof result.after_ip !== "string" ||
          typeof result.target !== "string" ||
          (result.status === "changed" && (!result.target || !result.before_ip || !result.after_ip || result.before_ip === result.after_ip))) {
        finish(new Error("invalid recovery response"))
        return
      }
      if ((code === 0 && ["changed", "skipped"].includes(result.status)) ||
          (code === 1 && result.status === "failed") || (code === 75 && result.status === "skipped")) {
        finish(undefined, result)
        return
      }
      finish(new Error(stderr.trim() ? "recovery process failed" : "inconsistent recovery exit status"))
    })
  })
}

function createV1Plugin() {
  return async ({ client, directory }) => {
    const activeSessions = new Set()
    const notify = async (message, variant = "info") => {
      try {
        await client.tui.showToast({
          body: { title: "VPN recovery", message, variant, duration: 8000 },
        })
      } catch {
        // Toast delivery does not repeat recovery.
      }
    }
    const handleEvent = async (sessionID, eventClass, abortFirst) => {
      if (activeSessions.has(sessionID)) return
      activeSessions.add(sessionID)
      try {
        if (abortFirst) {
          try {
            const result = await client.session.abort({
              path: { id: sessionID },
              query: { directory },
              throwOnError: true,
            })
            if (result?.data !== true) {
              await notify("Não foi possível confirmar o cancelamento; a VPN não foi alterada.", "error")
              return
            }
          } catch {
            await notify("Não foi possível cancelar a repetição; a VPN não foi alterada.", "error")
            return
          }
        }
        if (!RECOVERABLE.has(eventClass)) {
          await notify(messageFor(eventClass))
          return
        }
        try {
          const result = await runRecovery(eventClass)
          await notify(recoveryMessage(result), result.status === "failed" ? "error" : result.status === "changed" ? "success" : "info")
        } catch {
          await notify("Recuperação VPN falhou. Nenhuma mensagem foi reenviada.", "error")
        }
      } finally {
        activeSessions.delete(sessionID)
      }
    }
    return {
      event: ({ event }) => {
        if (!object(event) || !object(event.properties)) return
        const properties = event.properties
        if (event.type === "session.status") {
          const status = properties.status
          if (!object(status) || status.type !== "retry") return
          const reason = status.action?.reason
          const eventClass = reason === "free_tier_limit"
            ? "free_tier_limit"
            : reason === "account_rate_limit" ? "account_limit" : undefined
          if (eventClass && typeof properties.sessionID === "string" && properties.sessionID) {
            void handleEvent(properties.sessionID, eventClass, true)
          }
          return
        }
        if (event.type !== "session.error") return
        const error = properties.error
        if (typeof properties.sessionID !== "string" || !properties.sessionID || !object(error) || error.name !== "APIError") return
        const eventClass = classifyV1Error(error)
        if (eventClass) void handleEvent(properties.sessionID, eventClass, false)
      },
    }
  }
}
export const VpnRecovery = createV1Plugin()
