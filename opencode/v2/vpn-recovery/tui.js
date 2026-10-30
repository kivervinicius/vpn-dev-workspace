import { Plugin } from "@opencode/plugin/tui"
import { setupTuiPlugin } from "./tui-core.js"

export default Plugin.define({
  id: "vpn-recovery",
  setup: setupTuiPlugin,
})
