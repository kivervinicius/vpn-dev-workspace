const FALLBACK_PROVIDER_ID = "opencode"
const DEFAULT_MAX_MODELS_PER_TURN = 3

function priceValues(model) {
  const cost = model?.cost
  if (typeof cost === "number") return [cost]
  if (!cost || typeof cost !== "object") return []

  const prices = []
  if (Array.isArray(cost)) {
    for (const tier of cost) {
      if (!tier || typeof tier !== "object" || Array.isArray(tier)) return []
      if (Object.keys(tier).some((key) => !["input", "output", "cache", "tier"].includes(key))) return []
      if (typeof tier.input !== "number" || typeof tier.output !== "number") return []
      if (!tier.cache || typeof tier.cache !== "object" || Array.isArray(tier.cache)) return []
      if (Object.keys(tier.cache).some((key) => !["read", "write"].includes(key))) return []
      if (typeof tier.cache.read !== "number" || typeof tier.cache.write !== "number") return []
      prices.push(tier.input, tier.output, tier.cache.read, tier.cache.write)
    }
    return prices
  }

  if (Object.keys(cost).some((key) => !["input", "output", "cacheRead", "cacheWrite"].includes(key))) return []
  if (typeof cost.input !== "number" || typeof cost.output !== "number") return []
  if (typeof cost.cacheRead !== "number" || typeof cost.cacheWrite !== "number") return []
  prices.push(cost.input, cost.output, cost.cacheRead, cost.cacheWrite)
  return prices
}

export function isFreeModel(model) {
  if (!model || model.enabled === false || model.providerID !== FALLBACK_PROVIDER_ID) return false
  const prices = priceValues(model)
  if (prices.length === 0 || prices.some((price) => price !== 0)) return false
  return true
}

export function isEligibleFreeModel(model, { requiresImage = false, requiredInputs = [] } = {}) {
  if (!isFreeModel(model)) return false
  if (model.capabilities?.tools !== true) return false
  const inputs = new Set(requiredInputs)
  if (requiresImage) inputs.add("image")
  if ([...inputs].some((input) => !model.capabilities?.input?.includes(input))) return false
  return true
}

export function selectFallbackModel(catalog, state, { favorites = [], requiresImage = false, requiredInputs = [] } = {}) {
  if (!Array.isArray(catalog) || !state || state.modelsUsed.length >= DEFAULT_MAX_MODELS_PER_TURN) return undefined

  const favoriteOrder = new Map(favorites.map((id, index) => [id, index]))
  return catalog
    .filter((model) => isEligibleFreeModel(model, { requiresImage, requiredInputs }))
    .filter((model) => !state.modelsUsed.includes(`${model.providerID}/${model.id}`))
    .filter((model) => (state.blockedUntil[`${model.providerID}/${model.id}`] ?? 0) <= Date.now())
    .sort((left, right) => {
      const leftID = `${left.providerID}/${left.id}`
      const rightID = `${right.providerID}/${right.id}`
      const favoriteDifference = (favoriteOrder.get(leftID) ?? Number.MAX_SAFE_INTEGER)
        - (favoriteOrder.get(rightID) ?? Number.MAX_SAFE_INTEGER)
      return favoriteDifference || leftID.localeCompare(rightID)
    })[0]
}

export function createFallbackState(modelID, blockedUntil = {}) {
  return {
    blockedUntil,
    modelsUsed: modelID ? [modelID] : [],
    handledFailures: new Set(),
  }
}

export function recordFallback(state, modelID) {
  if (!state || typeof modelID !== "string" || state.modelsUsed.includes(modelID)) return false
  if (state.modelsUsed.length >= DEFAULT_MAX_MODELS_PER_TURN) return false
  state.modelsUsed.push(modelID)
  return true
}

export function blockModel(state, modelID, retryAfterSeconds, now = Date.now(), fallbackSeconds = 3600) {
  if (!state || typeof modelID !== "string") return undefined
  const durationSeconds = Number.isFinite(retryAfterSeconds) && retryAfterSeconds > 0
    ? Math.min(Math.trunc(retryAfterSeconds), 86_400)
    : Math.min(Math.max(1, Math.trunc(fallbackSeconds)), 86_400)
  const until = now + durationSeconds * 1000
  state.blockedUntil[modelID] = until
  return until
}

export function containsImagePayload(value, seen = new Set()) {
  if (typeof value === "string") return false
  if (!value || typeof value !== "object" || seen.has(value)) return false
  seen.add(value)
  if (Array.isArray(value)) return value.some((entry) => containsImagePayload(entry, seen))
  if (value.type === "image" || value.type === "file" && /^image\//.test(value.mime ?? value.mimeType ?? "")) return true
  return Object.values(value).some((entry) => containsImagePayload(entry, seen))
}

export function requiredModelInputs(value, required = new Set(), seen = new Set()) {
  if (typeof value === "string" || !value || typeof value !== "object" || seen.has(value)) return [...required]
  seen.add(value)
  if (Array.isArray(value)) {
    for (const entry of value) requiredModelInputs(entry, required, seen)
    return [...required]
  }

  const type = typeof value.type === "string" ? value.type.toLowerCase() : ""
  const mime = typeof (value.mime ?? value.mimeType) === "string" ? (value.mime ?? value.mimeType).toLowerCase() : ""
  if (type === "image" || type === "file" && mime.startsWith("image/")) required.add("image")
  else if (type === "video" || type === "file" && mime.startsWith("video/")) required.add("video")
  else if (["audio", "input_audio"].includes(type) || type === "file" && mime.startsWith("audio/")) required.add("audio")
  else if (type === "file") {
    if (mime === "application/pdf") required.add("pdf")
    else if (mime.startsWith("text/")) required.add("text")
    else required.add("unknown")
  }

  for (const entry of Object.values(value)) requiredModelInputs(entry, required, seen)
  return [...required]
}

export function maxFallbackModelsPerTurn() {
  return DEFAULT_MAX_MODELS_PER_TURN
}
