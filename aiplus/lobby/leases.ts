/**
 * Lobby CLI — Worktree Leases Parser
 *
 * Reads worktree/leases.json to find lane occupation.
 * Gracefully degrades if file doesn't exist.
 */

import * as fs from "node:fs"
import * as path from "node:path"
import type { LeaseEntry, LaneStatus } from "./types"

const LEASES_PATH = ".aiplus/worktree/leases.json"

/** Read leases.json and return all entries. */
export function readLeases(projectRoot: string): LeaseEntry[] {
  const leasePath = path.join(projectRoot, LEASES_PATH)
  if (!fs.existsSync(leasePath)) return []

  try {
    const content = fs.readFileSync(leasePath, "utf-8")
    const data = JSON.parse(content)
    return (data.leases ?? []).filter((l: LeaseEntry) => l.leaseId && l.lane && l.status)
  } catch {
    return []
  }
}

/** Get lane statuses for CEO lanes (ceo-1, ceo-2, ceo-3). */
export function getLaneStatuses(projectRoot: string): LaneStatus[] {
  const leases = readLeases(projectRoot)
  const lanes: LaneStatus[] = ["ceo-1", "ceo-2", "ceo-3"].map(lane => ({
    lane,
    status: "idle" as const,
  }))

  const now = Date.now()
  const STALE_MS = 24 * 60 * 60 * 1000 // 24h

  for (const lease of leases) {
    const lane = lanes.find(l => l.lane === lease.lane)
    if (!lane) continue

    // Ignore orphaned leases: the session was never created because the prompt
    // delivery failed mid-flight. These leases have sessionId "pending-*" — no
    // real OpenCode session exists. After a 10s grace period (to avoid racing
    // with an in-progress lease acquisition), we consider them orphaned.
    if (lease.sessionId.startsWith("pending-")) {
      const ORPHAN_GRACE_MS = 10_000 // 10s — enough for TUI round-trip
      const acquiredAt = new Date(lease.acquiredAt).getTime()
      if (now - acquiredAt > ORPHAN_GRACE_MS) continue
    }

    // Check if lease is expired
    const expiresAt = new Date(lease.expiresAt).getTime()
    if (expiresAt < now) continue

    // Check if lease is stale (>24h old)
    const acquiredAt = new Date(lease.acquiredAt).getTime()
    if (now - acquiredAt > STALE_MS) continue

    lane.status = "active"
    lane.sessionId = lease.sessionId
    lane.role = lease.lane
    lane.lastActive = lease.acquiredAt
  }

  return lanes
}
