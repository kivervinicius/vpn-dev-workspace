import { classifyV2Error, extractRetryAfterSeconds } from "./classify.js"
import {
  blockModel,
  createFallbackState,
  isFreeModel,
  recordFallback,
  requiredModelInputs,
  selectFallbackModel,
} from "./model-fallback.js"

function modelKey(model) {
  if (typeof model?.providerID !== "string" || typeof model?.id !== "string") return undefined
  return `${model.providerID}/${model.id}`
}

function findCatalogModel(models, modelID) {
  if (!Array.isArray(models) || typeof modelID !== "string") return undefined
  return models.find((model) => `${model?.providerID}/${model?.id}` === modelID)
}

function favoritesFromEnvironment() {
  return (process.env.OPENCODE_MODEL_FALLBACK_FAVORITES ?? "")
    .split(",")
    .map((model) => model.trim())
    .filter(Boolean)
}

function retryDecision(retry) {
  return retry ? { retry: true, delay: 0 } : { retry: false }
}

function unknownCooldownSeconds() {
  const configured = Number(process.env.OPENCODE_MODEL_FALLBACK_UNKNOWN_COOLDOWN_SECONDS ?? 3600)
  return Number.isFinite(configured) && configured > 0 ? Math.min(Math.trunc(configured), 86_400) : 3600
}

export async function setupServerPlugin(ctx) {
  if (process.env.VPN_WORKSPACE_CONTAINER !== "1") return () => {}

  const sessions = new Map()
  const blockedUntil = {}
  const stopExecutionEvents = new AbortController()
  const eventTask = (async () => {
    if (!ctx.event?.subscribe) return
    try {
      for await (const event of ctx.event.subscribe({ signal: stopExecutionEvents.signal })) {
        if (event.type === "session.execution.started" && event.properties?.sessionID) {
          sessions.delete(event.properties.sessionID)
        } else if (["session.execution.succeeded", "session.execution.failed", "session.execution.interrupted"].includes(event.type)) {
          sessions.delete(event.properties?.sessionID)
        }
      }
    } catch {
      if (!stopExecutionEvents.signal.aborted) return
    }
  })()

  const retryRegistration = await ctx.session.hook("retry", async (event) => {
    const eventClass = classifyV2Error(event?.error)
    if (!eventClass) return
    if (eventClass !== "free_tier_limit" || process.env.OPENCODE_MODEL_FALLBACK_ENABLED === "0") {
      event.decision = retryDecision(false)
      return
    }

    const sessionID = event.sessionID
    const currentKey = modelKey(event.model)
    if (typeof sessionID !== "string" || !currentKey) {
      event.decision = retryDecision(false)
      return
    }

    let state = sessions.get(sessionID)
    if (!state) {
      state = createFallbackState(currentKey, blockedUntil)
      sessions.set(sessionID, state)
    }
    const failureKey = `${currentKey}:${event.attempt}`
    if (state.handledFailures.has(failureKey)) {
      event.decision = retryDecision(false)
      return
    }
    if (state.pending) {
      event.decision = retryDecision(false)
      return
    }
    state.handledFailures.add(failureKey)
    state.pending = true

    try {
      const context = await ctx.session.context({ sessionID })
      const catalog = await ctx.model.list()
      const models = catalog?.data ?? catalog
      // Free -> free: a origem também precisa ser um modelo gratuito conhecido.
      // Origem paga, de custo desconhecido ou ausente do catálogo não troca.
      const originModel = findCatalogModel(models, currentKey) ?? event.model
      if (!isFreeModel(originModel)) {
        event.decision = retryDecision(false)
        return
      }
      blockModel(state, currentKey, extractRetryAfterSeconds(event.error), Date.now(), unknownCooldownSeconds())
      const candidate = selectFallbackModel(models, state, {
        favorites: favoritesFromEnvironment(),
        requiredInputs: requiredModelInputs(context),
      })
      const candidateKey = modelKey(candidate)
      if (!candidate || !candidateKey || !recordFallback(state, candidateKey)) {
        event.decision = retryDecision(false)
        return
      }

      await ctx.session.switchModel({ sessionID, model: { providerID: candidate.providerID, id: candidate.id } })
      state.pendingModel = { providerID: candidate.providerID, id: candidate.id }
      state.pendingFromModel = currentKey
      event.decision = retryDecision(true)
    } catch {
      event.decision = retryDecision(false)
    } finally {
      state.pending = false
    }
  })
  const modelRegistration = await ctx.session.hook("experimental.model.resolve", (event) => {
    if (event.kind !== "primary") return
    const state = sessions.get(event.sessionID)
    const candidate = state?.pendingModel
    if (!candidate) return
    const resolvedKey = modelKey(event.model)
    const pendingKey = modelKey(candidate)
    if (resolvedKey !== state.pendingFromModel && resolvedKey !== pendingKey) {
      state.pendingModel = undefined
      state.pendingFromModel = undefined
      return
    }
    event.model = candidate
    state.pendingModel = undefined
    state.pendingFromModel = undefined
  })

  return () => {
    stopExecutionEvents.abort()
    void eventTask
    for (const registration of [retryRegistration, modelRegistration]) {
      if (typeof registration === "function") registration()
      else registration?.dispose?.()
    }
  }
}
