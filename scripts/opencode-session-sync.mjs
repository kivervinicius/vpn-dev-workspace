#!/usr/bin/env node
import crypto from "node:crypto"
import fs from "node:fs"
import os from "node:os"
import path from "node:path"
import { spawnSync } from "node:child_process"
import { fileURLToPath } from "node:url"

const SCRIPT_PATH = fileURLToPath(import.meta.url)
const DEFAULT_LIMIT = 5
const FORMAT_VERSION = 1

function object(value) {
  return value !== null && typeof value === "object" && !Array.isArray(value)
}

function canonical(value) {
  if (Array.isArray(value)) return value.map(canonical)
  if (!object(value)) return value
  const output = {}
  for (const key of Object.keys(value).sort()) {
    if (["updated", "viewed", "busy", "idle"].includes(key)) continue
    output[key] = canonical(value[key])
  }
  return output
}

export function stableHash(value) {
  const input = typeof value === "string" ? value : JSON.stringify(canonical(value))
  return crypto.createHash("sha256").update(input).digest("hex")
}

function idFor(prefix, seed) {
  return prefix + "_" + stableHash(seed).slice(0, 26)
}

function finite(value, fallback = 0) {
  return Number.isFinite(value) ? value : fallback
}

function safeArray(value) {
  return Array.isArray(value) ? value : []
}

function unsupported(reason) {
  const error = new Error(reason)
  error.code = "UNSUPPORTED_CONVERSION"
  throw error
}

function sessionCreated(info) {
  return finite(info?.time?.created, 0)
}

function v1Tool(part, seed) {
  const state = part.state || {}
  if (state.status !== "completed") unsupported("tool call is not settled")
  if (safeArray(state.attachments).length) unsupported("tool attachments cannot be represented without loss")
  const start = finite(state.time?.start, 0)
  const completed = finite(state.time?.end, start)
  return {
    type: "tool",
    id: idFor("call", seed + ":call:" + String(part.callID || part.id)),
    name: String(part.tool || "tool"),
    executed: false,
    state: {
      status: "completed",
      input: object(state.input) ? state.input : {},
      content: [{ type: "text", text: String(state.output || "") }],
      ...(object(state.metadata) ? { metadata: state.metadata } : {}),
    },
    time: { created: start, ran: start, completed },
    ...(object(part.metadata) ? { native: part.metadata } : {}),
  }
}

function convertV1Message(message, context) {
  if (!object(message) || !object(message.info)) unsupported("malformed v1 message")
  const info = message.info
  const parts = safeArray(message.parts)
  const originalID = String(info.id || "")
  if (!originalID.startsWith("msg")) unsupported("v1 message has an invalid id")
  const messageID = idFor("msg", context.seed + ":message:" + originalID)
  const created = finite(info.time?.created, 0)

  if (info.role === "user") {
    const text = []
    for (const part of parts) {
      if (!object(part)) unsupported("malformed v1 user part")
      if (part.type === "text") {
        if (part.synthetic || part.ignored) unsupported("synthetic or ignored user text cannot be represented safely")
        text.push(String(part.text || ""))
      } else if (part.type !== "step-start" && part.type !== "step-finish") {
        unsupported("v1 user contains unsupported part: " + String(part.type))
      }
    }
    return { id: messageID, type: "user", time: { created }, text: text.join("") }
  }

  if (info.role !== "assistant") unsupported("unknown v1 message role")
  if (!Number.isFinite(info.time?.completed)) unsupported("assistant message is not settled")
  const modelID = info.modelID || context.sourceInfo?.model?.id
  const providerID = info.providerID || context.sourceInfo?.model?.providerID
  if (typeof modelID !== "string" || typeof providerID !== "string") unsupported("assistant model is missing")
  const content = []
  for (const part of parts) {
    if (!object(part)) unsupported("malformed v1 assistant part")
    if (part.type === "text") {
      if (part.synthetic || part.ignored) unsupported("synthetic or ignored assistant text cannot be represented safely")
      content.push({ type: "text", text: String(part.text || ""), ...(object(part.metadata) ? { native: part.metadata } : {}) })
    } else if (part.type === "reasoning") {
      const start = finite(part.time?.start, created)
      content.push({
        type: "reasoning",
        text: String(part.text || ""),
        time: { created: start, completed: finite(part.time?.end, finite(info.time.completed, start)) },
        ...(object(part.metadata) ? { native: part.metadata } : {}),
      })
    } else if (part.type === "tool") {
      content.push(v1Tool(part, context.seed))
    } else if (part.type !== "step-start" && part.type !== "step-finish") {
      unsupported("v1 assistant contains unsupported part: " + String(part.type))
    }
  }

  const assistant = {
    id: messageID,
    type: "assistant",
    agent: String(info.agent || context.sourceInfo?.agent || "build"),
    model: { id: modelID, providerID },
    content,
    time: { created, completed: finite(info.time.completed, created) },
    cost: finite(info.cost, 0),
    tokens: {
      input: finite(info.tokens?.input, 0),
      output: finite(info.tokens?.output, 0),
      reasoning: finite(info.tokens?.reasoning, 0),
      cache: { read: finite(info.tokens?.cache?.read, 0), write: finite(info.tokens?.cache?.write, 0) },
    },
  }
  return assistant
}

