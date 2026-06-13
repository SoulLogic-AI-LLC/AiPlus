/**
 * AiPlus Hook Handler — Main Process Side
 *
 * Receives RPC events from TUI worker and executes hooks
 * with full node:fs access. Runs in main process only.
 */

import type { AiplusHookEvent } from "../../session/aiplus-hook-events"

/** Handle an AiPlus hook event from the TUI worker. */
export function handleAiplusHookEvent(event: AiplusHookEvent): void {
  switch (event.type) {
    case "session.created":
      handleSessionCreated(event)
      break
    case "session.deleted":
      handleSessionDeleted(event)
      break
    case "task.completed":
      handleTaskCompleted(event)
      break
  }
}

function handleSessionCreated(event: Extract<AiplusHookEvent, { type: "session.created" }>) {
  const { append } = require("../../../../../aiplus/dispatch/writer") as typeof import("../../../../../aiplus/dispatch/writer")
  const { acquire } = require("../../../../../aiplus/worktree/lease") as typeof import("../../../../../aiplus/worktree/lease")

  const role = (event.agent ?? "unknown").replace(/^aiplus-/, "").toLowerCase()
  const lane = detectLane()

  try {
    append(event.worktree, {
      dispatchId: `dispatch-${event.sessionId}`,
      role,
      task: event.agent ? `[${event.agent}] session created` : "(session-create)",
      status: "created",
      sessionId: event.sessionId,
      worktreePath: event.worktree,
    })
  } catch { /* fire-and-forget */ }

  try {
    acquire(event.worktree, event.sessionId, lane, event.worktree)
  } catch { /* fire-and-forget */ }
}

function handleSessionDeleted(event: Extract<AiplusHookEvent, { type: "session.deleted" }>) {
  const { appendMemoryEntry } = require("../../../../../aiplus/memory/append") as typeof import("../../../../../aiplus/memory/append")
  const { verify } = require("../../../../../aiplus/audit/runner") as typeof import("../../../../../aiplus/audit/runner")

  const role = (event.agent ?? "unknown").replace(/^aiplus-/, "").toLowerCase()

  try {
    appendMemoryEntry({
      projectRoot: event.worktree,
      sessionId: event.sessionId,
      role,
      startedAt: new Date(event.createdAt).toISOString(),
      endedAt: new Date().toISOString(),
      task: event.title ?? "(session-delete)",
      outcome: "success",
    })
  } catch { /* fire-and-forget */ }

  try {
    verify(event.worktree, event.sessionId)
  } catch { /* fire-and-forget */ }
}

function handleTaskCompleted(event: Extract<AiplusHookEvent, { type: "task.completed" }>) {
  // Fix C: memory write
  try {
    const { appendMemoryEntry } = require("../../../../../aiplus/memory/append") as typeof import("../../../../../aiplus/memory/append")
    appendMemoryEntry({
      projectRoot: event.worktree,
      sessionId: event.sessionId,
      role: event.role,
      startedAt: new Date(Date.now() - 60_000).toISOString(),
      endedAt: new Date().toISOString(),
      task: event.task,
      outcome: event.outcome,
    })
  } catch { /* fire-and-forget */ }

  // Fix D: audit verify
  try {
    const { verify } = require("../../../../../aiplus/audit/runner") as typeof import("../../../../../aiplus/audit/runner")
    verify(event.worktree, event.sessionId)
  } catch { /* fire-and-forget */ }

  // Fix E: compact pressure with actual tokens
  if (event.modelId && event.tokensUsed && event.tokensTotal) {
    try {
      const { checkPressure } = require("../../../../../aiplus/compact/monitor") as typeof import("../../../../../aiplus/compact/monitor")
      const { writeCapsule } = require("../../../../../aiplus/compact/capsule") as typeof import("../../../../../aiplus/compact/capsule")
      const pressure = checkPressure({
        used: event.tokensUsed,
        total: event.tokensTotal,
        model: event.modelId,
      })
      if (!pressure.action.silent) {
        writeCapsule(event.worktree, pressure)
      }
    } catch { /* fire-and-forget */ }
  }
}

/** Detect CEO lane from environment (main process side). */
function detectLane(): string {
  const envLane = process.env.AIPLUS_CEO_LANE
  if (envLane && /^(ceo-[123]|default)$/.test(envLane)) {
    return envLane
  }
  return "default"
}
