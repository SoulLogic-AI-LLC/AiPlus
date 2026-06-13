/**
 * Agent Memory Hook — Entry Types (V1)
 *
 * Session lifecycle memory: records task + outcome on session end.
 * V1: Pure JSONL append, no hash chain (stabilize 2 days first).
 * decisions/filesChanged/commitShas written by AI via `aiplus memory add` (not hook).
 */

/** Outcome of a session. */
export type SessionOutcome = "success" | "failed" | "canceled"

/** Memory entry written on session end. */
export interface MemoryEntry {
  /** OpenCode session ID */
  sessionId: string
  /** Role name (stripped of `aiplus-` prefix) */
  role: string
  /** ISO 8601 timestamp — session create */
  startedAt: string
  /** ISO 8601 timestamp — session end/compact/interrupt */
  endedAt: string
  /** Duration in milliseconds */
  durationMs: number
  /** Last user prompt (truncated to 200 chars) */
  task: string
  /** Session outcome */
  outcome: SessionOutcome
  /** Schema version */
  schemaVersion: "0.1.0"
  /** ISO 8601 timestamp — entry written */
  timestamp: string
}

/** Truncate a task string to 200 chars. */
export function truncateTask(task: string, maxLen = 200): string {
  if (task.length <= maxLen) return task
  return task.slice(0, maxLen - 3) + "..."
}
