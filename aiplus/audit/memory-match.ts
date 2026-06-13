import * as fs from "node:fs"
import * as path from "node:path"
import type { AuditCheck } from "./types"

interface DispatchEntry {
  dispatchId: string
  sessionId?: string
  role: string
  timestamp: string
  outcome?: string
}

interface MemoryEntry {
  sessionId: string
  role: string
  startedAt: string
  endedAt: string
  task: string
  outcome: string
}

/** D2: verify memory entries match dispatch entries by sessionId.
 *  GAP-4: entry-level matching — not count-based.
 */
export function checkMemoryMatch(projectRoot: string): AuditCheck {
  const dispatchLogPath = path.join(projectRoot, ".aiplus", "agents", "dispatch-log.jsonl")
  const memoryDir = path.join(projectRoot, ".aiplus", "agent-memory")

  // Read dispatch entries
  const dispatchEntries: DispatchEntry[] = []
  if (fs.existsSync(dispatchLogPath)) {
    const lines = fs.readFileSync(dispatchLogPath, "utf-8").split("\n").filter(l => l.trim())
    for (const line of lines) {
      try {
        const entry = JSON.parse(line)
        if (entry.dispatchId && entry.role && entry.timestamp) {
          dispatchEntries.push(entry)
        }
      } catch { /* skip malformed */ }
    }
  }

  // Read memory entries
  const memoryEntries: MemoryEntry[] = []
  if (fs.existsSync(memoryDir)) {
    for (const role of fs.readdirSync(memoryDir)) {
      if (role.startsWith(".") || role === "_team") continue
      const memFile = path.join(memoryDir, role, "memory.jsonl")
      if (fs.existsSync(memFile)) {
        const lines = fs.readFileSync(memFile, "utf-8").split("\n").filter(l => l.trim())
        for (const line of lines) {
          try {
            const entry = JSON.parse(line)
            if (entry.sessionId && entry.role && entry.startedAt) {
              memoryEntries.push(entry)
            }
          } catch { /* skip malformed */ }
        }
      }
    }
  }

  // No data — nothing to verify
  if (dispatchEntries.length === 0 && memoryEntries.length === 0) {
    return { id: "D2", name: "memory-match", status: "PASS", detail: "no data — nothing to verify" }
  }

  // Build sessionId sets
  // Extract sessionId from dispatchId: dispatch-<timestamp>-<role> → session-<timestamp>
  const dispatchSessionIds = new Set(dispatchEntries.map(e => {
    const match = e.dispatchId.match(/^dispatch-(\d+)-/)
    return e.sessionId ?? (match ? `session-${match[1]}` : e.dispatchId)
  }))
  const memorySessionIds = new Set(memoryEntries.map(e => e.sessionId))

  // Find mismatches
  const inDispatchNotMemory: string[] = []
  const inMemoryNotDispatch: string[] = []

  for (const sid of dispatchSessionIds) {
    if (!memorySessionIds.has(sid)) {
      inDispatchNotMemory.push(sid)
    }
  }

  for (const sid of memorySessionIds) {
    if (!dispatchSessionIds.has(sid)) {
      inMemoryNotDispatch.push(sid)
    }
  }

  // All matched
  if (inDispatchNotMemory.length === 0 && inMemoryNotDispatch.length === 0) {
    return {
      id: "D2",
      name: "memory-match",
      status: "PASS",
      detail: `${dispatchEntries.length} dispatch, ${memoryEntries.length} memory — all sessionIds matched`,
    }
  }

  // Mismatches found
  const issues: string[] = []
  if (inDispatchNotMemory.length > 0) {
    issues.push(`${inDispatchNotMemory.length} dispatch-only: ${inDispatchNotMemory.slice(0, 3).join(", ")}${inDispatchNotMemory.length > 3 ? "..." : ""}`)
  }
  if (inMemoryNotDispatch.length > 0) {
    issues.push(`${inMemoryNotDispatch.length} memory-only: ${inMemoryNotDispatch.slice(0, 3).join(", ")}${inMemoryNotDispatch.length > 3 ? "..." : ""}`)
  }

  return {
    id: "D2",
    name: "memory-match",
    status: "REVISE",
    detail: `sessionId mismatch — ${issues.join("; ")}`,
  }
}
