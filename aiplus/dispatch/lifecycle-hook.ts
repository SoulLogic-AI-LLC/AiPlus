import * as path from "node:path"
import type { DispatchEntry } from "./types"
import { appendLogEntry } from "./writer"
import { appendCanonicalEvent } from "../canonical-events"
import { withLock } from "../lock/file-lock"
import { upsertExecutionStateEntry, type ExecutionStatus } from "./execution-state"

export interface DispatchStartParams {
  dispatchId: string
  role: string
  task: string
  lane?: string
  worktreePath?: string
  sessionId?: string
  backend?: string
  supervisionMode?: string
}

export interface DispatchStartResult {
  dispatchId: string
  timestamp: string
  logged: boolean
}

export interface DispatchCompleteParams {
  dispatchId: string
  role: string
  task: string
  sessionId?: string
  worktreePath?: string
  durationMs: number
  backend?: string
}

export interface DispatchFailParams {
  dispatchId: string
  role: string
  task: string
  sessionId?: string
  worktreePath?: string
  durationMs: number
  error: string
  backend?: string
}

export interface DispatchLifecycleHook {
  onDispatchStart(params: DispatchStartParams): Promise<DispatchStartResult>
  onDispatchComplete(params: DispatchCompleteParams): Promise<void>
  onDispatchFail(params: DispatchFailParams): Promise<void>
}

const DISPATCH_LOG_LOCK = ".aiplus/agents/dispatch-log.lock"

function nowIso(): string {
  return new Date().toISOString()
}

function makeDispatchEntry(
  status: DispatchEntry["status"],
  params: Omit<DispatchStartParams, "dispatchId" | "role" | "task"> & { dispatchId: string; role: string; task: string; durationMs?: number; error?: string; timestamp?: string },
): DispatchEntry {
  return {
    dispatchId: params.dispatchId,
    role: params.role,
    task: params.task,
    status,
    sessionId: params.sessionId ?? "",
    worktreePath: params.worktreePath ?? "",
    timestamp: params.timestamp ?? nowIso(),
    ...(params.durationMs !== undefined ? { durationMs: params.durationMs } : {}),
    ...(params.error !== undefined ? { error: params.error } : {}),
  }
}

function emitCanonical(
  projectRoot: string,
  eventType: "dispatch.created" | "dispatch.completed" | "dispatch.failed",
  params: { dispatchId: string; role: string; sessionId?: string; status: string; durationMs?: number; error?: string; task?: string },
) {
  appendCanonicalEvent(projectRoot, {
    eventType,
    timestamp: nowIso(),
    dispatchId: params.dispatchId,
    sessionId: params.sessionId,
    role: params.role,
    source: "native-session-hook",
    status: params.status,
    provenance: {
      transport: "native",
      emitter: "aiplus/dispatch/lifecycle-hook.ts",
      shadowMode: true,
    },
    payload: {
      task: params.task,
      durationMs: params.durationMs,
      error: params.error,
    },
  })
}

/**
 * Generate a dispatch id for a role/lane.
 * Format: dispatch-<unix_ms>-<role>[-<lane>]
 */
export function generateDispatchId(role: string, lane?: string): string {
  const normalizedRole = role.replace(/\s+/g, "-")
  return lane
    ? `dispatch-${Date.now()}-${normalizedRole}-${lane}`
    : `dispatch-${Date.now()}-${normalizedRole}`
}

/**
 * Create a fail-open dispatch lifecycle hook.
 *
 * The hook writes to `.aiplus/agents/dispatch-log.jsonl` (hash chain) and
 * `.aiplus/agents/execution-state.json` on start, complete, and fail.
 * Any write failure is logged to stderr and swallowed.
 */
export function createDispatchLifecycleHook(
  projectRoot: string,
  options: { backend?: string } = {},
): DispatchLifecycleHook {
  const backend = options.backend ?? "opencode"
  const lockPath = path.join(projectRoot, DISPATCH_LOG_LOCK)

  async function writeDispatchLog(entry: DispatchEntry): Promise<void> {
    await withLock(lockPath, async () => {
      appendLogEntry(projectRoot, entry)
    })
  }

  async function writeExecutionState(
    status: ExecutionStatus,
    params: { dispatchId: string; role: string; task: string; lane?: string; sessionId?: string; worktreePath?: string; error?: string; durationMs?: number },
  ): Promise<void> {
    const timestamp = nowIso()
    await upsertExecutionStateEntry(projectRoot, {
      dispatchId: params.dispatchId,
      role: params.role,
      lane: params.lane,
      task: params.task,
      status,
      backend,
      updatedAt: timestamp,
      sessionId: params.sessionId,
      worktreePath: params.worktreePath,
      ...(status === "queued" ? { startedAt: timestamp } : {}),
      ...(status === "completed" || status === "failed" ? { endedAt: timestamp } : {}),
      ...(params.error !== undefined ? { error: params.error } : {}),
    })
  }

  return {
    async onDispatchStart(params): Promise<DispatchStartResult> {
      const timestamp = nowIso()
      try {
        const entry = makeDispatchEntry("created", { ...params, timestamp })
        await writeDispatchLog(entry)
        await writeExecutionState("queued", params)
        emitCanonical(projectRoot, "dispatch.created", {
          dispatchId: params.dispatchId,
          role: params.role,
          sessionId: params.sessionId,
          status: "created",
          task: params.task,
        })
        return { dispatchId: params.dispatchId, timestamp, logged: true }
      } catch (err) {
        const msg = err instanceof Error ? err.message : String(err)
        process.stderr.write(`[aiplus-dispatch] onDispatchStart failed: ${msg}\n`)
        return { dispatchId: params.dispatchId, timestamp, logged: false }
      }
    },

    async onDispatchComplete(params): Promise<void> {
      try {
        const entry = makeDispatchEntry("completed", {
          ...params,
          durationMs: params.durationMs,
        })
        await writeDispatchLog(entry)
        await writeExecutionState("completed", params)
        emitCanonical(projectRoot, "dispatch.completed", {
          dispatchId: params.dispatchId,
          role: params.role,
          sessionId: params.sessionId,
          status: "completed",
          durationMs: params.durationMs,
        })
      } catch (err) {
        const msg = err instanceof Error ? err.message : String(err)
        process.stderr.write(`[aiplus-dispatch] onDispatchComplete failed: ${msg}\n`)
      }
    },

    async onDispatchFail(params): Promise<void> {
      try {
        const entry = makeDispatchEntry("failed", {
          ...params,
          durationMs: params.durationMs,
          error: params.error,
        })
        await writeDispatchLog(entry)
        await writeExecutionState("failed", params)
        emitCanonical(projectRoot, "dispatch.failed", {
          dispatchId: params.dispatchId,
          role: params.role,
          sessionId: params.sessionId,
          status: "failed",
          durationMs: params.durationMs,
          error: params.error,
        })
      } catch (err) {
        const msg = err instanceof Error ? err.message : String(err)
        process.stderr.write(`[aiplus-dispatch] onDispatchFail failed: ${msg}\n`)
      }
    },
  }
}
