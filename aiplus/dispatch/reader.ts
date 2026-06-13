import * as fs from "node:fs"
import * as path from "node:path"
import type { DispatchEntry } from "./types"

const LOG_FILE = ".aiplus/agents/dispatch-log.jsonl"

/** Read all dispatch entries from the log file. */
export function readAll(projectRoot: string): DispatchEntry[] {
  const logPath = path.join(projectRoot, LOG_FILE)
  if (!fs.existsSync(logPath)) return []
  const content = fs.readFileSync(logPath, "utf-8")
  return content
    .split("\n")
    .filter((line) => line.trim().length > 0)
    .map((line) => JSON.parse(line) as DispatchEntry)
}

/** Find the most recent dispatch for a given role. */
export function latestForRole(projectRoot: string, role: string): DispatchEntry | undefined {
  return readAll(projectRoot)
    .filter((e) => e.role === role)
    .sort((a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime())[0]
}
