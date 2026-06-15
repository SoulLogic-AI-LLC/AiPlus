/**
 * Lobby CLI — Lane Normalization
 *
 * Ported from crates/aiplus-cli/src/agent/lane.rs
 * Standardizes CEO lane identifiers and provides branch/worktree naming.
 */

/** Supported lane identifiers. */
export type CEOLane = "ceo-1" | "ceo-2" | "ceo-3"

const LANE_ALIASES: Record<string, CEOLane> = {
  "ceo-1": "ceo-1",
  "lane1": "ceo-1",
  "lane-1": "ceo-1",
  "ceo-2": "ceo-2",
  "lane2": "ceo-2",
  "lane-2": "ceo-2",
  "ceo-3": "ceo-3",
  "lane3": "ceo-3",
  "lane-3": "ceo-3",
}

const LANE_TO_TOKEN: Record<CEOLane, string> = {
  "ceo-1": "lane1",
  "ceo-2": "lane2",
  "ceo-3": "lane3",
}

const TOKEN_TO_LANE: Record<string, CEOLane> = {
  "lane1": "ceo-1",
  "lane2": "ceo-2",
  "lane3": "ceo-3",
}

/** Normalize a lane input string to a canonical CEOLane. */
export function normalizeLane(input: string): CEOLane {
  const raw = input.trim().toLowerCase()
  const lane = LANE_ALIASES[raw]
  if (lane) return lane
  throw new Error(
    raw === ""
      ? "--lane requires ceo-1, ceo-2, ceo-3, lane1, lane2, or lane3"
      : `unsupported lane \`${raw}\`; supported lanes: ceo-1, ceo-2, ceo-3`,
  )
}

/** Convert a CEOLane to its short token form ("lane1", "lane2", "lane3"). */
export function laneToken(lane: CEOLane): string {
  return LANE_TO_TOKEN[lane]
}

/** Reverse: token → lane. */
export function laneFromToken(token: string): CEOLane | undefined {
  return TOKEN_TO_LANE[token]
}

/** Build a role instance identifier (e.g. "engineer-a@ceo-1"). */
export function roleInstance(role: string, lane?: CEOLane | null): string {
  return lane ? `${role}@${lane}` : role
}

/** Build a lane-scoped branch name (e.g. "agent/lane1/engineer-a"). */
export function branchForRole(role: string, lane?: CEOLane | null): string {
  return lane ? `agent/${laneToken(lane)}/${role}` : `agent/${role}`
}

/** Build a worktree role token (e.g. "engineer-a.lane1"). */
export function worktreeRoleToken(role: string, lane?: CEOLane | null): string {
  return lane ? `${role}.${laneToken(lane)}` : role
}

/** Parse a lane-scoped branch back to { lane, role }. */
export function parseLaneBranch(branch: string): { lane: CEOLane; role: string } | null {
  const stripped = branch.replace(/^refs\/heads\//, "").replace(/^agent\//, "")
  const [token, role] = stripped.split("/")
  if (!token || !role) return null
  const lane = laneFromToken(token)
  if (!lane) return null
  return { lane, role }
}

/**
 * Display name for a CEO lane.
 * When activeCount === 1, "ceo-1" shows as "CEO" (no suffix).
 * When activeCount > 1, "ceo-1" shows as "CEO 1".
 * "ceo-2" always shows as "CEO 2", etc.
 */
export function laneDisplayName(role: string, lane?: CEOLane | null, activeCount = 1): string {
  if (role === "ceo") {
    if (!lane) return "CEO"
    const num = Number(lane.replace("ceo-", ""))
    if (num === 1 && activeCount <= 1) return "CEO"
    return `CEO ${num}`
  }
  return role
}

/** Parse input like "ceo-2" or "lane2" into { role: "ceo", lane }. */
export function parseRoleInput(input: string): { role: string; lane?: CEOLane } {
  const normalized = input.trim().toLowerCase()
  if (normalized === "ceo") return { role: "ceo" }
  if (normalized.startsWith("ceo-") || normalized.startsWith("lane")) {
    try {
      return { role: "ceo", lane: normalizeLane(normalized) }
    } catch {
      // fall through
    }
  }
  return { role: normalized }
}
