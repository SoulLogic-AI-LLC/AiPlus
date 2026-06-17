import type { AppServices } from "@/effect/app-runtime"
import { Context, Deferred, Effect, Ref } from "effect"

export interface DaemonLifecycle {
  readonly addConnection: Effect.Effect<void>
  readonly removeConnection: Effect.Effect<void>
  readonly incrementActiveTurn: Effect.Effect<void>
  readonly decrementActiveTurn: Effect.Effect<void>
  readonly shutdown: Effect.Effect<void>
}

export class Service extends Context.Service<Service, DaemonLifecycle>()("@opencode/DaemonLifecycle") {}

export const make = (args: {
  shutdownGraceMs: number
  onShutdown: Effect.Effect<void, never, AppServices>
  shutdownDaemon: (exitCode: number) => void
}): Effect.Effect<DaemonLifecycle, never, AppServices> =>
  Effect.gen(function* () {
    const context = yield* Effect.context<AppServices>()
    const onShutdown = args.onShutdown.pipe(Effect.provideContext(context))

    const openConnections = yield* Ref.make(0)
    const activeTurns = yield* Ref.make(0)
    const shuttingDown = yield* Ref.make(false)
    const turnsZero = yield* Deferred.make<void>()

    // maybeShutdown removed: daemon only exits on SIGTERM/SIGINT.
    // Connection drops (WiFi blip, sleep/wake, NAT timeout) must not
    // trigger automatic exit — TUI may reconnect within seconds.
    // Connection count is still tracked for monitoring.

    const waitForActiveTurns = Effect.gen(function* () {
      const turns = yield* Ref.get(activeTurns)
      if (turns === 0) return
      yield* Deferred.await(turnsZero).pipe(
        Effect.timeout(args.shutdownGraceMs),
        Effect.ignore,
      )
    })

    const shutdown = Effect.gen(function* () {
      const alreadyShuttingDown = yield* Ref.get(shuttingDown)
      if (alreadyShuttingDown) return
      yield* Ref.set(shuttingDown, true)
      yield* onShutdown
      yield* waitForActiveTurns
      yield* Effect.sync(() => args.shutdownDaemon(0))
    }).pipe(
      Effect.catchCause((cause) =>
        Effect.gen(function* () {
          yield* Effect.logError("daemon shutdown failed", cause)
          yield* Effect.sync(() => args.shutdownDaemon(1))
        }),
      ),
    )

    const addConnection = Effect.gen(function* () {
      yield* Ref.update(openConnections, n => n + 1)
    })

    const removeConnection = Effect.gen(function* () {
      yield* Ref.update(openConnections, n => Math.max(0, n - 1))
    })

    const incrementActiveTurn = Effect.gen(function* () {
      yield* Ref.update(activeTurns, n => n + 1)
    })

    const decrementActiveTurn = Effect.gen(function* () {
      const previous = yield* Ref.getAndUpdate(activeTurns, n => Math.max(0, n - 1))
      if (previous === 1) {
        yield* Deferred.succeed(turnsZero, void 0)
      }
    })

    return Service.of({
      addConnection,
      removeConnection,
      incrementActiveTurn,
      decrementActiveTurn,
      shutdown,
    })
  })

export * as DaemonLifecycle from "./daemon-lifecycle"