export function convertV1ToV2(data, options) {
  if (!object(data) || !object(data.info) || !Array.isArray(data.messages)) unsupported("invalid v1 export envelope")
  const info = data.info
  if (info.summary || info.revert) unsupported("v1 session has summary or revert state")
  const targetSessionID = options.targetSessionID
  const workspace = options.workspace
  const seed = options.seed
  return {
    info: {
      id: targetSessionID,
      projectID: String(info.projectID || idFor("prj", seed)),
      cost: finite(info.cost, 0),
      tokens: {
        input: finite(info.tokens?.input, 0),
        output: finite(info.tokens?.output, 0),
        reasoning: finite(info.tokens?.reasoning, 0),
        cache: { read: finite(info.tokens?.cache?.read, 0), write: finite(info.tokens?.cache?.write, 0) },
      },
      time: { created: sessionCreated(info), updated: sessionCreated(info) },
      title: String(info.title || "Imported conversation"),
      location: { directory: workspace },
      ...(typeof info.agent === "string" ? { agent: info.agent } : {}),
      ...(object(info.model) ? { model: info.model } : {}),
      ...(object(info.metadata) ? { metadata: info.metadata } : {}),
      ...(Array.isArray(info.permission) ? { permissions: info.permission } : {}),
    },
    messages: data.messages.map((message) => convertV1Message(message, {
      seed, targetSessionID, sourceInfo: info,
    })),
  }
}

function v2ToolText(content) {
  const items = safeArray(content)
  if (items.some((item) => !object(item) || item.type !== "text")) unsupported("tool result includes non-text content")
  return items.map((item) => String(item.text || "")).join("\n")
}

function convertV2AssistantContent(item, context) {
  if (!object(item)) unsupported("malformed v2 assistant content")
  const base = {
    id: idFor("prt", context.seed + ":part:" + context.messageID + ":" + context.partIndex),
    sessionID: context.targetSessionID,
    messageID: context.messageID,
  }
  context.partIndex += 1
  if (item.type === "text") return {
    ...base, type: "text", text: String(item.text || ""),
    ...(object(item.native) ? { metadata: item.native } : {}),
  }
  if (item.type === "reasoning") return {
    ...base,
    type: "reasoning",
    text: String(item.text || ""),
    time: { start: finite(item.time?.created, 0), end: finite(item.time?.completed, finite(item.time?.created, 0)) },
    ...(object(item.native) ? { metadata: item.native } : {}),
  }
  if (item.type === "tool") {
    const state = item.state || {}
    if (state.status !== "completed") unsupported("v2 tool call is not settled")
    const start = finite(item.time?.ran, finite(item.time?.created, 0))
    return {
      ...base,
      type: "tool",
      callID: String(item.id || idFor("call", context.seed + ":" + context.messageID)),
      tool: String(item.name || "tool"),
      ...(object(item.native) ? { metadata: item.native } : {}),
      state: {
        status: "completed",
        input: object(state.input) ? state.input : {},
        output: v2ToolText(state.content),
        title: String(item.name || "tool"),
        metadata: object(state.metadata) ? state.metadata : {},
        time: { start, end: finite(item.time?.completed, start) },
      },
    }
  }
  unsupported("v2 assistant contains unsupported content: " + String(item.type))
}

