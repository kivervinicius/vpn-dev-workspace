import test from "node:test"
import assert from "node:assert/strict"
import { mkdtempSync, writeFileSync, readFileSync, existsSync } from "node:fs"
import { tmpdir } from "node:os"
import { join } from "node:path"
import { VpnRecovery as createV1Plugin } from "../../opencode/v1/vpn-recovery.js"
import { setupServerPlugin } from "../../opencode/v2/vpn-recovery/server-core.js"
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

test("v2 server hook disables automatic retries for every recognized provider limit", async () => {
  let handler
  let disposeCalls = 0
  const dispose = await setupServerPlugin({
    session: { hook: async (name, callback) => {
      assert.equal(name, "retry")
      handler = callback
      return () => { disposeCalls++ }
    } },
  })
  for (const { expected, ...providerError } of PROVIDER_ERRORS) {
    const event = { error: providerError }
    await handler(event)
    assert.deepEqual(event.decision, { retry: false })
  }
  const unrelated = { error: { type: "provider.network" } }
  await handler(unrelated)
  assert.equal(unrelated.decision, undefined)
  dispose()
  assert.equal(disposeCalls, 1)
})

test("v2 TUI reports Retry-After, checks tunnel health, and does not replay provider requests", async () => {
  let listener
  let unsubscribeCalls = 0
  const toasts = []
  const helper = fakeNetworkRecovery()
  try {
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
    assert.match(toasts[0].message, /O turno não será repetido automaticamente/)
    assert.doesNotMatch(toasts[0].message, /rotação|troca de IP/)
    for (const { ...error } of PROVIDER_ERRORS.slice(1)) await listener({ data: { sessionID: JSON.stringify(error), error } })
    await until(() => helper.calls().length === PROVIDER_ERRORS.length && toasts.length === PROVIDER_ERRORS.length * 2)
    assert.ok(toasts.every((toast) => toast.variant === "info"))
    for (const { expected } of PROVIDER_ERRORS) {
      assert.ok(helper.calls().some((call) => call.includes(`--event ${expected}`)))
    }
    assert.ok(helper.calls().find((call) => call.includes("--event rate_limit"))?.includes("--force-restart"))
    assert.ok(helper.calls().filter((call) => call.includes("--event") && !call.includes("--event rate_limit")).every((call) => !call.includes("--force-restart")))

    await listener({ data: { sessionID: "s429-account", error: { type: "provider.quota", statusCode: 429 } } })
    await until(() => helper.calls().length === PROVIDER_ERRORS.length + 1)
    assert.ok(helper.calls().some((call) => call.includes("--event account_limit") && call.includes("--force-restart")))
    dispose()
    assert.equal(unsubscribeCalls, 1)
  } finally {
    helper.restore()
  }
})

test("v2 does not start a diagnostic when the provider notification fails", async () => {
  let listener
  const helper = fakeNetworkRecovery()
  try {
    setupTuiPlugin({
      data: { on: (_, callback) => { listener = callback } },
      ui: { toast: { show: async () => { throw new Error("TUI unavailable") } } },
    })
    await listener({ data: { sessionID: "s1", error: { type: "provider.quota" } } })
    await new Promise((resolve) => setTimeout(resolve, 100))
    assert.equal(helper.calls().length, 0)
  } finally {
    helper.restore()
  }
})

test("v2 reports that an HTTP 429 restarted the current VPN tunnel", async () => {
  let listener
  const toasts = []
  const helper = fakeNetworkRecovery({
    status: "reconnected",
    reason: "http_429_tunnel_restarted",
    ip: "198.51.100.9",
  })
  try {
    setupTuiPlugin({
      data: { on: (_, callback) => { listener = callback } },
      ui: { toast: { show: async (toast) => toasts.push(toast) } },
    })
    await listener({ data: { sessionID: "s-http-429", error: { type: "provider.rate-limit" } } })
    await until(() => toasts.length === 2)
    assert.match(helper.calls()[0], /--event rate_limit.*--force-restart/)
    assert.match(toasts[1].message, /HTTP 429 recebido; túnel VPN reiniciado/)
    assert.match(toasts[1].message, /198\.51\.100\.9/)
  } finally {
    helper.restore()
  }
})

test("v2 restarts the VPN on HTTP 429 even when its first toast fails", async () => {
  let listener
  const helper = fakeNetworkRecovery({ status: "reconnected", reason: "http_429_tunnel_restarted" })
  try {
    setupTuiPlugin({
      data: { on: (_, callback) => { listener = callback } },
      ui: { toast: { show: async () => { throw new Error("TUI unavailable") } } },
    })
    await listener({ data: { sessionID: "s-http-429-toast-failed", error: { type: "provider.rate-limit" } } })
    await until(() => helper.calls().length === 1)
    assert.match(helper.calls()[0], /--event rate_limit.*--force-restart/)
  } finally {
    helper.restore()
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

test("provider policy restarts the current tunnel on rate limits or structured HTTP 429", () => {
  for (const eventClass of QUOTA_CLASSES) {
    assert.deepEqual(decideAction({ eventClass }), {
      action: ACTION_NOTIFY,
      restartTunnel: eventClass === "rate_limit",
      reason: eventClass === "rate_limit" ? "http_429_tunnel_restart" : "provider_limit_diagnosis",
    })
  }
  assert.deepEqual(decideAction({ eventClass: "account_limit", httpStatus: 429 }), {
    action: ACTION_NOTIFY,
    restartTunnel: true,
    reason: "http_429_tunnel_restart",
  })
  assert.deepEqual(decideAction({ eventClass: undefined }), {
    action: ACTION_NOTIFY,
    restartTunnel: false,
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
