/**
 * Effect Gateway — Module Index
 *
 * Intercepts AI agent tool calls, classifies by side effect type,
 * checks idempotency, and blocks duplicate dangerous operations.
 * V1: Block + log only, no auto-retry.
 */

export { interceptToolCall } from "./gateway"
export { classifyToolEffect } from "./classify"
export { generateIdempotencyKey } from "./idempotency"
export { appendEffectLog } from "./log"
export type {
  SideEffectClass,
  RetryPolicy,
  EffectOutcome,
  EffectLogEntry,
  ClassificationResult,
  InterceptResult,
} from "./types"