function convertV2Message(message, context, nextModel) {
  if (!object(message) || typeof message.id !== "string") unsupported("malformed v2 message")
  const messageID = idFor("msg", context.seed + ":message:" + message.id)
  const created = finite(message.time?.created, 0)
  if (message.type === "user") {
    if (safeArray(message.files).length || safeArray(message.agents).length || safeArray(message.skills).length) {
      unsupported("v2 user attachments, agents, or skills cannot be represented safely")
    }
    const model = nextModel || context.sourceInfo.model
    if (!object(model) || typeof model.id !== "string" || typeof model.providerID !== "string") {
      unsupported("no model is available for the imported v1 user message")
    }
    return {
      info: {
        id: messageID,
        sessionID: context.targetSessionID,
        role: "user",
        time: { created },
        agent: String(context.sourceInfo.agent || "build"),
        model: { providerID: model.providerID, modelID: model.id },
      },
      parts: [{
        id: idFor("prt", context.seed + ":part:" + messageID + ":0"),
        sessionID: context.targetSessionID,
        messageID,
        type: "text",
        text: String(message.text || ""),
      }],
    }
  }

  if (message.type !== "assistant") unsupported("v2 message type cannot be represented in v1: " + String(message.type))
  if (message.error) unsupported("v2 assistant error cannot be represented safely")
  if (typeof message.agent !== "string" || !object(message.model) ||
      typeof message.model.id !== "string" || typeof message.model.providerID !== "string") {
    unsupported("v2 assistant agent or model is missing")
  }
  const parts = []
  const content = safeArray(message.content)
  const partContext = { seed: context.seed, targetSessionID: context.targetSessionID, messageID, partIndex: 0 }
  for (const item of content) parts.push(convertV2AssistantContent(item, partContext))
  return {
    info: {
      id: messageID,
      sessionID: context.targetSessionID,
      role: "assistant",
      time: { created, completed: finite(message.time?.completed, created) },
      parentID: context.previousUserID || idFor("msg", context.seed + ":missing-parent"),
      modelID: message.model.id,
      providerID: message.model.providerID,
      mode: message.agent,
      agent: message.agent,
      path: { cwd: context.workspace, root: context.workspace },
      cost: finite(message.cost, 0),
      tokens: {
        total: finite(message.tokens?.input, 0) + finite(message.tokens?.output, 0) + finite(message.tokens?.reasoning, 0),
        input: finite(message.tokens?.input, 0),
        output: finite(message.tokens?.output, 0),
        reasoning: finite(message.tokens?.reasoning, 0),
        cache: { read: finite(message.tokens?.cache?.read, 0), write: finite(message.tokens?.cache?.write, 0) },
      },
      ...(typeof message.finish === "string" ? { finish: message.finish } : {}),
    },
    parts,
  }
}

export function convertV2ToV1(data, options) {
  if (!object(data) || !object(data.info) || !Array.isArray(data.messages)) unsupported("invalid v2 export envelope")
  const info = data.info
  if (info.revert || info.fork) unsupported("v2 session has revert or fork state")
  const targetSessionID = options.targetSessionID
  const workspace = options.workspace
  const seed = options.seed
  const sourceMessages = data.messages
  const messages = []
  let previousUserID
  for (let index = 0; index < sourceMessages.length; index += 1) {
    const message = sourceMessages[index]
    let nextModel
    for (let next = index + 1; next < sourceMessages.length; next += 1) {
      if (sourceMessages[next]?.type === "assistant" && object(sourceMessages[next]?.model)) {
        nextModel = sourceMessages[next].model
        break
      }
    }
    const converted = convertV2Message(message, {
      seed, targetSessionID, workspace, sourceInfo: info, previousUserID,
    }, nextModel)
    if (converted.info.role === "user") previousUserID = converted.info.id
    messages.push(converted)
  }
  const created = finite(info.time?.created, 0)
  const firstAssistant = sourceMessages.find((message) => message?.type === "assistant")
  const model = object(info.model) ? info.model : firstAssistant?.model
  return {
    info: {
      id: targetSessionID,
      slug: "cross-client-" + stableHash(seed).slice(0, 12),
      projectID: String(info.projectID || idFor("prj", seed)),
      directory: workspace,
      path: "",
      title: String(info.title || "Imported conversation"),
      version: options.targetVersion || "1.19.6",
      time: { created, updated: finite(info.time?.updated, created) },
      cost: finite(info.cost, 0),
      tokens: {
        input: finite(info.tokens?.input, 0),
        output: finite(info.tokens?.output, 0),
        reasoning: finite(info.tokens?.reasoning, 0),
        cache: { read: finite(info.tokens?.cache?.read, 0), write: finite(info.tokens?.cache?.write, 0) },
      },
      ...(typeof info.agent === "string" ? { agent: info.agent } : (firstAssistant?.agent ? { agent: firstAssistant.agent } : {})),
      ...(object(model) ? { model: { id: model.id, providerID: model.providerID, ...(model.variant ? { variant: model.variant } : {}) } } : {}),
      ...(object(info.metadata) ? { metadata: info.metadata } : {}),
      ...(Array.isArray(info.permissions) ? { permission: info.permissions } : {}),
    },
    messages,
  }
}

export function parseSessionList(value) {
  if (Array.isArray(value)) return value.filter((item) => object(item) && typeof item.id === "string")
  if (!object(value)) return []
  for (const key of ["sessions", "data", "items", "results"]) {
    if (Array.isArray(value[key])) return value[key].filter((item) => object(item) && typeof item.id === "string")
  }
  return []
}

function extractJson(stdout) {
  const trimmed = stdout.trim()
  try { return JSON.parse(trimmed) } catch {}
  const starts = [trimmed.indexOf("["), trimmed.indexOf("{")].filter((index) => index >= 0)
  if (!starts.length) throw new Error("CLI did not return JSON")
  return JSON.parse(trimmed.slice(Math.min(...starts)))
}

