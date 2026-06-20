/**
 * Task ledger CRUD operations.
 *
 * Callable from MCP tools. All mutations append a full-snapshot event
 * to the JSONL event log under an exclusive lock.
 *
 * Matches §2 of the Phase 0 design contract and the source's
 * task_ledger.rs (R-G).
 */

import type {
  TaskRecord,
  TaskEvent,
  EvidencePointer,
  TaskPriority,
  TaskKind,
  TaskStatus,
  TaskEvidenceLevel,
  EvidenceKind,
} from "./types"
import { EVENT_SCHEMA_VERSION, EVIDENCE_LEVEL_RANK } from "./types"
import { rfc3339Now, appendEvent, getTaskById, snapshotTasks, replayEvents, sortTasks } from "./store"
import { validateStatusTransition, computeEvidenceLevel } from "./state-machine"
import { validateEvidenceAdd, isAutoRerunnable, taskMaxEvidenceLevel } from "./evidence"
import * as fs from "node:fs"
import * as path from "node:path"

// ── ID generation ─────────────────────────────────────────────────────

// Sub-millisecond counter to prevent event_id collisions
// when multiple events fire within the same Date.now() tick.
let _eventIdSeq = 0

/**
 * Generate task ID: task_<unix_ms>_<seq>_<slug>
 * Matches source format with added seq for uniqueness under 1ms.
 */
export function generateTaskId(title: string): string {
  const ms = Date.now()
  const seq = ++_eventIdSeq
  const slug = slugify(title).slice(0, 48)
  return `task_${ms}_${seq}_${slug}`
}

/**
 * Generate event ID: event_<unix_ms>_<seq>_<task.id>
 * Matches source format with added seq for uniqueness under 1ms.
 */
export function generateEventId(taskId: string): string {
  const ms = Date.now()
  const seq = ++_eventIdSeq
  return `event_${ms}_${seq}_${taskId}`
}

// ── Slugify ───────────────────────────────────────────────────────────

/**
 * Create a URL-friendly slug from a title.
 * Lowercase, replace non-alphanumeric with hyphens, collapse runs.
 */
function slugify(text: string): string {
  return text
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 48)
}

// ── Default task record ───────────────────────────────────────────────

function defaultTask(id: string, slug: string, title: string, overrides: Partial<TaskRecord> = {}): TaskRecord {
  const now = rfc3339Now()
  return {
    id,
    slug,
    title,
    status: "open",
    priority: "P2",
    task_kind: "generic",
    evidence_level: "L0",
    evidence: [],
    stop_gate: false,
    blocked: false,
    created_at: now,
    updated_at: now,
    tags: [],
    ...overrides,
  }
}

// ── task_add ──────────────────────────────────────────────────────────

export interface TaskAddParams {
  title: string
  description?: string
  driver_agent?: string
  worker_agent?: string
  runtime?: string
  priority?: TaskPriority
  kind?: TaskKind
  parent_id?: string
  lane?: string
  tags?: string[]
}

/**
 * Create a new task and append an "add" event.
 * Returns the created TaskRecord.
 */
export async function task_add(projectRoot: string, params: TaskAddParams): Promise<TaskRecord> {
  const id = generateTaskId(params.title)
  const slug = slugify(params.title)
  const task = defaultTask(id, slug, params.title, {
    description: params.description,
    driver_agent: params.driver_agent,
    worker_agent: params.worker_agent,
    runtime: params.runtime,
    priority: params.priority ?? "P2",
    task_kind: params.kind ?? "generic",
    parent_id: params.parent_id,
    lane: params.lane,
    tags: params.tags ?? [],
  })

  const event: TaskEvent = {
    schema_version: EVENT_SCHEMA_VERSION,
    event_id: generateEventId(id),
    event_type: "add",
    ts: task.created_at,
    task,
  }

  await appendEvent(projectRoot, event)
  return task
}

// ── task_assign ───────────────────────────────────────────────────────

export interface TaskAssignParams {
  driver_agent?: string
  worker_agent?: string
  runtime?: string
}

/**
 * Assign driver/worker/runtime to a task and move status to "assigned".
 * Appends an "assign" event.
 */
