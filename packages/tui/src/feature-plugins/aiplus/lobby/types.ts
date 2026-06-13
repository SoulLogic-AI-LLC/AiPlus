/** Types matching B0 /aiplus/lobby/status response. */

export interface RoleStatus {
  id: string
  name: string
  pillar: "coordinator" | "verifier" | "expert"
  status: "active" | "idle" | "stale"
  sessionId?: string
  lastActive?: string
}

export interface LaneStatus {
  lane: string
  status: "active" | "idle"
  sessionId?: string
  role?: string
  lastActive?: string
}

export interface LobbyState {
  boundRole: string | null
  boundAt: string | null
  sessionId: string | null
}

export interface LobbyStatusResponse {
  roles: RoleStatus[]
  lanes: LaneStatus[]
  state: LobbyState
}
