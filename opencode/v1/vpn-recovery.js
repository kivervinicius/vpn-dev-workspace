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
  switch (eventClass) {
    case "free_tier_limit":
      return "Limite gratuito do Zen detectado; a VPN não foi alterada e o turno não será repetido automaticamente."
    case "rate_limit":
      return "Limite de requisições detectado; a VPN não foi alterada e o turno não será repetido automaticamente."
    case "account_limit":
      return "Limite da conta detectado; a VPN não foi alterada."
    case "credit_limit":
      return "Limite de crédito detectado; a VPN não foi alterada."
    default:
      return "Limite do provider detectado; a VPN não foi alterada."
  }
}

function createV1Plugin() {
  return async ({ client, directory }) => {
    // The config directory can be shared with the host. Keep this integration
    // scoped to the VPN container; quota events only notify and cancel retries.
    if (process.env.VPN_WORKSPACE_CONTAINER !== "1") return {}

    const handled = new Set()
    const notify = async (message, variant = "info") => {
      try {
        await client.tui.showToast({
          body: { title: "OpenCode provider status", message, variant, duration: 8000 },
        })
      } catch {
        // Notification failures never start another request.
      }
    }
    const handle = async (sessionID, eventClass, cancelRetry) => {
      const key = `${sessionID}:${eventClass}`
      if (handled.has(key)) return
      handled.add(key)
      if (handled.size > 512) handled.delete(handled.values().next().value)

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
      await notify(messageFor(eventClass))
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
          if (eventClass) void handle(properties.sessionID, eventClass, true)
          return
        }

        if (event.type !== "session.error") return
        const error = properties.error
        if (!object(error) || error.name !== "APIError") return
        const eventClass = classifyV1Error(error)
        if (eventClass) void handle(properties.sessionID, eventClass, false)
      },
    }
  }
}

export const VpnRecovery = createV1Plugin()
