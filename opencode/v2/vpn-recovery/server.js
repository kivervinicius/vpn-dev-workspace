import { Plugin } from "@opencode/plugin"
import { setupServerPlugin } from "./server-core.js"

export default Plugin.define({
  id: "vpn-recovery",
  setup: setupServerPlugin,
})
