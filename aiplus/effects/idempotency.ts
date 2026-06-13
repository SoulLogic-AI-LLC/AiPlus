/**
 * Effect Gateway — Idempotency Key Generation (V1)
 *
 * Generates deterministic keys for tool calls to detect duplicates.
 * Format: <toolName>:<hash>:<date>
 */

import { createHash } from "node:crypto"

/**
 * Generate an idempotency key for a tool call.
 *
 * Format: <toolName>:<sha256(toolName+args)[0:8]>:<YYYYMMDD>
 *
 * The key is deterministic: same tool + same args + same day = same key.
 * This allows detecting duplicate dangerous operations within a day.
 */
export function generateIdempotencyKey(
  toolName: string,
  toolArgs: Record<string, unknown>,
): string {
  const payload = JSON.stringify({ toolName, toolArgs })
  const hash = createHash("sha256").update(payload).digest("hex").slice(0, 8)
  const date = new Date().toISOString().slice(0, 10).replace(/-/g, "")
  return `${toolName}:${hash}:${date}`
}
