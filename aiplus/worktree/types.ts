/** Worktree lease — binds a session to a git worktree with mutual exclusion. */
export interface WorktreeLease {
  leaseId: string
  sessionId: string
  worktreePath: string
  lane: string // "ceo-1" | "ceo-2" | "ceo-3" | "default"
  status: "active" | "prunable" | "released"
  acquiredAt: string // ISO 8601
  expiresAt?: string // ISO 8601, released after 24h inactivity
  baseCommit: string // git rev-parse HEAD at acquire time
}

/** In-memory lease state snapshot, read from leases.json. */
export interface LeaseState {
  leases: WorktreeLease[]
}

/** Result of a fencing check before acquiring a new lease. */
export interface FencingResult {
  allowed: boolean
  blockedBy?: WorktreeLease
  reason?: string
}
