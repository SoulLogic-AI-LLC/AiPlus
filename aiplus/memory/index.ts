/**
 * Agent Memory Hook — Module Index
 *
 * Session lifecycle memory: records task + outcome on session end.
 * V1: Pure JSONL append, no hash chain.
 */

export { appendMemoryEntry } from "./append"
export type { MemoryEntry, SessionOutcome } from "./types"
export { truncateTask } from "./types"
