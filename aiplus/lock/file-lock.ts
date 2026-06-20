import * as fs from "node:fs"
import * as path from "node:path"
import { dlopen, type Library } from "bun:ffi"

export interface FileLock {
  release(): void
}

const LOCK_EX = 2
const LOCK_UN = 8
const LOCK_NB = 4

const STALE_TIMEOUT_MS = 5 * 60 * 1000
const FALLBACK_RETRY_MS = 20
const FALLBACK_MAX_RETRIES = 5000
const FFI_POLL_MS = 10

type FlockLib = Library<{
  flock: { args: ["i32", "i32"]; returns: "i32" }
}>

let ffiLib: FlockLib | undefined
let ffiAvailable: boolean | undefined

function loadFfi(): boolean {
  if (ffiAvailable !== undefined) return ffiAvailable
  if (process.env.AIPLUS_FILE_LOCK_FORCE_FALLBACK === "1") {
    ffiAvailable = false
    return false
  }
  const candidates =
    process.platform === "darwin"
      ? ["/usr/lib/libc.dylib", "/usr/lib/libSystem.dylib"]
      : ["libc.so.6", "/lib/x86_64-linux-gnu/libc.so.6", "/lib64/libc.so.6"]
  for (const path of candidates) {
    try {
      ffiLib = dlopen(path, {
        flock: { args: ["i32", "i32"], returns: "i32" },
      }) as FlockLib
      ffiAvailable = true
      return true
    } catch {
      /* try next */
    }
  }
  ffiAvailable = false
  process.stderr.write("[aiplus-file-lock] FFI flock unavailable; falling back to O_EXCL lockfile\n")
  return false
}

function flockAcquire(fd: number, blocking: boolean): boolean {
  const op = LOCK_EX | (blocking ? 0 : LOCK_NB)
  const result = ffiLib!.symbols.flock(fd, op)
  return result === 0
}

function flockRelease(fd: number): void {
  try {
    ffiLib!.symbols.flock(fd, LOCK_UN)
  } catch {
    /* best effort */
  }
}

function openLockFile(lockPath: string): number {
  const dir = path.dirname(lockPath)
  fs.mkdirSync(dir, { recursive: true })
  return fs.openSync(lockPath, fs.constants.O_RDWR | fs.constants.O_CREAT, 0o644)
}

async function acquireFfiLock(lockPath: string): Promise<FileLock> {
  const fd = openLockFile(lockPath)
  while (!flockAcquire(fd, false)) {
    await Bun.sleep(FFI_POLL_MS)
  }
  let released = false
  return {
    release() {
      if (released) return
      released = true
      flockRelease(fd)
      try {
        fs.closeSync(fd)
      } catch {
        /* fd may already be closed by kernel */
      }
    },
  }
}

interface FallbackLockRecord {
  pid: number
  started_at: string
  hostname: string
}

function isStale(record: FallbackLockRecord): boolean {
  const startedAt = Date.parse(record.started_at)
  if (Number.isNaN(startedAt)) return true
  if (Date.now() - startedAt > STALE_TIMEOUT_MS) return true
  try {
    process.kill(record.pid, 0)
    return false
  } catch {
    return true
  }
}

function writeFallbackLock(lockPath: string): void {
  const record: FallbackLockRecord = {
    pid: process.pid,
    started_at: new Date().toISOString(),
    hostname: process.env.HOSTNAME ?? "localhost",
  }
  fs.writeFileSync(lockPath, JSON.stringify(record), { flag: "wx" })
}

async function acquireFallbackLock(lockPath: string): Promise<FileLock> {
  const dir = path.dirname(lockPath)
  fs.mkdirSync(dir, { recursive: true })
  let retries = 0
  while (true) {
    try {
      writeFallbackLock(lockPath)
      let released = false
      return {
        release() {
          if (released) return
          released = true
          try {
            fs.unlinkSync(lockPath)
          } catch {
            /* lock may have been reclaimed */
          }
        },
      }
    } catch (err) {
      const code = (err as NodeJS.ErrnoException).code
      if (code !== "EEXIST") throw err
      if (retries >= FALLBACK_MAX_RETRIES) {
        throw new Error(`Failed to acquire fallback lock ${lockPath} after ${retries} retries`)
      }
      try {
        const raw = fs.readFileSync(lockPath, "utf-8")
        const record = JSON.parse(raw) as FallbackLockRecord
        if (isStale(record)) {
          fs.unlinkSync(lockPath)
          retries++
          continue
        }
      } catch {
        /* corrupt or missing; try to reclaim */
        try {
          fs.unlinkSync(lockPath)
        } catch {
          /* another process reclaimed it */
        }
        retries++
        continue
      }
      retries++
      await Bun.sleep(FALLBACK_RETRY_MS)
    }
  }
}

/**
 * Acquire an exclusive advisory lock on `lockPath`. Blocks until acquired.
 * The lock is held for the lifetime of the returned FileLock handle.
 * Crash-safe: the kernel auto-releases flock(2) on process death.
 */
export async function acquireExclusiveLock(lockPath: string): Promise<FileLock> {
  if (loadFfi()) return acquireFfiLock(lockPath)
  return acquireFallbackLock(lockPath)
}

/**
 * Run `fn` while holding the exclusive lock, then release.
 */
export async function withLock<T>(lockPath: string, fn: () => Promise<T>): Promise<T> {
  const lock = await acquireExclusiveLock(lockPath)
  try {
    return await fn()
  } finally {
    lock.release()
  }
}
