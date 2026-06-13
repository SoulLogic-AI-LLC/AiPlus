import * as fs from "node:fs"
import * as path from "node:path"
import type { DispatchEntry } from "./types"

const LOG_FILE = ".aiplus/agents/dispatch-log.jsonl"

/**
 * Append a dispatch entry to the JSONL log file.
 * Fire-and-forget: write failure is logged to stderr but never throws.
 *
 * NOTE: session lifecycle dispatch writes go through session.ts's inline
 * appendDispatchLog() — this module is for external (CLI/tool) dispatch use.
 * The two implementations are intentionally independent to avoid cross-package
 * import complexity in the core session module.
 */
export function append(projectRoot: string, entry: DispatchEntry): void {
  try {
    const logPath = path.join(projectRoot, LOG_FILE)
    const dir = path.dirname(logPath)
    fs.mkdirSync(dir, { recursive: true })
    const line = JSON.stringify(entry) + "\n"
    fs.appendFileSync(logPath, line, "utf-8")
  } catch (err) {
    // OBS-1: fire-and-forget — never block session startup on log failure
    const msg = err instanceof Error ? err.message : String(err)
    process.stderr.write(`[aiplus-dispatch] failed to write dispatch log: ${msg}\n`)
  }
}
