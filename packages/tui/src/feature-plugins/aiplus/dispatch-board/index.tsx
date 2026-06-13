/** @jsxImportSource @opentui/solid */

import type { TuiPlugin, TuiPluginApi } from "@opencode-ai/plugin/tui"
import type { BuiltinTuiPlugin } from "../builtins"
import { DispatchBoardRoute, dispatchBoardStore } from "./route"

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
      {
        name: "aiplus.dispatch.refresh",
        title: "AiPlus: Refresh Dispatch Board",
        category: "AiPlus",
        run() {
          dispatchBoardStore.refresh()
        },
      },
      {
        name: "aiplus.dispatch.cycle-role",
        title: "AiPlus: Cycle Role Filter",
        category: "AiPlus",
        run() {
          dispatchBoardStore.cycleRole()
        },
      },
      {
        name: "aiplus.dispatch.cycle-status",
        title: "AiPlus: Cycle Status Filter",
        category: "AiPlus",
        run() {
          dispatchBoardStore.cycleStatus()
        },
      },
      {
        name: "aiplus.dispatch.back",
        title: "AiPlus: Back to Home",
        category: "AiPlus",
        run() {
          api.route.navigate({ type: "home" })
        },
      },
    ],
    bindings: [
      { command: "aiplus.open-dispatch", key: "F3" },
      { command: "aiplus.dispatch.refresh", key: "r" },
      { command: "aiplus.dispatch.cycle-role", key: "f" },
      { command: "aiplus.dispatch.cycle-status", key: "s" },
      { command: "aiplus.dispatch.back", key: "escape" },
    ],
  })
}

const plugin: BuiltinTuiPlugin = {
  id,
  tui,
}

export default plugin
