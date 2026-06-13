export type PressureLevel = "silent" | "soft" | "hard" | "emergency"

/** Lifecycle classification for each role — drives compact strategy and /new policy. */
export enum CompactProfile {
  /** Single-shot audit/inspection tasks — /new after every task. */
  RESET_BOUND = "RESET_BOUND",
  /** Long-running coordination — durable checkpoint before /new. */
  CONTINUOUS = "CONTINUOUS",
  /** Clear task boundaries — /new between tasks, compact as wrap-up reminder. */
  TASK_BOUND = "TASK_BOUND",
}

/** What action to take at a given pressure level for a given profile. */
export interface CompactAction {
  silent: boolean
  writeCapsule: boolean
  message: string
}

/** Full 4×3 action matrix: PressureLevel → CompactProfile → CompactAction. */
export type ActionMatrix = Record<PressureLevel, Record<CompactProfile, CompactAction>>

/** Durable checkpoint fields for CONTINUOUS-role handoff. */
export interface CheckpointEntry {
  objective: string
  phase: string
  acceptedDecisions: string[]
  supersededDecisions: string[]
  activeTasks: string[]
  blockedTasks: string[]
  unresolvedQuestions: string[]
  constraints: string[]
  artifacts: string[]
  nextAction: string
}

/** Per-session compact generation tracking. */
export interface SessionCompactState {
  generation: number // 0 = original, 1 = compacted once, 2 = twice, 3 = force /new
  lastCompactedAt?: string // ISO 8601
  profile: CompactProfile
}

export interface ContextCapsule {
  sessionId: string
  contextUsage: number // 0.0–1.0
  pressureLevel: PressureLevel
  tokenCount: { used: number; total: number }
  model: string
  writtenAt: string // ISO 8601
  recommendation: string
  /** Profile-driven action taken for this capsule. */
  action?: CompactAction
}
