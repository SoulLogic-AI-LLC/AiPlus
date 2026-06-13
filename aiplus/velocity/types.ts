/**
 * Velocity — Types (V1)
 *
 * Task completion time stats from OpenCode session durations.
 * SQL for raw extraction, JS for percentile math.
 */

export interface Percentiles {
  /** 50th percentile in minutes */
  p50: number
  /** 90th percentile in minutes */
  p90: number
  /** Number of samples */
  count: number
}

export interface VelocityStats {
  /** ISO 8601 — stats last updated */
  updated: string
  /** Source DB path */
  source: string
  /** Min session time_created included (epoch ms) */
  windowStart: number
  /** By role (parsed from session title / agent field) */
  byRole: Record<string, Percentiles>
  /** By task type (parsed from conventional commit prefix: feat/fix/refactor/…) */
  byTaskType: Record<string, Percentiles>
  /** 7-day rolling p50/p90 */
  trend7d: Percentiles
  /** 30-day rolling p50/p90 */
  trend30d: Percentiles
}

export interface VelocityOptions {
  /** Path to OpenCode SQLite DB. Default: ~/.local/share/opencode/opencode.db */
  dbPath?: string
  /** Only sessions after this epoch ms. Default: 90 days ago. */
  windowStart?: number
}
