/** @jsxImportSource @opentui/solid */

import type { TuiPluginApi, TuiThemeCurrent } from "@opencode-ai/plugin/tui"
import { createMemo, createResource, createSignal, For, Show } from "solid-js"
import { createAiPlusClient } from "../shared/client"
import { truncate } from "../shared/components"
import type { DispatchEntry, FilterState, StatusType } from "./types"
import { getDisplayStatus, getUniqueRoles } from "./types"

/** External store for dispatch board actions (used by keymap commands). */
export const dispatchBoardStore = {
  refresh: () => {},
  cycleRole: () => {},
  cycleLane: () => {},
  cycleStatus: () => {},
}

/** Format duration from timestamp to now. */
function formatDuration(iso: string): string {
  const diff = Date.now() - new Date(iso).getTime()
  const mins = Math.floor(diff / 60000)
  if (mins < 1) return "<1m"
  if (mins < 60) return `${mins}m`
  const hours = Math.floor(mins / 60)
  if (hours < 24) return `${hours}h`
  return `${Math.floor(hours / 24)}d`
}

/** Get color for status. */
function statusColor(status: StatusType, theme: TuiThemeCurrent) {
  switch (status) {
    case "completed":
      return theme.success
    case "failed":
      return theme.error
    case "canceled":
      return theme.warning
    case "running":
      return theme.warning
    case "created":
    default:
      return theme.textMuted
  }
}

/** Get symbol for status. */
function statusSymbol(status: StatusType): string {
  switch (status) {
    case "completed":
      return "✓"
    case "failed":
      return "✗"
    case "canceled":
      return "⊘"
    case "running":
      return "●"
    case "created":
    default:
      return "○"
  }
}

/** Dispatch entry row. */
function EntryRow(props: { entry: DispatchEntry; theme: TuiThemeCurrent }) {
  const t = props.theme
  const status = getDisplayStatus(props.entry)
  const color = statusColor(status, t)

  return (
    <box flexDirection="row" gap={1} paddingLeft={2} paddingRight={2}>
      <text fg={color} width={3}>
        {statusSymbol(status)}
      </text>
      <text fg={t.text} width={20}>
        {truncate(props.entry.sessionId, 20)}
      </text>
      <text fg={t.info} width={14}>
        {truncate(props.entry.role, 14)}
      </text>
      <text fg={t.textMuted} width={8}>
        {props.entry.lane ?? "—"}
      </text>
      <text fg={t.text} width={26}>
        {truncate(props.entry.task ?? "—", 26)}
      </text>
      <text fg={color} width={10}>
        {status}
      </text>
      <text fg={t.textMuted} width={8}>
        {formatDuration(props.entry.timestamp)}
      </text>
    </box>
  )
}

/** Filter dropdown label. */
function FilterLabel(props: { label: string; value: string | null; theme: TuiThemeCurrent }) {
  return (
    <text fg={props.value ? props.theme.info : props.theme.textMuted}>
      [{props.label}: {props.value ?? "all"}]
    </text>
  )
}

