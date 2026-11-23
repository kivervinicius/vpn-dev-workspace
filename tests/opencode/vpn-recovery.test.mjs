import test from "node:test"
import assert from "node:assert/strict"
import { mkdtempSync, writeFileSync, readFileSync, existsSync } from "node:fs"
import { tmpdir } from "node:os"
import { join } from "node:path"
import { VpnRecovery as createV1Plugin } from "../../opencode/v1/vpn-recovery.js"
import { setupServerPlugin } from "../../opencode/v2/vpn-recovery/server-core.js"
import { blockModel, containsImagePayload, createFallbackState, isEligibleFreeModel, isFreeModel, recordFallback, requiredModelInputs, selectFallbackModel } from "../../opencode/v2/vpn-recovery/model-fallback.js"
import { classifyV2Error, extractRetryAfterSeconds, hasHttp429 } from "../../opencode/v2/vpn-recovery/classify.js"
import { decideAction, ACTION_NOTIFY, QUOTA_CLASSES } from "../../opencode/v2/vpn-recovery/policy.js"
import { setupTuiPlugin } from "../../opencode/v2/vpn-recovery/tui-core.js"

const previousContainerValue = process.env.VPN_WORKSPACE_CONTAINER
const previousTtlValue = process.env.OPENCODE_QUOTA_NOTIFY_TTL_SECONDS
process.env.VPN_WORKSPACE_CONTAINER = "1"
delete process.env.OPENCODE_QUOTA_NOTIFY_TTL_SECONDS
test.after(() => {
  if (previousContainerValue === undefined) delete process.env.VPN_WORKSPACE_CONTAINER
  else process.env.VPN_WORKSPACE_CONTAINER = previousContainerValue
  if (previousTtlValue === undefined) delete process.env.OPENCODE_QUOTA_NOTIFY_TTL_SECONDS
  else process.env.OPENCODE_QUOTA_NOTIFY_TTL_SECONDS = previousTtlValue
})

async function until(predicate, timeout = 2000) {
  const deadline = Date.now() + timeout
  while (Date.now() < deadline) {
    if (predicate()) return
    await new Promise((resolve) => setTimeout(resolve, 5))
  }
  throw new Error("condition not reached")
}

function fakeNetworkRecovery(result = { status: "healthy", reason: "tunnel_healthy" }) {
  const directory = mkdtempSync(join(tmpdir(), "network-recovery-"))
  const log = join(directory, "calls.log")
  const bin = join(directory, "opencode-network-recover")
  writeFileSync(bin, `#!/usr/bin/env bash\nprintf '%s\\n' "$*" >> "${log}"\nprintf '%s\\n' "$OPENCODE_NETWORK_RECOVERY_RESULT"\n`, { mode: 0o755 })
  const previousBin = process.env.OPENCODE_NETWORK_RECOVER_BIN
  const previousResult = process.env.OPENCODE_NETWORK_RECOVERY_RESULT
  process.env.OPENCODE_NETWORK_RECOVER_BIN = bin
  process.env.OPENCODE_NETWORK_RECOVERY_RESULT = JSON.stringify(result)
  return {
    calls: () => (existsSync(log) ? readFileSync(log, "utf8").trim().split("\n").filter(Boolean) : []),
    restore: () => {
      if (previousBin === undefined) delete process.env.OPENCODE_NETWORK_RECOVER_BIN
      else process.env.OPENCODE_NETWORK_RECOVER_BIN = previousBin
      if (previousResult === undefined) delete process.env.OPENCODE_NETWORK_RECOVERY_RESULT
      else process.env.OPENCODE_NETWORK_RECOVERY_RESULT = previousResult
    },
  }
}

const PROVIDER_ERRORS = [
  { type: "provider.free-limit", expected: "free_tier_limit" },
  { type: "provider.rate-limit", expected: "rate_limit" },
  { type: "provider.quota", expected: "account_limit" },
  { type: "provider.auth", expected: "auth_limit" },
  { data: { code: "CreditLimitExceeded" }, expected: "credit_limit" },
]

