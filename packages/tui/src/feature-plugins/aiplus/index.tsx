/** @jsxImportSource @opentui/solid */

import type { TuiPlugin, TuiPluginApi } from "@opencode-ai/plugin/tui"
import type { BuiltinTuiPlugin } from "../builtins"
import { LobbyHomeWidget } from "./lobby/home-widget"
import { LobbyRoute } from "./lobby/route"

const id = "internal:aiplus-lobby"
const LAYER_PRIORITY = 950

function View(props: { api: TuiPluginApi }) {
  return <LobbyHomeWidget api={props.api} />
}

const tui: TuiPlugin = async (api) => {
  // Register home_bottom slot — compact lobby widget (renders above tips)
  api.slots.register({
    order: 55,
    slots: {
      home_bottom() {
        return <View api={api} />
      },
    },
  })

  // Register aiplus-lobby full-screen route
  api.route.register([
    {
      name: "aiplus-lobby",
      render: () => <LobbyRoute api={api} />,
    },
  ])

  // Register keybind layer
  api.keymap.registerLayer({
    priority: LAYER_PRIORITY,
    commands: [
      {
        name: "aiplus.open-lobby",
        title: "AiPlus: Lobby Dashboard",
        category: "AiPlus",
        run() {
          api.route.navigate("aiplus-lobby")
        },
      },
    ],
    bindings: [
      { command: "aiplus.open-lobby", key: "F2" },
    ],
  })
}

const plugin: BuiltinTuiPlugin = {
  id,
  tui,
}

export default plugin
