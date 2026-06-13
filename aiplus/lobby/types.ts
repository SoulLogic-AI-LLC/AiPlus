/**
 * Lobby CLI — Types (V1)
 *
 * Independent CLI lobby for AiPlus Agent Team.
 * Reads .aiplus/ data sources — no OpenCode API calls.
 */

/** Pillar classification. */
export type Pillar = "coordinator" | "verifier" | "expert"

/** Role status in lobby. */
export type RoleStatusType = "active" | "idle" | "stale"

/** Lane status. */
export type LaneStatusType = "active" | "idle"

/** Role status in lobby. */
export interface RoleStatus {
  /** Role ID ("ceo", "advisor", etc.) */
  id: string
  /** Display name ("CEO", "Advisor", etc.) */
  name: string
  /** Pillar classification */
  pillar: Pillar
  /** Current status */
  status: RoleStatusType
  /** Session ID (if active) */
  sessionId?: string
  /** Last active timestamp (ISO 8601) */
  lastActive?: string
}

/** Lane status. */
export interface LaneStatus {
  /** Lane ID ("ceo-1", "ceo-2", "ceo-3") */
  lane: string
  /** Current status */
  status: LaneStatusType
  /** Session ID (if active) */
  sessionId?: string
  /** Role (if active) */
  role?: string
  /** Last active timestamp (ISO 8601) */
  lastActive?: string
}

/** Lobby state (persisted). */
export interface LobbyState {
  /** Currently bound role */
  boundRole: string | null
  /** When bound (ISO 8601) */
  boundAt: string | null
  /** Current session ID */
  sessionId: string | null
}

/** Full lobby status. */
export interface LobbyStatus {
  /** All roles grouped by pillar */
  roles: RoleStatus[]
  /** CEO lane statuses */
  lanes: LaneStatus[]
  /** Current lobby state */
  state: LobbyState
}

/** Dispatch log entry (partial). */
export interface DispatchEntry {
  dispatchId: string
  role: string
  lane?: string | null
  outcome?: string
  timestamp: string
  schemaVersion?: string
  [key: string]: unknown
}

/** Worktree lease entry. */
export interface LeaseEntry {
  leaseId: string
  sessionId: string
  lane: string
  status: string
  acquiredAt: string
  expiresAt: string
}