test("plugins do not register outside the VPN container", async () => {
  const previous = process.env.VPN_WORKSPACE_CONTAINER
  delete process.env.VPN_WORKSPACE_CONTAINER
  try {
    assert.deepEqual(await createV1Plugin({ client: {}, directory: "/work" }), {})
    let registrations = 0
    const disposeServer = await setupServerPlugin({
      get session() { registrations++; throw new Error("unexpected server registration") },
    })
    const disposeTui = setupTuiPlugin({
      get data() { registrations++; throw new Error("unexpected TUI registration") },
    })
    disposeServer()
    disposeTui()
    assert.equal(registrations, 0)
  } finally {
    if (previous === undefined) delete process.env.VPN_WORKSPACE_CONTAINER
    else process.env.VPN_WORKSPACE_CONTAINER = previous
  }
})

test("v1 cancels provider retries, checks the tunnel, and never replays a turn", async () => {
  const toasts = []
  const aborts = []
  let promptCalls = 0
  const helper = fakeNetworkRecovery()
  try {
    const plugin = await createV1Plugin({
      client: {
        session: {
          abort: async (args) => { aborts.push(args); return { data: true } },
          promptAsync: async () => { promptCalls++ },
        },
        tui: { showToast: async (toast) => toasts.push(toast) },
      },
      directory: "/work",
    })

    const event = {
      event: {
        type: "session.status",
        properties: { sessionID: "s-free", status: { type: "retry", action: { reason: "free_tier_limit" } } },
      },
    }
    plugin.event(event)
    plugin.event(event)
    await until(() => helper.calls().length === 1 && toasts.length === 2)
    assert.equal(aborts.length, 1)
    assert.equal(aborts[0].path.id, "s-free")
    assert.match(toasts[0].body.message, /verificando o túnel VPN/)
    assert.match(toasts[1].body.message, /Túnel VPN confirmado saudável/)
    assert.doesNotMatch(toasts[0].body.message, /rotação|troca de IP/)
    assert.doesNotMatch(helper.calls()[0], /--force-restart/)
    assert.equal(promptCalls, 0)

    helper.restore()
  } finally {
    helper.restore()
  }
})

test("v1 reports a confirmed tunnel reconnect and its resulting IP", async () => {
  const toasts = []
  const helper = fakeNetworkRecovery({ status: "reconnected", reason: "http_429_tunnel_restarted", ip: "203.0.113.7" })
  try {
    const plugin = await createV1Plugin({
      client: {
        session: { abort: async () => ({ data: true }) },
        tui: { showToast: async (toast) => toasts.push(toast) },
      },
      directory: "/work",
    })
    plugin.event({ event: { type: "session.error", properties: { sessionID: "s-rate", error: { name: "APIError", data: { statusCode: 429, code: "GoUsageLimitError" } } } } })
    await until(() => toasts.length === 2)
    assert.match(toasts[1].body.message, /IP atual: 203\.0\.113\.7/)
    assert.match(toasts[1].body.message, /HTTP 429 recebido; túnel VPN reiniciado/)
    assert.match(helper.calls()[0], /--event account_limit.*--force-restart/)
    assert.match(toasts[1].body.message, /limite do provider pode continuar ativo/)
  } finally {
    helper.restore()
  }
})

test("v1 restarts the VPN on HTTP 429 even when its first toast fails", async () => {
  const helper = fakeNetworkRecovery({ status: "reconnected", reason: "http_429_tunnel_restarted" })
  try {
    const plugin = await createV1Plugin({
      client: {
        tui: { showToast: async () => { throw new Error("TUI unavailable") } },
      },
      directory: "/work",
    })
    plugin.event({ event: { type: "session.error", properties: { sessionID: "s-v1-429-toast-failed", error: { name: "APIError", data: { statusCode: 429 } } } } })
    await until(() => helper.calls().length === 1)
    assert.match(helper.calls()[0], /--event rate_limit.*--force-restart/)
  } finally {
    helper.restore()
  }
})

test("v1 ignores provider prose and only handles structured terminal errors", async () => {
  const toasts = []
  const helper = fakeNetworkRecovery()
  try {
    const plugin = await createV1Plugin({
      client: {
        session: { abort: async () => ({ data: true }) },
        tui: { showToast: async (toast) => toasts.push(toast) },
      },
      directory: "/work",
    })
    plugin.event({ event: { type: "session.error", properties: { sessionID: "prose", error: { name: "APIError", data: { responseBody: '{"message":"free tier rate limit"}' } } } } })
    plugin.event({ event: { type: "session.error", properties: { sessionID: "structured", error: { name: "APIError", data: { statusCode: 429 } } } } })
    await until(() => helper.calls().length === 1 && toasts.length === 2)
    assert.match(toasts[0].body.message, /Limite de requisições/)
  } finally {
    helper.restore()
  }
})

