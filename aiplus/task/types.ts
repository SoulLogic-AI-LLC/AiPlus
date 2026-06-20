// ── Enums (serde rename rules preserved) ──────────────────────────────

/** serde rename_all = "snake_case". Values: P0 | P1 | P2 | P3 */
export type TaskPriority = "P0" | "P1" | "P2" | "P3"

/** serde rename_all = "kebab-case". Values: generic | docs | code | user-visible */
export type TaskKind = "generic" | "docs" | "code" | "user-visible"

/** serde rename_all = "snake_case". Values: open | assigned | in-progress | in-review | validated | merged | done */
export type TaskStatus =
  | "open"
  | "assigned"
  | "in-progress"
  | "in-review"
  | "validated"
  | "merged"
  | "done"

/** Values: L0 | L1 | L2 | L3 | L4 | L5 (Ord — L0 < L1 < ... < L5) */
export type TaskEvidenceLevel = "L0" | "L1" | "L2" | "L3" | "L4" | "L5"

/**
 * Evidence level numeric rank for comparison.
 * L0=0, L1=1, ..., L5=5
 */
export const EVIDENCE_LEVEL_RANK: Record<TaskEvidenceLevel, number> = {
  L0: 0,
  L1: 1,
  L2: 2,
  L3: 3,
  L4: 4,
  L5: 5,
}

/** serde rename_all = "snake_case". Values below. */
export type EvidenceKind =
  | "command"
  | "overclaim-packet"
  | "pr"
  | "ci-run"
  | "reviewer-report"
  | "qa-report"
  | "dogfood"
  | "queued"
  | "unsupported"
  | "note"

// ── Core records ──────────────────────────────────────────────────────

/**
 * Matches Rust `TaskRecord` (R-G lines 241–273).
 * All Option<T> serialize as absent-when-None (skip_serializing_if).
 */
export interface TaskRecord {
  id: string // "task_<unix_ms>_<slug>"
  slug: string // slugify_label(title), max 48 chars
  title: string
  description?: string // absent when None
  driver_agent?: string
  worker_agent?: string
  runtime?: string
  status: TaskStatus
  priority: TaskPriority
  task_kind: TaskKind
  evidence_level: TaskEvidenceLevel
  evidence: EvidencePointer[] // default empty array
  stop_gate: boolean
  stop_gate_kind?: string
  blocked: boolean
  blocked_reason?: string
  created_at: string // RFC 3339 (seconds precision)
  updated_at: string
  parent_id?: string
  lane?: string
  tags: string[] // default empty array
}

/**
 * Matches Rust `EvidencePointer` (R-G lines 276–284).
 */
export interface EvidencePointer {
  kind: EvidenceKind
  value: string
  level: TaskEvidenceLevel
  rerunnable: boolean
  added_at: string // RFC 3339
  note?: string
}

// ── Event envelope ────────────────────────────────────────────────────

/**
 * Matches Rust `TaskEvent` (R-G lines 287–293).
 * schema_version = "aiplus-task-ledger-event: v1"
 * One event per JSONL line.
 */
export interface TaskEvent {
  schema_version: string // "aiplus-task-ledger-event: v1"
  event_id: string // "event_<unix_ms>_<task.id>"
  event_type: TaskEventType
  ts: string // RFC 3339
  task: TaskRecord // full snapshot at event time
}

export type TaskEventType = "add" | "assign" | "update" | "evidence_add" | "validate"

// ── Index projection ──────────────────────────────────────────────────

/**
 * Matches Rust `TaskIndex` (R-G lines 296–300).
 * schema_version = "aiplus-task-ledger-index: v1"
 * Cached projection rebuilt after each write.
 */
export interface TaskIndex {
  schema_version: string // "aiplus-task-ledger-index: v1"
  rebuilt_at: string // RFC 3339
  tasks: TaskRecord[] // sorted by priority_rank → status_rank → updated_at → id
}

// ── Lock state (Option C — fd-based, no persisted content) ────────────

/**
 * Under Option C (flock), the lock file exists but carries no meaningful
 * content (the lock is on the fd, not the bytes). Under Option A fallback,
 * this record is written for staleness detection.
 */
export interface TaskLockFallbackRecord {
  pid: number
  started_at: string // RFC 3339
  hostname: string
}

// ── Schema constants ──────────────────────────────────────────────────

export const EVENT_SCHEMA_VERSION = "aiplus-task-ledger-event: v1"
export const INDEX_SCHEMA_VERSION = "aiplus-task-ledger-index: v1"