function normalizePath(value) {
  if (typeof value !== "string" || !value) return ""
  return path.resolve(value.replaceAll("\\\\", path.sep))
}

function homeConfig(client) {
  const hostHome = process.env.OPENCODE_HOST_HOME || process.env.HOME || os.homedir()
  const v1Home = process.env.OPENCODE_V1_HOME || path.join(hostHome, ".opencode-v1")
  const v2Home = process.env.OPENCODE_V2_HOME || hostHome
  const v1Bin = process.env.OPENCODE_V1_BIN || path.join(v1Home, "bin", "opencode")
  const v2Bin = process.env.OPENCODE_V2_BIN || path.join(v2Home, ".opencode", "bin", "opencode")
  const v1Data = path.join(v1Home, ".local", "share")
  const v2Data = process.env.XDG_DATA_HOME || path.join(v2Home, ".local", "share")
  const v1Config = path.join(v1Home, ".config")
  const v2Config = process.env.XDG_CONFIG_HOME || path.join(v2Home, ".config")
  const v1State = path.join(v1Home, ".local", "state")
  const v2State = process.env.XDG_STATE_HOME || path.join(v2Home, ".local", "state")
  return {
    hostHome, v1Home, v2Home, v1Bin, v2Bin, v1Data, v2Data, v1Config, v2Config, v1State, v2State,
    db: path.join(client === "v1" ? v1Data : v2Data, "opencode", "opencode.db"),
  }
}

function versionEnv(client, config) {
  if (client === "v1") return {
    ...process.env,
    HOME: config.v1Home,
    XDG_DATA_HOME: config.v1Data,
    XDG_CONFIG_HOME: config.v1Config,
    XDG_STATE_HOME: config.v1State,
    OPENCODE_V1_HOME: config.v1Home,
  }
  return {
    ...process.env,
    HOME: config.v2Home,
    XDG_DATA_HOME: config.v2Data,
    XDG_CONFIG_HOME: config.v2Config,
    XDG_STATE_HOME: config.v2State,
  }
}

function run(client, args, workspace, timeout = 120000) {
  const config = homeConfig(client)
  const bin = client === "v1" ? config.v1Bin : config.v2Bin
  const result = spawnSync(bin, args, {
    cwd: workspace, env: versionEnv(client, config), encoding: "utf8",
    maxBuffer: 64 * 1024 * 1024, timeout,
  })
  if (result.error) throw result.error
  if (result.status !== 0) throw new Error((result.stderr || result.stdout || "OpenCode CLI failed").trim())
  return { stdout: result.stdout || "", config }
}

function listSessions(client, workspace, limit) {
  const args = client === "v1"
    ? ["session", "list", "--format", "json", "-n", String(limit)]
    : ["session", "list", "--format", "json", "--max-count", String(limit)]
  const stdout = run(client, args, workspace).stdout
  if (!stdout.trim()) return []
  return parseSessionList(extractJson(stdout))
}

function exportSession(client, id, workspace) {
  const args = client === "v1" ? ["export", id] : ["session", "export", id]
  return extractJson(run(client, args, workspace).stdout)
}

function importSession(client, data, workspace, tempDir) {
  fs.mkdirSync(tempDir, { recursive: true, mode: 0o700 })
  const file = path.join(tempDir, "import-" + crypto.randomUUID() + ".json")
  fs.writeFileSync(file, JSON.stringify(data), { mode: 0o600, flag: "wx" })
  try {
    const args = client === "v1" ? ["import", file] : ["session", "import", file, "--directory", workspace]
    run(client, args, workspace)
  } finally {
    fs.rmSync(file, { force: true })
  }
}

function sessionWorkspace(client, data) {
  const value = client === "v1" ? data?.info?.directory : data?.info?.location?.directory
  return typeof value === "string" ? value : ""
}

function sourceID(_client, data) {
  return data?.info?.id
}

function semanticMessages(client, data) {
  const messages = safeArray(data?.messages)
  return client === "v1"
    ? messages.map((entry) => ({ info: canonical(entry.info || {}), parts: canonical(safeArray(entry.parts)) }))
    : canonical(messages)
}

function findActiveClient(client, config) {
  if (process.platform !== "linux") return { active: false, reason: "process check unavailable" }
  const bin = client === "v1" ? config.v1Bin : config.v2Bin
  const needles = client === "v1" ? [config.v1Home, bin] : [bin]
  for (const value of [...needles]) {
    try { needles.push(fs.realpathSync(value)) } catch {}
  }
  for (const entry of fs.readdirSync("/proc")) {
    if (!/^[0-9]+$/.test(entry) || Number(entry) === process.pid) continue
    let command = ""
    try { command = fs.readFileSync(path.join("/proc", entry, "cmdline"), "utf8").replaceAll("\0", " ") } catch { continue }
    if (!command.includes("opencode") || !needles.some((needle) => command.includes(needle))) continue
    if (command.includes(SCRIPT_PATH) || command.includes("opencode-session-sync")) continue
    if (/\b(session list|session export|session import|debug paths db|--version)\b/.test(command)) continue
    if (/\bserve\b.*--service\b/.test(command)) continue
    return { active: true, pid: Number(entry) }
  }
  return { active: false }
}

