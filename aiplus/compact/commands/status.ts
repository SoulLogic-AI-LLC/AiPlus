/**
 * Compact CLI — Status Command
 *
 * Show compact state for all sessions or a specific session.
 */

import * as fs from "node:fs"
import * as path from "node:path"
import { getSessionCompactState } from "../monitor"
import { readCapsule } from "../capsule"
import { formatCompactStatus } from "../format"
import type { SessionCompactState } from "../types"

/** Run compact status command. */
export function statusCommand(projectRoot: string, sessionId?: string): string {
  // Read all session states
  const statePath = path.join(projectRoot, ".aiplus", "compact", "session-compact-state.json")
  let states: Record<string, SessionCompactState> = {}
  try {
    if (fs.existsSync(statePath)) {
      states = JSON.parse(fs.readFileSync(statePath, "utf-8"))
    }
  } catch { /* empty */ }

  // Filter to specific session if given
  if (sessionId) {
    const state = states[sessionId]
    if (!state) return `No compact state for session: ${sessionId}`
    const capsule = readCapsule(projectRoot)
    return formatCompactStatus({ [sessionId]: state }, capsule)
  }

  const capsule = readCapsule(projectRoot)
  return formatCompactStatus(states, capsule)
}
