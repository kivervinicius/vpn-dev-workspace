import test from "node:test"
import assert from "node:assert/strict"
import { mkdtempSync, writeFileSync, readFileSync, existsSync, rmSync, chmodSync } from "node:fs"
import { tmpdir } from "node:os"
import { join } from "node:path"
import { VpnRecovery as createV1Plugin } from "../../opencode/v1/vpn-recovery.js"
import { setupServerPlugin } from "../../opencode/v2/vpn-recovery/server-core.js"
import { classifyV2Error } from "../../opencode/v2/vpn-recovery/classify.js"
import { setupTuiPlugin } from "../../opencode/v2/vpn-recovery/tui-core.js"

const CHANGED = '{"status":"changed","reason":"ip_changed","before_ip":"203.0.113.1","after_ip":"203.0.113.2","target":"a.example"}'

function recoveryStub(action = "changed") {
  const dir = mkdtempSync(join(tmpdir(), "vpn-recovery-test-"))
  const log = join(dir, "calls")
  const bin = join(dir, "opencode-limit-recover")
  const body = action === "fail"
    ? 'printf \'{"status":"failed","reason":"no_verified_change","before_ip":"203.0.113.1","after_ip":"","target":"a.example"}\\n\'\nexit 1'
    : action === "skip"
      ? 'printf \'{"status":"skipped","reason":"cooldown","before_ip":"","after_ip":"","target":""}\\n\'\nexit 0'
      : `printf '%s\\n' '${CHANGED}'\nexit 0`
  writeFileSync(bin, `#!/usr/bin/env bash\nprintf '%s\\n' "$*" >> "$STUB_LOG"\n${body}\n`)
  chmodSync(bin, 0o755)
  const previousBin = process.env.OPENCODE_LIMIT_RECOVER_BIN
  const previousLog = process.env.STUB_LOG
  process.env.OPENCODE_LIMIT_RECOVER_BIN = bin
  process.env.STUB_LOG = log
  return {
    calls: () => existsSync(log) ? readFileSync(log, "utf8").trim().split("\n").filter(Boolean) : [],
    restore() {
      if (previousBin === undefined) delete process.env.OPENCODE_LIMIT_RECOVER_BIN
      else process.env.OPENCODE_LIMIT_RECOVER_BIN = previousBin
      if (previousLog === undefined) delete process.env.STUB_LOG
      else process.env.STUB_LOG = previousLog
      rmSync(dir, { recursive: true, force: true })
    },
  }
}

async function until(predicate, timeout = 5000) {
  const deadline = Date.now() + timeout
  while (Date.now() < deadline) {
    if (predicate()) return
    await new Promise((resolve) => setTimeout(resolve, 10))
  }
  throw new Error("condition not reached")
}

test("v1 plugin ignores provider prose and malformed API events", async () => {
  const stub = recoveryStub("changed")
  try {
    const toasts = []
    const plugin = await createV1Plugin({
      client: {
        session: { abort: async () => ({ data: true }) },
        tui: { showToast: async (toast) => toasts.push(toast) },
      },
      directory: "/work",
    })
    plugin.event({ event: { type: "session.error", properties: { sessionID: "prose", error: { name: "APIError", data: { statusCode: 400, responseBody: '{"message":"free tier rate limit"}' } } } } })
    plugin.event({ event: { type: "session.error", properties: { sessionID: "bad", error: { name: "MessageOutputLengthError", data: { statusCode: 429 } } } } })
    await new Promise((resolve) => setTimeout(resolve, 50))
    assert.deepEqual(stub.calls(), [])
    assert.equal(toasts.length, 0)
  } finally {
    stub.restore()
  }
})