function versionFromBinary(client) {
  const config = homeConfig(client)
  const bin = client === "v1" ? config.v1Bin : config.v2Bin
  const result = spawnSync(bin, ["--version"], { env: versionEnv(client, config), encoding: "utf8", timeout: 30000 })
  if (result.status !== 0) return client === "v1" ? "1.19.6" : "2.3.2"
  const match = (result.stdout || result.stderr || "").match(/[0-9]+\.[0-9]+\.[0-9]+/)
  return match ? match[0] : (client === "v1" ? "1.19.6" : "2.3.2")
}

function idForSource(sourceClient, targetClient, sourceData, sourceHash) {
  return idFor("ses", [sourceClient, targetClient, sourceID(sourceClient, sourceData), sourceHash].join(":"))
}

function convert(sourceClient, targetClient, sourceData, workspace, targetID, sourceHash) {
  const seed = [sourceClient, sourceID(sourceClient, sourceData), sourceHash, targetClient].join(":")
  return sourceClient === "v1"
    ? convertV1ToV2(sourceData, { targetSessionID: targetID, workspace, seed })
    : convertV2ToV1(sourceData, { targetSessionID: targetID, workspace, seed, targetVersion: versionFromBinary("v1") })
}

function stateDirectory(config) {
  return path.join(config.hostHome, ".local", "state", "vpn-dev-workspace", "session-sync")
}

function secureDirectory(dir) {
  fs.mkdirSync(dir, { recursive: true, mode: 0o700 })
  try { fs.chmodSync(dir, 0o700) } catch {}
}

function ledgerFile(config) {
  return path.join(stateDirectory(config), "ledger.json")
}

function readLedger(file) {
  try {
    const value = JSON.parse(fs.readFileSync(file, "utf8"))
    if (object(value) && value.version === FORMAT_VERSION && Array.isArray(value.mappings)) return value
  } catch {}
  return { version: FORMAT_VERSION, mappings: [], updatedAt: new Date().toISOString() }
}

function writeLedger(file, ledger) {
  secureDirectory(path.dirname(file))
  ledger.updatedAt = new Date().toISOString()
  const temp = file + "." + process.pid + "." + crypto.randomUUID() + ".tmp"
  fs.writeFileSync(temp, JSON.stringify(ledger, null, 2) + "\n", { mode: 0o600, flag: "wx" })
  fs.renameSync(temp, file)
  try { fs.chmodSync(file, 0o600) } catch {}
}

function mappingKey(sourceClient, id, hash, targetClient) {
  return [sourceClient, id, hash, targetClient].join(":")
}

function mappingsFor(ledger, sourceClient, id, targetClient) {
  return ledger.mappings
    .filter((entry) => entry.sourceClient === sourceClient && entry.sourceID === id && entry.targetClient === targetClient)
    .sort((left, right) => String(right.createdAt).localeCompare(String(left.createdAt)))
}

export function findUnchangedMirror(ledger, sourceClient, id, targetClient, semanticHash) {
  return ledger.mappings.find((entry) =>
    entry.sourceClient === targetClient &&
    entry.sourceID &&
    entry.targetClient === sourceClient &&
    entry.targetID === id &&
    entry.targetHash === semanticHash
  )
}

function sameWorkspace(sourceValue, workspace) {
  const source = normalizePath(sourceValue)
  const target = normalizePath(workspace)
  if (source && source === target) return true
  const host = normalizePath(process.env.VPN_HOST_WORKSPACE_DIR || "")
  const container = normalizePath(process.env.VPN_CONTAINER_WORKSPACE_DIR || "")
  return (source === host && target === container) || (source === container && target === host)
}

function inspectTarget(client, id, workspace) {
  try {
    const data = exportSession(client, id, workspace)
    return { exists: true, data, hash: stableHash(semanticMessages(client, data)) }
  } catch {
    return { exists: false }
  }
}

