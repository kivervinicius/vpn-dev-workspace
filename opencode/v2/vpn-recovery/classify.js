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

function object(value) {
  return value !== null && typeof value === "object" && !Array.isArray(value)
}

export function classifyV2Error(error) {
  if (!object(error)) return undefined
  if (error.type === "provider.free-limit") return "free_tier_limit"
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
