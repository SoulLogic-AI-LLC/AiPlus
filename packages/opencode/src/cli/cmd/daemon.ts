import { Effect, Option } from "effect"
import { effectCmd } from "../effect-cmd"
import { Heap } from "@/cli/heap"
import { clearDaemonPort, writeDaemonPort, readDaemonPort, isDaemonAlive } from "@/cli/daemon-port"
import { disposeAllInstancesAndEmitGlobalDisposed } from "@/server/global-lifecycle"
import { Flag } from "@opencode-ai/core/flag/flag"
import type { Listener } from "../../server/server"

async function shutdownDaemon(server: Listener) {
  const { AppRuntime } = await import("@/effect/app-runtime")
  await AppRuntime.runPromise(
    Effect.gen(function* () {
      yield* clearDaemonPort()
      yield* disposeAllInstancesAndEmitGlobalDisposed({ swallowErrors: true })
    }).pipe(Effect.ignore),
  )
  await server.stop(true)
  process.exit(0)
}

export const DaemonCommand = effectCmd({
  command: "daemon",
  describe: "start opencode daemon process",
  // The daemon is a long-lived process that loads instances per-request via the
  // x-opencode-directory header. No ambient project InstanceContext is needed
  // at startup, matching `serve.ts:12`.
  instance: false,
  handler: Effect.fn("Cli.daemon")(function* () {
    Heap.start()

    const { Server } = yield* Effect.promise(() => import("../../server/server"))

    if (!Flag.OPENCODE_SERVER_PASSWORD) {
      process.stderr.write("Warning: OPENCODE_SERVER_PASSWORD is not set; daemon is unsecured.\n")
    }

    const existingPort = yield* readDaemonPort()
    if (Option.isSome(existingPort)) {
      const alive = yield* isDaemonAlive(existingPort.value)
      if (alive) {
        process.stderr.write(`daemon already running on port ${existingPort.value.port}\n`)
        return
      }
    }

    // port: 0 → 4096-preferred behavior (B0-B3 / V1). The actual port is reported
    // to consumers via the port file written below.
    const server: Listener = yield* Effect.promise(() =>
      Server.listen({ port: 0, hostname: "127.0.0.1" }),
    )

    yield* writeDaemonPort(server.port)
    process.stderr.write(`daemon ready on port ${server.port}\n`)

    let shuttingDown = false
    const onSignal = () => {
      if (shuttingDown) return
      shuttingDown = true
      void shutdownDaemon(server).catch(() => process.exit(0))
    }
    process.on("SIGTERM", onSignal)
    process.on("SIGINT", onSignal)

    yield* Effect.never
  }),
})
