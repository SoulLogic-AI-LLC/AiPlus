/**
 * Lobby CLI — Status Command
 *
 * Shows pillar-grouped roles + lane occupation.
 */

import * as path from "node:path"
import { getAllRoleIds, getPillar, getDisplayName } from "../pillars"
import { readDispatchLog, getLatestByRole, getRecentEntries } from "../dispatch"
import { getLaneStatuses } from "../leases"
import { readState } from "../state"
import { formatLobbyStatus } from "../format"
import type { RoleStatus, RoleStatusType } from "../types"

/** Run lobby status command. */
export function statusCommand(projectRoot: string): string {
  const state = readState(projectRoot)
  const dispatchEntries = readDispatchLog(projectRoot)
  const recentEntries = getRecentEntries(dispatchEntries, 24)
  const latestByRole = getLatestByRole(dispatchEntries)

  // Build role statuses
  const allRoles = getAllRoleIds()
  const roles: RoleStatus[] = allRoles.map(roleId => {
    const latest = latestByRole.get(roleId)
    let status: RoleStatusType = "idle"

    if (latest) {
      const isRecent = recentEntries.some(e => e.dispatchId === latest.dispatchId)
      if (isRecent && latest.outcome !== "failed" && latest.outcome !== "canceled") {
        status = "active"
      } else if (!isRecent) {
        status = "stale"
      }
    }

    return {
      id: roleId,
      name: getDisplayName(roleId),
      pillar: getPillar(roleId),
      status,
      sessionId: latest ? latest.dispatchId : undefined,
      lastActive: latest?.timestamp,
    }
  })

  // Get lane statuses
  const lanes = getLaneStatuses(projectRoot)

  return formatLobbyStatus(roles, lanes, state)
}