test("v1 deduplicates the same session and provider event for its TTL", async () => {
  const toasts = []
  const helper = fakeNetworkRecovery()
  try {
    const plugin = await createV1Plugin({
      client: {
        session: { abort: async () => ({ data: true }) },
        tui: { showToast: async (toast) => toasts.push(toast) },
      },
      directory: "/work",
    })
    const event = { event: { type: "session.error", properties: { sessionID: "s1", error: { name: "APIError", data: { statusCode: 429 } } } } }
    plugin.event(event)
    plugin.event(event)
    await until(() => helper.calls().length === 1 && toasts.length === 2)
    assert.equal(helper.calls().length, 1)
  } finally {
    helper.restore()
  }
})

test("v2 server hook tries up to three dynamically catalogued free models in the same session", async () => {
  const handlers = new Map()
  const switches = []
  let disposeCalls = 0
  const models = [
    { providerID: "opencode", id: "original-free", cost: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0 }, capabilities: { tools: true, input: ["text"] } },
    { providerID: "opencode", id: "second-free", cost: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0 }, capabilities: { tools: true, input: ["text"] } },
    { providerID: "opencode", id: "third-free", cost: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0 }, capabilities: { tools: true, input: ["text"] } },
    { providerID: "opencode", id: "zz-fourth-free", cost: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0 }, capabilities: { tools: true, input: ["text"] } },
    { providerID: "opencode", id: "paid", cost: { input: 0.1, output: 0.2, cacheRead: 0, cacheWrite: 0 }, capabilities: { tools: true, input: ["text"] } },
    { providerID: "other", id: "free", cost: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0 }, capabilities: { tools: true, input: ["text"] } },
  ]
  const dispose = await setupServerPlugin({
    session: { hook: async (name, callback) => {
      handlers.set(name, callback)
      return () => { disposeCalls++ }
    }, context: async () => [{ role: "user", content: [{ type: "text", text: "change the code" }] }], switchModel: async (args) => switches.push(args) },
    model: { list: async () => models },
    event: { subscribe: async function* () {} },
  })
  const event = (model, attempt, sessionID = "session-one") => ({
    sessionID,
    model: { providerID: "opencode", id: model },
    attempt,
    error: { type: "provider.free-limit", retryAfterMs: 60_000 },
  })
  const first = event("original-free", 1)
  const firstHandling = handlers.get("retry")(first)
  const duplicate = event("original-free", 1)
  await handlers.get("retry")(duplicate)
  assert.deepEqual(duplicate.decision, { retry: false })
  await firstHandling
  assert.deepEqual(first.decision, { retry: true, delay: 0 })
  const firstResolution = { sessionID: "session-one", kind: "primary", model: { providerID: "opencode", id: "original-free" } }
  handlers.get("experimental.model.resolve")(firstResolution)
  assert.deepEqual(firstResolution.model, { providerID: "opencode", id: "second-free" })
  const second = event("second-free", 2)
  await handlers.get("retry")(second)
  assert.deepEqual(second.decision, { retry: true, delay: 0 })
  const secondResolution = { sessionID: "session-one", kind: "primary", model: { providerID: "opencode", id: "second-free" } }
  handlers.get("experimental.model.resolve")(secondResolution)
  assert.deepEqual(secondResolution.model, { providerID: "opencode", id: "third-free" })
  const third = event("third-free", 3)
  await handlers.get("retry")(third)
  assert.deepEqual(third.decision, { retry: false })
  assert.deepEqual(switches, [
    { sessionID: "session-one", model: { providerID: "opencode", id: "second-free" } },
    { sessionID: "session-one", model: { providerID: "opencode", id: "third-free" } },
  ])
  const manualSessionEvent = event("original-free", 1, "session-two")
  await handlers.get("retry")(manualSessionEvent)
  assert.deepEqual(manualSessionEvent.decision, { retry: true, delay: 0 })
  assert.deepEqual(switches.at(-1), { sessionID: "session-two", model: { providerID: "opencode", id: "zz-fourth-free" } })
  const manualResolution = { sessionID: "session-two", kind: "primary", model: { providerID: "opencode", id: "manual-choice" } }
  handlers.get("experimental.model.resolve")(manualResolution)
  assert.equal(manualResolution.model.id, "manual-choice")

  for (const { expected, ...providerError } of PROVIDER_ERRORS.slice(1)) {
    const event = { error: providerError }
    await handlers.get("retry")(event)
    assert.deepEqual(event.decision, { retry: false })
  }
  const unrelated = { error: { type: "provider.network" } }
  await handlers.get("retry")(unrelated)
  assert.equal(unrelated.decision, undefined)
  dispose()
  assert.equal(disposeCalls, 2)
})

