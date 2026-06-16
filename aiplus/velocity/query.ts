/**
 * Velocity — Query (V1)
 *
 * SQL extracts raw session data (duration, role, task_type, time_created).
 * JS computes p50/p90 percentiles.
 */

import { Database } from "bun:sqlite"
import * as path from "node:path"
import * as os from "node:os"
import type { VelocityStats, VelocityOptions, Percentiles } from "./types"

// ---- Helpers --------------------------------------------------------------

function defaultDbPath(): string {
  return path.join(os.homedir(), ".local", "share", "opencode", "opencode.db")
}

/**
 * Parse role from session title + agent field.
 * Same logic as token-cost (keep in sync).
 */
export function parseRole(title: string, agent: string | null): string {
  if (agent) {
    const m = agent.match(/^agent-team-(\S+)$/)
    if (m) return m[1]
  }
  const patterns = [
    /^CEO-(\d+)/i, /^advisor/i, /^ca\b/i, /^chief.?auditor/i,
    /^reviewer/i, /^qa\b/i, /^engineer-[ab]/i, /^architect/i,
    /^pm\b/i, /^security/i, /^researcher/i, /^devops/i, /^tech.?writer/i,
  ]
  for (const p of patterns) {
    const m = title.match(p)
    if (m) return m[0].toLowerCase().replace(/\s+/g, "-")
  }
  return "unknown"
}

/**
 * Parse task type from conventional commit prefix.
 * "feat: add X" → "feat", "fix: ..." → "fix", etc.
 */
export function parseTaskType(title: string): string {
  const m = title.match(/^(feat|fix|refactor|test|docs|chore|perf|style|build|ci|revert)\b/i)
  return m ? m[1].toLowerCase() : "other"
}

/**
 * Compute p50/p90 from a sorted array of numbers.
 * p50 = median, p90 = 90th percentile.
 */
function percentiles(values: number[]): { p50: number; p90: number } {
  if (values.length === 0) return { p50: 0, p90: 0 }
  const sorted = [...values].sort((a, b) => a - b)
  const p50 = sorted[Math.max(0, Math.ceil(sorted.length * 0.5) - 1)]
  const p90 = sorted[Math.max(0, Math.ceil(sorted.length * 0.9) - 1)]
  return { p50, p90 }
}

/** Convert milliseconds to minutes, rounded to nearest integer. */
function msToMin(ms: number): number {
  return Math.round(ms / 60000)
}

// ---- SQL: raw extraction --------------------------------------------------

interface SessionRow {
  id: string
  title: string
  agent: string | null
  duration_ms: number
  time_created: number
}

/**
 * Extract raw session durations from the OpenCode session table.
 * Only includes sessions that have both time_created and time_updated
 * (completed or interrupted sessions that left a duration trail).
 */
function fetchSessions(dbPath: string, windowStart: number): SessionRow[] {
  const db = new Database(dbPath, { readonly: true })
  const rows = db
    .query(
      `SELECT id, title, agent,
              (time_updated - time_created) AS duration_ms,
              time_created
       FROM session
       WHERE time_created >= ?
         AND time_updated > time_created
         AND duration_ms > 1000
       ORDER BY time_created`,
    )
    .all(windowStart) as SessionRow[]
  db.close()
  return rows
}

// ---- Main: compute stats --------------------------------------------------

export function computeVelocity(options: VelocityOptions = {}): VelocityStats {
  const dbPath = options.dbPath ?? defaultDbPath()
  const now = Date.now()
  const windowStart = options.windowStart ?? (now - 90 * 24 * 60 * 60 * 1000)

  const rows = fetchSessions(dbPath, windowStart)

  // Group durations by role and task type
  const byRoleDurations: Record<string, number[]> = {}
  const byTaskDurations: Record<string, number[]> = {}
  const allDurations: number[] = []
  const recent7d: number[] = []
  const recent30d: number[] = []
  const cutoff7d = now - 7 * 24 * 60 * 60 * 1000
  const cutoff30d = now - 30 * 24 * 60 * 60 * 1000

  for (const row of rows) {
    const min = msToMin(row.duration_ms)
    const role = parseRole(row.title, row.agent)
    const taskType = parseTaskType(row.title)

    allDurations.push(min)
    byRoleDurations[role] ??= []
    byRoleDurations[role].push(min)
    byTaskDurations[taskType] ??= []
    byTaskDurations[taskType].push(min)

    if (row.time_created >= cutoff7d) recent7d.push(min)
    if (row.time_created >= cutoff30d) recent30d.push(min)
  }

  const makeP = (vals: number[]): Percentiles => {
    const { p50, p90 } = percentiles(vals)
    return { p50, p90, count: vals.length }
  }

  const byRole: Record<string, Percentiles> = {}
  for (const [role, vals] of Object.entries(byRoleDurations)) {
    byRole[role] = makeP(vals)
  }

  const byTaskType: Record<string, Percentiles> = {}
  for (const [tt, vals] of Object.entries(byTaskDurations)) {
    byTaskType[tt] = makeP(vals)
  }

  return {
    updated: new Date().toISOString(),
    source: dbPath,
    windowStart,
    byRole,
    byTaskType,
    trend7d: makeP(recent7d),
    trend30d: makeP(recent30d),
  }
}
