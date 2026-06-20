/**
 * Task ledger persistence layer.
 *
 * File inventory:
 *   Event log      .aiplus/tasks/tasks.jsonl      JSONL — one TaskEvent per line
 *   Index cache    .aiplus/tasks/index.json        JSON — TaskIndex, atomic-rename
 *   Lock           .aiplus/tasks/tasks.lock        fd-based (flock)
 *   Proactive state .aiplus/tasks/proactive-state.json  JSON (read-only passthrough)
 *   Config         .aiplus/tasks/config.json       JSON (proactive_heartbeat_turns)
 *
 * Matches §2.3 of the Phase 0 design contract.
 */

import * as fs from "node:fs"
import * as path from "node:path"
import type {
  TaskRecord,
  TaskEvent,
  TaskEventType,
  TaskIndex,
  TaskStatus,
  TaskPriority,
  EvidenceKind,
  TaskEvidenceLevel,
} from "./types"
import { EVENT_SCHEMA_VERSION, INDEX_SCHEMA_VERSION, EVIDENCE_LEVEL_RANK } from "./types"
import { withLock } from "./lock"

// ── Paths ─────────────────────────────────────────────────────────────

const TASKS_DIR = ".aiplus/tasks"
const EVENT_LOG_FILE = "tasks.jsonl"
const INDEX_FILE = "index.json"
const LOCK_FILE = "tasks.lock"
const PROACTIVE_STATE_FILE = "proactive-state.json"
const CONFIG_FILE = "config.json"

function eventLogPath(projectRoot: string): string {
  return path.join(projectRoot, TASKS_DIR, EVENT_LOG_FILE)
}

function indexPath(projectRoot: string): string {
  return path.join(projectRoot, TASKS_DIR, INDEX_FILE)
}

function lockPath(projectRoot: string): string {
  return path.join(projectRoot, TASKS_DIR, LOCK_FILE)
}

// ── Priority / status sort ranks ──────────────────────────────────────

const PRIORITY_RANK: Record<TaskPriority, number> = {
  P0: 0,
  P1: 1,
  P2: 2,
  P3: 3,
}

const STATUS_RANK: Record<TaskStatus, number> = {
  open: 0,
  assigned: 1,
  "in-progress": 2,
  "in-review": 3,
  validated: 4,
  merged: 5,
  done: 6,
}

/**
 * Sort tasks by priority_rank → status_rank → updated_at desc → id asc.
 * Matches source sort order (R-G).
 */
export function sortTasks(tasks: TaskRecord[]): TaskRecord[] {
  return [...tasks].sort((a, b) => {
    const pa = PRIORITY_RANK[a.priority] ?? 99
    const pb = PRIORITY_RANK[b.priority] ?? 99
    if (pa !== pb) return pa - pb
    const sa = STATUS_RANK[a.status] ?? 99
    const sb = STATUS_RANK[b.status] ?? 99
    if (sa !== sb) return sa - sb
    if (a.updated_at < b.updated_at) return 1
    if (a.updated_at > b.updated_at) return -1
    if (a.id < b.id) return -1
    if (a.id > b.id) return 1
    return 0
  })
}

// ── RFC 3339 timestamp (seconds precision, no millis) ─────────────────

/**
 * Returns current UTC time as RFC 3339 with second precision.
 * Matches source: chrono::Utc::now().to_rfc3339_opts(SecondsFormat::Secs, true)
 *
 * e.g. "2026-06-19T04:23:22Z"
 */
export function rfc3339Now(): string {
  return new Date().toISOString().replace(/\.\d{3}/, "")
}

// ── Replay events from JSONL ──────────────────────────────────────────

/**
 * Read the JSONL event log and replay all events.
 * Returns array of TaskRecord representing current state (latest snapshot per task).
 * Sorted by priority → status → updated_at → id.
 *
 * Matches source replay strategy (R-G lines 822–836).
 */
export function replayEvents(projectRoot: string): TaskRecord[] {
  const logPath = eventLogPath(projectRoot)
  if (!fs.existsSync(logPath)) return []

  const content = fs.readFileSync(logPath, "utf-8")
  const lines = content.split("\n").filter((l) => l.trim())

  const taskMap = new Map<string, TaskRecord>()

  for (const line of lines) {
    try {
      const event: TaskEvent = JSON.parse(line)
      // Validate schema version
      // Skip unknown schema versions
      if (event.schema_version && event.schema_version !== EVENT_SCHEMA_VERSION) {
        continue
      }
      // Each event carries a full task snapshot — overwrite the map entry
      taskMap.set(event.task.id, event.task)
    } catch {
      // Skip malformed lines (source skips corrupt entries)
      continue
    }
  }

  return sortTasks(Array.from(taskMap.values()))
}

// ── Read tasks (lock + replay) ────────────────────────────────────────

/**
 * Acquire lock, replay all events from JSONL, return sorted tasks.
 * Releases lock after reading.
 *
 * Matches source snapshot_tasks() (R-G lines 874–878).
 */
export async function snapshotTasks(projectRoot: string): Promise<TaskRecord[]> {
  return await withLock(lockPath(projectRoot), async () => {
    return replayEvents(projectRoot)
  })
}

// ── Append event ──────────────────────────────────────────────────────

/**
 * Acquire lock, append event to JSONL, rebuild index, release lock.
 *
 * This is the core write path. Lock serializes concurrent appenders
 * so JSONL remains clean (no interleaved lines, no truncation).
 *
 * Matches source append_event flow (R-G lines 874–900).
 */
