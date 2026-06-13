/**
 * Agent Memory — Entry Types (V2)
 *
 * Three-layer memory: personal, team, project.
 * V2 adds team + project layers + 12 redaction rules.
 * V1 personal layer preserved, backward-compatible.
 */

// ---- Layers ---------------------------------------------------------------

export type MemoryLayer = "personal" | "team" | "project"

// ---- Personal (V1 — unchanged) -------------------------------------------

/** Outcome of a session. */
export type SessionOutcome = "success" | "failed" | "canceled"

/** Memory entry written on session end. */
export interface MemoryEntry {
  sessionId: string
  role: string
  startedAt: string
  endedAt: string
  durationMs: number
  task: string
  outcome: SessionOutcome
  schemaVersion: "0.1.0"
  timestamp: string
}

/** Truncate a task string to 200 chars. */
export function truncateTask(task: string, maxLen = 200): string {
  if (task.length <= maxLen) return task
  return task.slice(0, maxLen - 3) + "..."
}

// ---- Team (V2) -----------------------------------------------------------

export type TeamConfidence = "owner_asserted" | "verified" | "speculative"
export type TeamStatus = "active" | "superseded" | "resolved"

/** A shared decision / blocker / gate visible to all roles. */
export interface TeamEntry {
  id: string
  subject: string
  summary: string
  /** Who created this entry (role name or "owner") */
  source: string
  confidence: TeamConfidence
  status: TeamStatus
  tags: string[]
  schemaVersion: "0.2.0"
  timestamp: string
  /** Redaction level: "none" | "partial" | "full". Set by redact pipeline. */
  redaction: "none" | "partial" | "full"
}

// ---- Project (V2) --------------------------------------------------------

/** A project-level constraint or preference, shared across CEO lanes. */
export interface ProjectEntry {
  key: string
  value: string
  source: string
  schemaVersion: "0.2.0"
  timestamp: string
}

// ---- Redaction (V2) ------------------------------------------------------

export interface RedactionRule {
  name: string
  /** Pattern to match. Order matters: earlier rules fire first. */
  pattern: RegExp
  /** Replacement for matched text. */
  replacement: string
  /** Brief description for audit/log. */
  description: string
}
