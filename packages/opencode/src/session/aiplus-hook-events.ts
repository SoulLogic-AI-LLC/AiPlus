/**
 * AiPlus Hook Events — RPC payload types
 *
 * Shared between TUI worker (sender) and main process (receiver).
 * NO node:fs imports — pure type definitions only.
 */

/** Session created event. */
export interface AiplusSessionCreated {
  type: "session.created"
  sessionId: string
  agent: string | undefined
  worktree: string
}

/** Session deleted event. */
export interface AiplusSessionDeleted {
  type: "session.deleted"
  sessionId: string
  agent: string | undefined
  title: string | undefined
  createdAt: number
  worktree: string
}

/** Subagent task completed event. */
export interface AiplusTaskCompleted {
  type: "task.completed"
  sessionId: string
  role: string
  task: string
  outcome: "success" | "failed" | "canceled"
  modelId?: string
  tokensUsed?: number
  tokensTotal?: number
  worktree: string
}

/** All AiPlus hook event payloads. */
export type AiplusHookEvent =
  | AiplusSessionCreated
  | AiplusSessionDeleted
  | AiplusTaskCompleted
