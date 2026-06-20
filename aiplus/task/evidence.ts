import type { TaskRecord, TaskEvidenceLevel, EvidencePointer, EvidenceKind } from "./types"
import { EVIDENCE_LEVEL_RANK } from "./types"

/**
 * Returns the max evidence level across all evidence pointers,
 * or L0 if the task has no evidence.
 *
 * Matches Rust `task_max_evidence_level` (R-G lines 707–713).
 */
export function taskMaxEvidenceLevel(task: TaskRecord): TaskEvidenceLevel {
  if (!task.evidence || task.evidence.length === 0) return "L0"
  let max: TaskEvidenceLevel = "L0"
  for (const e of task.evidence) {
    if (EVIDENCE_LEVEL_RANK[e.level] > EVIDENCE_LEVEL_RANK[max]) {
      max = e.level
    }
  }
  return max
}

/**
 * Validate an evidence_add operation.
 *
 * - Rejects if kind=queued/unsupported AND level > L1
 *   ("queued ≠ executed" guard)
 * - Auto-rerunnable: kind=command or kind=overclaim-packet → always rerunnable=true
 *
 * Matches Rust evidence enforcement (R-G lines 685–696, 560–564).
 */
export function validateEvidenceAdd(
  kind: EvidenceKind,
  level: TaskEvidenceLevel,
): { valid: boolean; error?: string } {
  // Queued/unsupported cap: cannot claim higher than L1
  if ((kind === "queued" || kind === "unsupported") && EVIDENCE_LEVEL_RANK[level] > 1) {
    return { valid: false, error: "queued_unsupported_capped_at_l1" }
  }
  return { valid: true }
}

/**
 * Determine if an evidence kind is auto-rerunnable.
 *
 * kind=command and kind=overclaim-packet are ALWAYS rerunnable=true,
 * regardless of the caller's flag.
 *
 * Matches Rust auto-rerunnable override (R-G lines 560–564).
 */
export function isAutoRerunnable(kind: EvidenceKind): boolean {
  return kind === "command" || kind === "overclaim-packet"
}