function syncOne(sourceClient, targetClient, sourceData, workspace, ledger, tempDir) {
  const id = sourceID(sourceClient, sourceData)
  if (typeof id !== "string" || !id) return { status: "conflict", reason: "source session ID is missing" }
  const sourceHash = stableHash(sourceData)
  const sourceSemanticHash = stableHash(semanticMessages(sourceClient, sourceData))
  const mirror = findUnchangedMirror(ledger, sourceClient, id, targetClient, sourceSemanticHash)
  if (mirror) {
    return {
      status: "unchanged",
      reason: "identical synchronized copy; reverse transfer skipped",
      sourceClient,
      sourceID: id,
      targetClient,
      targetID: mirror.sourceID,
    }
  }
  const key = mappingKey(sourceClient, id, sourceHash, targetClient)
  const known = ledger.mappings.find((entry) => entry.key === key)
  const generatedID = idForSource(sourceClient, targetClient, sourceData, sourceHash)
  const targetConfig = homeConfig(targetClient)
  const active = findActiveClient(targetClient, targetConfig)
  if (active.active) return {
    status: "pending", reason: "target client is active; import deferred",
    sourceID: id, targetID: known?.targetID || generatedID, targetClient, targetPID: active.pid,
  }

  let desired
  try { desired = convert(sourceClient, targetClient, sourceData, workspace, generatedID, sourceHash) }
  catch (error) {
    return { status: "conflict", sourceID: id, targetID: generatedID, reason: String(error.message || error) }
  }
  const expectedHash = stableHash(semanticMessages(targetClient, desired))
  const target = inspectTarget(targetClient, generatedID, workspace)
  let verifiedHash
  if (target.exists) {
    if (target.hash !== expectedHash) {
      return { status: "conflict", reason: "deterministic destination ID has different content", sourceID: id, targetID: generatedID }
    }
    verifiedHash = target.hash
  } else {
    try {
      importSession(targetClient, desired, workspace, tempDir)
    } catch (error) {
      return { status: "pending", reason: "native import failed: " + String(error.message || error), sourceID: id, targetID: generatedID }
    }
    const imported = inspectTarget(targetClient, generatedID, workspace)
    if (!imported.exists || imported.hash !== expectedHash) {
      return { status: "pending", reason: "import verification did not match exported transcript", sourceID: id, targetID: generatedID }
    }
    verifiedHash = imported.hash
  }

  if (!known) {
    ledger.mappings.push({
      key, sourceClient, sourceID: id, sourceHash, targetClient, targetID: generatedID,
      targetHash: verifiedHash, createdAt: new Date().toISOString(),
    })
  }
  return {
    status: known && target.exists ? "unchanged" : "applied",
    sourceClient, sourceID: id, sourceHash, targetClient, targetID: generatedID,
  }
}

function exportRecent(client, workspace, limit, results) {
  try {
    const rows = listSessions(client, workspace, limit)
    const sessions = []
    for (const row of rows) {
      try {
        const data = exportSession(client, row.id, workspace)
        if (sameWorkspace(sessionWorkspace(client, data), workspace)) sessions.push(data)
      } catch (error) {
        results.push({ status: "pending", sourceID: row.id, reason: "export failed: " + String(error.message || error) })
      }
    }
    return sessions
  } catch (error) {
    results.push({ status: "pending", reason: "session list failed: " + String(error.message || error) })
    return []
  }
}

function timeUpdated(client, data) {
  return finite(client === "v1" ? data?.info?.time?.updated : data?.info?.time?.updated, 0)
}

async function withLock(file, action) {
  secureDirectory(path.dirname(file))
  const started = Date.now()
  let handle
  while (!handle) {
    try {
      handle = await fs.promises.open(file, "wx", 0o600)
      await handle.writeFile(JSON.stringify({ pid: process.pid, startedAt: Date.now() }))
    } catch (error) {
      if (error.code !== "EEXIST") throw error
      try {
        const lock = JSON.parse(fs.readFileSync(file, "utf8"))
        if (Date.now() - Number(lock.startedAt) > 600000) {
          fs.rmSync(file, { force: true })
          continue
        }
      } catch {
        try {
          if (Date.now() - fs.statSync(file).mtimeMs > 600000) fs.rmSync(file, { force: true })
        } catch {}
      }
      if (Date.now() - started > 10000) throw new Error("session sync lock is busy")
      await new Promise((resolve) => setTimeout(resolve, 100))
    }
  }
  try { return await action() }
  finally { await handle.close(); fs.rmSync(file, { force: true }) }
}

function summarize(results) {
  const counts = { applied: 0, unchanged: 0, pending: 0, conflict: 0 }
  for (const result of results) counts[result.status] = (counts[result.status] || 0) + 1
  return {
    status: counts.pending || counts.conflict ? "pending" : (counts.applied ? "applied" : "unchanged"),
    counts,
    results,
  }
}

function logSummary(action, summary) {
  const counts = summary.counts
  let message = "[session-sync] " + action + ": " + counts.applied + " copied, " +
    counts.unchanged + " unchanged, " + counts.pending + " pending, " + counts.conflict + " conflicts."
  const detail = summary.results.find((result) => result.status === "pending" || result.status === "conflict")
  if (detail?.reason) message += " " + detail.reason
  process.stderr.write(message + "\n")
}

