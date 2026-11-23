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

// O runtime OpenCode mapeia o erro do provider para tipos estáveis
// (packages/core/src/session/to-session-error.ts). A TUI só aciona recuperação
// de rede se o túnel estiver parado; o servidor troca modelo apenas em cota
// gratuita explicitamente identificada para aquele modelo.
const RUNTIME_ERROR_CLASSES = new Map([
  ["provider.free-limit", "free_tier_limit"],
  ["provider.rate-limit", "rate_limit"],
  ["provider.quota", "account_limit"],
  ["provider.auth", "auth_limit"],
])

function object(value) {
  return value !== null && typeof value === "object" && !Array.isArray(value)
}

function parseRetryAfter(value) {
  if (typeof value === "number" && Number.isFinite(value) && value > 0) {
    return Math.min(Math.trunc(value), 86_400)
  }
  if (typeof value === "string" && /^\d+$/.test(value.trim())) {
    return Math.min(Number.parseInt(value.trim(), 10), 86_400)
  }
  return undefined
}

// Localiza um header Retry-After numérico (segundos) no erro do provider.
// Format HTTP-date é ignorado de propósito: a janela de cota do Zen é longa e
// um parse errado seria pior do que nenhum countdown.
export function extractRetryAfterSeconds(error) {
  if (!object(error)) return undefined
  const pending = [error]
  const seen = new Set()
  while (pending.length) {
    const current = pending.pop()
    if (!object(current) || seen.has(current)) continue
    seen.add(current)
    // O runtime entrega o Retry-After em milissegundos no topo do SessionError
    // (packages/core/src/route/executor.js -> providerError()). Sem esta leitura
    // o cooldown de cota nunca é aplicado e a rotação vira tempestade.
    const millis = current.retryAfterMs
    if (typeof millis === "number" && Number.isFinite(millis) && millis > 0) {
      return Math.min(Math.trunc(millis / 1000), 86_400)
    }
    for (const key of ["retryAfter", "retry_after"]) {
      const parsed = parseRetryAfter(current[key])
      if (parsed !== undefined) return parsed
    }
    for (const key of ["headers", "responseHeaders"]) {
      const child = current[key]
      if (!object(child)) continue
      const parsed = parseRetryAfter(child["retry-after"] ?? child["Retry-After"])
      if (parsed !== undefined) return parsed
    }
    for (const [key, child] of Object.entries(current)) {
      if (key === "body" || key === "responseBody") continue
      if (object(child)) pending.push(child)
    }
  }
  return undefined
}

export function hasHttp429(error) {
  if (!object(error)) return false
  const pending = [error]
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

export function classifyV2Error(error) {
  if (!object(error)) return undefined
  const runtimeClass = RUNTIME_ERROR_CLASSES.get(error.type)
  if (runtimeClass) return runtimeClass
  const pending = [error]
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
      if (key === "body" || key === "responseBody") {
        if (object(child)) pending.push(child)
        else if (typeof child === "string") {
          try {
            const parsed = JSON.parse(child)
            if (object(parsed)) pending.push(parsed)
          } catch {
            // Arbitrary provider prose is intentionally not interpreted.
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
