import { Global } from "@opencode-ai/core/global"
import { DaemonAuth } from "@/cli/daemon-auth"
import { Effect, Option, Schema } from "effect"
import { randomUUID } from "crypto"
import { spawn, spawnSync } from "node:child_process"
import fs from "fs/promises"
import fsSync from "fs"
import os from "os"
import path from "path"

export const DaemonPortFile = "daemon.port"
export const DefaultDaemonPort = 37367

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

export function daemonPort() {
  const value = Number(process.env.OPENCODE_DAEMON_PORT ?? DefaultDaemonPort)
  return Number.isInteger(value) && value > 0 ? value : DefaultDaemonPort
}

export function daemonSpawnCommand(execPath = process.execPath, argv1 = process.argv[1]) {
  const compiled = path.basename(execPath).replace(/\.exe$/, "") !== "bun"
  return {
    execPath:
      compiled && fsSync.existsSync(path.join(path.dirname(execPath), "aiplus-daemon"))
        ? path.join(path.dirname(execPath), "aiplus-daemon")
        : execPath,
    args: [...(!compiled && argv1 ? [argv1] : []), "daemon"],
  }
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

export type DaemonAliveStatus = "alive" | "dead" | "unauthorized"

export const probeDaemonPort = Effect.fn("Cli.daemon-port.probe")(function* (port: number) {
  const controller = new AbortController()
  const timer = setTimeout(() => controller.abort(), 2_000)
  const auth = yield* DaemonAuth.readHeader()
  const headers: Record<string, string> = {}
  if (auth) headers.Authorization = auth
  try {
    const response = yield* Effect.promise(async (): Promise<Response | undefined> => {
      try {
        return await fetch(`http://127.0.0.1:${port}/global/health`, {
          signal: controller.signal,
          headers,
        })
      } catch {
        return undefined
      }
    })
    if (response === undefined) return "dead"
    if (response.status === 401) return "unauthorized"
    return response.ok ? "alive" : "dead"
  } finally {
    clearTimeout(timer)
  }
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
 * Returns `"alive"` for a healthy 2xx response, `"unauthorized"` for a 401
 * response (caller must NOT delete the port file), and `"dead"` for any
 * connection error, timeout, or other non-2xx response.
 */
export const isDaemonAlive = Effect.fn("Cli.daemon-port.isAlive")(function* (
  info: DaemonPort,
) {
  return yield* probeDaemonPort(info.port)
})

export class DaemonAuthError extends Schema.TaggedErrorClass<DaemonAuthError>()("CliDaemonAuthError", {
  port: Schema.Int,
}) {}

export class DaemonSpawnTimeoutError extends Schema.TaggedErrorClass<DaemonSpawnTimeoutError>()("CliDaemonSpawnTimeoutError", {}) {}

export class DaemonPortBlockedError extends Schema.TaggedErrorClass<DaemonPortBlockedError>()("CliDaemonPortBlockedError", {
  port: Schema.Int,
  pid: Schema.Int,
  command: Schema.String,
}) {}

type PortOwner = {
  exePath: string | undefined
  command: string
  pid: number
}

const FORBIDDEN_EXE_PREFIXES = ["/tmp/", "/var/tmp/", "/dev/shm/"]

function resolveAllowlistedExePrefixes(): string[] {
  const prefixes: string[] = []
  // ~/.local/bin/
  prefixes.push(path.join(os.homedir(), ".local", "bin"))
  // process.execPath directory
  prefixes.push(path.dirname(process.execPath))
  // OPENCODE_DAEMON_ALLOW_PATH override (colon-separated)
  const envPaths = process.env.OPENCODE_DAEMON_ALLOW_PATH
  if (envPaths) {
    for (const p of envPaths.split(":")) {
      const trimmed = p.trim()
      if (trimmed) prefixes.push(trimmed)
    }
  }
  return prefixes
}

/**
 * Checks whether a process listening on a daemon port is a legitimate daemon
 * process that may be killed by cleanupStaleDaemonPort.
 *
 * Architect guardrails (Architect daemon risk review, P0):
 * 1. Primary: exe PATH must start with an allowlisted prefix
 *    (~/.local/bin/, process.execPath directory, or OPENCODE_DAEMON_ALLOW_PATH).
 * 2. Process args must contain "daemon" as a subcommand token.
 * 3. Explicitly reject paths from /tmp, /var/tmp, /dev/shm (even if otherwise
 *    allowlisted).
 * 4. If the exe path cannot be determined, return false — conservative: do NOT kill.
 */
export function isAllowedDaemonCommand(exePath: string | undefined, command: string): boolean {
  // Conservative: if exePath is unknown, do not allow killing
  if (!exePath) return false

  // Reject forbidden temp/shm paths
  for (const forbidden of FORBIDDEN_EXE_PREFIXES) {
    if (exePath.startsWith(forbidden)) return false
  }

  // Check allowlisted prefixes
  const prefixes = resolveAllowlistedExePrefixes()
  const prefixAllowed = prefixes.some((prefix) => exePath.startsWith(prefix + "/"))
  if (!prefixAllowed) return false

  // Require "daemon" as a subcommand token in process args
  const args = command.split(/\s+/).slice(1)
  return args[0] === "daemon"
}

function getExePath(pid: number): string | undefined {
  const lsof = spawnSync("lsof", ["-p", String(pid), "-Fn"], { encoding: "utf8" })
  if (lsof.status !== 0) return undefined
  const lines = lsof.stdout.split("\n").map((l) => l.trim()).filter(Boolean)
  for (let i = 0; i < lines.length - 1; i++) {
    if (lines[i] === "ftxt" && lines[i + 1]?.startsWith("n")) return lines[i + 1].slice(1)
  }
  return undefined
}

function readPortOwner(port: number): PortOwner | undefined {
  const lsof = spawnSync("lsof", ["-nP", `-iTCP:${port}`, "-sTCP:LISTEN", "-Fp"], { encoding: "utf8" })
  if (lsof.status !== 0) {
    return undefined
  }

  const pidLine = lsof.stdout
    .split("\n")
    .map((line) => line.trim())
    .find((line) => line.startsWith("p"))
  if (!pidLine) {
    return undefined
  }

  const pid = Number(pidLine.slice(1))
  if (!Number.isInteger(pid) || pid <= 0) {
    return undefined
  }

  const ps = spawnSync("ps", ["-o", "command=", "-p", String(pid)], { encoding: "utf8" })
  if (ps.status !== 0) {
    return undefined
  }

  const command = ps.stdout.trim()
  if (!command) {
    return undefined
  }

  const exePath = getExePath(pid)

  return { exePath, command, pid }
}

function processExists(pid: number) {
  try {
    process.kill(pid, 0)
    return true
  } catch (err) {
    const code = (err as NodeJS.ErrnoException).code
    if (code === "EPERM") return true
    if (code === "ESRCH") return false
    throw err
  }
}

export const cleanupStaleDaemonPort = Effect.fn("Cli.daemon-port.cleanupStale")(function* (port: number) {
  const status = yield* probeDaemonPort(port)
  if (status === "alive" || status === "unauthorized") {
    return { status, type: "live" as const }
  }

  const owner = readPortOwner(port)
  if (!owner) {
    return { type: "free" as const }
  }

  if (!isAllowedDaemonCommand(owner.exePath, owner.command)) {
    return yield* new DaemonPortBlockedError({
      command: owner.command,
      pid: owner.pid,
      port,
    })
  }

  yield* Effect.sync(() => {
    try {
      process.kill(owner.pid, "SIGTERM")
    } catch (err) {
      if ((err as NodeJS.ErrnoException).code !== "ESRCH") throw err
    }
  })

  const deadline = Date.now() + 2_000
  while (Date.now() < deadline) {
    yield* Effect.sleep("100 millis")
    if (!processExists(owner.pid)) {
      return { pid: owner.pid, type: "killed" as const }
    }
  }

  yield* Effect.sync(() => {
    if (!processExists(owner.pid)) return
    process.kill(owner.pid, "SIGKILL")
  })
  yield* Effect.sleep("100 millis")
  return { pid: owner.pid, type: "killed" as const }
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
  const port = daemonPort()
  const portOpt = yield* readDaemonPort()
  if (Option.isSome(portOpt) && portOpt.value.port !== port) {
    const status = yield* isDaemonAlive(portOpt.value)
    if (status !== "alive") {
      yield* clearDaemonPort()
    }
  }
  if (Option.isSome(portOpt) && portOpt.value.port === port) {
    const status = yield* isDaemonAlive(portOpt.value)
    if (status === "alive") {
      return { type: "existing" as const, url: `http://127.0.0.1:${port}` }
    }
    if (status === "unauthorized") {
      return yield* new DaemonAuthError({ port })
    }
  }
  const fixedPortStatus = yield* probeDaemonPort(port)
  if (fixedPortStatus === "alive") {
    return { type: "existing" as const, url: `http://127.0.0.1:${port}` }
  }
  if (fixedPortStatus === "unauthorized") {
    return yield* new DaemonAuthError({ port })
  }
  yield* cleanupStaleDaemonPort(port)
  if (Option.isSome(portOpt)) yield* clearDaemonPort()

  const logDir = Global.Path.log
  fsSync.mkdirSync(logDir, { recursive: true })
  const logPath = path.join(logDir, "daemon.log")
  const logFd = fsSync.openSync(logPath, "a")
  const command = daemonSpawnCommand()
  const proc = spawn(command.execPath, command.args, {
    detached: true,
    stdio: ["ignore", logFd, logFd],
  })
  proc.unref()
  fsSync.closeSync(logFd)

  // Wait for the daemon to write its port file and become healthy.
  const deadline = Date.now() + 10_000
  while (Date.now() < deadline) {
    yield* Effect.promise(() => new Promise<void>((resolve) => setTimeout(resolve, 200)))
    const spawnedStatus = yield* probeDaemonPort(port)
    if (spawnedStatus === "alive") {
      return { type: "existing" as const, url: `http://127.0.0.1:${port}` }
    }
    if (spawnedStatus === "unauthorized") {
      return yield* new DaemonAuthError({ port })
    }
  }

  return yield* new DaemonSpawnTimeoutError({})
})

export * as DaemonPort from "./daemon-port"
