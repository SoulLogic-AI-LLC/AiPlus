/** @jsxImportSource @opentui/solid */

import type { TuiPluginApi } from "@opencode-ai/plugin/tui"
import { createMemo, createResource, Show } from "solid-js"
import { createAiPlusClient } from "../shared/client"
import { pillarColor, statusSymbol, truncate } from "../shared/components"
import type { LobbyStatusResponse } from "./types"

function groupByPillar(roles: LobbyStatusResponse["roles"]) {
  return {
    coordinator: roles.filter((r) => r.pillar === "coordinator"),
    verifier: roles.filter((r) => r.pillar === "verifier"),
    expert: roles.filter((r) => r.pillar === "expert"),
  }
}

export function LobbyHomeWidget(props: { api: TuiPluginApi }) {
  const theme = () => props.api.theme.current
  const client = createAiPlusClient("") // relative URL to same server
  const [data] = createResource(() => client.lobbyStatus())

  const groups = createMemo(() => {
    const d = data()
    if (!d) return null
    return groupByPillar(d.roles)
  })

  const activeLanes = createMemo(() => {
    const d = data()
    if (!d) return []
    return d.lanes.filter((l) => l.status === "active")
  })

  return (
    <Show when={data()}>
      <box width="100%" maxWidth={75} paddingTop={1} paddingBottom={1} flexDirection="column" flexShrink={0}>
        {/* Header */}
        <box flexDirection="row" gap={2} paddingLeft={2} paddingRight={2}>
          <text fg={theme().text}>
            <b>AiPlus Lobby</b>
          </text>
          <text fg={theme().textMuted}>[{activeLanes().length}/3 lanes active] [F2 details]</text>
        </box>

        {/* Pillar groups */}
        <Show when={groups()}>
          <box flexDirection="column" gap={1} paddingLeft={2} paddingRight={2} paddingTop={1}>
            {(["coordinator", "verifier", "expert"] as const).map((pillar) => {
              const roles = groups()?.[pillar] ?? []
              const activeCount = roles.filter((r) => r.status === "active").length
              const color = pillarColor(pillar, {
                success: theme().success,
                info: theme().info,
                warning: theme().warning,
              })

              return (
                <box flexDirection="row" gap={1} alignItems="center">
                  <text fg={color} width={12}>
                    {pillar.charAt(0).toUpperCase() + pillar.slice(1)}
                  </text>
                  <text fg={theme().textMuted} width={10}>
                    {activeCount}/{roles.length} active
                  </text>
                  <box flexDirection="row" gap={1} flexGrow={1}>
                    {roles.slice(0, 6).map((r) => (
                      <text
                        fg={
                          r.status === "active"
                            ? theme().success
                            : r.status === "stale"
                              ? theme().warning
                              : theme().textMuted
                        }
                      >
                        {statusSymbol(r.status)} {truncate(r.name, 10)}
                      </text>
                    ))}
                    {roles.length > 6 && <text fg={theme().textMuted}>+{roles.length - 6}</text>}
                  </box>
                </box>
              )
            })}
          </box>
        </Show>

        {/* Lane status bar */}
        <Show when={activeLanes().length > 0}>
          <box flexDirection="row" gap={2} paddingLeft={2} paddingRight={2} paddingTop={1}>
            <text fg={theme().textMuted}>Lanes:</text>
            {(["ceo-1", "ceo-2", "ceo-3"] as const).map((lane) => {
              const active = activeLanes().find((l) => l.lane === lane)
              return (
                <text fg={active ? theme().success : theme().textMuted}>
                  {lane} {active ? "■" : "□"}
                </text>
              )
            })}
          </box>
        </Show>
      </box>
    </Show>
  )
}
