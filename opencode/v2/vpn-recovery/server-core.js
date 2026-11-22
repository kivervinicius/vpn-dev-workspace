import { classifyV2Error } from "./classify.js"
import { vetoDecision } from "./policy.js"

// Provider quotas are status-only. The server hook vetoes the runtime retry
// for structured quota errors so a turn with tool calls is never replayed.
export async function setupServerPlugin(ctx) {
  if (process.env.VPN_WORKSPACE_CONTAINER !== "1") return () => {}

  const registration = await ctx.session.hook("retry", async (event) => {
    if (!classifyV2Error(event?.error)) return
    event.decision = vetoDecision()
  })
  return () => {
    if (typeof registration === "function") registration()
    else registration?.dispose?.()
  }
}
