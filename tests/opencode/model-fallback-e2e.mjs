import assert from "node:assert/strict"
import { spawn } from "node:child_process"
import { createServer } from "node:http"
import { mkdtemp, mkdir, rm, writeFile } from "node:fs/promises"
import { tmpdir } from "node:os"
import { join } from "node:path"
import { fileURLToPath } from "node:url"

const pluginDirectory = new URL("../../opencode/v2/vpn-recovery/", import.meta.url)
const root = await mkdtemp(join(tmpdir(), "opencode-model-fallback-e2e-"))
const configDirectory = join(root, "config", "opencode")
const requests = []
const allRequests = []

const provider = createServer(async (request, response) => {
  const chunks = []
  for await (const chunk of request) chunks.push(chunk)
  const payload = JSON.parse(Buffer.concat(chunks).toString("utf8"))
  allRequests.push(payload.model)

  if (!["first-free", "second-free", "third-free"].includes(payload.model)) {
    response.writeHead(200, { "content-type": "application/json" })
    response.end(JSON.stringify({ id: "title", object: "chat.completion", created: Math.floor(Date.now() / 1000), model: payload.model, choices: [{ index: 0, message: { role: "assistant", content: "test title" }, finish_reason: "stop" }], usage: { prompt_tokens: 1, completion_tokens: 1, total_tokens: 2 } }))
    return
  }

  requests.push(payload.model)
  if (payload.model !== "third-free") {
    response.writeHead(429, { "content-type": "application/json", "retry-after": "1" })
    response.end(JSON.stringify({ error: { type: "FreeUsageLimitError", message: "model quota reached" } }))
    return
  }

  response.writeHead(200, { "content-type": "text/event-stream" })
  const created = Math.floor(Date.now() / 1000)
  response.write(`data: ${JSON.stringify({
    id: "chatcmpl-model-fallback-e2e",
    object: "chat.completion.chunk",
    created,
    model: payload.model,
    choices: [{ index: 0, delta: { role: "assistant", content: "fallback-e2e-ok" }, finish_reason: null }],
  })}\n\n`)
  response.end(`data: ${JSON.stringify({
    id: "chatcmpl-model-fallback-e2e",
    object: "chat.completion.chunk",
    created,
    model: payload.model,
    choices: [{ index: 0, delta: {}, finish_reason: "stop" }],
  })}\n\ndata: [DONE]\n\n`)
})

function runOpenCode(env) {
  return new Promise((resolve, reject) => {
    const child = spawn("opencode2", ["--print-logs", "--log-level", "debug", "run", "--standalone", "--model", "opencode/first-free", "--title", "fallback e2e", "--format", "json", "model fallback e2e"], {
      cwd: process.cwd(),
      env,
      stdio: ["ignore", "pipe", "pipe"],
    })
    let output = ""
    child.stdout.setEncoding("utf8")
    child.stderr.setEncoding("utf8")
    child.stdout.on("data", (chunk) => { output += chunk })
    child.stderr.on("data", (chunk) => { output += chunk })
    child.on("error", reject)
    const timeout = setTimeout(() => child.kill("SIGTERM"), 15_000)
    child.on("close", (code) => {
      clearTimeout(timeout)
      resolve({ code, output })
    })
  })
}

let passed = false
try {
  await new Promise((resolve, reject) => {
    provider.once("error", reject)
    provider.listen(0, "127.0.0.1", resolve)
  })
  const address = provider.address()
  await mkdir(configDirectory, { recursive: true })
  await writeFile(join(configDirectory, "opencode.json"), JSON.stringify({
    model: "opencode/first-free",
    plugins: [process.env.OPENCODE_MODEL_FALLBACK_PLUGIN_PATH || fileURLToPath(pluginDirectory)],
    providers: {
      opencode: {
        name: "Local quota fixture",
        package: "@opencode/ai/providers/openai-compatible",
        settings: { baseURL: `http://127.0.0.1:${address.port}/v1`, apiKey: "local-e2e" },
        models: {
          ...Object.fromEntries(["first-free", "second-free", "third-free"].map((id) => [id, {
            name: id,
            limit: { context: 32768, output: 4096 },
            cost: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0 },
            capabilities: { tools: true, input: ["text"], output: ["text"] },
          }])),
          "paid-model": {
            name: "paid-model",
            limit: { context: 32768, output: 4096 },
            cost: { input: 1, output: 2, cacheRead: 0, cacheWrite: 0 },
            capabilities: { tools: true, input: ["text"], output: ["text"] },
          },
        },
      },
    },
  }), "utf8")

  const result = await runOpenCode({
    ...process.env,
    HOME: root,
    XDG_CONFIG_HOME: join(root, "config"),
    XDG_DATA_HOME: join(root, "data"),
    XDG_STATE_HOME: join(root, "state"),
    XDG_CACHE_HOME: join(root, "cache"),
    VPN_WORKSPACE_CONTAINER: "1",
    OPENCODE_MODEL_FALLBACK_ENABLED: "true",
    OPENCODE_MODEL_FALLBACK_FAVORITES: "opencode/second-free,opencode/third-free",
    OPENCODE_MODEL_FALLBACK_UNKNOWN_COOLDOWN_SECONDS: "60",
  })
  assert.equal(result.code, 0, result.output)
  assert.deepEqual(requests, ["first-free", "second-free", "third-free"])
  assert.equal(allRequests.includes("paid-model"), false, `modelo pago foi chamado: ${allRequests.join(", ")}`)
  assert.match(result.output, /fallback-e2e-ok/)
  process.stdout.write("PASS OpenCode v2 native retry changed models twice in one run; provider calls were local mocks only.\n")
  passed = true
} finally {
  provider.close()
  if (passed) await rm(root, { recursive: true, force: true })
  else process.stderr.write(`E2E state retained at ${root}; model calls: ${requests.join(", ")}; all calls: ${allRequests.join(", ")}\n`)
}
