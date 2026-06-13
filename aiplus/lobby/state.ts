/**
 * Lobby CLI — State Management
 *
 * Reads/writes lobby-state.json for role binding persistence.
 */

import * as fs from "node:fs"
import * as path from "node:path"
import type { LobbyState } from "./types"

const STATE_PATH = ".aiplus/lobby/lobby-state.json"

const DEFAULT_STATE: LobbyState = {
  boundRole: null,
  boundAt: null,
  sessionId: null,
}

/** Read lobby state from disk. */
export function readState(projectRoot: string): LobbyState {
  const statePath = path.join(projectRoot, STATE_PATH)
  if (!fs.existsSync(statePath)) return { ...DEFAULT_STATE }

  try {
    const content = fs.readFileSync(statePath, "utf-8")
    const data = JSON.parse(content)
    return {
      boundRole: data.boundRole ?? null,
      boundAt: data.boundAt ?? null,
      sessionId: data.sessionId ?? null,
    }
  } catch {
    return { ...DEFAULT_STATE }
  }
}

/** Write lobby state to disk. */
export function writeState(projectRoot: string, state: LobbyState): void {
  const statePath = path.join(projectRoot, STATE_PATH)
  const dir = path.dirname(statePath)
  fs.mkdirSync(dir, { recursive: true })
  fs.writeFileSync(statePath, JSON.stringify(state, null, 2), "utf-8")
}

/** Bind a role. */
export function bindRole(projectRoot: string, roleId: string): LobbyState {
  const state: LobbyState = {
    boundRole: roleId,
    boundAt: new Date().toISOString(),
    sessionId: null,
  }
  writeState(projectRoot, state)
  return state
}

/** Unbind current role. */
export function unbindRole(projectRoot: string): LobbyState {
  const state: LobbyState = { ...DEFAULT_STATE }
  writeState(projectRoot, state)
  return state
}