function argsForClient(client, args, selectedID, continueRequested) {
  const output = []
  let hadSessionFlag = false
  for (let index = 0; index < args.length; index += 1) {
    const value = args[index]
    if (value === "--continue" || value === "-c") continue
    if (value === "--session" || value === "-s") { hadSessionFlag = true; index += 1; continue }
    if (value.startsWith("--session=") || value.startsWith("-s=")) { hadSessionFlag = true; continue }
    output.push(value)
  }
  if (selectedID && (hadSessionFlag || continueRequested)) output.push("--session", selectedID)
  else if (continueRequested) output.push("--continue")
  return output
}

function parseSelection(args) {
  let session = ""
  let continueRequested = false
  for (let index = 0; index < args.length; index += 1) {
    const value = args[index]
    if ((value === "--session" || value === "-s") && args[index + 1]) {
      session = args[index + 1]
      index += 1
    } else if (value.startsWith("--session=")) session = value.slice("--session=".length)
    else if (value.startsWith("-s=")) session = value.slice(3)
    else if (value === "--continue" || value === "-c") continueRequested = true
  }
  return { session, continueRequested }
}

function writeArgsFile(stateDir, args) {
  secureDirectory(stateDir)
  const file = path.join(stateDir, "args-" + crypto.randomUUID() + ".bin")
  const payload = Buffer.concat(args.flatMap((arg) => [Buffer.from(String(arg)), Buffer.from([0])]))
  fs.writeFileSync(file, payload, { mode: 0o600, flag: "wx" })
  return file
}

function emit(value) {
  process.stdout.write(JSON.stringify(value) + "\n")
}

async function before(client, workspace, args) {
  const sourceClient = client === "v1" ? "v2" : "v1"
  const config = homeConfig(client)
  const stateDir = stateDirectory(config)
  return withLock(path.join(stateDir, "sync.lock"), async () => {
    const ledger = readLedger(ledgerFile(config))
    const results = []
    const rawLimit = process.env.OPENCODE_SESSION_SYNC_LIMIT || String(DEFAULT_LIMIT)
    const limit = /^[1-9][0-9]*$/.test(rawLimit) ? Math.min(Number(rawLimit), 100) : DEFAULT_LIMIT
    const selection = parseSelection(args)
    const sourceSessions = exportRecent(sourceClient, workspace, limit, results)
      .sort((left, right) => timeUpdated(sourceClient, right) - timeUpdated(sourceClient, left))
    const importedSourceIDs = new Set()
    for (const data of sourceSessions) {
      const id = sourceID(sourceClient, data)
      if (!id || importedSourceIDs.has(id)) continue
      importedSourceIDs.add(id)
      results.push(syncOne(sourceClient, client, data, workspace, ledger, stateDir))
    }

    if (selection.session && !importedSourceIDs.has(selection.session)) {
      try {
        const data = exportSession(sourceClient, selection.session, workspace)
        if (sameWorkspace(sessionWorkspace(sourceClient, data), workspace)) {
          results.push(syncOne(sourceClient, client, data, workspace, ledger, stateDir))
          importedSourceIDs.add(selection.session)
        }
      } catch {}
    }

    const targetSessions = exportRecent(client, workspace, limit, results)
    const snapshots = {}
    for (const data of targetSessions) {
      const id = sourceID(client, data)
      snapshots[id] = stableHash(semanticMessages(client, data))
    }

    let selectedTargetID = ""
    if (selection.session) {
      const native = inspectTarget(client, selection.session, workspace)
      if (native.exists) selectedTargetID = selection.session
      else selectedTargetID = mappingsFor(ledger, sourceClient, selection.session, client)[0]?.targetID || selection.session
    } else if (selection.continueRequested) {
      const newestSource = sourceSessions[0]
      const newestTarget = targetSessions[0]
      if (newestSource && (!newestTarget || timeUpdated(sourceClient, newestSource) >= timeUpdated(client, newestTarget))) {
        const sourceIDValue = sourceID(sourceClient, newestSource)
        selectedTargetID = mappingsFor(ledger, sourceClient, sourceIDValue, client)[0]?.targetID || ""
      } else if (newestTarget) {
        selectedTargetID = sourceID(client, newestTarget)
      }
    }

    const token = crypto.randomUUID()
    const argsFile = writeArgsFile(stateDir, argsForClient(client, args, selectedTargetID, selection.continueRequested))
    const runDir = path.join(stateDir, "runs")
    secureDirectory(runDir)
    const manifestFile = path.join(runDir, token + ".json")
    fs.writeFileSync(manifestFile, JSON.stringify({
      formatVersion: FORMAT_VERSION, token, client, sourceClient, workspace,
      snapshots, selectedTargetID, createdAt: Date.now(), argsFile,
    }, null, 2), { mode: 0o600, flag: "wx" })
    writeLedger(ledgerFile(config), ledger)
    const summary = summarize(results)
    logSummary("before", summary)
    emit({
      ...summary, client, sourceClient, database: config.db, workspace,
      launchSessionID: selectedTargetID || undefined, token, manifestFile, argsFile,
    })
    return 0
  })
}