/** Dispatch board route. */
export function DispatchBoardRoute(props: { api: TuiPluginApi }) {
  const theme = () => props.api.theme.current
  const client = createAiPlusClient("")

  // Data
  const [data, { refetch }] = createResource(() => client.dispatchList())

  // Filters
  const [filter, setFilter] = createSignal<FilterState>({ role: null, lane: null, status: null })

  // Filtered entries
  const filtered = createMemo(() => {
    const entries = data() ?? []
    const f = filter()
    return entries
      .filter((e) => {
        if (f.role && e.role !== f.role) return false
        if (f.lane && (e.lane ?? "—") !== f.lane) return false
        if (f.status && getDisplayStatus(e) !== f.status) return false
        return true
      })
      .sort((a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime())
  })

  // Stats
  const stats = createMemo(() => {
    const entries = data() ?? []
    const running = entries.filter((e) => getDisplayStatus(e) === "running").length
    const completed = entries.filter((e) => getDisplayStatus(e) === "completed").length
    const failed = entries.filter((e) => getDisplayStatus(e) === "failed").length
    return { total: entries.length, running, completed, failed }
  })

  // Available roles for filter
  const roles = createMemo(() => getUniqueRoles(data() ?? []))

  // Available lanes for filter
  const lanes = createMemo(() => {
    const entries = data() ?? []
    const laneSet = new Set(entries.map((e) => e.lane ?? "—"))
    return Array.from(laneSet).sort()
  })

  // Cycle role filter
  function cycleRole() {
    const r = roles()
    if (r.length === 0) return
    const current = filter().role
    if (!current) {
      setFilter((f) => ({ ...f, role: r[0] }))
    } else {
      const idx = r.indexOf(current)
      if (idx === r.length - 1) {
        setFilter((f) => ({ ...f, role: null }))
      } else {
        setFilter((f) => ({ ...f, role: r[idx + 1] }))
      }
    }
  }

  // Cycle lane filter
  function cycleLane() {
    const l = lanes()
    if (l.length === 0) return
    const current = filter().lane
    if (!current) {
      setFilter((f) => ({ ...f, lane: l[0] }))
    } else {
      const idx = l.indexOf(current)
      if (idx === l.length - 1) {
        setFilter((f) => ({ ...f, lane: null }))
      } else {
        setFilter((f) => ({ ...f, lane: l[idx + 1] }))
      }
    }
  }

  // Cycle status filter
  const STATUS_OPTIONS: (string | null)[] = [null, "running", "completed", "failed", "created"]

  function cycleStatus() {
    const current = filter().status
    const idx = STATUS_OPTIONS.indexOf(current)
    const next = STATUS_OPTIONS[(idx + 1) % STATUS_OPTIONS.length]
    setFilter((f) => ({ ...f, status: next }))
  }

  // Wire up external store for keymap commands
  dispatchBoardStore.refresh = () => refetch()
  dispatchBoardStore.cycleRole = cycleRole
  dispatchBoardStore.cycleLane = cycleLane
  dispatchBoardStore.cycleStatus = cycleStatus

  return (
    <box flexDirection="column" flexGrow={1} paddingTop={1} paddingBottom={1}>
      {/* Title bar */}
      <box flexDirection="row" paddingLeft={2} paddingRight={2} paddingBottom={1} gap={2}>
        <text fg={theme().text}>
          <b>AiPlus Dispatch Board</b>
        </text>
        <text fg={theme().textMuted}>— Session Dispatch Status</text>
        <box flexGrow={1} />
        <text fg={theme().textMuted}>[R refresh] [F role] [L lane] [S status] [Esc back]</text>
      </box>

      {/* Separator */}
      <box width="100%" height={1}>
        <text fg={theme().borderSubtle}>{"─".repeat(90)}</text>
      </box>

      {/* Filters */}
      <box flexDirection="row" paddingLeft={2} paddingRight={2} paddingTop={1} gap={3}>
        <FilterLabel label="Role" value={filter().role} theme={theme()} />
        <FilterLabel label="Lane" value={filter().lane} theme={theme()} />
        <FilterLabel label="Status" value={filter().status} theme={theme()} />
        <box flexGrow={1} />
        <text fg={theme().textMuted}>{filtered().length} entries</text>
      </box>

      {/* Column header */}
      <box flexDirection="row" gap={1} paddingLeft={2} paddingTop={1}>
        <text fg={theme().textMuted} width={3}>
          {" "}
        </text>
        <text fg={theme().textMuted} width={20}>
          <b>Session ID</b>
        </text>
        <text fg={theme().textMuted} width={14}>
          <b>Role</b>
        </text>
        <text fg={theme().textMuted} width={8}>
          <b>Lane</b>
        </text>
        <text fg={theme().textMuted} width={26}>
          <b>Task</b>
        </text>
        <text fg={theme().textMuted} width={10}>
          <b>Status</b>
        </text>
        <text fg={theme().textMuted} width={8}>
          <b>Time</b>
        </text>
      </box>

      {/* Entries */}
      <Show
        when={!data.loading}
        fallback={
          <text fg={theme().textMuted} paddingLeft={2}>
            Loading...
          </text>
        }
      >
        <Show
          when={filtered().length > 0}
          fallback={
            <text fg={theme().textMuted} paddingLeft={2}>
              No dispatch entries found
            </text>
          }
        >
          <For each={filtered()}>{(entry) => <EntryRow entry={entry} theme={theme()} />}</For>
        </Show>
      </Show>

      {/* Footer */}
      <box flexGrow={1} />
      <box width="100%" height={1}>
        <text fg={theme().borderSubtle}>{"─".repeat(90)}</text>
      </box>
      <box flexDirection="row" paddingLeft={2} paddingRight={2} gap={2}>
        <text fg={theme().textMuted}>AiPlus Dispatch Board v0.0.3</text>
        <box flexGrow={1} />
        <text fg={theme().success}>{stats().completed} completed</text>
        <text fg={theme().error}>{stats().failed} failed</text>
        <text fg={theme().info}>{stats().running} running</text>
        <text fg={theme().textMuted}>{stats().total} total</text>
      </box>
    </box>
  )
}
