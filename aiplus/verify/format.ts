/**
 * Verify CLI — Terminal Formatting
 */

import type { AuditVerdict, AuditCheck } from "../audit/types"
import type { VerifyEntry, GhPrCheck } from "./types"

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

/** Color for verdict. */
function verdictColor(v: AuditVerdict): string {
  switch (v) {
    case "PASS": return C.green
    case "REVISE": return C.yellow
    case "BLOCKED": return C.red
  }
}

/** Icon for verdict. */
function verdictIcon(v: AuditVerdict): string {
  switch (v) {
    case "PASS": return "✓"
    case "REVISE": return "⚠"
    case "BLOCKED": return "✗"
  }
}

/** Format a single check. */
function formatCheck(check: AuditCheck): string {
  const vc = verdictColor(check.status)
  const vi = verdictIcon(check.status)
  return `  ${vc}${vi}${C.reset} ${C.bold}${check.id} ${check.name}${C.reset} — ${check.detail ?? ""}`
}

/** Format a verification run result. */
export function formatVerifyRun(entry: VerifyEntry): string {
  const lines: string[] = []
  const vc = verdictColor(entry.verdict)
  const vi = verdictIcon(entry.verdict)

  lines.push("")
  lines.push(`${C.bold}╔══════════════════════════════════════════╗${C.reset}`)
  lines.push(`${C.bold}║          AiPlus Verify                  ║${C.reset}`)
  lines.push(`${C.bold}╚══════════════════════════════════════════╝${C.reset}`)
  lines.push("")
  lines.push(`  ${C.bold}Verdict:${C.reset} ${vc}${vi} ${entry.verdict}${C.reset}`)
  lines.push(`  ${C.dim}ID:${C.reset} ${entry.id}`)
  lines.push(`  ${C.dim}Time:${C.reset} ${entry.timestamp}`)
  if (entry.sessionId) {
    lines.push(`  ${C.dim}Session:${C.reset} ${entry.sessionId}`)
  }
  if (entry.durationMs !== undefined) {
    lines.push(`  ${C.dim}Duration:${C.reset} ${entry.durationMs}ms`)
  }
  lines.push("")

  for (const check of entry.checks) {
    lines.push(formatCheck(check))
  }

  lines.push("")
  return lines.join("\n")
}

/** Format verify status (latest entry). */
export function formatVerifyStatus(entry: VerifyEntry | null): string {
  if (!entry) {
    return `\n  ${C.dim}No verification runs recorded.${C.reset}\n`
  }
  const lines: string[] = []
  const vc = verdictColor(entry.verdict)
  const vi = verdictIcon(entry.verdict)

  lines.push("")
  lines.push(`${C.bold}Verify Status${C.reset}`)
  lines.push(`  ${vc}${vi} ${entry.verdict}${C.reset} — ${formatTimeAgo(entry.timestamp)}`)
  for (const check of entry.checks) {
    lines.push(formatCheck(check))
  }
  lines.push("")
  return lines.join("\n")
}

/** Format verify history. */
export function formatVerifyHistory(entries: VerifyEntry[]): string {
  const lines: string[] = []

  lines.push("")
  lines.push(`${C.bold}Verify History${C.reset}`)
  lines.push("")

  if (entries.length === 0) {
    lines.push(`  ${C.dim}No verification runs recorded.${C.reset}`)
    lines.push("")
    return lines.join("\n")
  }

  lines.push(`  ${C.dim}ID${C.reset}                    ${C.dim}Verdict${C.reset}  ${C.dim}Session${C.reset}                  ${C.dim}Time${C.reset}`)
  lines.push(`  ${"─".repeat(70)}`)

  for (const entry of entries) {
    const vc = verdictColor(entry.verdict)
    const vi = verdictIcon(entry.verdict)
    const sid = entry.sessionId ? truncate(entry.sessionId, 24).padEnd(24) : "—".padEnd(24)
    lines.push(`  ${truncate(entry.id, 22).padEnd(22)} ${vc}${vi} ${entry.verdict.padEnd(6)}${C.reset} ${sid} ${formatTimeAgo(entry.timestamp)}`)
  }

  lines.push("")
  return lines.join("\n")
}

/** Format GitHub PR checks. */
export function formatGhChecks(checks: GhPrCheck[]): string {
  const lines: string[] = []

  lines.push("")
  lines.push(`${C.bold}GitHub PR Checks${C.reset}`)
  lines.push("")

  if (checks.length === 0) {
    lines.push(`  ${C.dim}No open PRs found.${C.reset}`)
    lines.push("")
    return lines.join("\n")
  }

  for (const pr of checks) {
    const stateColor = pr.state === "MERGED" ? C.green : pr.state === "CLOSED" ? C.red : C.cyan
    const statusIcon = pr.statusCheckRollup === "SUCCESS" ? "✓" : pr.statusCheckRollup === "FAILURE" ? "✗" : pr.statusCheckRollup === "PENDING" ? "●" : "—"
    const statusColor = pr.statusCheckRollup === "SUCCESS" ? C.green : pr.statusCheckRollup === "FAILURE" ? C.red : pr.statusCheckRollup === "PENDING" ? C.yellow : C.dim

    lines.push(`  ${stateColor}#${pr.pr}${C.reset} ${truncate(pr.title, 50)}`)
    lines.push(`    ${statusColor}${statusIcon} ${pr.statusCheckRollup ?? "no checks"}${C.reset} — ${pr.url}`)
  }

  lines.push("")
  return lines.join("\n")
}

/** Format time ago. */
function formatTimeAgo(isoStr: string): string {
  const diff = Date.now() - new Date(isoStr).getTime()
  const mins = Math.floor(diff / 60000)
  if (mins < 1) return "just now"
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
