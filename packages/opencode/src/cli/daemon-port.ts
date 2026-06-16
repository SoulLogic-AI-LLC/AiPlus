import { Global } from "@opencode-ai/core/global"
import { ServerAuth } from "@/server/auth"
import { Effect, Option, Schema } from "effect"
import { randomUUID } from "crypto"
import { spawn, type ChildProcess } from "node:child_process"
import fs from "fs/promises"
import fsSync from "fs"
import path from "path"

export const DaemonPortFile = "daemon.port"

const DaemonPortSchema = Schema.Struct({
  port: Schema.Int,
  pid: Schema.Int,
  startedAt: Schema.Number,
})
export type DaemonPort = typeof DaemonPortSchema.Type

const decodeDaemonPort = Schema.decodeUnknownOption(DaemonPortSchema)

function portFilePath() {
  return path.join(Global.Path.data, DaemonPortFile)
}

/**
 * Atomically writes `{ port, pid, startedAt }` to `Global.Path.data/daemon.port`.
 *
 * Mirrors the `<file>.<randomUUID()>.tmp` + rename pattern from
 * `packages/cli/src/services/daemon.ts:166-173` so concurrent readers never
 * observe a partially-written JSON document.
 *
 * Mode `0o600` keeps the port file readable only by the owning user (matches
 * `cli/daemon.ts:53` precedent for the password file).
 */
export const writeDaemonPort = Effect.fn("Cli.daemon-port.write")(function* (port: number) {
  const file = portFilePath()
  const temp = file + "." + randomUUID() + ".tmp"
  yield* Effect.promise(() => fs.mkdir(Global.Path.data, { recursive: true }))
  yield* Effect.promise(() => fs.writeFile(temp, JSON.stringify({ port, pid: process.pid, startedAt: Date.now() }), { mode: 0o600 }))
  yield* Effect.promise(() => fs.rename(temp, file))
})

/**
 * Reads `daemon.port` and returns `Option.some(DaemonPort)` on success or
 * `Option.none()` if the file is missing or unparseable.
 *
 * Strictly reads `daemon.port` — never touches sibling `daemon.port.<uuid>.tmp`
 * files (those are in-flight atomic writes and must not be observed as truth).
 *
 * NOTE: may return stale data after a daemon crash. Callers MUST validate via
 * `isDaemonAlive` before consuming the result. Stale entries are deleted by
 * the caller (see B0-B7 / E1).
 */
export const readDaemonPort = Effect.fn("Cli.daemon-port.read")(function* () {
  const raw = yield* Effect.promise(async () => {
    try {
      return await fs.readFile(portFilePath(), "utf8")
    } catch (err) {
      if ((err as NodeJS.ErrnoException).code === "ENOENT") return undefined
      throw err
    }
  })
  if (raw === undefined) return Option.none<DaemonPort>()
  let parsed: unknown
  try {
    parsed = JSON.parse(raw)
  } catch {
    return Option.none<DaemonPort>()
  }
  return decodeDaemonPort(parsed)
})

/**
 * Removes the daemon port file. Swallows `ENOENT` so repeated calls (e.g. from
 * a SIGTERM handler that fires after a manual `clearDaemonPort`) are no-ops.
 */
export const clearDaemonPort = Effect.fn("Cli.daemon-port.clear")(function* () {
  yield* Effect.promise(async () => {
    try {
      await fs.unlink(portFilePath())
    } catch (err) {
      if ((err as NodeJS.ErrnoException).code !== "ENOENT") throw err
    }
  })
})

/**
 * Probes the daemon by hitting `/global/health` with a 2-second timeout. The
 * route lives at `server/routes/instance/httpapi/groups/global.ts:68`
 * (returned by `HttpApiBuilder.group(...)`); the spec's `/api/health` does
 * not exist.
 *
 * The `ServerAuth.header()` value is attached when present so the probe
 * succeeds against password-gated deployments. When no password is configured
 * the header is `undefined` and the request is sent unauthenticated — matching
 * the `ServerAuth.required(config) === false` short-circuit in the auth
 * middleware (`server/routes/instance/httpapi/middleware/authorization.ts:46`).
 *
 * On any error — connection refused, non-2xx response, timeout — returns
 * `false`. The caller is responsible for deleting the stale port file when
 * this returns false (see B0-B7).
 */
