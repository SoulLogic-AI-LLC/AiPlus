/**
 * Lobby CLI — Bind Command
 *
 * Binds a role to the current session.
 * For CEO role, supports lane assignment (ceo-1, ceo-2, ceo-3).
 */

import { getAllRoleIds, getDisplayName } from "../pillars"
import { readState, bindRole, unbindRole } from "../state"
import { formatBindConfirm, formatUnbindConfirm, formatError } from "../format"
import { parseRoleInput, normalizeLane, type CEOLane } from "../lane"

/** Find the next available CEO lane by reading current lobby state. */
function allocateNextCEOLane(projectRoot: string): CEOLane {
  const state = readState(projectRoot)
  const occupied = new Set<string>()
  if (state.lane) occupied.add(state.lane)

  for (const lane of ["ceo-1", "ceo-2", "ceo-3"] as CEOLane[]) {
    if (!occupied.has(lane)) return lane
  }
  throw new Error("Max 3 CEO lanes reached. Unbind an existing lane first.")
}

/** Run lobby bind command. */
export function bindCommand(projectRoot: string, roleId: string | null): string {
  // Unbind if no role specified
  if (!roleId) {
    const state = readState(projectRoot)
    if (!state.boundRole) {
      return formatError("No role currently bound")
    }
    unbindRole(projectRoot)
    return formatUnbindConfirm()
  }

  // Parse input — may contain lane (e.g. "ceo-2", "lane2")
  const { role: parsedRole, lane: parsedLane } = parseRoleInput(roleId)
  const normalizedId = parsedRole.toLowerCase().replace(/^aiplus-/, "")
  const allRoles = getAllRoleIds()

  if (!allRoles.includes(normalizedId)) {
    return formatError(`Unknown role: ${roleId}\nAvailable roles: ${allRoles.join(", ")}`)
  }

  // For CEO: determine lane
  let lane: CEOLane | null = null
  if (normalizedId === "ceo") {
    if (parsedLane) {
      lane = parsedLane
    } else {
      try {
        lane = allocateNextCEOLane(projectRoot)
      } catch (e) {
        return formatError((e as Error).message)
      }
    }
  }

  // Bind role with lane
  bindRole(projectRoot, normalizedId, lane)
  const displayName = getDisplayName(normalizedId)
  // activeCount: derive from lane number (ceo-1 → 1, ceo-2 → 2, etc.)
  const activeCount = lane ? Number(lane.replace("ceo-", "")) : 1
  return formatBindConfirm(normalizedId, displayName, lane, activeCount)
}