test("v2 server hook refuses to switch when the current model is paid or has unknown cost", async () => {
  const handlers = new Map()
  const switches = []
  const models = [
    { providerID: "opencode", id: "paid-origin", cost: { input: 0.1, output: 0.2, cacheRead: 0, cacheWrite: 0 }, capabilities: { tools: true, input: ["text"] } },
    { providerID: "opencode", id: "unknown-cost-origin", cost: { input: "0", output: 0 }, capabilities: { tools: true, input: ["text"] } },
    { providerID: "opencode", id: "free", cost: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0 }, capabilities: { tools: true, input: ["text"] } },
  ]
  const dispose = await setupServerPlugin({
    session: { hook: async (name, callback) => {
      handlers.set(name, callback)
      return () => {}
    }, context: async () => [{ role: "user", content: [{ type: "text", text: "change the code" }] }], switchModel: async (args) => switches.push(args) },
    model: { list: async () => models },
    event: { subscribe: async function* () {} },
  })
  for (const id of ["paid-origin", "unknown-cost-origin"]) {
    const event = { sessionID: `session-${id}`, model: { providerID: "opencode", id }, attempt: 1, error: { type: "provider.free-limit", retryAfterMs: 60_000 } }
    await handlers.get("retry")(event)
    assert.deepEqual(event.decision, { retry: false })
  }
  assert.deepEqual(switches, [])
  dispose()
})

test("paid favorites never enter the free fallback catalog", () => {
  const paid = { providerID: "opencode", id: "paid", cost: { input: 1, output: 1, cacheRead: 0, cacheWrite: 0 }, capabilities: { tools: true, input: ["text"] } }
  const free = { providerID: "opencode", id: "free", cost: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0 }, capabilities: { tools: true, input: ["text"] } }
  const state = createFallbackState("opencode/current")
  const chosen = selectFallbackModel([paid, free], state, { favorites: ["opencode/paid"] })
  assert.equal(chosen.id, "free")
  const onlyPaid = selectFallbackModel([paid], createFallbackState("opencode/current"), { favorites: ["opencode/paid"] })
  assert.equal(onlyPaid, undefined)
})

test("v2 TUI reports exhausted model quota and only recovers an unhealthy tunnel", async () => {
  const listeners = new Map()
  let unsubscribeCalls = 0
  const toasts = []
  const helper = fakeNetworkRecovery()
  try {
    const dispose = setupTuiPlugin({
      data: { on: (name, callback) => {
        listeners.set(name, callback)
        return () => { unsubscribeCalls++ }
      } },
      ui: { model: { current: () => undefined }, toast: { show: async (toast) => toasts.push(toast) } },
    })

    const free = { data: { sessionID: "s-free", error: { type: "provider.free-limit", retryAfterMs: 24_613_000 } } }
    await listeners.get("session.execution.failed")(free)
    await listeners.get("session.execution.failed")(free)
    assert.equal(toasts.length, 1)
    assert.match(toasts[0].message, /~6h50m/)
    assert.match(toasts[0].message, /execução não foi concluída/)
    assert.doesNotMatch(toasts[0].message, /rotação|troca de IP/)
    for (const { ...error } of PROVIDER_ERRORS.slice(1)) await listeners.get("session.execution.failed")({ data: { sessionID: JSON.stringify(error), error } })
    await until(() => helper.calls().length === PROVIDER_ERRORS.length && toasts.length === PROVIDER_ERRORS.length * 2)
    assert.ok(toasts.every((toast) => toast.variant === "info"))
    for (const { expected } of PROVIDER_ERRORS) {
      assert.ok(helper.calls().some((call) => call.includes(`--event ${expected}`)))
    }
    assert.ok(helper.calls().every((call) => !call.includes("--force-restart")))

    await listeners.get("session.execution.failed")({ data: { sessionID: "s429-account", error: { type: "provider.quota", statusCode: 429 } } })
    await until(() => helper.calls().length === PROVIDER_ERRORS.length + 1)
    assert.ok(helper.calls().some((call) => call.includes("--event account_limit") && !call.includes("--force-restart")))
    dispose()
    assert.equal(unsubscribeCalls, 3)
  } finally {
    helper.restore()
  }
})

