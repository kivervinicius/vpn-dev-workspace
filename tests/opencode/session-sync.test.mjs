import test from "node:test"
import assert from "node:assert/strict"
import {
  convertV1ToV2,
  convertV2ToV1,
  findUnchangedMirror,
  parseSessionList,
  stableHash,
} from "../../scripts/opencode-session-sync.mjs"

function v1Fixture() {
  const sessionID = "ses_fixture_v1"
  const userID = "msg_fixture_user"
  const assistantID = "msg_fixture_assistant"
  return {
    info: {
      id: sessionID,
      slug: "fixture",
      projectID: "prj_fixture",
      directory: "/workspace",
      title: "Synthetic transcript",
      version: "1.19.6",
      agent: "build",
      model: { id: "model-a", providerID: "provider-a" },
      time: { created: 1000, updated: 3000 },
      cost: 0.25,
      tokens: { input: 10, output: 5, reasoning: 0, cache: { read: 0, write: 0 } },
    },
    messages: [
      {
        info: {
          id: userID,
          sessionID,
          role: "user",
          time: { created: 1000 },
          agent: "build",
          model: { providerID: "provider-a", modelID: "model-a" },
        },
        parts: [{
          id: "prt_fixture_user",
          sessionID,
          messageID: userID,
          type: "text",
          text: "Run a harmless check.",
        }],
      },
      {
        info: {
          id: assistantID,
          sessionID,
          role: "assistant",
          time: { created: 2000, completed: 3000 },
          parentID: userID,
          modelID: "model-a",
          providerID: "provider-a",
          mode: "build",
          agent: "build",
          path: { cwd: "/workspace", root: "/workspace" },
          cost: 0.25,
          tokens: { input: 10, output: 5, reasoning: 0, cache: { read: 0, write: 0 } },
        },
        parts: [
          { id: "prt_fixture_reasoning", sessionID, messageID: assistantID, type: "reasoning", text: "Inspect safely." },
          { id: "prt_fixture_tool", sessionID, messageID: assistantID, type: "tool", callID: "call_fixture", tool: "read", state: {
            status: "completed",
            input: { filePath: "README.md" },
            output: "read complete",
            title: "Read README",
            metadata: {},
            time: { start: 2100, end: 2200 },
          } },
          { id: "prt_fixture_text", sessionID, messageID: assistantID, type: "text", text: "Check finished." },
        ],
      },
    ],
  }
}

function v2Fixture() {
  const sessionID = "ses_fixture_v2"
  const userID = "msg_fixture_v2_user"
  const assistantID = "msg_fixture_v2_assistant"
  return {
    info: {
      id: sessionID,
      projectID: "prj_fixture",
      title: "Synthetic transcript",
      agent: "build",
      model: { id: "model-a", providerID: "provider-a" },
      location: { directory: "/workspace" },
      cost: 0.25,
      tokens: { input: 10, output: 5, reasoning: 0, cache: { read: 0, write: 0 } },
      time: { created: 1000, updated: 3000, idle: 3000 },
    },
    messages: [
      {
        id: userID,
        sessionID,
        type: "user",
        time: { created: 1000 },
        text: "Run a harmless check.",
      },
      {
        id: assistantID,
        sessionID,
        type: "assistant",
        agent: "build",
        model: { id: "model-a", providerID: "provider-a" },
        content: [
          { type: "reasoning", text: "Inspect safely.", time: { created: 2000, completed: 2100 } },
          { type: "tool", id: "call_fixture", name: "read", executed: false, time: { created: 2100, ran: 2100, completed: 2200 }, state: {
            status: "completed",
            input: { filePath: "README.md" },
            content: [{ type: "text", text: "read complete" }],
            metadata: {},
          } },
          { type: "text", text: "Check finished." },
        ],
        time: { created: 2000, completed: 3000 },
        cost: 0.25,
        tokens: { input: 10, output: 5, reasoning: 0, cache: { read: 0, write: 0 } },
      },
    ],
  }
}

