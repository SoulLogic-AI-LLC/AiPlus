/**
 * Lobby CLI — Terminal Formatting
 *
 * Colorful terminal output for lobby status.
 * Uses ANSI escape codes — no external dependencies.
 */

import type { RoleStatus, LaneStatus, LobbyState, Pillar } from "./types"
import { getPillarLabel } from "./pillars"
import { laneDisplayName, type CEOLane } from "./lane"

/** ANSI color codes. */
const COLORS = {
  reset: "\x1b[0m",
  bold: "\x1b[1m",
  dim: "\x1b[2m",
  green: "\x1b[32m",
  blue: "\x1b[34m",
  yellow: "\x1b[33m",
  red: "\x1b[31m",
  cyan: "\x1b[36m",
  white: "\x1b[37m",
  bgGreen: "\x1b[42m",
  bgBlue: "\x1b[44m",
  bgYellow: "\x1b[43m",
}

/** Pillar colors. */
const PILLAR_COLORS: Record<Pillar, string> = {
  coordinator: COLORS.green,
  verifier: COLORS.blue,
  expert: COLORS.yellow,
}

/** Status indicators. */
const STATUS_ICONS: Record<string, string> = {
  active: "●",
  idle: "○",
  stale: "◌",
}

/** Format a role status line. */
function formatRole(role: RoleStatus, index: number): string {
  const color = PILLAR_COLORS[role.pillar]
  const icon = STATUS_ICONS[role.status]
  const num = String(index).padStart(2)
  const name = role.name.padEnd(20)
  const id = `[${role.id}]`.padEnd(22)

  let status = `${color}${icon} ${role.status}${COLORS.reset}`
  if (role.status === "active" && role.sessionId) {
    status = `${color}${icon} active${COLORS.reset} (${role.sessionId.slice(0, 12)})`
  }

  return `  ${num}. ${name} ${id} ${status}`
}

/** Format a lane status line. */
function formatLane(lane: LaneStatus): string {
  const icon = STATUS_ICONS[lane.status]
  let line = `  ${lane.lane}: ${icon} ${lane.status}`

  if (lane.status === "active") {
    if (lane.sessionId) line += ` (${lane.sessionId.slice(0, 12)}`
    if (lane.lastActive) {
      const ago = formatTimeAgo(lane.lastActive)
      line += lane.sessionId ? `, ${ago}` : ` (${ago}`
    }
    line += ")"
  }

  return line
}

/** Format time ago. */
function formatTimeAgo(isoStr: string): string {
  const diff = Date.now() - new Date(isoStr).getTime()
  const mins = Math.floor(diff / 60000)
  if (mins < 60) return `${mins}m ago`
  const hours = Math.floor(mins / 60)
  if (hours < 24) return `${hours}h ago`
  const days = Math.floor(hours / 24)
  return `${days}d ago`
}

/** Format full lobby status. */
export function formatLobbyStatus(
  roles: RoleStatus[],
  lanes: LaneStatus[],
  state: LobbyState,
): string {
  const lines: string[] = []

  // Header
  lines.push("")
  lines.push(`${COLORS.bold}╔══════════════════════════════════════════════════════════════╗${COLORS.reset}`)
  lines.push(`${COLORS.bold}║                    AiPlus Agent Lobby                        ║${COLORS.reset}`)
  lines.push(`${COLORS.bold}╠══════════════════════════════════════════════════════════════╣${COLORS.reset}`)

  // Roles by pillar
  const pillars: Pillar[] = ["coordinator", "verifier", "expert"]
  let roleIndex = 1

  for (const pillar of pillars) {
    const pillarRoles = roles.filter(r => r.pillar === pillar)
    if (pillarRoles.length === 0) continue

    const label = getPillarLabel(pillar)
    const color = PILLAR_COLORS[pillar]
    lines.push(`║ ${color}${COLORS.bold}${label}${COLORS.reset}`)

      for (const role of pillarRoles) {
        const isActive = state.boundRole === role.id
        const line = formatRole(role, roleIndex)
        if (isActive) {
          const activeCount = lanes.filter((l) => l.status === "active").length
          const laneTag = state.lane && role.id === "ceo"
            ? ` [${laneDisplayName(role.id, state.lane as CEOLane, activeCount)}]`
            : ""
          lines.push(`${COLORS.bold}${line} ← bound${laneTag}${COLORS.reset}`)
        } else {
          lines.push(line)
        }
        roleIndex++
      }

    lines.push("║")
  }

  // Lane status
  lines.push(`║ ${COLORS.cyan}${COLORS.bold}📊 Lane Status${COLORS.reset}`)
  for (const lane of lanes) {
    lines.push(formatLane(lane))
  }

  // Footer
  lines.push(`${COLORS.bold}╚══════════════════════════════════════════════════════════════╝${COLORS.reset}`)
  lines.push("")

  return lines.join("\n")
}

/** Format bind confirmation. */
export function formatBindConfirm(roleId: string, displayName: string, lane?: CEOLane | null, activeCount = 1): string {
  const laneInfo = lane ? ` → lane ${laneDisplayName(roleId, lane, activeCount)}` : ""
  return `\n${COLORS.green}✓${COLORS.reset} Bound to ${COLORS.bold}${displayName}${COLORS.reset} [${roleId}]${laneInfo}\n`
}

/** Format unbind confirmation. */
export function formatUnbindConfirm(): string {
  return `\n${COLORS.green}✓${COLORS.reset} Unbound from current role\n`
}

/** Format resume info. */
export function formatResumeInfo(sessionId: string, role: string, task: string): string {
  const lines = [
    "",
    `${COLORS.bold}Session Info${COLORS.reset}`,
    `  ID:   ${sessionId}`,
    `  Role: ${role}`,
    `  Task: ${task.slice(0, 80)}${task.length > 80 ? "..." : ""}`,
    "",
    `${COLORS.cyan}To resume:${COLORS.reset}`,
    `  aiplus agent talk --resume ${role}`,
    "",
  ]
  return lines.join("\n")
}

/** Format error message. */
export function formatError(msg: string): string {
  return `\n${COLORS.red}✗ ${msg}${COLORS.reset}\n`
}
