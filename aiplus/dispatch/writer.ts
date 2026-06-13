import * as fs from "node:fs"
import * as path from "node:path"
import type { DispatchEntry } from "./types"

const LOG_FILE = ".aiplus/agents/dispatch-log.jsonl"

/** GAP-2: compute entry hash with hash chain. Returns entry without chain fields. */
export function hashEntry(entry: DispatchEntry, logFile: string): { prev_hash: string; entry_hash: string } {
  let prevHash = "genesis"
  if (fs.existsSync(logFile)) {
    const lines = fs.readFileSync(logFile, "utf-8").split("\n").filter(l => l.trim())
    if (lines.length > 0) {
      try { prevHash = JSON.parse(lines[lines.length - 1]).entry_hash ?? "genesis" }
      catch { /* corrupt */ }
    }
  }
  const body = JSON.stringify(entry)
  const entryHash = Bun.SHA256.hash(body, "hex").slice(0, 16)
  return { prev_hash: prevHash, entry_hash: entryHash }
}

/**
 * Append a dispatch entry to the JSONL log file with hash chain.
 * Fire-and-forget: write failure is logged to stderr but never throws.
 *
 * NOTE: session lifecycle dispatch writes go through session.ts's inline
 * appendDispatchLog() — this module is for external (CLI/tool) dispatch use.
 */
export function append(projectRoot: string, entry: DispatchEntry): void {
  try {
    const logPath = path.join(projectRoot, LOG_FILE)
    const dir = path.dirname(logPath)
    fs.mkdirSync(dir, { recursive: true })
    const chain = hashEntry(entry, logPath)
    const line = JSON.stringify({ ...entry, ...chain }) + "\n"
    fs.appendFileSync(logPath, line, "utf-8")
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err)
    process.stderr.write(`[aiplus-dispatch] failed to write dispatch log: ${msg}\n`)
  }
}
