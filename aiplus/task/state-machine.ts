import type { TaskRecord, TaskKind, TaskStatus, TaskEvidenceLevel } from "./types"
import { EVIDENCE_LEVEL_RANK } from "./types"
import { taskMaxEvidenceLevel } from "./evidence"

/**
 * Evidence floors by task kind (R-G lines 698–705):
 *
 * | TaskKind      | Floor |
 * |---------------|-------|
 * | generic       | L1    |
 * | docs          | L2    |
 * | code          | L3    |
 * | user-visible  | L5    |
 */
export const EVIDENCE_FLOOR_BY_KIND: Record<TaskKind, TaskEvidenceLevel> = {
  generic: "L1",
  docs: "L2",
  code: "L3",
  "user-visible": "L5",
}

/**
 * Validate a status transition for a task.
 *
 * Only gates `validated` and `done` — all other transitions are PERMITTED.
 *
 * Guard for `validated`/`done`:
 * 1. Must have ≥1 rerunnable evidence
 * 2. max(evidence.level) ≥ evidence_floor(task_kind)
 *
 * Matches Rust `validate_status_transition` (R-G lines 661–683).
 */
export function validateStatusTransition(
  task: TaskRecord,
  newStatus: TaskStatus,
): { valid: boolean; error?: string } {
  // Only validate for validated/done transitions
  if (newStatus !== "validated" && newStatus !== "done") {
    return { valid: true }
  }

  // Guard 1: must have at least 1 rerunnable evidence
  const rerunnableEvidence = task.evidence.filter((e) => e.rerunnable)
  if (rerunnableEvidence.length === 0) {
    return {
      valid: false,
      error: `cannot transition to ${newStatus}: no rerunnable evidence`,
    }
  }

  // Guard 2: max evidence level must meet the floor for this task kind
  const maxLevel = taskMaxEvidenceLevel(task)
  const floor = EVIDENCE_FLOOR_BY_KIND[task.task_kind]
  if (EVIDENCE_LEVEL_RANK[maxLevel] < EVIDENCE_LEVEL_RANK[floor]) {
    return {
      valid: false,
      error: `cannot transition to ${newStatus}: evidence level ${maxLevel} is below floor ${floor} for task kind ${task.task_kind}`,
    }
  }

  return { valid: true }
}

/**
 * Compute the auto-updated evidence_level for a task.
 * Always returns max(evidence.map(e => e.level)), or L0 if empty.
 *
 * Matches Rust evidence_level auto-update on every evidence_add.
 */
export function computeEvidenceLevel(evidence: { level: TaskEvidenceLevel }[]): TaskEvidenceLevel {
  if (!evidence || evidence.length === 0) return "L0"
  let max: TaskEvidenceLevel = "L0"
  for (const e of evidence) {
    if (EVIDENCE_LEVEL_RANK[e.level] > EVIDENCE_LEVEL_RANK[max]) {
      max = e.level
    }
  }
  return max
}
