/** @jsxImportSource @opentui/solid */

import type { TuiPluginApi, TuiThemeCurrent } from "@opencode-ai/plugin/tui"
import { createMemo, createResource, For, Show } from "solid-js"
import { createAiPlusClient } from "../shared/client"
import { pillarColor, pillarLabel, statusSymbol, truncate } from "../shared/components"
import type { RoleStatus, LobbyStatusResponse } from "./types"

function groupByPillar(roles: LobbyStatusResponse["roles"]) {
  return {
    coordinator: roles.filter((r) => r.pillar === "coordinator"),
    verifier: roles.filter((r) => r.pillar === "verifier"),
    expert: roles.filter((r) => r.pillar === "expert"),
  }
}

function formatTime(iso: string | undefined): string {
  if (!iso) return "—"
  const date = new Date(iso)
  const now = Date.now()
  const diff = now - date.getTime()
  const mins = Math.floor(diff / 60000)
  if (mins < 1) return "just now"
  if (mins < 60) return `${mins}m ago`
  const hours = Math.floor(mins / 60)
  if (hours < 24) return `${hours}h ago`
  return `${Math.floor(hours / 24)}d ago`
}

function RoleRow(props: { role: RoleStatus; theme: TuiThemeCurrent }) {
  const t = props.theme
  const color = pillarColor(props.role.pillar, { success: t.success, info: t.info, warning: t.warning })

  return (
    <box flexDirection="row" gap={1} paddingLeft={1} paddingRight={1}>
      <text fg={color} width={3}>
        {statusSymbol(props.role.status)}
      </text>
      <text fg={t.text} width={18}>
        {truncate(props.role.name, 18)}
      </text>
      <text fg={t.textMuted} width={12}>
        {pillarLabel(props.role.pillar)}
      </text>
      <text
        fg={props.role.status === "active" ? t.success : props.role.status === "stale" ? t.warning : t.textMuted}
        width={8}
      >
        {props.role.status}
      </text>
      <text fg={t.textMuted} width={12}>
        {formatTime(props.role.lastActive)}
      </text>
    </box>
  )
}

export function LobbyRoute(props: { api: TuiPluginApi }) {
  const theme = () => props.api.theme.current
  const client = createAiPlusClient("")
  const [data, { refetch }] = createResource(() => client.lobbyStatus())

  const groups = createMemo(() => {
    const d = data()
    if (!d) return null
    return groupByPillar(d.roles)
  })

  const boundInfo = createMemo(() => {
    const d = data()
    if (!d || !d.state.boundRole) return null
    return `Bound: ${d.state.boundRole}`
  })

  return (
    <box flexDirection="column" flexGrow={1} paddingTop={1} paddingBottom={1}>
      {/* Title bar */}
      <box flexDirection="row" paddingLeft={2} paddingRight={2} paddingBottom={1} gap={2}>
        <text fg={theme().text}>
          <b>AiPlus Lobby</b>
        </text>
        <text fg={theme().textMuted}>— Agent Team Status</text>
        <box flexGrow={1} />
        <Show when={boundInfo()}>
          <text fg={theme().info}>{boundInfo()}</text>
        </Show>
        <text fg={theme().textMuted}>[R refresh] [Esc back]</text>
      </box>

      {/* Separator */}
      <box width="100%" height={1}>
        <text fg={theme().borderSubtle}>{"─".repeat(75)}</text>
      </box>

      {/* Column header */}
      <box flexDirection="row" gap={1} paddingLeft={2} paddingTop={1}>
        <text fg={theme().textMuted} width={3}>
          {" "}
        </text>
        <text fg={theme().textMuted} width={18}>
          <b>Role</b>
        </text>
        <text fg={theme().textMuted} width={12}>
          <b>Pillar</b>
        </text>
        <text fg={theme().textMuted} width={8}>
          <b>Status</b>
        </text>
        <text fg={theme().textMuted} width={12}>
          <b>Last Active</b>
        </text>
      </box>

      {/* Role table */}
      <Show when={groups()} fallback={<text fg={theme().textMuted}>Loading...</text>}>
        {(["coordinator", "verifier", "expert"] as const).map((pillar) => {
          const roles = groups()?.[pillar] ?? []
          const color = pillarColor(pillar, {
            success: theme().success,
            info: theme().info,
            warning: theme().warning,
          })

          return (
            <box flexDirection="column">
              {/* Pillar section header */}
              <box paddingLeft={2} paddingTop={1} paddingBottom={0}>
                <text fg={color}>
                  <b>▸ {pillarLabel(pillar)}</b>
                </text>
                <text fg={theme().textMuted}>
                  {" "}
                  ({roles.filter((r) => r.status === "active").length} active / {roles.length} total)
                </text>
              </box>
              <For each={roles}>{(role) => <RoleRow role={role} theme={theme()} />}</For>
            </box>
          )
        })}
      </Show>

      {/* Lane status section */}
      <box paddingLeft={2} paddingTop={2} paddingBottom={1}>
        <text fg={theme().text}>
          <b>▸ CEO Lanes</b>
        </text>
      </box>
      <Show when={data()}>
        <box flexDirection="row" gap={2} paddingLeft={3}>
          <For each={data()!.lanes}>
            {(lane) => (
              <text fg={lane.status === "active" ? theme().success : theme().textMuted}>
                {lane.lane}: {lane.status === "active" ? "■ ACTIVE" : "□ idle"}
                {lane.lastActive ? ` (${formatTime(lane.lastActive)})` : ""}
              </text>
            )}
          </For>
        </box>
      </Show>

      {/* Footer */}
      <box flexGrow={1} />
      <box width="100%" height={1}>
        <text fg={theme().borderSubtle}>{"─".repeat(75)}</text>
      </box>
      <box flexDirection="row" paddingLeft={2} paddingRight={2} gap={2}>
        <text fg={theme().textMuted}>AiPlus Lobby v0.0.3</text>
        <box flexGrow={1} />
        <text fg={theme().textMuted}>{data() ? `${data()!.roles.length} roles loaded` : "loading…"}</text>
      </box>
    </box>
  )
}