test("v1 confirmed abort triggers exactly one recovery and notifies without replay", async () => {
  const stub = recoveryStub("changed")
  try {
    const calls = []
    let releaseAbort
    const plugin = await createV1Plugin({
      client: {
        session: {
          abort: (args) => {
            calls.push(["abort", args])
            return new Promise((resolve) => { releaseAbort = resolve })
          },
        },
        tui: { showToast: async (toast) => calls.push(["toast", toast]) },
      },
      directory: "/workspace",
    })
    const retry = { type: "session.status", properties: { sessionID: "ses-a", status: { type: "retry", action: { reason: "free_tier_limit" } } } }
    plugin.event({ event: retry })
    plugin.event({ event: retry })
    await until(() => calls.length === 1)
    assert.deepEqual(calls[0], ["abort", { path: { id: "ses-a" }, query: { directory: "/workspace" }, throwOnError: true }])
    releaseAbort({ data: true })
    await until(() => calls.length === 2)
    assert.deepEqual(stub.calls(), ["--event free_tier_limit"])
    assert.equal(calls[1][0], "toast")
    assert.match(calls[1][1].body.message, /IP de saída mudou/)
    assert.equal(calls[1][1].body.variant, "success")
  } finally {
    stub.restore()
  }
})

test("v1 unconfirmed abort never changes VPN and reports the failure", async () => {
  const stub = recoveryStub("changed")
  try {
    const toasts = []
    let abortResult = { data: false }
    const plugin = await createV1Plugin({
      client: {
        session: { abort: async () => abortResult },
        tui: { showToast: async (toast) => toasts.push(toast) },
      },
      directory: "/work",
    })
    const retry = (id) => ({ type: "session.status", properties: { sessionID: id, status: { type: "retry", action: { reason: "free_tier_limit" } } } })
    plugin.event({ event: retry("false") })
    abortResult = Promise.reject(new Error("abort failed"))
    plugin.event({ event: retry("error") })
    await until(() => toasts.length === 2)
    assert.deepEqual(stub.calls(), [])
    assert.ok(toasts.every((toast) => /VPN não foi alterada/.test(toast.body.message)))
  } finally {
    stub.restore()
  }
})

test("v1 account limit stops retry but never calls VPN recovery", async () => {
  const stub = recoveryStub("changed")
  try {
    const toasts = []
    let aborted = 0
    const plugin = await createV1Plugin({
      client: {
        session: { abort: async () => { aborted++; return { data: true } } },
        tui: { showToast: async (toast) => toasts.push(toast) },
      },
      directory: "/work",
    })
    plugin.event({ event: { type: "session.status", properties: { sessionID: "acc", status: { type: "retry", action: { reason: "account_rate_limit" } } } } })
    await until(() => toasts.length === 1)
    assert.equal(aborted, 1)
    assert.deepEqual(stub.calls(), [])
    assert.match(toasts[0].body.message, /VPN não foi alterada/)
  } finally {
    stub.restore()
  }
})

test("v1 structured session.error recovers 429 but ignores prose and malformed events", async () => {
  const stub = recoveryStub("changed")
  try {
    const toasts = []
    let aborts = 0
    const plugin = await createV1Plugin({
      client: {
        session: { abort: async () => { aborts++ } },
        tui: { showToast: async (toast) => toasts.push(toast) },
      },
      directory: "/work",
    })
    plugin.event({ event: { type: "session.error", properties: { sessionID: "s-1", error: { name: "APIError", data: { statusCode: 429, responseBody: "{}" } } } } })
    await until(() => toasts.length === 1)
    assert.deepEqual(stub.calls(), ["--event rate_limit"])
    assert.equal(aborts, 0)
    assert.match(toasts[0].body.message, /IP de saída mudou/)
    plugin.event({ event: { type: "session.error", properties: { sessionID: "text", error: { name: "APIError", data: { statusCode: 400, responseBody: '{"message":"free limit reached"}' } } } } })
    plugin.event({ event: { type: "session.error", properties: { error: { name: "APIError", data: { statusCode: 429 } } } } })
    plugin.event({ event: { type: "session.error", properties: { sessionID: "overflow", error: { name: "MessageOutputLengthError", data: { statusCode: 429 } } } } })
    await new Promise((resolve) => setTimeout(resolve, 50))
    assert.equal(toasts.length, 1)
    assert.equal(stub.calls().length, 1)
  } finally {
    stub.restore()
  }
})

