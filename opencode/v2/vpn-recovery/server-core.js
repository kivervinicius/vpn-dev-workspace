import { classifyV2Error } from "./classify.js"

export async function setupServerPlugin(ctx) {
  const registration = await ctx.session.hook("retry", (event) => {
    if (classifyV2Error(event?.error)) event.decision = { retry: false }
  })
  return () => {
    if (typeof registration === "function") registration()
    else registration?.dispose?.()
  }
}