export const isDaemonAlive = Effect.fn("Cli.daemon-port.isAlive")(function* (
  info: DaemonPort,
) {
  const controller = new AbortController()
  const timer = setTimeout(() => controller.abort(), 2_000)
  const auth = ServerAuth.header()
  const headers: Record<string, string> = {}
  if (auth) headers["Authorization"] = auth
  try {
    const response = yield* Effect.promise(async (): Promise<Response | undefined> => {
      try {
        return await fetch(`http://127.0.0.1:${info.port}/global/health`, {
          signal: controller.signal,
          headers,
        })
      } catch {
        return undefined
      }
    })
    return response?.ok === true
  } finally {
    clearTimeout(timer)
  }
})

/**
 * Ensures a daemon is running and returns either the URL of an existing alive
 * daemon or the spawned child process. Prevents duplicate daemon spawns by
 * checking the port file and probing health before starting a new process.
 *
 * Spawns the daemon as a detached process whose stdio is drained to
 * `Global.Path.log/daemon.log`. This prevents the pipe-buffer deadlock that
 * happens when a child process with `stdio: "inherit"` (or a fully-buffered
 * pipe) outlives its parent without a consumer on the other end (B0-B2 / E5).
 *
 * Uses raw file descriptors (via `fs.openSync(..., "a")`) rather than a
 * `fs.WriteStream` because Bun's `child_process.spawn` does not yet support
 * stream-typed stdio values (`TODO: stream.Readable stdio @ 1`). On Node the
 * two forms are equivalent; the FD is the lowest common denominator.
 *
 * Mirrors the `process.execPath + process.argv[1]` binary-compat pattern from
 * `packages/cli/src/services/daemon.ts:113-117`: when running under `bun run`,
 * `process.execPath` is the `bun` binary and `process.argv[1]` is the script
 * entrypoint; when running a compiled binary, only `process.execPath` is used.
 *
 * The caller is expected to `proc.unref()` if it does not need the parent to
 * wait for the daemon (we already call it here so the daemon is fully
 * detached from the TUI's lifetime in Phase 1 — see B3 contract).
 *
 * NOTE: B0's sequencing nit suggested splitting this into a `daemon-spawn.ts`
 * file. We keep it colocated in `daemon-port.ts` because it is small (~25 LoC),
 * tightly coupled to the daemon-port file location, and there is no other
 * consumer in B1. Promote to its own file only if a third caller appears.
 */
export const spawnDaemonProcess = Effect.fn("Cli.daemon-port.spawn")(function* () {
  const portOpt = yield* readDaemonPort()
  if (Option.isSome(portOpt)) {
    const alive = yield* isDaemonAlive(portOpt.value)
    if (alive) {
      return { type: "existing" as const, url: `http://127.0.0.1:${portOpt.value.port}` }
    }
    yield* clearDaemonPort()
  }

  const logDir = Global.Path.log
  fsSync.mkdirSync(logDir, { recursive: true })
  const logPath = path.join(logDir, "daemon.log")
  const logFd = fsSync.openSync(logPath, "a")
  const compiled = path.basename(process.execPath).replace(/\.exe$/, "") !== "bun"
  const entrypoint = compiled ? undefined : process.argv[1]
  const args = [...(entrypoint ? [entrypoint] : []), "daemon"]
  const proc = spawn(process.execPath, args, {
    detached: true,
    stdio: ["ignore", logFd, logFd],
  })
  proc.unref()
  fsSync.closeSync(logFd)
  return { type: "spawned" as const, proc }
})

export * as DaemonPort from "./daemon-port"