test("v1 exports convert to a detached v2 copy with stable new IDs and completed tool records", () => {
  const input = v1Fixture()
  const options = { targetSessionID: "ses_copy_v1_to_v2", workspace: "/workspace", seed: "seed-a" }
  const first = convertV1ToV2(input, options)
  const repeated = convertV1ToV2(input, options)

  assert.equal(first.info.id, options.targetSessionID)
  assert.equal(first.info.title, input.info.title)
  assert.deepEqual(first, repeated)
  assert.equal(first.messages[0].type, "user")
  assert.equal(first.messages[0].text, "Run a harmless check.")
  const assistant = first.messages[1]
  assert.equal(assistant.type, "assistant")
  assert.equal(assistant.content.find((part) => part.type === "text").text, "Check finished.")
  const tool = assistant.content.find((part) => part.type === "tool")
  assert.equal(tool.state.status, "completed")
  assert.equal(tool.executed, false)
  assert.equal(tool.state.content[0].text, "read complete")
  assert.notEqual(assistant.id, input.messages[1].info.id)
})

test("v2 exports convert to a detached v1 copy without marking old tools for execution", () => {
  const input = v2Fixture()
  const options = {
    targetSessionID: "ses_copy_v2_to_v1",
    workspace: "/workspace",
    seed: "seed-b",
    targetVersion: "1.19.6",
  }
  const first = convertV2ToV1(input, options)
  const repeated = convertV2ToV1(input, options)

  assert.equal(first.info.id, options.targetSessionID)
  assert.equal(first.info.title, input.info.title)
  assert.equal(first.info.version, "1.19.6")
  assert.deepEqual(first, repeated)
  const assistant = first.messages[1]
  assert.equal(assistant.info.role, "assistant")
  assert.equal(assistant.info.parentID, first.messages[0].info.id)
  assert.equal(assistant.parts.find((part) => part.type === "text").text, "Check finished.")
  const tool = assistant.parts.find((part) => part.type === "tool")
  assert.equal(tool.state.status, "completed")
  assert.equal(tool.state.output, "read complete")
})

test("converters reject unsettled tools and attachments rather than losing or replaying them", () => {
  const v1 = v1Fixture()
  v1.messages[1].parts.find((part) => part.type === "tool").state.status = "running"
  assert.throws(() => convertV1ToV2(v1, {
    targetSessionID: "ses_copy",
    workspace: "/workspace",
    seed: "seed-c",
  }), /not settled/)

  const v2 = v2Fixture()
  v2.messages[0].files = [{ mime: "image/png", name: "image.png", data: "data:image/png;base64,AA==" }]
  assert.throws(() => convertV2ToV1(v2, {
    targetSessionID: "ses_copy",
    workspace: "/workspace",
    seed: "seed-d",
    targetVersion: "1.19.6",
  }), /attachments/)
})

test("session hashes ignore volatile update/view timestamps but detect transcript changes", () => {
  const original = { info: { time: { created: 1, updated: 2, viewed: 3 } }, messages: [{ id: "msg_a", text: "same" }] }
  const opened = { info: { time: { created: 1, updated: 99, viewed: 88 } }, messages: [{ id: "msg_a", text: "same" }] }
  const changed = { info: { time: { created: 1, updated: 2 } }, messages: [{ id: "msg_a", text: "changed" }] }
  assert.equal(stableHash(original), stableHash(opened))
  assert.notEqual(stableHash(original), stableHash(changed))
})

test("unchanged synchronized copies do not bounce back into their source client", () => {
  const mappings = [{
    sourceClient: "v1",
    sourceID: "ses_original_v1",
    targetClient: "v2",
    targetID: "ses_copy_v2",
    targetHash: "content-hash",
  }]
  assert.equal(findUnchangedMirror({ mappings }, "v2", "ses_copy_v2", "v1", "content-hash"), mappings[0])
  assert.equal(findUnchangedMirror({ mappings }, "v2", "ses_copy_v2", "v1", "changed-hash"), undefined)
})

test("session list parser accepts arrays and common JSON envelopes", () => {
  const rows = [{ id: "ses_a" }, { id: 3 }, null]
  assert.deepEqual(parseSessionList(rows), [{ id: "ses_a" }])
  assert.deepEqual(parseSessionList({ sessions: rows }), [{ id: "ses_a" }])
  assert.deepEqual(parseSessionList({ data: rows }), [{ id: "ses_a" }])
  assert.deepEqual(parseSessionList({ items: "invalid" }), [])
})
