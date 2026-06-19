/**
 * Effect Gateway — Types (V1)
 *
 * Intercepts AI agent tool calls, classifies by side effect type,
 * checks idempotency, and blocks duplicate dangerous operations.
 * V1: Block + log only, no auto-retry.
 */

/** Side effect classification. */
export type SideEffectClass =
  | "READ_ONLY" // ✅ 可无限重放 (read, grep, glob)
  | "MUTATING" // ⚠️ 需确认无冲突 (write, edit)
  | "EXTERNAL" // ❌ 不可重放 (网络请求)
  | "IRREVERSIBLE" // 🛑 需 Owner gate (rm -rf, force-push, DROP TABLE)

/** Retry policy. */
export type RetryPolicy =
  | "NO_RETRY" // 不自动重试
  | "LINEAR_BACKOFF" // 线性退避重试
  | "EXPONENTIAL_BACKOFF" // 指数退避重试

/** Tool call outcome. */
export type EffectOutcome = "allowed" | "blocked"

/** Effect log entry. */
export interface EffectLogEntry {
  /** Tool name */
  toolName: string
  /** Tool arguments (serialized) */
  toolArgs: Record<string, unknown>
  /** Idempotency key */
  idempotencyKey: string
  /** Side effect classification */
  sideEffectClass: SideEffectClass
  /** Retry policy */
  retryPolicy: RetryPolicy
  /** Session ID */
  sessionId: string
  /** Role name */
  role: string
  /** ISO 8601 timestamp */
  timestamp: string
  /** Outcome */
  outcome: EffectOutcome
  /** Block reason (if blocked) */
  blockReason?: string
  /** Schema version */
  schemaVersion: "0.1.0"
}

/** Classification result. */
export interface ClassificationResult {
  sideEffectClass: SideEffectClass
  retryPolicy: RetryPolicy
}

/** Intercept result. */
export interface InterceptResult {
  allowed: boolean
  reason?: string
}
