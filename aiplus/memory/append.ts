/**
 * Agent Memory Hook — Append Entry (V2)
 *
 * Fire-and-forget JSONL append to .aiplus/agent-memory/<role>/memory.jsonl.
 * V2: hash chain (GAP-2) — prev_hash + entry_hash per row.
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

    const memFile = path.join(roleDir, "memory.jsonl")
    // GAP-2: hash chain
    let prevHash = "genesis"
    if (fs.existsSync(memFile)) {
      const lines = fs.readFileSync(memFile, "utf-8").split("\n").filter(l => l.trim())
      if (lines.length > 0) {
        try { prevHash = JSON.parse(lines[lines.length - 1]).entry_hash ?? "genesis" }
        catch { /* corrupt */ }
      }
    }
    const entryBody = JSON.stringify(entry)
    const entryHash = Bun.SHA256.hash(entryBody, "hex").slice(0, 16)

    const line = JSON.stringify({ ...entry, prev_hash: prevHash, entry_hash: entryHash }) + "\n"
    fs.appendFileSync(memFile, line, "utf-8")
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err)
    process.stderr.write(`[aiplus-memory] ${msg}\n`)
  }
}
