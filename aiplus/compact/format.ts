/**
 * Compact CLI — Terminal Formatting
 *
 * Colorful terminal output for compact status.
 * Uses ANSI escape codes — no external dependencies.
 */

import type { PressureLevel, SessionCompactState, ContextCapsule } from "./types"
import type { PressureResult } from "./monitor"

/** ANSI color codes. */
const C = {
  reset: "\x1b[0m",
  bold: "\x1b[1m",
  dim: "\x1b[2m",
  green: "\x1b[32m",
  yellow: "\x1b[33m",
  red: "\x1b[31m",
  cyan: "\x1b[36m",
}

/** Color for pressure level. */
function levelColor(level: PressureLevel): string {
  switch (level) {
    case "silent":
      return C.dim
    case "soft":
      return C.green
    case "hard":
      return C.yellow
    case "emergency":
      return C.red
  }
}

/** Format compact status for all sessions. */
export function formatCompactStatus(
  states: Record<string, SessionCompactState>,
  capsule: ContextCapsule | null,
): string {
  const lines: string[] = []

  lines.push("")
  lines.push(`${C.bold}╔══════════════════════════════════════════╗${C.reset}`)
  lines.push(`${C.bold}║          AiPlus Compact Status           ║${C.reset}`)
  lines.push(`${C.bold}╚══════════════════════════════════════════╝${C.reset}`)
  lines.push("")

  const entries = Object.entries(states)
  if (entries.length === 0) {
    lines.push(`  ${C.dim}No compact state recorded yet.${C.reset}`)
  } else {
    lines.push(
      `  ${C.dim}Session${C.reset}                              ${C.dim}Gen${C.reset}  ${C.dim}Profile${C.reset}        ${C.dim}Last Compacted${C.reset}`,
    )
    lines.push(`  ${"─".repeat(70)}`)
    for (const [sid, state] of entries) {
      const gen = String(state.generation).padStart(3)
      const profile = state.profile.padEnd(14)
      const last = state.lastCompactedAt ? formatTimeAgo(state.lastCompactedAt) : "never"
      const genColor = state.generation >= 3 ? C.red : state.generation >= 2 ? C.yellow : C.dim
      lines.push(`  ${truncate(sid, 34).padEnd(34)} ${genColor}${gen}${C.reset}  ${profile} ${last}`)
    }
  }

  lines.push("")

  // Capsule
  if (capsule) {
    const lc = levelColor(capsule.pressureLevel)
    const pct = (capsule.contextUsage * 100).toFixed(1)
    lines.push(`  ${C.bold}Latest Capsule:${C.reset}`)
    lines.push(`    ${lc}● ${capsule.pressureLevel.toUpperCase()}${C.reset} — ${pct}% usage — ${capsule.model}`)
    lines.push(`    ${C.dim}${capsule.recommendation}${C.reset}`)
    lines.push(`    ${C.dim}Written: ${capsule.writtenAt}${C.reset}`)
  } else {
    lines.push(`  ${C.dim}No capsule recorded yet.${C.reset}`)
  }

  lines.push("")
  return lines.join("\n")
}

/** Format a pressure check result. */
export function formatPressureResult(result: PressureResult): string {
  const lines: string[] = []
  const lc = levelColor(result.level)
  const pct = (result.contextUsage * 100).toFixed(1)

  lines.push("")
  lines.push(`${C.bold}Compact Check${C.reset}`)
  lines.push(`  ${lc}● ${result.level.toUpperCase()}${C.reset} — ${pct}% context usage`)
  lines.push(`  Model: ${result.model}`)
  lines.push(`  Tokens: ${result.tokenCount.used.toLocaleString()} / ${result.tokenCount.total.toLocaleString()}`)
  lines.push(`  Profile: ${result.profile}`)
  if (result.recommendation) {
    lines.push(`  ${lc}${result.recommendation}${C.reset}`)
  }
  lines.push(
    `  Action: ${result.action.silent ? "silent" : "active"}${result.action.writeCapsule ? " + capsule written" : ""}`,
  )
  lines.push("")

  return lines.join("\n")
}

/** Format all model thresholds. */
export function formatThresholds(
  thresholds: Record<string, { soft: number; hard: number; emergency: number }>,
  handoffTokens: number,
): string {
  const lines: string[] = []

  lines.push("")
  lines.push(`${C.bold}╔══════════════════════════════════════════╗${C.reset}`)
  lines.push(`${C.bold}║        Compact Thresholds (v2)           ║${C.reset}`)
  lines.push(`${C.bold}╚══════════════════════════════════════════╝${C.reset}`)
  lines.push("")
  lines.push(
    `  ${C.dim}Model${C.reset}                  ${C.dim}Soft${C.reset}   ${C.dim}Hard${C.reset}   ${C.dim}Emergency${C.reset}`,
  )
  lines.push(`  ${"─".repeat(50)}`)

  for (const [model, t] of Object.entries(thresholds)) {
    const soft = `${(t.soft * 100).toFixed(0)}%`.padStart(4)
    const hard = `${(t.hard * 100).toFixed(0)}%`.padStart(4)
    const emerg = `${(t.emergency * 100).toFixed(0)}%`.padStart(4)
    lines.push(
      `  ${model.padEnd(24)} ${C.green}${soft}${C.reset} ${C.yellow}${hard}${C.reset} ${C.red}${emerg}${C.reset}`,
    )
  }

  lines.push("")
  lines.push(`  ${C.dim}Fallback: soft=30%, hard=45%, emergency=60%${C.reset}`)
  lines.push(`  ${C.dim}Handoff token reserve: ${handoffTokens.toLocaleString()}${C.reset}`)
  lines.push("")

  return lines.join("\n")
}

/** Format current capsule. */
export function formatCapsule(capsule: ContextCapsule | null): string {
  const lines: string[] = []

  lines.push("")
  if (!capsule) {
    lines.push(`  ${C.dim}No context capsule recorded.${C.reset}`)
    lines.push("")
    return lines.join("\n")
  }

  const lc = levelColor(capsule.pressureLevel)
  const pct = (capsule.contextUsage * 100).toFixed(1)

  lines.push(`${C.bold}Context Capsule${C.reset}`)
  lines.push(`  ${lc}● ${capsule.pressureLevel.toUpperCase()}${C.reset} — ${pct}% usage`)
  lines.push(`  Model: ${capsule.model}`)
  lines.push(`  Tokens: ${capsule.tokenCount.used.toLocaleString()} / ${capsule.tokenCount.total.toLocaleString()}`)
  if (capsule.recommendation) {
    lines.push(`  ${lc}${capsule.recommendation}${C.reset}`)
  }
  lines.push(`  ${C.dim}Written: ${capsule.writtenAt}${C.reset}`)
  lines.push("")

  return lines.join("\n")
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

/** Truncate string with ellipsis. */
function truncate(s: string, max: number): string {
  return s.length > max ? s.slice(0, max - 1) + "…" : s
}
