import { getThresholds, HANDOFF_TOKENS, getCompactProfile } from "./thresholds"
import { CompactProfile } from "./types"
import type { PressureLevel, CompactAction, ActionMatrix, SessionCompactState } from "./types"
import * as fs from "node:fs"
import * as path from "node:path"

// ===== Token usage input =====

interface TokenUsage {
  used: number
  total: number
  model: string
}

// ===== Result type =====

export interface PressureResult {
  level: PressureLevel
  contextUsage: number
  tokenCount: { used: number; total: number }
  model: string
  recommendation: string
  action: CompactAction
  profile: CompactProfile
}

// ===== Action Matrix =====

/**
 * 4×3 action matrix: PressureLevel × CompactProfile → CompactAction.
 *
 * Key design decisions (from 3-AI cross-review):
 *   - RESET_BOUND: soft/hard are SILENT (audit tasks don't compact — /new is cleaner)
 *   - TASK_BOUND:   soft is SILENT (task-end /new suffices), hard reminds /new
 *   - CONTINUOUS:   all levels active (long-running coordination needs pressure gauge)
 *   - EMERGENCY:    NEVER silent for any profile (safety net)
 */
const COMPACT_ACTION_MATRIX: ActionMatrix = {
  silent: {
    RESET_BOUND:  { silent: true,  writeCapsule: false, message: "" },
    CONTINUOUS:   { silent: true,  writeCapsule: false, message: "" },
    TASK_BOUND:   { silent: true,  writeCapsule: false, message: "" },
  },
  soft: {
    RESET_BOUND:  { silent: true,  writeCapsule: false, message: "" },
    CONTINUOUS:   { silent: false, writeCapsule: true,  message: "Context usage elevated — consider compacting soon" },
    TASK_BOUND:   { silent: true,  writeCapsule: false, message: "" },
  },
  hard: {
    RESET_BOUND:  { silent: false, writeCapsule: true,  message: "Context near limit — save findings and /new (do not compact)" },
    CONTINUOUS:   { silent: false, writeCapsule: true,  message: "Context near limit — compact strongly recommended now" },
    TASK_BOUND:   { silent: false, writeCapsule: true,  message: "Context nearing limit — wrap current task and /new" },
  },
  emergency: {
    RESET_BOUND:  { silent: false, writeCapsule: true,  message: "EMERGENCY: persist partial evidence, reopen fresh session" },
    CONTINUOUS:   { silent: false, writeCapsule: true,  message: "EMERGENCY: checkpoint state and compact or controlled /new" },
    TASK_BOUND:   { silent: false, writeCapsule: true,  message: "EMERGENCY: checkpoint current work and /new immediately" },
  },
}

// ===== Compaction generation tracking =====

const COMPACT_STATE_DIR = ".aiplus/compact"

function statePath(projectRoot: string): string {
  return path.join(projectRoot, COMPACT_STATE_DIR, "session-compact-state.json")
}

function readStates(projectRoot: string): Record<string, SessionCompactState> {
  try {
    const p = statePath(projectRoot)
    if (!fs.existsSync(p)) return {}
    return JSON.parse(fs.readFileSync(p, "utf-8")) as Record<string, SessionCompactState>
  } catch {
    return {}
  }
}

function writeStates(projectRoot: string, states: Record<string, SessionCompactState>): void {
  const dir = path.join(projectRoot, COMPACT_STATE_DIR)
  fs.mkdirSync(dir, { recursive: true })
  fs.writeFileSync(statePath(projectRoot), JSON.stringify(states, null, 2), "utf-8")
}

/** Get per-session compact state (generation, last compact time, profile). */
export function getSessionCompactState(projectRoot: string, sessionId: string): SessionCompactState {
  const states = readStates(projectRoot)
  return states[sessionId] ?? { generation: 0, profile: CompactProfile.TASK_BOUND }
}

/** Initialize state for a new session — sets profile, generation=0. */
export function initSessionCompactState(projectRoot: string, sessionId: string, profile: CompactProfile): void {
  const states = readStates(projectRoot)
  if (!states[sessionId]) {
    states[sessionId] = { generation: 0, profile }
    writeStates(projectRoot, states)
  }
}

/** Increment compaction generation after a successful compact. Returns new generation. */
export function bumpCompactionGeneration(projectRoot: string, sessionId: string): number {
  const states = readStates(projectRoot)
  const current = states[sessionId] ?? { generation: 0, profile: CompactProfile.TASK_BOUND }
  const next = { ...current, generation: current.generation + 1, lastCompactedAt: new Date().toISOString() }
  states[sessionId] = next
  writeStates(projectRoot, states)
  return next.generation
}

/** After 3 compactions, force /new — re-injecting checkpoint is safer than recursive compaction. */
export function shouldForceFresh(projectRoot: string, sessionId: string): boolean {
  const state = getSessionCompactState(projectRoot, sessionId)
  return state.generation >= 3
}

// ===== Main pressure check (v2: profile-aware) =====

/** Check context pressure for a session given token usage and role. */
export function checkPressure(
  projectRoot: string,
  sessionId: string,
  usage: TokenUsage,
  role?: string,
): PressureResult {
  const modelId = usage.model
  const { soft, hard, emergency } = getThresholds(modelId)
  const contextUsage = (usage.used + HANDOFF_TOKENS) / usage.total

  // Determine pressure level (unchanged logic)
  let level: PressureLevel = "silent"
  if (contextUsage >= emergency) {
    level = "emergency"
  } else if (contextUsage >= hard) {
    level = "hard"
  } else if (contextUsage >= soft) {
    level = "soft"
  }

  // Look up profile and action
  const profile = role ? getCompactProfile(role) : CompactProfile.TASK_BOUND
  const action = COMPACT_ACTION_MATRIX[level][profile]

  // Initialize state tracking on first call
  initSessionCompactState(projectRoot, sessionId, profile)

  // Build recommendation from action matrix
  let recommendation = action.message
  const state = getSessionCompactState(projectRoot, sessionId)
  if (state.generation >= 2) {
    recommendation += ` [compacted ${state.generation}× — consider /new after 3]`
  }

  return {
    level: action.silent ? "silent" : level,
    contextUsage: Math.round(contextUsage * 10000) / 10000,
    tokenCount: { used: usage.used, total: usage.total },
    model: modelId,
    recommendation,
    action,
    profile,
  }
}
