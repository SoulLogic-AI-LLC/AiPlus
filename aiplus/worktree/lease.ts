import * as fs from "node:fs"
import * as path from "node:path"
import { execFileSync } from "node:child_process"
import type { WorktreeLease, LeaseState, FencingResult } from "./types"

const LEASE_FILE = ".aiplus/worktree/leases.json"
const LEASE_TTL_HOURS = 24

type FlockCapableFs = typeof fs & {
  flockSync?: (fd: number, operation: number) => void
}

/** Read all leases from the lease file. Returns empty state if file doesn't exist. */
function readState(projectRoot: string): LeaseState {
  const filePath = path.join(projectRoot, LEASE_FILE)
  if (!fs.existsSync(filePath)) return { leases: [] }
  try {
    const raw = fs.readFileSync(filePath, "utf-8")
    return JSON.parse(raw) as LeaseState
  } catch {
    return { leases: [] }
  }
}

/** Write state to lease file under flock to prevent concurrent corruption. */
function writeState(projectRoot: string, state: LeaseState): void {
  const filePath = path.join(projectRoot, LEASE_FILE)
  const dir = path.dirname(filePath)
  fs.mkdirSync(dir, { recursive: true })

  const fd = fs.openSync(filePath, "w")
  try {
    // flock exclusive lock (macOS/BSD compatible via fcntl)
    const LOCK_EX = 0x2
    ;(fs as FlockCapableFs).flockSync?.(fd, LOCK_EX)
    fs.writeFileSync(fd, JSON.stringify(state, null, 2), "utf-8")
    fs.fsyncSync(fd)
  } finally {
    fs.closeSync(fd)
  }
}

/** Get current HEAD commit SHA for a directory. */
function getBaseCommit(dir: string): string {
  try {
    return execFileSync("git", ["rev-parse", "HEAD"], { cwd: dir, encoding: "utf-8" }).trim()
  } catch {
    return "unknown"
  }
}

/** Check if a lease has expired (24h past expiresAt or no heartbeat). */
function isExpired(lease: WorktreeLease): boolean {
  if (!lease.expiresAt) return false
  const expiry = new Date(lease.expiresAt).getTime()
  const now = Date.now()
  return now - expiry > LEASE_TTL_HOURS * 60 * 60 * 1000
}

/** Fencing check: can this lane acquire a new lease? */
export function fencingCheck(projectRoot: string, lane: string): FencingResult {
  const state = readState(projectRoot)
  // Clean up expired leases first
  const active = state.leases.filter((l) => l.status === "active" && !isExpired(l))
  const conflict = active.find((l) => l.lane === lane)
  if (conflict) {
    return {
      allowed: false,
      blockedBy: conflict,
      reason: `lane ${lane} already has active lease (session ${conflict.sessionId}) on ${conflict.worktreePath}`,
    }
  }
  return { allowed: true }
}

/** Acquire a worktree lease for a session. */
export function acquire(projectRoot: string, sessionId: string, lane: string, worktreePath: string): WorktreeLease {
  const state = readState(projectRoot)
  // Remove expired leases
  state.leases = state.leases.filter((l) => !isExpired(l) || l.status !== "active")

  const lease: WorktreeLease = {
    leaseId: `lease-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
    sessionId,
    worktreePath,
    lane,
    status: "active",
    acquiredAt: new Date().toISOString(),
    expiresAt: new Date(Date.now() + LEASE_TTL_HOURS * 60 * 60 * 1000).toISOString(),
    baseCommit: getBaseCommit(worktreePath),
  }
  state.leases.push(lease)
  writeState(projectRoot, state)
  return lease
}

/** Renew a lease's expiry (heartbeat). No-op if lease not found. */
export function renew(projectRoot: string, leaseId: string): void {
  const state = readState(projectRoot)
  const lease = state.leases.find((l) => l.leaseId === leaseId)
  if (!lease || lease.status !== "active") return
  lease.expiresAt = new Date(Date.now() + LEASE_TTL_HOURS * 60 * 60 * 1000).toISOString()
  writeState(projectRoot, state)
}

/** Release a lease — mark prunable (not removed; GC handles cleanup). */
export function release(projectRoot: string, sessionId: string): void {
  const state = readState(projectRoot)
  const lease = state.leases.find((l) => l.sessionId === sessionId && l.status === "active")
  if (!lease) return
  lease.status = "prunable"
  lease.expiresAt = new Date(Date.now() + LEASE_TTL_HOURS * 60 * 60 * 1000).toISOString()
  writeState(projectRoot, state)
}

/** GC: remove worktrees for leases expired >24h. Called by doctor/lobby startup. */
export function garbageCollect(projectRoot: string): string[] {
  const state = readState(projectRoot)
  const removed: string[] = []
  const now = Date.now()
  const remaining: WorktreeLease[] = []

  for (const lease of state.leases) {
    if (lease.status === "prunable" && lease.expiresAt) {
      const expiry = new Date(lease.expiresAt).getTime()
      if (now - expiry > LEASE_TTL_HOURS * 60 * 60 * 1000) {
        try {
          execFileSync("git", ["worktree", "remove", "--force", lease.worktreePath], {
            cwd: projectRoot,
            stdio: "pipe",
          })
          removed.push(lease.worktreePath)
          continue // don't keep in remaining
        } catch {
          // worktree may already be removed — skip
        }
      }
    }
    remaining.push(lease)
  }

  state.leases = remaining
  writeState(projectRoot, state)
  return removed
}

/** List all active or prunable leases. */
export function list(projectRoot: string): WorktreeLease[] {
  return readState(projectRoot).leases
}