export async function appendEvent(projectRoot: string, event: TaskEvent): Promise<void> {
  await withLock(lockPath(projectRoot), async () => {
    const logPath = eventLogPath(projectRoot)
    const dir = path.dirname(logPath)
    fs.mkdirSync(dir, { recursive: true })

    // Append one line to JSONL
    const line = JSON.stringify(event) + "\n"
    fs.appendFileSync(logPath, line, "utf-8")

    // Rebuild index from scratch (replay all events)
    const tasks = replayEvents(projectRoot)
    rebuildIndex(projectRoot, tasks)
  })
}

// ── Index management ──────────────────────────────────────────────────

/**
 * Rebuild the index.json cache file.
 * Uses temp-file + atomic rename (crash-safe).
 *
 * Matches source atomic-write pattern (R-G).
 */
export function rebuildIndex(projectRoot: string, tasks: TaskRecord[]): void {
  const idxPath = indexPath(projectRoot)
  const dir = path.dirname(idxPath)
  fs.mkdirSync(dir, { recursive: true })

  const index: TaskIndex = {
    schema_version: INDEX_SCHEMA_VERSION,
    rebuilt_at: rfc3339Now(),
    tasks: sortTasks(tasks),
  }

  // Write to temp file, then atomic rename
  const tmpPath = idxPath + ".tmp"
  fs.writeFileSync(tmpPath, JSON.stringify(index) + "\n", "utf-8")
  fs.renameSync(tmpPath, idxPath)
}

// ── Read single task ──────────────────────────────────────────────────

/**
 * Get a single task by ID.
 * Reads from index cache if available and fresh, otherwise replays.
 *
 * Matches source get_task_by_id().
 */
export async function getTaskById(projectRoot: string, id: string): Promise<TaskRecord | null> {
  // Try index cache first (doesn't need lock)
  const idxPath = indexPath(projectRoot)
  if (fs.existsSync(idxPath)) {
    try {
      const raw = fs.readFileSync(idxPath, "utf-8")
      const index: TaskIndex = JSON.parse(raw)
      if (index.schema_version === INDEX_SCHEMA_VERSION) {
        const found = index.tasks.find((t) => t.id === id)
        if (found) return found
      }
    } catch {
      // Corrupt index — fall through to replay
    }
  }

  // Fall back to full replay under lock
  const tasks = await snapshotTasks(projectRoot)
  return tasks.find((t) => t.id === id) ?? null
}

// ── Locked read-modify-write ──────────────────────────────────────────

/**
 * Sub-millisecond counter for event_id uniqueness inside locked writes.
 */
let _storeEventSeq = 0

/**
 * Run a read-modify-write cycle on a single task under one exclusive lock.
 *
 * 1. acquire tasks.lock
 * 2. replay JSONL → get current task
 * 3. call fn(task) → { task, eventType } | null
 * 4. if result, append event to JSONL
 * 5. rebuild index via atomic rename
 * 6. release lock (in finally!)
 * 7. return updated task (null if not found or fn returned null)
 *
 * This eliminates the TOCTOU window between getTaskById and appendEvent.
 */
export async function withLockedTask(
  projectRoot: string,
  id: string,
  fn: (current: TaskRecord) => Promise<{ task: TaskRecord; eventType: TaskEventType } | null>,
): Promise<TaskRecord | null> {
  return await withLock(lockPath(projectRoot), async () => {
    const tasks = replayEvents(projectRoot)
    const current = tasks.find((t) => t.id === id)
    if (!current) return null

    const result = await fn(current)
    if (!result) return null

    const event: TaskEvent = {
      schema_version: EVENT_SCHEMA_VERSION,
      event_id: `event_${Date.now()}_${++_storeEventSeq}_${id}`,
      event_type: result.eventType,
      ts: result.task.updated_at,
      task: result.task,
    }

    const logPath = eventLogPath(projectRoot)
    const dir = path.dirname(logPath)
    fs.mkdirSync(dir, { recursive: true })
    const line = JSON.stringify(event) + "\n"
    fs.appendFileSync(logPath, line, "utf-8")

    const allTasks = replayEvents(projectRoot)
    rebuildIndex(projectRoot, allTasks)

    return result.task
  })
}

// ── Proactive state / config passthrough (read-only) ──────────────────

/**
 * Read proactive-state.json (P0: read-only passthrough).
 * Returns the parsed JSON object or null if not present.
 */
export function readProactiveState(projectRoot: string): unknown | null {
  const p = path.join(projectRoot, TASKS_DIR, PROACTIVE_STATE_FILE)
  if (!fs.existsSync(p)) return null
  try {
    return JSON.parse(fs.readFileSync(p, "utf-8"))
  } catch {
    return null
  }
}

/**
 * Read config.json.
 * Returns the parsed JSON object or default config.
 */
export function readConfig(projectRoot: string): { proactive_heartbeat_turns: number } {
  const p = path.join(projectRoot, TASKS_DIR, CONFIG_FILE)
  const defaults = { proactive_heartbeat_turns: 10 }
  if (!fs.existsSync(p)) return defaults
  try {
    const raw = JSON.parse(fs.readFileSync(p, "utf-8"))
    return { ...defaults, ...raw }
  } catch {
    return defaults
  }
}
