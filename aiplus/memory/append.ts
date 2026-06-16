/**
 * Agent Memory Hook — Append Entry (V2)
 *
 * Fire-and-forget JSONL append to .aiplus/agent-memory/<role>/memory.jsonl.
 * V2: hash chain (GAP-2) — prev_hash + entry_hash per row.
 */

import * as fs from "node:fs"
import * as path from "node:path"
import * as crypto from "node:crypto"
import type { MemoryEntry, SessionOutcome, TeamEntry, TeamConfidence, TeamStatus, ProjectEntry } from "./types"
import { truncateTask } from "./types"
import { applyRedaction } from "./redact"

const MEMORY_DIR = ".aiplus/agent-memory"

/** Hash a JSON-stringified entry (SHA-256, first 16 hex chars). */
export function hashEntry(entryBody: string): string {
  const hash = crypto.createHash("sha256")
  hash.update(entryBody)
  return hash.digest("hex").slice(0, 16)
}

/** Read the last entry_hash from a memory file (or "genesis" if none). */
function readPrevHash(memFile: string): string {
  if (!fs.existsSync(memFile)) return "genesis"
  const lines = fs.readFileSync(memFile, "utf-8").split("\n").filter(l => l.trim())
  if (lines.length === 0) return "genesis"
  try {
    return JSON.parse(lines[lines.length - 1]).entry_hash ?? "genesis"
  } catch { return "genesis" }
}

/** Write a JSONL line to a memory file with hash chain and redaction. */
export function writeLine(memFile: string, entry: object): void {
  const entryBody = JSON.stringify(entry)
  const entryHash = hashEntry(entryBody)
  const prevHash = readPrevHash(memFile)
  const line = JSON.stringify({ ...entry, prev_hash: prevHash, entry_hash: entryHash }) + "\n"
  fs.appendFileSync(memFile, applyRedaction(line), "utf-8")
}

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
    writeLine(memFile, entry)
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err)
    process.stderr.write(`[aiplus-memory] ${msg}\n`)
  }
}

/**
 * Append a team-level memory entry (decisions, blockers, gates).
 *
 * Writes to .aiplus/agent-memory/_team/memory.jsonl.
 * Fire-and-forget: errors are logged, never thrown.
 */
export function appendTeamEntry(params: {
  projectRoot: string
  id: string
  subject: string
  summary: string
  source: string
  confidence?: TeamConfidence
  status?: TeamStatus
  tags?: string[]
  supersedes?: string[]
}): void {
  try {
    const teamDir = path.join(params.projectRoot, MEMORY_DIR, "_team")
    fs.mkdirSync(teamDir, { recursive: true })

    const entry: TeamEntry = {
      id: params.id,
      subject: params.subject,
      summary: params.summary,
      source: params.source,
      confidence: params.confidence ?? "owner_asserted",
      status: params.status ?? "active",
      tags: params.tags ?? [],
      schemaVersion: "0.2.1",
      timestamp: new Date().toISOString(),
      redaction: "none",
      supersededBy: [],
      supersedes: params.supersedes ?? [],
      conflictGroup: null,
      expiresAt: null,
      staleAfter: null,
    }

    const memFile = path.join(teamDir, "memory.jsonl")
    writeLine(memFile, entry)
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err)
    process.stderr.write(`[aiplus-memory] ${msg}\n`)
  }
}

/**
 * Append a project-level memory entry (constraints, preferences).
 *
 * Writes to .aiplus/agent-memory/project/memory.jsonl.
 * Fire-and-forget: errors are logged, never thrown.
 */
export function appendProjectEntry(params: {
  projectRoot: string
  key: string
  value: string
  source: string
  supersedes?: string[]
}): void {
  try {
    const projectDir = path.join(params.projectRoot, MEMORY_DIR, "project")
    fs.mkdirSync(projectDir, { recursive: true })

    const entry: ProjectEntry = {
      key: params.key,
      value: params.value,
      source: params.source,
      schemaVersion: "0.2.1",
      timestamp: new Date().toISOString(),
      supersededBy: [],
      supersedes: params.supersedes ?? [],
      conflictGroup: null,
      expiresAt: null,
      staleAfter: null,
    }

    const memFile = path.join(projectDir, "memory.jsonl")
    writeLine(memFile, entry)
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err)
    process.stderr.write(`[aiplus-memory] ${msg}\n`)
  }
}

/** Memory entry written on session create — lightweight, no outcome/duration. */
interface SessionCreatedEntry {
  sessionId: string
  role: string
  task: string
  schemaVersion: "0.1.0"
  timestamp: string
}

/**
 * Append a lightweight "session created" entry to the role's memory log.
 *
 * Unlike `appendMemoryEntry`, this does not require startedAt/endedAt/outcome.
 * Called from the session create path before any execution begins.
 * Fire-and-forget: errors are logged to stderr, never thrown.
 */
export function appendSessionCreated(params: {
  projectRoot: string
  sessionId: string
  role: string
  task: string
}): void {
  try {
    const roleDir = path.join(params.projectRoot, MEMORY_DIR, params.role)
    fs.mkdirSync(roleDir, { recursive: true })

    const entry: SessionCreatedEntry = {
      sessionId: params.sessionId,
      role: params.role,
      task: truncateTask(params.task),
      schemaVersion: "0.1.0",
      timestamp: new Date().toISOString(),
    }

    const memFile = path.join(roleDir, "memory.jsonl")
    writeLine(memFile, entry)
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err)
    process.stderr.write(`[aiplus-memory] ${msg}\n`)
  }
}
