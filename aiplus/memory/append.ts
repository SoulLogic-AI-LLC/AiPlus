/**
 * Agent Memory — Append Entry (V2)
 *
 * Three-layer JSONL append: personal (V1), team (V2), project (V2).
 * Redaction pipeline runs before every write.
 *
 * Fire-and-forget: errors are logged to stderr, never thrown.
 * Team-layer write permission: enforcement deferred to persona YAML.
 * Any role CAN call appendTeamEntry; whether it SHOULD is a persona concern.
 */

import * as fs from "node:fs"
import * as path from "node:path"
import type { MemoryEntry, TeamEntry, ProjectEntry, SessionOutcome } from "./types"
import { truncateTask } from "./types"
import { applyRedaction } from "./redact"
import { resolveLayerPath } from "./layers"

// ---- Personal (V1 — unchanged API) ---------------------------------------

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
    const filePath = resolveLayerPath(params.projectRoot, "personal", params.role)
    fs.mkdirSync(path.dirname(filePath), { recursive: true })

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

    const raw = JSON.stringify(entry) + "\n"
    fs.appendFileSync(filePath, raw, "utf-8")
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err)
    process.stderr.write(`[aiplus-memory] ${msg}\n`)
  }
}

// ---- Team (V2) -----------------------------------------------------------
//
// Permission note: any role can call appendTeamEntry. Write enforcement
// is deferred to persona YAML restrictions, not code-level gates.
// See ceo.md §1.2 default-does: "CEO owns assignment quality,
// specialists own domain correctness."

export function appendTeamEntry(params: {
  projectRoot: string
  id: string
  subject: string
  summary: string
  source: string
  tags?: string[]
}): void {
  try {
    const filePath = resolveLayerPath(params.projectRoot, "team")
    fs.mkdirSync(path.dirname(filePath), { recursive: true })

    const entry: TeamEntry = {
      id: params.id,
      subject: params.subject,
      summary: applyRedaction(params.summary),
      source: params.source,
      confidence: "owner_asserted",
      status: "active",
      tags: params.tags ?? [],
      schemaVersion: "0.2.0",
      timestamp: new Date().toISOString(),
      redaction: "none",
    }

    const raw = JSON.stringify(entry) + "\n"
    fs.appendFileSync(filePath, raw, "utf-8")
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err)
    process.stderr.write(`[aiplus-memory:team] ${msg}\n`)
  }
}

// ---- Project (V2) --------------------------------------------------------

export function appendProjectEntry(params: {
  projectRoot: string
  key: string
  value: string
  source: string
}): void {
  try {
    const filePath = resolveLayerPath(params.projectRoot, "project")
    fs.mkdirSync(path.dirname(filePath), { recursive: true })

    const entry: ProjectEntry = {
      key: params.key,
      value: applyRedaction(params.value),
      source: params.source,
      schemaVersion: "0.2.0",
      timestamp: new Date().toISOString(),
    }

    const raw = JSON.stringify(entry) + "\n"
    fs.appendFileSync(filePath, raw, "utf-8")
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err)
    process.stderr.write(`[aiplus-memory:project] ${msg}\n`)
  }
}
