/** AiPlus dispatch log entry — compatible with AiPlus-Source JSONL format. */
export interface DispatchEntry {
  dispatchId: string
  role: string
  task: string
  status: "created" | "running" | "completed" | "failed"
  sessionId: string
  worktreePath: string
  timestamp: string // ISO 8601
  durationMs?: number
  error?: string
}
