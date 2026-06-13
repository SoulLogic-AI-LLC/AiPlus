/**
 * Lobby CLI — Dispatch Log Parser
 *
 * Reads dispatch-log.jsonl to find active sessions.
 */

import * as fs from "node:fs"
import * as path from "node:path"
import type { DispatchEntry } from "./types"

const DISPATCH_LOG_PATH = ".aiplus/agents/dispatch-log.jsonl"

/** Read dispatch-log.jsonl and return all entries. */
export function readDispatchLog(projectRoot: string): DispatchEntry[] {
  const logPath = path.join(projectRoot, DISPATCH_LOG_PATH)
  if (!fs.existsSync(logPath)) return []

  try {
    const content = fs.readFileSync(logPath, "utf-8")
    const lines = content.trim().split("\n").filter(Boolean)
    const entries: DispatchEntry[] = []

    for (const line of lines) {
      try {
        const entry = JSON.parse(line)
        if (entry.dispatchId && entry.role && entry.timestamp) {
          entries.push(entry)
        }
      } catch {
        // skip malformed lines
      }
    }

    return entries
  } catch {
    return []
  }
}

/** Get the most recent entry for each role. */
export function getLatestByRole(entries: DispatchEntry[]): Map<string, DispatchEntry> {
  const latest = new Map<string, DispatchEntry>()

  for (const entry of entries) {
    const existing = latest.get(entry.role)
    if (!existing || new Date(entry.timestamp) > new Date(existing.timestamp)) {
      latest.set(entry.role, entry)
    }
  }

  return latest
}

/** Get entries from the last N hours. */
export function getRecentEntries(entries: DispatchEntry[], hours = 24): DispatchEntry[] {
  const cutoff = new Date(Date.now() - hours * 60 * 60 * 1000)
  return entries.filter(e => new Date(e.timestamp) > cutoff)
}

/** Extract session ID from dispatch ID. */
export function extractSessionId(dispatchId: string): string {
  // dispatch-<timestamp>-<role> → session-<timestamp>
  const match = dispatchId.match(/^dispatch-(\d+)-/)
  return match ? `session-${match[1]}` : dispatchId
}