test("v2 does not start a diagnostic when the provider notification fails", async () => {
  let listener
  const helper = fakeNetworkRecovery()
  try {
    setupTuiPlugin({
      data: { on: (_, callback) => { listener = callback }, location: { model: { list: () => [] } } },
      ui: { model: { current: () => undefined }, toast: { show: async () => { throw new Error("TUI unavailable") } } },
    })
    await listener({ data: { sessionID: "s1", error: { type: "provider.quota" } } })
    await new Promise((resolve) => setTimeout(resolve, 100))
    assert.equal(helper.calls().length, 0)
  } finally {
    helper.restore()
  }
})

test("v2 does not force a VPN restart for provider HTTP 429", async () => {
  const listeners = new Map()
  const toasts = []
  const helper = fakeNetworkRecovery({
    status: "reconnected",
    reason: "http_429_tunnel_restarted",
    ip: "198.51.100.9",
  })
  try {
    setupTuiPlugin({
      data: { on: (name, callback) => { listeners.set(name, callback) } },
      ui: { model: { current: () => undefined }, toast: { show: async (toast) => toasts.push(toast) } },
    })
    await listeners.get("session.execution.failed")({ data: { sessionID: "s-http-429", error: { type: "provider.rate-limit" } } })
    await until(() => helper.calls().length === 1)
    assert.doesNotMatch(helper.calls()[0], /--force-restart/)
    assert.doesNotMatch(toasts[0].message, /túnel VPN reiniciado/)
  } finally {
    helper.restore()
  }
})

test("v2 does not start network recovery on HTTP 429 when its notification fails", async () => {
  let listener
  const helper = fakeNetworkRecovery({ status: "reconnected", reason: "http_429_tunnel_restarted" })
  try {
    setupTuiPlugin({
      data: { on: (_, callback) => { listener = callback }, location: { model: { list: () => [] } } },
      ui: { model: { current: () => undefined }, toast: { show: async () => { throw new Error("TUI unavailable") } } },
    })
    await listener({ data: { sessionID: "s-http-429-toast-failed", error: { type: "provider.rate-limit" } } })
    await new Promise((resolve) => setTimeout(resolve, 100))
    assert.equal(helper.calls().length, 0)
  } finally {
    helper.restore()
  }
})

test("v1 emits exactly one failure toast when the helper cannot spawn", async () => {
  const toasts = []
  const previousBin = process.env.OPENCODE_NETWORK_RECOVER_BIN
  process.env.OPENCODE_NETWORK_RECOVER_BIN = "/nonexistent-vpn-helper-xyz"
  try {
    const plugin = await createV1Plugin({
      client: { tui: { showToast: async (toast) => { toasts.push(toast) } } },
      directory: "/work",
    })
    plugin.event({ event: { type: "session.error", properties: { sessionID: "s-v1-spawn-fail", error: { name: "APIError", data: { statusCode: 429 } } } } })
    await until(() => toasts.length >= 2)
    await new Promise((resolve) => setTimeout(resolve, 150))
    // error+close disparam juntos em spawn falho: sem trava, vinha um 3º toast.
    assert.equal(toasts.length, 2)
    assert.match(toasts[1].body.message, /Não foi possível confirmar ou reconectar/)
  } finally {
    if (previousBin === undefined) delete process.env.OPENCODE_NETWORK_RECOVER_BIN
    else process.env.OPENCODE_NETWORK_RECOVER_BIN = previousBin
  }
})

test("v2 emits exactly one failure toast when the helper cannot spawn", async () => {
  let listener
  const toasts = []
  const previousBin = process.env.OPENCODE_NETWORK_RECOVER_BIN
  process.env.OPENCODE_NETWORK_RECOVER_BIN = "/nonexistent-vpn-helper-xyz"
  try {
    setupTuiPlugin({
      data: { on: (_, callback) => { listener = callback } },
      ui: { toast: { show: async (toast) => { toasts.push(toast) } } },
    })
    await listener({ data: { sessionID: "s-v2-spawn-fail", error: { type: "provider.rate-limit" } } })
    await until(() => toasts.length >= 2)
    await new Promise((resolve) => setTimeout(resolve, 150))
    assert.equal(toasts.length, 2)
    assert.match(toasts[1].message, /Não foi possível verificar ou reconectar/)
  } finally {
    if (previousBin === undefined) delete process.env.OPENCODE_NETWORK_RECOVER_BIN
    else process.env.OPENCODE_NETWORK_RECOVER_BIN = previousBin
  }
})

