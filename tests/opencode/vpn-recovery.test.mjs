import test from "node:test"
import assert from "node:assert/strict"
import { VpnRecovery as createV1Plugin } from "../../opencode/v1/vpn-recovery.js"
import { setupServerPlugin } from "../../opencode/v2/vpn-recovery/server-core.js"
import { classifyV2Error, extractRetryAfterSeconds } from "../../opencode/v2/vpn-recovery/classify.js"
import { decideAction, ACTION_NOTIFY } from "../../opencode/v2/vpn-recovery/policy.js"
import { setupTuiPlugin } from "../../opencode/v2/vpn-recovery/tui-core.js"

const previousContainerValue = process.env.VPN_WORKSPACE_CONTAINER
process.env.VPN_WORKSPACE_CONTAINER = "1"
test.after(() => {
  if (previousContainerValue === undefined) delete process.env.VPN_WORKSPACE_CONTAINER
  else process.env.VPN_WORKSPACE_CONTAINER = previousContainerValue
})

async function until(predicate, timeout = 1000) {
  const deadline = Date.now() + timeout
  while (Date.now() < deadline) {
    if (predicate()) return
    await new Promise((resolve) => setTimeout(resolve, 5))
  }
  throw new Error("condition not reached")
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

test("v1 quota notifications cancel recognized retries and never replay a turn", async () => {
  const toasts = []
  const aborts = []
  let promptCalls = 0
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

  const retryEvent = {
    event: {
      type: "session.status",
      properties: { sessionID: "s-free", status: { type: "retry", action: { reason: "free_tier_limit" } } },
    },
  }
  plugin.event(retryEvent)
  plugin.event(retryEvent)
  await until(() => toasts.length === 1)
  assert.equal(aborts.length, 1)
  assert.equal(aborts[0].path.id, "s-free")
  assert.match(toasts[0].body.message, /VPN não foi alterada/)
  assert.match(toasts[0].body.message, /não será repetido automaticamente/)
  assert.equal(promptCalls, 0)

  plugin.event({
    event: {
      type: "session.status",
      properties: { sessionID: "s-rate", status: { type: "retry", action: { reason: "rate_limit" } } },
    },
  })
  await until(() => toasts.length === 2)
  assert.equal(aborts.length, 2)
  assert.match(toasts[1].body.message, /VPN não foi alterada/)
  assert.equal(promptCalls, 0)
})

test("v1 ignores provider prose and only notifies structured terminal errors", async () => {
  const toasts = []
  const plugin = await createV1Plugin({
    client: {
      session: { abort: async () => ({ data: true }) },
      tui: { showToast: async (toast) => toasts.push(toast) },
    },
    directory: "/work",
  })
  plugin.event({ event: { type: "session.error", properties: { sessionID: "prose", error: { name: "APIError", data: { responseBody: '{"message":"free tier rate limit"}' } } } } })
  plugin.event({ event: { type: "session.error", properties: { sessionID: "structured", error: { name: "APIError", data: { statusCode: 429 } } } } })
  await until(() => toasts.length === 1)
  assert.match(toasts[0].body.message, /Limite de requisições/)
  assert.match(toasts[0].body.message, /VPN não foi alterada/)
})

test("v2 server hook disables automatic retries for every recognized provider limit", async () => {
  let handler
  let disposeCalls = 0
  const ctx = {
    session: {
      hook: async (name, callback) => {
        assert.equal(name, "retry")
        handler = callback
        return { dispose: async () => { disposeCalls++ } }
      },
    },
    model: { list: async () => { throw new Error("provider models must not be queried") } },
    switchModel: async () => { throw new Error("model must not be changed") },
  }
  const dispose = await setupServerPlugin(ctx)
  for (const { ...error } of PROVIDER_ERRORS) {
    const event = { error }
    await handler(event)
    assert.deepEqual(event.decision, { retry: false })
  }
  const unrelated = { error: { type: "provider.network" } }
  await handler(unrelated)
  assert.equal(unrelated.decision, undefined)
  dispose()
  assert.equal(disposeCalls, 1)
})

test("v2 TUI reports quota status, Retry-After, and does not trigger VPN recovery", async () => {
  let listener
  let unsubscribeCalls = 0
  const toasts = []
  const dispose = setupTuiPlugin({
    data: { on: (name, callback) => {
      assert.equal(name, "session.execution.failed")
      listener = callback
      return () => { unsubscribeCalls++ }
    } },
    ui: { toast: { show: async (toast) => toasts.push(toast) } },
  })

  const free = { data: { sessionID: "s-free", error: { type: "provider.free-limit", retryAfterMs: 24_613_000 } } }
  await listener(free)
  await listener(free)
  assert.equal(toasts.length, 1)
  assert.match(toasts[0].message, /~6h50m/)
  assert.match(toasts[0].message, /VPN não foi alterada/)
  assert.match(toasts[0].message, /nem haverá repetição automática/)
  for (const { ...error } of PROVIDER_ERRORS.slice(1)) await listener({ data: { sessionID: JSON.stringify(error), error } })
  assert.equal(toasts.length, PROVIDER_ERRORS.length)
  assert.ok(toasts.every((toast) => toast.variant === "info"))
  dispose()
  assert.equal(unsubscribeCalls, 1)
})

test("classifyV2Error recognizes structured provider classes and ignores prose", () => {
  assert.equal(classifyV2Error({ type: "provider.free-limit" }), "free_tier_limit")
  assert.equal(classifyV2Error({ type: "provider.rate-limit" }), "rate_limit")
  assert.equal(classifyV2Error({ type: "provider.quota" }), "account_limit")
  assert.equal(classifyV2Error({ type: "provider.auth" }), "auth_limit")
  assert.equal(classifyV2Error({ data: { code: "GoUsageLimitError" } }), "account_limit")
  assert.equal(classifyV2Error({ data: { error: { type: "InsufficientFunds" } } }), "credit_limit")
  assert.equal(classifyV2Error({ data: { responseBody: '{"error":{"type":"FreeUsageLimitError"}}' } }), "free_tier_limit")
  assert.equal(classifyV2Error({ statusCode: 402 }), "credit_limit")
  assert.equal(classifyV2Error({ statusCode: 429 }), "rate_limit")
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

test("the policy is notification-only for provider quota classes", () => {
  for (const { expected } of PROVIDER_ERRORS) {
    assert.deepEqual(decideAction({ eventClass: expected }), {
      action: ACTION_NOTIFY,
      rotate: false,
      reason: "quota_status_only",
    })
  }
  assert.deepEqual(decideAction({ eventClass: undefined }), {
    action: ACTION_NOTIFY,
    rotate: false,
    reason: "unclassified",
  })
})

test("v2 TUI suggests available alternatives and gives a manual command on catalog failure", async () => {
  let listener
  const toasts = []
  const current = { providerID: "local", id: "current" }
  const alternate = { providerID: "local", modelID: "alternate", id: "local/alternate" }
  let unavailable = false
  setupTuiPlugin({
    location: "test-location",
    data: {
      on: (_, callback) => { listener = callback },
      location: { model: { list: (location) => {
        assert.equal(location, "test-location")
        if (unavailable) throw new Error("catalog unavailable")
        return [{ ...current, modelID: current.id }, alternate, alternate,
          { providerID: "local", modelID: "disabled", enabled: false }]
      } } },
    },
    ui: { toast: { show: async (toast) => toasts.push(toast) } },
  })
  await listener({ data: { sessionID: "suggest", model: current, error: { type: "provider.rate-limit", retryAfterMs: 120_000 } } })
  assert.match(toasts[0].message, /~2min/)
  assert.match(toasts[0].message, /local\/alternate\.$/)
  assert.doesNotMatch(toasts[0].message, /local\/(current|disabled)/)
  unavailable = true
  await listener({ data: { sessionID: "fallback", model: current, error: { type: "provider.rate-limit" } } })
  assert.match(toasts[1].message, /opencode2 models/)
})