async function after(client, workspace, token) {
  const config = homeConfig(client)
  const stateDir = stateDirectory(config)
  const manifestFile = path.join(stateDir, "runs", token + ".json")
  const manifest = JSON.parse(fs.readFileSync(manifestFile, "utf8"))
  if (manifest.client !== client || normalizePath(manifest.workspace) !== normalizePath(workspace)) {
    throw new Error("run token does not match client/workspace")
  }
  const targetClient = manifest.sourceClient
  const targetConfig = homeConfig(targetClient)
  return withLock(path.join(stateDir, "sync.lock"), async () => {
    const ledger = readLedger(ledgerFile(config))
    const results = []
    const rawLimit = process.env.OPENCODE_SESSION_SYNC_LIMIT || String(DEFAULT_LIMIT)
    const limit = /^[1-9][0-9]*$/.test(rawLimit) ? Math.min(Number(rawLimit), 100) : DEFAULT_LIMIT
    const current = exportRecent(client, workspace, limit, results)
    const currentByID = new Map(current.map((data) => [sourceID(client, data), data]))
    const candidates = new Set([...Object.keys(manifest.snapshots || {}), ...currentByID.keys()])
    if (manifest.selectedTargetID) candidates.add(manifest.selectedTargetID)

    for (const id of candidates) {
      if (!id) continue
      let data = currentByID.get(id)
      if (!data) {
        try { data = exportSession(client, id, workspace) } catch { continue }
      }
      if (!sameWorkspace(sessionWorkspace(client, data), workspace)) continue
      const hash = stableHash(semanticMessages(client, data))
      if (manifest.snapshots?.[id] === hash) continue
      results.push(syncOne(client, targetClient, data, workspace, ledger, stateDir))
    }

    writeLedger(ledgerFile(config), ledger)
    const summary = summarize(results)
    logSummary("after", summary)
    if (summary.status !== "pending") {
      fs.rmSync(manifestFile, { force: true })
      fs.rmSync(manifest.argsFile, { force: true })
    }
    emit({
      ...summary, client, targetClient, database: targetConfig.db, workspace, token,
    })
    return summary.status === "pending" ? 1 : 0
  })
}

function parseCommand(argv) {
  const command = argv[0]
  let client = ""
  let workspace = process.cwd()
  let token = ""
  const appArgs = []
  let passthrough = false
  for (let index = 1; index < argv.length; index += 1) {
    const value = argv[index]
    if (passthrough) appArgs.push(value)
    else if (value === "--") passthrough = true
    else if (value === "--client") client = argv[++index] || ""
    else if (value === "--workspace") workspace = argv[++index] || ""
    else if (value === "--token") token = argv[++index] || ""
    else throw new Error("unknown argument: " + value)
  }
  return { command, client, workspace, token, appArgs }
}

async function main() {
  try {
    if (process.argv[2] === "--help" || process.argv[2] === "-h") {
      process.stdout.write([
        "Usage: opencode-session-sync <before|after|status> --client <v1|v2> --workspace <absolute-path> [options]",
        "  before: -- [OpenCode arguments]",
        "  after:  --token <run-uuid>",
        "  status: show local ledger metadata",
        "Session content is converted through native JSON export/import; no database files are copied between clients.",
      ].join("\n") + "\n")
      return 0
    }
    const parsed = parseCommand(process.argv.slice(2))
    if (!["v1", "v2"].includes(parsed.client)) throw new Error("--client must be v1 or v2")
    if (!path.isAbsolute(parsed.workspace) || !fs.existsSync(parsed.workspace)) {
      throw new Error("--workspace must be an existing absolute directory")
    }
    if (parsed.command === "before") return await before(parsed.client, parsed.workspace, parsed.appArgs)
    if (parsed.command === "after") {
      if (!parsed.token || !/^[0-9a-f-]{36}$/.test(parsed.token)) throw new Error("--token must be a run UUID")
      return await after(parsed.client, parsed.workspace, parsed.token)
    }
    if (parsed.command === "status") {
      const config = homeConfig(parsed.client)
      const ledger = readLedger(ledgerFile(config))
      emit({ status: "ok", client: parsed.client, database: config.db, ledger: ledgerFile(config), mappings: ledger.mappings.length })
      return 0
    }
    throw new Error("command must be before, after, or status")
  } catch (error) {
    process.stderr.write("opencode-session-sync: " + String(error.message || error) + "\n")
    emit({ status: "pending", reason: String(error.message || error) })
    return 1
  }
}

if (process.argv[1] && path.resolve(process.argv[1]) === SCRIPT_PATH) {
  process.exitCode = await main()
}