export async function task_assign(
  projectRoot: string,
  id: string,
  params: TaskAssignParams,
): Promise<TaskRecord | null> {
  const current = await getTaskById(projectRoot, id)
  if (!current) return null

  const updated: TaskRecord = {
    ...current,
    status: "assigned",
    driver_agent: params.driver_agent !== undefined ? params.driver_agent : current.driver_agent,
    worker_agent: params.worker_agent !== undefined ? params.worker_agent : current.worker_agent,
    runtime: params.runtime !== undefined ? params.runtime : current.runtime,
    updated_at: rfc3339Now(),
  }

  const event: TaskEvent = {
    schema_version: EVENT_SCHEMA_VERSION,
    event_id: generateEventId(id),
    event_type: "assign",
    ts: updated.updated_at,
    task: updated,
  }

  await appendEvent(projectRoot, event)
  return updated
}

// ── task_update ───────────────────────────────────────────────────────

export interface TaskUpdateParams {
  status?: TaskStatus
  evidence_level?: TaskEvidenceLevel
  blocked?: boolean
  blocked_reason?: string
  clear_blocked?: boolean
  stop_gate?: boolean
  stop_gate_kind?: string
  clear_stop_gate?: boolean
}

/**
 * Update task status/priority/blocked/stop_gate fields.
 * Appends an "update" event.
 *
 * Guard: validated/done require sufficient evidence (§2.2).
 * Blocked/stop_gate are independent flags — setting them does NOT change status.
 */
export async function task_update(
  projectRoot: string,
  id: string,
  params: TaskUpdateParams,
): Promise<{ task: TaskRecord | null; error?: string }> {
  const current = await getTaskById(projectRoot, id)
  if (!current) return { task: null, error: `task not found: ${id}` }

  const now = rfc3339Now()
  const updated: TaskRecord = { ...current, updated_at: now }

  // Handle blocked flag
  if (params.blocked !== undefined) {
    updated.blocked = params.blocked
    if (params.blocked) {
      updated.blocked_reason = params.blocked_reason
    } else {
      delete updated.blocked_reason
    }
  }
  if (params.clear_blocked) {
    updated.blocked = false
    delete updated.blocked_reason
  }
  if (params.blocked_reason !== undefined && updated.blocked) {
    updated.blocked_reason = params.blocked_reason
  }

  // Handle stop_gate flag
  if (params.stop_gate !== undefined) {
    updated.stop_gate = params.stop_gate
    updated.stop_gate_kind = params.stop_gate_kind
  }
  if (params.clear_stop_gate) {
    updated.stop_gate = false
    delete updated.stop_gate_kind
  }

  // Handle status transition
  if (params.status !== undefined && params.status !== current.status) {
    const validation = validateStatusTransition(updated, params.status)
    if (!validation.valid) {
      return { task: current, error: validation.error }
    }
    updated.status = params.status
  }

  // Handle evidence_level update (cap check)
  if (params.evidence_level !== undefined) {
    const maxLevel = taskMaxEvidenceLevel(updated)
    if (EVIDENCE_LEVEL_RANK[params.evidence_level] > EVIDENCE_LEVEL_RANK[maxLevel]) {
      return {
        task: current,
        error: `cannot set evidence_level to ${params.evidence_level}: max evidence pointer is ${maxLevel}`,
      }
    }
    updated.evidence_level = params.evidence_level
  }

  const event: TaskEvent = {
    schema_version: EVENT_SCHEMA_VERSION,
    event_id: generateEventId(id),
    event_type: "update",
    ts: now,
    task: updated,
  }

  await appendEvent(projectRoot, event)
  return { task: updated }
}

// ── task_evidence_add ─────────────────────────────────────────────────

export interface TaskEvidenceAddParams {
  kind: EvidenceKind
  value: string
  level?: TaskEvidenceLevel
  rerunnable?: boolean
  note?: string
}

/**
 * Add an evidence pointer to a task.
 * Appends an "evidence_add" event.
 *
 * Enforces:
 * - queued/unsupported cap at L1
 * - auto-rerunnable for command/overclaim-packet
 * - evidence_level auto-update to max
 */
export async function task_evidence_add(
  projectRoot: string,
  id: string,
  params: TaskEvidenceAddParams,
): Promise<{ task: TaskRecord | null; error?: string }> {
  const current = await getTaskById(projectRoot, id)
  if (!current) return { task: null, error: `task not found: ${id}` }

  const level = params.level ?? "L1"
  const rerunnable = isAutoRerunnable(params.kind) ? true : (params.rerunnable ?? false)

  // Validate evidence (queued/unsupported cap)
  const validation = validateEvidenceAdd(params.kind, level)
  if (!validation.valid) {
    return { task: current, error: validation.error }
  }

  const pointer: EvidencePointer = {
    kind: params.kind,
    value: params.value,
    level,
    rerunnable,
    added_at: rfc3339Now(),
    note: params.note,
  }

  const updated: TaskRecord = {
    ...current,
    evidence: [...current.evidence, pointer],
    evidence_level: "", // placeholder, computed below
    updated_at: rfc3339Now(),
  }
  // Auto-update evidence_level to max
  updated.evidence_level = computeEvidenceLevel(updated.evidence)

  const event: TaskEvent = {
    schema_version: EVENT_SCHEMA_VERSION,
    event_id: generateEventId(id),
    event_type: "evidence_add",
    ts: updated.updated_at,
    task: updated,
  }

  await appendEvent(projectRoot, event)
  return { task: updated }
}

