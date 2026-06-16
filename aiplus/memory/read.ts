/**
 * Agent Memory — Read Layer (V2)
 *
 * Read-side filtering for JSONL memory files.
 * Uses node:fs and resolveLayerPath from layers.ts.
 */

import * as fs from "node:fs"
import type { MemoryEntry, TeamEntry, ProjectEntry, CraftEntry } from "./types"
import { resolveLayerPath } from "./layers"

type AnyEntry = TeamEntry | ProjectEntry | MemoryEntry | CraftEntry

const REJECTED_STATUSES = new Set(["superseded", "rejected", "forgotten"])

function readJsonl(filePath: string): AnyEntry[] {
  if (!fs.existsSync(filePath)) return []
  const content = fs.readFileSync(filePath, "utf-8")
  if (content.trim().length === 0) return []
  return content
    .split("\n")
    .filter(line => line.trim().length > 0)
    .map(line => JSON.parse(line) as AnyEntry)
}

/**
 * Read all entries (no filtering) from a layer's JSONL file.
 */
export function readAll(
  projectRoot: string,
  layer: "personal" | "team" | "project",
  role?: string,
): AnyEntry[] {
  const filePath = resolveLayerPath(projectRoot, layer, role)
  return readJsonl(filePath)
}

/**
 * Read only active entries (exclude status: "superseded", "rejected", "forgotten").
 */
export function readActive(
  projectRoot: string,
  layer: "personal" | "team" | "project",
  role?: string,
): AnyEntry[] {
  const filePath = resolveLayerPath(projectRoot, layer, role)
  return readJsonl(filePath).filter(entry => {
    if ("status" in entry) return !REJECTED_STATUSES.has(entry.status)
    return true
  })
}

/**
 * Find a single entry by ID.
 */
export function findById<T extends { id: string }>(
  projectRoot: string,
  layer: "personal" | "team" | "project",
  id: string,
  role?: string,
): T | null {
  const filePath = resolveLayerPath(projectRoot, layer, role)
  const entries = readJsonl(filePath) as unknown as T[]
  return entries.find(e => e.id === id) ?? null
}

/**
 * Simple case-insensitive query search across summary and tags.
 */
export function findByQuery<T>(
  projectRoot: string,
  layer: "personal" | "team" | "project",
  query: string,
  role?: string,
): T[] {
  const filePath = resolveLayerPath(projectRoot, layer, role)
  const lower = query.toLowerCase()
  const entries = readJsonl(filePath)
  return entries.filter(entry => {
    if ("summary" in entry && typeof entry.summary === "string") {
      if (entry.summary.toLowerCase().includes(lower)) return true
    }
    if ("tags" in entry && Array.isArray(entry.tags)) {
      if (entry.tags.some(t => t.toLowerCase().includes(lower))) return true
    }
    if ("task" in entry && typeof entry.task === "string") {
      if (entry.task.toLowerCase().includes(lower)) return true
    }
    return false
  }) as unknown as T[]
}