test("v1 recovery failure is reported as error", async () => {
  const stub = recoveryStub("fail")
  try {
    const toasts = []
    const plugin = await createV1Plugin({
      client: {
        session: { abort: async () => ({ data: true }) },
        tui: { showToast: async (toast) => toasts.push(toast) },
      },
      directory: "/work",
    })
    plugin.event({ event: { type: "session.status", properties: { sessionID: "f", status: { type: "retry", action: { reason: "free_tier_limit" } } } } })
    await until(() => toasts.length === 1)
    assert.equal(toasts[0].body.variant, "error")
    assert.match(toasts[0].body.message, /falhou/)
  } finally {
    stub.restore()
  }
})

test("v2 retry hook vetoes only structured recognized errors and is disposed", async () => {
  let handler
  let disposed = false
  const cleanup = await setupServerPlugin({
    session: {
      hook: async (name, callback) => {
        assert.equal(name, "retry")
        handler = callback
        return { dispose: async () => { disposed = true } }
      },
    },
  })
  const free = { error: { type: "provider.free-limit" }, decision: { retry: true } }
  handler(free)
  assert.deepEqual(free.decision, { retry: false })
  const rate = { error: { status: 429 }, decision: { retry: true } }
  handler(rate)
  assert.deepEqual(rate.decision, { retry: false })
  const account = { error: { data: { code: "GoUsageLimitError" } }, decision: { retry: true } }
  handler(account)
  assert.deepEqual(account.decision, { retry: false })
  const ordinary = { error: { message: "please rate limit" }, decision: { retry: true } }
  handler(ordinary)
  assert.deepEqual(ordinary.decision, { retry: true })
  assert.equal(classifyV2Error({ message: "FreeUsageLimitError" }), undefined)
  assert.equal(classifyV2Error({ type: "provider.free-limit" }), "free_tier_limit")
  assert.equal(classifyV2Error({ data: { code: "GoUsageLimitError" } }), "account_limit")
  assert.equal(classifyV2Error({ data: { code: "account_rate_limit" } }), "account_limit")
  assert.equal(classifyV2Error({ data: { error: { type: "InsufficientFunds" } } }), "credit_limit")
  assert.equal(classifyV2Error({ data: { responseBody: '{"error":{"type":"FreeUsageLimitError"}}' } }), "free_tier_limit")
  assert.equal(classifyV2Error({ statusCode: 402 }), "credit_limit")
  assert.equal(classifyV2Error({ statusCode: 429 }), "rate_limit")
  await cleanup()
  assert.equal(disposed, true)
})

test("v2 TUI triggers one recovery per in-flight session and never on account limits", async () => {
  const stub = recoveryStub("changed")
  try {
    let registered = 0
    let listener
    let unsubscribeCalls = 0
    const toasts = []
    const dispose = setupTuiPlugin({
      data: {
        on: (name, callback) => {
          registered++
          assert.equal(name, "session.execution.failed")
          listener = callback
          return () => { unsubscribeCalls++ }
        },
      },
      ui: { toast: { show: async (toast) => { toasts.push(toast) } } },
    })
    assert.equal(registered, 1)
    const event = { data: { sessionID: "s-1", error: { type: "provider.free-limit" } } }
    const first = listener(event)
    const duplicate = listener(event)
    await Promise.all([first, duplicate])
    assert.equal(stub.calls().length, 1)
    assert.equal(toasts.length, 1)
    assert.match(toasts[0].message, /IP de saída mudou/)
    assert.equal(toasts[0].sessionID, "s-1")
    const account = await listener({ data: { sessionID: "s-2", error: { data: { code: "GoUsageLimitError" } } } })
    assert.equal(account, undefined)
    assert.equal(stub.calls().length, 1)
    assert.equal(toasts.length, 2)
    assert.match(toasts[1].message, /VPN não foi alterada/)
    assert.equal(typeof dispose, "function")
    dispose()
    assert.equal(unsubscribeCalls, 1)
  } finally {
    stub.restore()
  }
})
