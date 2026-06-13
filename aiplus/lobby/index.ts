/**
 * Lobby CLI — Module Index
 *
 * Independent CLI lobby for AiPlus Agent Team.
 * Reads .aiplus/ data sources — no OpenCode API calls.
 */

export { statusCommand } from "./commands/status"
export { bindCommand } from "./commands/bind"
export { resumeCommand } from "./commands/resume"
export { readState, writeState, bindRole, unbindRole } from "./state"
export { readDispatchLog, getLatestByRole, getRecentEntries } from "./dispatch"
export { readLeases, getLaneStatuses } from "./leases"
export { getPillar, getDisplayName, getRolesByPillar, getAllRoleIds } from "./pillars"
export { formatLobbyStatus, formatBindConfirm, formatUnbindConfirm, formatResumeInfo, formatError } from "./format"
export type {
  Pillar,
  RoleStatus,
  RoleStatusType,
  LaneStatus,
  LaneStatusType,
  LobbyState,
  LobbyStatus,
  DispatchEntry,
  LeaseEntry,
} from "./types"