test("classifiers recognize structured provider classes and ignore prose", () => {
  assert.equal(classifyV2Error({ type: "provider.free-limit" }), "free_tier_limit")
  assert.equal(classifyV2Error({ type: "provider.rate-limit" }), "rate_limit")
  assert.equal(classifyV2Error({ type: "provider.quota" }), "account_limit")
  assert.equal(classifyV2Error({ type: "provider.auth" }), "auth_limit")
  assert.equal(classifyV2Error({ data: { code: "GoUsageLimitError" } }), "account_limit")
  assert.equal(classifyV2Error({ data: { error: { type: "InsufficientFunds" } } }), "credit_limit")
  assert.equal(classifyV2Error({ data: { responseBody: '{"error":{"type":"FreeUsageLimitError"}}' } }), "free_tier_limit")
  assert.equal(classifyV2Error({ statusCode: 402 }), "credit_limit")
  assert.equal(classifyV2Error({ statusCode: 429 }), "rate_limit")
  assert.equal(hasHttp429({ response: { status: 429 } }), true)
  assert.equal(hasHttp429({ responseBody: '{"statusCode":429}' }), true)
  assert.equal(hasHttp429({ message: "provider returned 429" }), false)
  assert.equal(classifyV2Error({ message: "FreeUsageLimitError" }), undefined)
})

test("Retry-After extraction handles runtime milliseconds and numeric headers", () => {
  assert.equal(extractRetryAfterSeconds({ retryAfterMs: 24_613_000 }), 24613)
  assert.equal(extractRetryAfterSeconds({ headers: { "Retry-After": "24613" } }), 24613)
  assert.equal(extractRetryAfterSeconds({ responseHeaders: { "retry-after": 30 } }), 30)
  assert.equal(extractRetryAfterSeconds({ data: { retryAfter: 90 } }), 90)
  assert.equal(extractRetryAfterSeconds({ headers: { "Retry-After": "Wed, 21 Oct 2026 07:28:00 GMT" } }), undefined)
  assert.equal(extractRetryAfterSeconds({ headers: {} }), undefined)
})

test("provider policy never forces VPN restarts for quota or HTTP 429", () => {
  for (const eventClass of QUOTA_CLASSES) {
    assert.deepEqual(decideAction({ eventClass }), {
      action: ACTION_NOTIFY,
      recoverStoppedTunnel: true,
      reason: "provider_limit_diagnosis",
    })
  }
  assert.deepEqual(decideAction({ eventClass: "account_limit" }), {
    action: ACTION_NOTIFY,
    recoverStoppedTunnel: true,
    reason: "provider_limit_diagnosis",
  })
  assert.deepEqual(decideAction({ eventClass: undefined }), {
    action: ACTION_NOTIFY,
    recoverStoppedTunnel: false,
    reason: "unclassified",
  })
})

test("v2 TUI suggests available alternatives and gives a manual command on catalog failure", async () => {
  let listener
  const toasts = []
  const helper = fakeNetworkRecovery()
  const current = { providerID: "local", id: "current" }
  const alternate = { providerID: "local", modelID: "alternate", id: "local/alternate" }
  let unavailable = false
  try {
    setupTuiPlugin({
      location: "test-location",
      data: {
        on: (_, callback) => { listener = callback },
        location: { model: { list: (location) => {
          assert.equal(location, "test-location")
          if (unavailable) throw new Error("catalog unavailable")
          return [current, alternate]
        } } },
      },
      ui: { toast: { show: async (toast) => toasts.push(toast) } },
    })
    await listener({ data: { sessionID: "s-model", model: current, error: { type: "provider.rate-limit" } } })
    assert.match(toasts[0].message, /local\/alternate/)
    unavailable = true
    await listener({ data: { sessionID: "s-model-2", model: current, error: { type: "provider.rate-limit" } } })
    assert.match(toasts[1].message, /opencode2 models/)
  } finally {
    helper.restore()
  }
})

