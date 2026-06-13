/**
 * Agent Memory Hook — Append Entry (V1)
 *
 * Fire-and-forget JSONL append to .aiplus/agent-memory/<role>/memory.jsonl.
 * V1: No hash chain. Pure append. Stabilize 2 days before adding hash.
 */

import * as fs from "node:fs"
import * as path from "node:path"
import type { MemoryEntry, SessionOutcome } from "./types"
import { truncateTask } from "./types"

const MEMORY_DIR = ".aiplus/agent-memory"

/**
 * Append a memory entry for a completed session.
 *
 * Fire-and-forget: errors are logged to stderr, never thrown.
 */
export function appendMemoryEntry(params: {
  projectRoot: string
  sessionId: string
  role: string
  startedAt: string
  endedAt: string
  task: string
  outcome: SessionOutcome
}): void {
  try {
    const roleDir = path.join(params.projectRoot, MEMORY_DIR, params.role)
    fs.mkdirSync(roleDir, { recursive: true })

    const entry: MemoryEntry = {
      sessionId: params.sessionId,
      role: params.role,
      startedAt: params.startedAt,
      endedAt: params.endedAt,
      durationMs: new Date(params.endedAt).getTime() - new Date(params.startedAt).getTime(),
      task: truncateTask(params.task),
      outcome: params.outcome,
      schemaVersion: "0.1.0",
      timestamp: new Date().toISOString(),
    }

    const line = JSON.stringify(entry) + "\n"
    fs.appendFileSync(path.join(roleDir, "memory.jsonl"), line, "utf-8")
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err)
    process.stderr.write(`[aiplus-memory] ${msg}\n`)
  }
}
