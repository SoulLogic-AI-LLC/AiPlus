import type { AppServices } from "@/effect/app-runtime"
import { Context, Deferred, Effect, Fiber, Option, Ref } from "effect"

export interface DaemonLifecycle {
  readonly addConnection: Effect.Effect<void>
  readonly removeConnection: Effect.Effect<void>
  readonly incrementActiveTurn: Effect.Effect<void>
  readonly decrementActiveTurn: Effect.Effect<void>
  readonly startIdleTimer: (idleTimeoutMs: number) => Effect.Effect<void>
  readonly cancelIdleTimer: Effect.Effect<void>
  readonly shutdown: Effect.Effect<void>
}

export class Service extends Context.Service<Service, DaemonLifecycle>()("@opencode/DaemonLifecycle") {}

export const make = (args: {
  idleTimeoutMs: number
  shutdownGraceMs: number
  onShutdown: Effect.Effect<void, never, AppServices>
  shutdownDaemon: (exitCode: number) => void
}): Effect.Effect<DaemonLifecycle, never, AppServices> =>
  Effect.gen(function* () {
    const context = yield* Effect.context<AppServices>()
    const fork = Effect.runForkWith(context)
    const onShutdown = args.onShutdown.pipe(Effect.provideContext(context))

    const openConnections = yield* Ref.make(0)
    const activeTurns = yield* Ref.make(0)
    const shuttingDown = yield* Ref.make(false)
    const timerFiber = yield* Ref.make(Option.none<Fiber.Fiber<unknown, unknown>>())
    const turnsZero = yield* Deferred.make<void>()

    const isIdle = Effect.gen(function* () {
      const connections = yield* Ref.get(openConnections)
      const turns = yield* Ref.get(activeTurns)
      return connections === 0 && turns === 0
    })

    const cancelIdleTimer = Effect.gen(function* () {
      const current = Fiber.getCurrent()
      const fiber = yield* Ref.getAndSet(timerFiber, Option.none())
      if (Option.isSome(fiber) && fiber.value !== current) {
        yield* Fiber.interrupt(fiber.value).pipe(Effect.ignore)
      }
    })

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
      yield* cancelIdleTimer
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

    const startIdleTimer = (idleTimeoutMs: number) =>
      Effect.gen(function* () {
        const alreadyShuttingDown = yield* Ref.get(shuttingDown)
        if (alreadyShuttingDown) return
        const existing = yield* Ref.get(timerFiber)
        if (Option.isSome(existing)) return
        const fiber = yield* Effect.sync(() =>
          fork(
            Effect.sleep(idleTimeoutMs).pipe(
              Effect.flatMap(() => shutdown),
              Effect.asVoid,
            ),
          ),
        )
        yield* Ref.set(timerFiber, Option.some(fiber))
      })

    const addConnection = Effect.gen(function* () {
      yield* cancelIdleTimer
      yield* Ref.update(openConnections, n => n + 1)
    })

    const removeConnection = Effect.gen(function* () {
      yield* Ref.update(openConnections, n => Math.max(0, n - 1))
      const idle = yield* isIdle
      if (idle) yield* startIdleTimer(args.idleTimeoutMs)
    })

    const incrementActiveTurn = Effect.gen(function* () {
      yield* cancelIdleTimer
      yield* Ref.update(activeTurns, n => n + 1)
    })

    const decrementActiveTurn = Effect.gen(function* () {
      const previous = yield* Ref.getAndUpdate(activeTurns, n => Math.max(0, n - 1))
      if (previous === 1) {
        yield* Deferred.succeed(turnsZero, void 0)
      }
      const idle = yield* isIdle
      if (idle) yield* startIdleTimer(args.idleTimeoutMs)
    })

    return Service.of({
      addConnection,
      removeConnection,
      incrementActiveTurn,
      decrementActiveTurn,
      startIdleTimer,
      cancelIdleTimer,
      shutdown,
    })
  })

export * as DaemonLifecycle from "./daemon-lifecycle"