// ── task_validate ─────────────────────────────────────────────────────

/**
 * Parse overclaim packet from file, then call evidence_add.
 * Default level L3.
 *
 * Matches source task_validate flow (R-G lines 582–600).
 */
export async function task_validate(
  projectRoot: string,
  id: string,
  packetPath: string,
  level?: TaskEvidenceLevel,
): Promise<{ task: TaskRecord | null; error?: string }> {
  // Check that task exists
  const current = await getTaskById(projectRoot, id)
  if (!current) return { task: null, error: `task not found: ${id}` }

  // Read and parse the overclaim packet file
  let packetContent: string
  try {
    // Resolve relative to projectRoot if not absolute
    const resolvedPath = path.isAbsolute(packetPath)
      ? packetPath
      : path.resolve(projectRoot, packetPath)
    packetContent = fs.readFileSync(resolvedPath, "utf-8")
  } catch (err: any) {
    return { task: current, error: `cannot read packet file: ${err.message}` }
  }

  // Validate it's parseable JSON (basic check)
  try {
    JSON.parse(packetContent)
  } catch {
    return { task: current, error: "packet file is not valid JSON" }
  }

  // Add evidence with kind=overclaim-packet
  return await task_evidence_add(projectRoot, id, {
    kind: "overclaim-packet",
    value: packetPath,
    level: level ?? "L3",
    rerunnable: true,
    note: `overclaim packet from ${packetPath}`,
  })
}

// ── task_show ─────────────────────────────────────────────────────────

/**
 * Return a single task by ID.
 */
export async function task_show(projectRoot: string, id: string): Promise<TaskRecord | null> {
  return await getTaskById(projectRoot, id)
}

// ── task_list ─────────────────────────────────────────────────────────

export interface TaskListFilters {
  status?: TaskStatus
  agent?: string // matches driver_agent OR worker_agent
  lane?: string
}

/**
 * Return all tasks, with optional filters.
 * Sorted by priority → status → updated_at → id.
 */
export async function task_list(
  projectRoot: string,
  filters?: TaskListFilters,
): Promise<TaskRecord[]> {
  let tasks = await snapshotTasks(projectRoot)

  if (filters) {
    if (filters.status) {
      tasks = tasks.filter((t) => t.status === filters.status)
    }
    if (filters.agent) {
      tasks = tasks.filter(
        (t) => t.driver_agent === filters.agent || t.worker_agent === filters.agent,
      )
    }
    if (filters.lane) {
      tasks = tasks.filter((t) => t.lane === filters.lane)
    }
  }

  return tasks
}

// ── task_next ─────────────────────────────────────────────────────────

export interface TaskNextFilters {
  agent?: string // for idle-agent matching
  lane?: string
  limit?: number // default 3 (source default)
}

/**
 * Return open/assigned/in-progress tasks for an agent.
 * Excludes blocked and stop_gate tasks.
 * Sorted by priority (P0 first), then updated_at desc.
 *
 * If agent is provided: matches driver_agent OR worker_agent.
 * Default limit = 3 (matches source CLI default).
 */
export async function task_next(
  projectRoot: string,
  filters?: TaskNextFilters,
): Promise<TaskRecord[]> {
  const limit = filters?.limit ?? 3
  let tasks = await snapshotTasks(projectRoot)

  // Filter: only actionable statuses
  const actionableStatuses: TaskStatus[] = ["open", "assigned", "in-progress"]
  tasks = tasks.filter((t) => actionableStatuses.includes(t.status))

  // Exclude blocked and stop_gate tasks
  tasks = tasks.filter((t) => !t.blocked && !t.stop_gate)

  // Filter by agent
  if (filters?.agent) {
    tasks = tasks.filter(
      (t) => t.driver_agent === filters.agent || t.worker_agent === filters.agent,
    )
  }

  // Filter by lane
  if (filters?.lane) {
    tasks = tasks.filter((t) => t.lane === filters.lane)
  }

  // Already sorted by priority → status → updated_at → id from snapshot
  return tasks.slice(0, limit)
}
