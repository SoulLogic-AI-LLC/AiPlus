/**
 * File locking module for the AiPlus task ledger.
 *
 * **Option C (primary):** `flock(2)` via `bun:ffi`
 *   - Blocks until lock acquired
 *   - Auto-released on process death (kernel closes fd)
 *   - crash-safe, no staleness detection needed
 *
 * **Option A (fallback):** O_EXCL lockfile with pid staleness detection
 *   - Creates lockfile atomically
 *   - On crash, stale lock detection via pid check + age timeout
 *   - Weaker than flock but unblocks development
 *
 * Matches §1 of the Phase 0 design contract.
 */

import * as fs from "node:fs"
import * as os from "node:os"
import type { TaskLockFallbackRecord } from "./types"

// ── Constants ─────────────────────────────────────────────────────────

/** Seconds: when pid-based lock is considered stale (Option A fallback) */
const LOCK_STALE_SECONDS = 300 // 5 minutes

/** File descriptor used by flock-based lock */
let flockFd: number | null = null

// ── FileLock interface ────────────────────────────────────────────────

export interface FileLock {
  /** Release the lock. Idempotent. Safe to call after process fork. */
  release(): void
}

// ── Option C: flock(2) FFI ────────────────────────────────────────────

/**
 * Attempt to load the flock FFI binding.
 * Returns the flock function if successful, null if not.
 */
function loadFlockFFI(): ((fd: number, operation: number) => number) | null {
  try {
    // LOCK_EX = 2, LOCK_UN = 8 on macOS/Linux
    const LOCK_EX = 2
    const LOCK_UN = 8

    const lib = process.platform === "darwin" ? "libSystem.dylib" : "libc.so.6"

    const { symbols } = require("bun:ffi")
    const flock = symbols(lib, {
      flock: {
        args: ["int", "int"],
        returns: "int",
      },
    }).flock

    return flock
  } catch {
    return null
  }
}

/**
 * Acquire an exclusive lock using flock(2) via bun:ffi.
 */
async function acquireFlock(lockPath: string): Promise<FileLock> {
  // Ensure directory exists
  const dir = lockPath.substring(0, lockPath.lastIndexOf("/"))
  fs.mkdirSync(dir, { recursive: true })

  // Open the lock file
  const fd = fs.openSync(lockPath, fs.constants.O_RDWR | fs.constants.O_CREAT, 0o644)

  const flockFn = loadFlockFFI()
  if (!flockFn) {
    fs.closeSync(fd)
    throw new Error("flock FFI not available")
  }

  const LOCK_EX = 2

  // Block until lock acquired
  const result = flockFn(fd, LOCK_EX)
  if (result !== 0) {
    fs.closeSync(fd)
    throw new Error(`flock(LOCK_EX) failed with code ${result}`)
  }

  return {
    release() {
      try {
        const LOCK_UN = 8
        flockFn(fd, LOCK_UN)
      } catch {
        /* best effort */
      }
      try {
        fs.closeSync(fd)
      } catch {
        /* fd may already be closed */
      }
    },
  }
}

// ── Option A: O_EXCL lockfile with pid staleness ──────────────────────

/**
 * Check if a process with the given pid is still running.
 * Uses `kill -0 <pid>` on Unix.
 */
function processIsRunning(pid: number): boolean {
  try {
    process.kill(pid, 0)
    return true
  } catch {
    return false
  }
}

/**
 * Check if a fallback lockfile is stale.
 * Stale if: pid is dead OR lock is older than LOCK_STALE_SECONDS.
 */
function isFallbackLockStale(lockPath: string): boolean {
  if (!fs.existsSync(lockPath)) return false

  try {
    const content = fs.readFileSync(lockPath, "utf-8")
    const record: TaskLockFallbackRecord = JSON.parse(content)

    // Check pid alive
    if (!processIsRunning(record.pid)) return true

    // Check age
    const startedAt = new Date(record.started_at).getTime()
    const now = Date.now()
    if (now - startedAt > LOCK_STALE_SECONDS * 1000) return true

    return false
  } catch {
    // Corrupt lockfile → treat as stale
    return true
  }
}

/**
 * Acquire exclusive lock via O_EXCL lockfile (Option A fallback).
 * Uses busy-wait with exponential backoff.
 */
async function acquireOExcl(lockPath: string): Promise<FileLock> {
  const dir = lockPath.substring(0, lockPath.lastIndexOf("/"))
  fs.mkdirSync(dir, { recursive: true })

  let acquired = false
  let waitMs = 10

  while (!acquired) {
    // Check staleness first
    if (isFallbackLockStale(lockPath)) {
      try {
        fs.unlinkSync(lockPath)
      } catch {
        /* may have been reclaimed already */
      }
    }

    try {
      const record: TaskLockFallbackRecord = {
        pid: process.pid,
        started_at: new Date().toISOString().replace(/\.\d{3}/, ""),
        hostname: os.hostname(),
      }
      // O_EXCL + O_CREAT: atomic create, fails if exists
      const fd = fs.openSync(lockPath, fs.constants.O_WRONLY | fs.constants.O_CREAT | fs.constants.O_EXCL, 0o644)
      fs.writeFileSync(fd, JSON.stringify(record), "utf-8")
      fs.closeSync(fd)
      acquired = true

      return {
        release() {
          try {
            if (fs.existsSync(lockPath)) {
              const content = fs.readFileSync(lockPath, "utf-8")
              const record2: TaskLockFallbackRecord = JSON.parse(content)
              if (record2.pid === process.pid) {
                fs.unlinkSync(lockPath)
              }
            }
          } catch {
            /* best effort */
          }
        },
      }
    } catch (err: any) {
      if (err.code === "EEXIST") {
        // Already locked — wait and retry
        await sleep(waitMs)
        waitMs = Math.min(waitMs * 2, 1000)
        continue
      }
      throw err
    }
  }

  throw new Error("unreachable — failed to acquire O_EXCL lock")
}

// ── Public API ────────────────────────────────────────────────────────

/**
 * Acquire an exclusive advisory lock on `lockPath`.
 * Blocks until acquired.
 *
 * Tries Option C (flock) first. Falls back to Option A (O_EXCL + pid).
 * Crash-safe: flock auto-releases on process death.
 *
 * Matches fs2::FileExt::lock_exclusive() semantics.
 */
export async function acquireExclusiveLock(lockPath: string): Promise<FileLock> {
  try {
    return await acquireFlock(lockPath)
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err)
    process.stderr.write(`[aiplus-task] flock unavailable (${msg}), falling back to O_EXCL lockfile\n`)
    return await acquireOExcl(lockPath)
  }
}

/**
 * Convenience: run `fn` while holding the exclusive lock, then release.
 *
 * Matches source's `with_store_lock(root, |store| { ... })` pattern.
 */
export async function withLock<T>(lockPath: string, fn: () => Promise<T>): Promise<T> {
  const lock = await acquireExclusiveLock(lockPath)
  try {
    return await fn()
  } finally {
    lock.release()
  }
}

// ── Helpers ───────────────────────────────────────────────────────────

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms))
}
