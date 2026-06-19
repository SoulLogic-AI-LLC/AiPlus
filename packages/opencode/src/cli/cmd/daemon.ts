import { Context, Effect, Option } from "effect"
import { effectCmd, fail } from "../effect-cmd"
import { Heap } from "@/cli/heap"
import {
  cleanupStaleDaemonPort,
  clearDaemonPort,
  daemonPort,
  isDaemonAlive,
  probeDaemonPort,
  readDaemonPort,
  writeDaemonPort,
} from "@/cli/daemon-port"
import { DaemonLifecycle } from "@/cli/daemon-lifecycle"
import { DaemonAuth } from "@/cli/daemon-auth"
import { disposeAllInstancesAndEmitGlobalDisposed } from "@/server/global-lifecycle"
import { Flag } from "@opencode-ai/core/flag/flag"
import { EventCleanup } from "@/event-cleanup"
import { Database } from "@opencode-ai/core/database/database"
import { ProjectTable } from "@opencode-ai/core/project/sql"
import { cleanupStale } from "@/worktree-cleanup"
import type { Listener } from "../../server/server"

export const DaemonCommand = effectCmd({
  command: "daemon",
  describe: "start opencode daemon process",
  // The daemon is a long-lived process that loads instances per-request via the
  // x-opencode-directory header. No ambient project InstanceContext is needed
  // at startup, matching `serve.ts:12`.
  instance: false,
  handler: Effect.fn("Cli.daemon")(function* () {
    const port = daemonPort()

    Heap.start()

    const { Server } = yield* Effect.promise(() => import("../../server/server"))

    const existingPort = yield* readDaemonPort()
    if (Option.isSome(existingPort) && existingPort.value.port === port) {
      const status = yield* isDaemonAlive(existingPort.value)
      if (status === "alive" || status === "unauthorized") {
        process.stderr.write(`daemon already running on port ${port}\n`)
        return
      }
    }

    const directStatus = yield* probeDaemonPort(port)
    if (directStatus === "alive" || directStatus === "unauthorized") {
      process.stderr.write(`daemon already running on port ${port}\n`)
      return
    }

    yield* cleanupStaleDaemonPort(port).pipe(
      Effect.catchTag("CliDaemonPortBlockedError", (error) =>
        fail(
          `Port ${error.port} is owned by a non-daemon process (pid ${error.pid}): ${error.command}. ` +
            "Will not kill it automatically.",
        ),
      ),
    )
    if (Option.isSome(existingPort)) {
      if (existingPort.value.port !== port) {
        const status = yield* isDaemonAlive(existingPort.value)
        if (status !== "alive") {
          yield* clearDaemonPort()
        }
      } else {
        yield* clearDaemonPort()
      }
    }

    const password = yield* DaemonAuth.ensurePassword()
    process.env.OPENCODE_SERVER_PASSWORD = password
    Flag.OPENCODE_SERVER_PASSWORD = password

    const shutdownGraceMs = Number(process.env.OPENCODE_DAEMON_SHUTDOWN_GRACE_MS ?? "30000")

    let server: Listener | undefined

    const onShutdown = Effect.gen(function* () {
      if (server !== undefined) {
        yield* Effect.promise(() => server!.stop(true))
      }
      yield* clearDaemonPort()
      yield* disposeAllInstancesAndEmitGlobalDisposed({ swallowErrors: true })
    }).pipe(Effect.asVoid)

    const shutdownDaemon = (exitCode: number) => {
      Effect.runPromise(clearDaemonPort()).catch(() => {}).finally(() => process.exit(exitCode))
    }

    const lifecycle = yield* DaemonLifecycle.make({
      shutdownGraceMs,
      onShutdown,
      shutdownDaemon,
    })

    const context = Context.make(DaemonLifecycle.Service, lifecycle)

    server = yield* Effect.promise(() =>
      Server.listen({ port, hostname: "127.0.0.1" }, context),
    )

    yield* writeDaemonPort(server.port)
    process.stderr.write(`daemon ready on port ${server.port}\n`)

    // Run event table cleanup once at startup (dedup + 30-day TTL).
    // Fork detaches so it never blocks daemon readiness or shutdown.
    yield* EventCleanup.compactAndCleanup().pipe(Effect.forkDetach)

    // Run worktree cleanup every 12 hours — detect and remove stale worktrees
    // for branches already merged into origin/dev or deleted from remote.
    // First run at startup, then repeats on a 12-hour interval.
    yield* Effect.gen(function* () {
      const { db } = yield* Database.Service
      while (true) {
        const rows = yield* db
          .select({ worktree: ProjectTable.worktree })
          .from(ProjectTable)
          .all()
          .pipe(Effect.orDie)

        const seen = new Set<string>()
        for (const row of rows) {
          const repoRoot = row.worktree as string
          if (!repoRoot || seen.has(repoRoot)) continue
          seen.add(repoRoot)
          yield* Effect.sync(() => {
            const result = cleanupStale(repoRoot)
            if (result.removed.length > 0) {
              console.log(`[worktree-cleanup] removed ${result.removed.length} stale worktree(s) for ${repoRoot}`)
            }
            if (result.failed.length > 0) {
              console.log(`[worktree-cleanup] failed to remove ${result.failed.length} worktree(s) for ${repoRoot}`)
            }
            if (result.skipped.length > 0) {
              console.log(
                `[worktree-cleanup] skipped ${result.skipped.length} worktree(s) for ${repoRoot}: ` +
                  result.skipped.map((s) => `${s.path} (${s.reasons.join(",")})`).join("; "),
              )
            }
          })
        }
        // 12-hour interval between cleanup sweeps
        yield* Effect.sleep("12 hours")
      }
    }).pipe(Effect.forkDetach)

    // RSS monitor: check total memory every 30 minutes. Uses rss (OS-level
    // resident set size) to catch native leaks (SQLite, Buffer) that heapUsed
    // would miss. Threshold 1.5 GB shared with heap.ts Heap.start().
    // If exceeded, log a warning and exit gracefully — launchd restarts a
    // fresh daemon at 160 MB baseline. Configurable via env vars.
    yield* Effect.gen(function* () {
      const intervalMs = Number(process.env.OPENCODE_DAEMON_HEAP_CHECK_MS ?? "1800000") // 30 min
      const limitBytes = Number(process.env.OPENCODE_DAEMON_HEAP_LIMIT_MB ?? "1536") * 1024 * 1024 // 1.5 GB
      while (true) {
        yield* Effect.sleep(intervalMs)
        const used = process.memoryUsage().rss
        if (used > limitBytes) {
          process.stderr.write(
            `[daemon] heap ${(used / 1024 / 1024).toFixed(0)} MB exceeds limit ` +
              `${(limitBytes / 1024 / 1024).toFixed(0)} MB; restarting\n`,
          )
          yield* lifecycle.shutdown
        }
      }
    }).pipe(Effect.forkDetach)

    let shuttingDown = false
    const onSignal = () => {
      if (shuttingDown) return
      shuttingDown = true
      process.stderr.write("shutting down\n")
      void Effect.runPromise(lifecycle.shutdown).catch(() => shutdownDaemon(1))
    }
    process.on("SIGTERM", onSignal)
    process.on("SIGINT", onSignal)

    process.on("uncaughtException", (error) => {
      process.stderr.write(`uncaught exception: ${error}\n`)
      shutdownDaemon(1)
    })
    process.on("unhandledRejection", (reason) => {
      process.stderr.write(`unhandled rejection: ${reason}\n`)
      shutdownDaemon(1)
    })

    yield* Effect.never
  }),
})
