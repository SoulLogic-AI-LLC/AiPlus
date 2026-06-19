/**
 * Agent Memory — Module Index (V2)
 *
 * Three-layer memory: personal, team, project.
 * Redaction pipeline on every write.
 */

export {
  appendMemoryEntry,
  appendTeamEntry,
  appendProjectEntry,
  appendSessionCreated,
  hashEntry,
  writeLine,
} from "./append"
export { applyRedaction, detectFirstSensitive, getRedactionRules } from "./redact"
export { resolveLayerPath } from "./layers"
export { detectConflicts, detectStale } from "./conflict"
export type { ConflictReport, StaleReport, ConflictCapable } from "./conflict"
export { readActive, readAll, findById, findByQuery } from "./read"
export { parseCraftMarkers, processCraftMarkers, isAllowedCraftRole, ALLOWED_CRAFT_ROLES } from "./craft"
export type { CraftMarker, CraftCaptureResult, CraftScanOutcome } from "./craft"
export { classifyRisk, autoCapture } from "./risk"
export type { RiskLevel, AutoWriteConfig, AutoWriteResult } from "./risk"
export type {
  MemoryLayer,
  MemoryEntry,
  TeamEntry,
  ProjectEntry,
  CraftEntry,
  TeamConfidence,
  TeamStatus,
  SessionOutcome,
  RedactionRule,
} from "./types"
export { truncateTask } from "./types"
