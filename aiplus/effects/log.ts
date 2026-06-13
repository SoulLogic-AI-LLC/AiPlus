/**
 * Effect Gateway — Log Writer (V1)
 *
 * Fire-and-forget JSONL append to .aiplus/effects/effect-log.jsonl.
 * Separate from dispatch-log: tracks "is this tool call safe?"
 */

import * as fs from "node:fs"
import * as path from "node:path"
import type { EffectLogEntry, SideEffectClass, RetryPolicy, EffectOutcome } from "./types"
import { applyRedaction } from "../memory/redact"

const EFFECTS_DIR = ".aiplus/effects"
const EFFECT_LOG_FILE = "effect-log.jsonl"

/**
 * Append an effect log entry.
 *
 * Fire-and-forget: errors are logged to stderr, never thrown.
 */
export function appendEffectLog(params: {
  projectRoot: string
  toolName: string
  toolArgs: Record<string, unknown>
  idempotencyKey: string
  sideEffectClass: SideEffectClass
  retryPolicy: RetryPolicy
  sessionId: string
  role: string
  outcome: EffectOutcome
  blockReason?: string
}): void {
  try {
    const dir = path.join(params.projectRoot, EFFECTS_DIR)
    fs.mkdirSync(dir, { recursive: true })

    const entry: EffectLogEntry = {
      toolName: params.toolName,
      toolArgs: params.toolArgs,
      idempotencyKey: params.idempotencyKey,
      sideEffectClass: params.sideEffectClass,
      retryPolicy: params.retryPolicy,
      sessionId: params.sessionId,
      role: params.role,
      timestamp: new Date().toISOString(),
      outcome: params.outcome,
      blockReason: params.blockReason,
      schemaVersion: "0.1.0",
    }

    const line = JSON.stringify(entry) + "\n"
    fs.appendFileSync(path.join(dir, EFFECT_LOG_FILE), applyRedaction(line), "utf-8")
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err)
    process.stderr.write(`[aiplus-effects] ${msg}\n`)
  }
}
