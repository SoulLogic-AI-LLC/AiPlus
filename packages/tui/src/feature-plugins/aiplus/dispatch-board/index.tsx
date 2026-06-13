/** @jsxImportSource @opentui/solid */

import type { TuiPlugin, TuiPluginApi } from "@opencode-ai/plugin/tui"
import type { BuiltinTuiPlugin } from "../builtins"
import { DispatchBoardRoute } from "./route"

const id = "internal:aiplus-dispatch"
const LAYER_PRIORITY = 951

const tui: TuiPlugin = async (api) => {
  // Register aiplus-dispatch full-screen route
  api.route.register([
    {
      name: "aiplus-dispatch",
      render: () => <DispatchBoardRoute api={api} />,
    },
  ])

  // Register keybind layer
  api.keymap.registerLayer({
    priority: LAYER_PRIORITY,
    commands: [
      {
        name: "aiplus.open-dispatch",
        title: "AiPlus: Dispatch Board",
        category: "AiPlus",
        run() {
          api.route.navigate("aiplus-dispatch")
        },
      },
    ],
    bindings: [
      { command: "aiplus.open-dispatch", key: "F3" },
    ],
  })
}

const plugin: BuiltinTuiPlugin = {
  id,
  tui,
}

export default plugin
