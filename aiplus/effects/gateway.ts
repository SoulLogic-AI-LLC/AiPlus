/**
 * Effect Gateway — Main Interceptor (V1)
 *
 * Intercepts AI agent tool calls, checks idempotency, and blocks duplicates.
 * V1: Block + log only, no auto-retry.
 */

import * as fs from "node:fs"
import * as path from "node:path"
import type { InterceptResult } from "./types"
import { classifyToolEffect } from "./classify"
import { generateIdempotencyKey } from "./idempotency"
import { appendEffectLog } from "./log"

const DISPATCH_LOG_FILE = ".aiplus/agents/dispatch-log.jsonl"

/**
 * Check if a dispatch-log has a successful entry with the given idempotency key.
 *
 * Scans the dispatch-log.jsonl for matching keys with outcome=success.
 * Returns true if a duplicate is found.
 */
function checkDuplicateInDispatchLog(projectRoot: string, idempotencyKey: string): boolean {
  const logPath = path.join(projectRoot, DISPATCH_LOG_FILE)
  if (!fs.existsSync(logPath)) return false

  try {
    const content = fs.readFileSync(logPath, "utf-8")
    const lines = content.trim().split("\n")

    for (const line of lines) {
      try {
        const entry = JSON.parse(line)
        if (entry.idempotencyKey === idempotencyKey && entry.outcome === "success") {
          return true
        }
      } catch {
        // skip malformed lines
      }
    }
  } catch {
    // file read error → no duplicate
  }

  return false
}

/**
 * Intercept a tool call and decide whether to allow or block it.
 *
 * Flow:
 * 1. Generate idempotency key
 * 2. Classify side effect type
 * 3. Check dispatch-log for duplicate successful execution
 * 4. Block IRREVERSIBLE/MUTATING if duplicate found
 * 5. Log to effect-log.jsonl
 *
 * Fire-and-forget: errors in logging never throw.
 */
export function interceptToolCall(params: {
  toolName: string
  toolArgs: Record<string, unknown>
  sessionId: string
  role: string
  projectRoot: string
}): InterceptResult {
  // 1. Generate idempotency key
  const idempotencyKey = generateIdempotencyKey(params.toolName, params.toolArgs)

  // 2. Classify side effect type
  const { sideEffectClass, retryPolicy } = classifyToolEffect(params.toolName, params.toolArgs)

  // 3. Check dispatch-log for duplicate
  const duplicate = checkDuplicateInDispatchLog(params.projectRoot, idempotencyKey)

  // 4. Block decision
  if (duplicate && sideEffectClass === "IRREVERSIBLE") {
    const blockReason = "duplicate idempotencyKey for IRREVERSIBLE operation"
    appendEffectLog({
      ...params,
      idempotencyKey,
      sideEffectClass,
      retryPolicy,
      outcome: "blocked",
      blockReason,
    })
    process.stderr.write(`[aiplus-effects] BLOCKED: ${params.toolName} — ${blockReason}\n`)
    return { allowed: false, reason: blockReason }
  }

  if (duplicate && sideEffectClass === "MUTATING") {
    const blockReason = "duplicate idempotencyKey for MUTATING operation"
    appendEffectLog({
      ...params,
      idempotencyKey,
      sideEffectClass,
      retryPolicy,
      outcome: "blocked",
      blockReason,
    })
    process.stderr.write(`[aiplus-effects] BLOCKED: ${params.toolName} — ${blockReason}\n`)
    return { allowed: false, reason: blockReason }
  }

  // 5. Allow
  appendEffectLog({
    ...params,
    idempotencyKey,
    sideEffectClass,
    retryPolicy,
    outcome: "allowed",
  })
  return { allowed: true }
}
