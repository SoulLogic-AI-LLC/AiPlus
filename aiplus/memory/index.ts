/**
 * Agent Memory — Module Index (V2)
 *
 * Three-layer memory: personal, team, project.
 * Redaction pipeline on every write.
 */

export { appendMemoryEntry, appendTeamEntry, appendProjectEntry } from "./append"
export { applyRedaction, detectFirstSensitive, getRedactionRules } from "./redact"
export { resolveLayerPath } from "./layers"
export type {
  MemoryLayer,
  MemoryEntry,
  TeamEntry,
  ProjectEntry,
  TeamConfidence,
  TeamStatus,
  SessionOutcome,
  RedactionRule,
} from "./types"
export { truncateTask } from "./types"
