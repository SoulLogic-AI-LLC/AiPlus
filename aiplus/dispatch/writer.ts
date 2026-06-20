import * as fs from "node:fs"
import * as path from "node:path"
import type { DispatchEntry } from "./types"
import { appendCanonicalEvent } from "../canonical-events"

const LOG_FILE = ".aiplus/agents/dispatch-log.jsonl"

/** GAP-2: compute entry hash with hash chain. Returns entry without chain fields. */
export function hashEntry(entry: DispatchEntry, logFile: string): { prev_hash: string; entry_hash: string } {
  let prevHash = "genesis"
  if (fs.existsSync(logFile)) {
    const lines = fs
      .readFileSync(logFile, "utf-8")
      .split("\n")
      .filter((l) => l.trim())
    if (lines.length > 0) {
      try {
        prevHash = JSON.parse(lines[lines.length - 1]).entry_hash ?? "genesis"
      } catch {
        /* corrupt */
      }
    }
  }
  const body = JSON.stringify(entry)
  const entryHash = Bun.SHA256.hash(body, "hex").slice(0, 16)
  return { prev_hash: prevHash, entry_hash: entryHash }
}

/**
 * Append a dispatch entry to the JSONL log file with hash chain.
 * Caller must hold `.aiplus/agents/dispatch-log.lock` when concurrent
 * appenders exist (e.g. lifecycle hooks). This function performs no I/O
 * locking of its own.
 */
export function appendLogEntry(projectRoot: string, entry: DispatchEntry): void {
  const logPath = path.join(projectRoot, LOG_FILE)
  const dir = path.dirname(logPath)
  fs.mkdirSync(dir, { recursive: true })
  const chain = hashEntry(entry, logPath)
  const line = JSON.stringify({ ...entry, ...chain }) + "\n"
  fs.appendFileSync(logPath, line, "utf-8")
}

/**
 * Append a dispatch entry to the JSONL log file with hash chain.
 * Fire-and-forget: write failure is logged to stderr but never throws.
 *
 * This is the unlocked CLI path. Concurrent callers (lifecycle hooks) should
 * use `appendLogEntry` while holding `dispatch-log.lock`.
 */
export function append(projectRoot: string, entry: DispatchEntry): void {
  try {
    appendLogEntry(projectRoot, entry)
    appendCanonicalEvent(projectRoot, {
      eventType: "dispatch.appended",
      timestamp: entry.timestamp,
      dispatchId: entry.dispatchId,
      sessionId: entry.sessionId,
      role: entry.role,
      source: "native-cli-dispatch",
      status: entry.status,
      provenance: {
        transport: "cli",
        emitter: "aiplus/dispatch/writer.ts",
        shadowMode: true,
      },
      payload: {
        task: entry.task,
        worktreePath: entry.worktreePath,
        durationMs: entry.durationMs,
        error: entry.error,
      },
    })
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err)
    process.stderr.write(`[aiplus-dispatch] failed to write dispatch log: ${msg}\n`)
  }
}
