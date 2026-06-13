/**
 * Lobby CLI — Bind Command
 *
 * Binds a role to the current session.
 */

import { getAllRoleIds, getDisplayName } from "../pillars"
import { readState, bindRole, unbindRole } from "../state"
import { formatBindConfirm, formatUnbindConfirm, formatError } from "../format"

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

  // Validate role ID
  const normalizedId = roleId.toLowerCase().replace(/^aiplus-/, "")
  const allRoles = getAllRoleIds()

  if (!allRoles.includes(normalizedId)) {
    return formatError(`Unknown role: ${roleId}\nAvailable roles: ${allRoles.join(", ")}`)
  }

  // Bind role
  bindRole(projectRoot, normalizedId)
  const displayName = getDisplayName(normalizedId)
  return formatBindConfirm(normalizedId, displayName)
}
