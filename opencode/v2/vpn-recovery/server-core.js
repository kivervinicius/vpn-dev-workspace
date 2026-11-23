import { classifyV2Error } from "./classify.js"
import { vetoDecision } from "./policy.js"

// The server hook only vetoes runtime retries for structured quota errors.
// VPN reconnection is initiated separately by the TUI notification path.
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