test("free fallback catalog rejects paid, disabled, tool-less, and image-incompatible models", () => {
  const model = (id, overrides = {}) => ({
    providerID: "opencode",
    id,
    cost: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0 },
    capabilities: { tools: true, input: ["text"] },
    ...overrides,
  })
  assert.equal(isEligibleFreeModel(model("free")), true)
  assert.equal(isEligibleFreeModel(model("free-tiers", { cost: [{ input: 0, output: 0, cache: { read: 0, write: 0 } }, { tier: { type: "context", size: 128_000 }, input: 0, output: 0, cache: { read: 0, write: 0 } }] })), true)
  assert.equal(isEligibleFreeModel(model("paid-tier", { cost: [{ input: 0, output: 0, cache: { read: 0, write: 0 } }, { input: 0, output: 0.01, cache: { read: 0, write: 0 } }] })), false)
  assert.equal(isEligibleFreeModel(model("unknown-cost", { cost: [{ input: "0", output: 0, cache: { read: 0, write: 0 } }] })), false)
  assert.equal(isEligibleFreeModel(model("unknown-price-scope", { cost: [{ input: 0, output: 0, cache: { read: 0, write: 0 }, requests: 0.01 }] })), false)
  assert.equal(isEligibleFreeModel(model("paid", { cost: { input: 0, output: 1 } })), false)
  assert.equal(isEligibleFreeModel(model("disabled", { enabled: false })), false)
  assert.equal(isEligibleFreeModel(model("no-tools", { capabilities: { tools: false, input: ["text"] } })), false)
  assert.equal(isEligibleFreeModel(model("text-only"), { requiresImage: true }), false)
  assert.equal(isEligibleFreeModel(model("pdf-only-text"), { requiredInputs: ["pdf"] }), false)
  assert.deepEqual(requiredModelInputs([{ type: "file", mime: "image/png" }, { type: "file", mimeType: "application/pdf" }]).sort(), ["image", "pdf"])
  assert.deepEqual(requiredModelInputs([{ type: "audio" }, { type: "video" }]).sort(), ["audio", "video"])
  assert.deepEqual(requiredModelInputs([{ type: "file", name: "unknown.bin" }]), ["unknown"])
  assert.equal(isEligibleFreeModel(model("wrong-provider", { providerID: "local" })), false)
  assert.equal(isFreeModel(model("free")), true)
  assert.equal(isFreeModel(model("paid", { cost: { input: 0.1, output: 0.2, cacheRead: 0, cacheWrite: 0 } })), false)
  assert.equal(isFreeModel(model("unknown-cost", { cost: [{ input: "0", output: 0, cache: { read: 0, write: 0 } }] })), false)
  assert.equal(isFreeModel(model("no-cost", { cost: undefined })), false)
  assert.equal(isFreeModel(model("disabled", { enabled: false })), false)
  assert.equal(isFreeModel(model("wrong-provider", { providerID: "local" })), false)
  assert.equal(isFreeModel(undefined), false)

  const state = createFallbackState("opencode/current")
  state.blockedUntil["opencode/blocked"] = Date.now() + 60_000
  const chosen = selectFallbackModel([model("blocked"), model("b"), model("a")], state)
  assert.equal(chosen.id, "a")
  assert.equal(recordFallback(state, "opencode/a"), true)
  assert.equal(recordFallback(state, "opencode/a"), false)
  recordFallback(state, "opencode/b")
  assert.equal(selectFallbackModel([model("c")], state), undefined)
  const cooldown = blockModel(state, "opencode/current", 30, 1_000)
  assert.equal(cooldown, 31_000)
  assert.equal(containsImagePayload([{ role: "user", content: [{ type: "image", url: "data:image/png" }] }]), true)
})

test("v2 TUI announces a successful retry on a changed model", async () => {
  const listeners = new Map()
  const toasts = []
  let selected = { providerID: "opencode", id: "first-free" }
  const dispose = setupTuiPlugin({
    data: { on: (name, callback) => { listeners.set(name, callback); return () => {} } },
    ui: { model: { current: () => selected }, toast: { show: async (toast) => toasts.push(toast) } },
  })
  await listeners.get("session.execution.started")({ data: { sessionID: "s-fallback" } })
  selected = { providerID: "opencode", id: "second-free" }
  await listeners.get("session.execution.succeeded")({ data: { sessionID: "s-fallback" } })
  assert.equal(toasts.length, 1)
  assert.match(toasts[0].message, /first-free.*second-free/)
  assert.equal(toasts[0].variant, "success")
  dispose()
})
