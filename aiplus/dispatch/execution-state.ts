import * as fs from "node:fs"
import * as path from "node:path"
import { withLock } from "../lock/file-lock"

const STATE_FILE = ".aiplus/agents/execution-state.json"
const STATE_LOCK_FILE = ".aiplus/agents/execution-state.lock"
const SCHEMA_VERSION = "0.1.0"

export type ExecutionStatus =
  | "queued"
  | "launch_ready"
  | "running"
  | "completed"
  | "failed"
  | "unsupported"
  | "timeout"

export interface ExecutionStateEntry {
  dispatchId: string
  role: string
  lane?: string
  roleInstance?: string
  task: string
  status: ExecutionStatus
  backend: string
  updatedAt: string
  sessionId?: string
  worktreePath?: string
  startedAt?: string
  endedAt?: string
  exitCode?: number
  error?: string
}

export interface ExecutionStateFile {
  schemaVersion: string
  roles: string[]
  dispatches: ExecutionStateEntry[]
}

function statePath(projectRoot: string): string {
  return path.join(projectRoot, STATE_FILE)
}

function lockPath(projectRoot: string): string {
  return path.join(projectRoot, STATE_LOCK_FILE)
}

function ensureDir(projectRoot: string): void {
  fs.mkdirSync(path.dirname(statePath(projectRoot)), { recursive: true })
}

function emptyState(): ExecutionStateFile {
  return { schemaVersion: SCHEMA_VERSION, roles: [], dispatches: [] }
}

function roleInstance(entry: Pick<ExecutionStateEntry, "role" | "lane">): string {
  return entry.lane ? `${entry.role}@${entry.lane}` : entry.role
}

function normalizeEntry(entry: ExecutionStateEntry): ExecutionStateEntry {
  return {
    ...entry,
    roleInstance: roleInstance(entry),
  }
}

function recomputeRoles(state: ExecutionStateFile): string[] {
  const set = new Set(state.dispatches.map((d) => d.roleInstance ?? roleInstance(d)))
  return Array.from(set).sort()
}

/** Load execution state from disk. Returns empty state if file missing. */
export async function loadExecutionState(projectRoot: string): Promise<ExecutionStateFile> {
  return withLock(lockPath(projectRoot), async () => {
    const file = statePath(projectRoot)
    if (!fs.existsSync(file)) return emptyState()
    try {
      const raw = fs.readFileSync(file, "utf-8")
      const parsed = JSON.parse(raw) as ExecutionStateFile
      if (!parsed || typeof parsed !== "object" || !Array.isArray(parsed.dispatches)) {
        return emptyState()
      }
      return {
        schemaVersion: parsed.schemaVersion ?? SCHEMA_VERSION,
        roles: parsed.roles ?? recomputeRoles(parsed),
        dispatches: parsed.dispatches.map(normalizeEntry),
      }
    } catch {
      return emptyState()
    }
  })
}

/** Save execution state to disk atomically (temp file + rename) under lock. */
export async function saveExecutionState(projectRoot: string, state: ExecutionStateFile): Promise<void> {
  return withLock(lockPath(projectRoot), async () => {
    ensureDir(projectRoot)
    const file = statePath(projectRoot)
    const normalized = {
      ...state,
      schemaVersion: state.schemaVersion ?? SCHEMA_VERSION,
      roles: recomputeRoles(state),
      dispatches: state.dispatches.map(normalizeEntry),
    }
    const tmp = `${file}.tmp-${Date.now()}-${process.pid}`
    fs.writeFileSync(tmp, JSON.stringify(normalized, null, 2), "utf-8")
    fs.renameSync(tmp, file)
  })
}

/** Insert or update a dispatch entry in execution state. */
export async function upsertExecutionStateEntry(
  projectRoot: string,
  entry: ExecutionStateEntry,
): Promise<void> {
  return withLock(lockPath(projectRoot), async () => {
    const file = statePath(projectRoot)
    let state: ExecutionStateFile
    if (fs.existsSync(file)) {
      try {
        const raw = fs.readFileSync(file, "utf-8")
        const parsed = JSON.parse(raw) as ExecutionStateFile
        state = {
          schemaVersion: parsed.schemaVersion ?? SCHEMA_VERSION,
          roles: parsed.roles ?? [],
          dispatches: parsed.dispatches.map(normalizeEntry),
        }
      } catch {
        state = emptyState()
      }
    } else {
      state = emptyState()
    }

    const normalized = normalizeEntry(entry)
    const index = state.dispatches.findIndex((d) => d.dispatchId === normalized.dispatchId)
    if (index >= 0) {
      state.dispatches[index] = normalized
    } else {
      state.dispatches.push(normalized)
    }
    state.roles = recomputeRoles(state)

    ensureDir(projectRoot)
    const tmp = `${file}.tmp-${Date.now()}-${process.pid}`
    fs.writeFileSync(tmp, JSON.stringify(state, null, 2), "utf-8")
    fs.renameSync(tmp, file)
  })
}

/** Check whether a dispatch id already exists in execution state. */
export async function hasExecutionStateEntry(projectRoot: string, dispatchId: string): Promise<boolean> {
  const state = await loadExecutionState(projectRoot)
  return state.dispatches.some((d) => d.dispatchId === dispatchId)
}
