/**
 * Verify CLI — On-Disk Ledger
 *
 * Append-only JSONL ledger at .aiplus/verify/ledger.jsonl.
 */

import * as fs from "node:fs"
import * as path from "node:path"
import type { VerifyEntry } from "./types"

const LEDGER_DIR = ".aiplus/verify"
const LEDGER_FILE = "ledger.jsonl"

function ledgerPath(projectRoot: string): string {
  return path.join(projectRoot, LEDGER_DIR, LEDGER_FILE)
}

/** Append a verification entry to the ledger. Fire-and-forget. */
export function appendLedger(projectRoot: string, entry: VerifyEntry): void {
  try {
    const dir = path.join(projectRoot, LEDGER_DIR)
    fs.mkdirSync(dir, { recursive: true })
    const line = JSON.stringify(entry) + "\n"
    fs.appendFileSync(ledgerPath(projectRoot), line, "utf-8")
  } catch (err) {
    process.stderr.write(`[aiplus-verify] ledger write failed: ${err instanceof Error ? err.message : String(err)}\n`)
  }
}

/** Read all ledger entries. */
export function readLedger(projectRoot: string): VerifyEntry[] {
  try {
    const p = ledgerPath(projectRoot)
    if (!fs.existsSync(p)) return []
    const lines = fs
      .readFileSync(p, "utf-8")
      .split("\n")
      .filter((l) => l.trim())
    const entries: VerifyEntry[] = []
    for (const line of lines) {
      try {
        entries.push(JSON.parse(line))
      } catch {
        /* skip malformed */
      }
    }
    return entries
  } catch {
    return []
  }
}

/** Get the latest N ledger entries. */
export function getLatestEntries(projectRoot: string, count: number = 10): VerifyEntry[] {
  const entries = readLedger(projectRoot)
  return entries.slice(-count)
}

/** Get the most recent entry, if any. */
export function getLatestEntry(projectRoot: string): VerifyEntry | null {
  const entries = readLedger(projectRoot)
  return entries.length > 0 ? entries[entries.length - 1] : null
}
