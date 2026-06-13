/** Dispatch entry from B0 /aiplus/dispatch/list endpoint. */
export interface DispatchEntry {
  dispatchId: string
  sessionId: string
  role: string
  lane?: string
  tier?: "LIGHT" | "MEDIUM" | "HEAVY"
  outcome?: "success" | "failed" | "canceled"
  timestamp: string
  task?: string
  reversibility?: string
  schemaVersion?: string
}

/** Filter state for dispatch board. */
export interface FilterState {
  role: string | null  // null = all
  lane: string | null  // null = all
  status: string | null  // null = all
}

/** Status display info. */
export type StatusType = "created" | "running" | "completed" | "failed" | "canceled"

/** Get display status from dispatch entry. */
export function getDisplayStatus(entry: DispatchEntry): StatusType {
  if (entry.outcome === "success") return "completed"
  if (entry.outcome === "failed") return "failed"
  if (entry.outcome === "canceled") return "canceled"
  // If no outcome, check if recent (within 5 min) = running, else created
  const age = Date.now() - new Date(entry.timestamp).getTime()
  if (age < 5 * 60 * 1000) return "running"
  return "created"
}

/** Get all unique roles from entries. */
export function getUniqueRoles(entries: DispatchEntry[]): string[] {
  const roles = new Set(entries.map(e => e.role))
  return Array.from(roles).sort()
}
