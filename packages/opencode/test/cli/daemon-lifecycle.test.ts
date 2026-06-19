import { describe, expect, test } from "bun:test"
import { Effect, Exit, Fiber, Scope } from "effect"
import { DaemonLifecycle } from "../../src/cli/daemon-lifecycle"

describe("DaemonLifecycle", () => {
  test("active turn holds off shutdown, idle does not auto-shutdown", () =>
    Effect.runPromise(
      Effect.scoped(Effect.gen(function* () {
        let shutdownExitCode: number | undefined

        const lifecycle = yield* DaemonLifecycle.make({
          shutdownGraceMs: 5000,
          onShutdown: Effect.void as Effect.Effect<void, never, never>,
          shutdownDaemon: (code) => {
            shutdownExitCode = code
          },
        })

        yield* lifecycle.addConnection
        yield* lifecycle.incrementActiveTurn
        yield* lifecycle.removeConnection

        // Active turn holds off explicit shutdown.
        yield* Effect.sleep(50)
        expect(shutdownExitCode).toBeUndefined()

        yield* lifecycle.decrementActiveTurn

        // Idle (no connections, no active turns) must NOT auto-shutdown.
        // Auto-shutdown was intentionally removed in PR #65 to prevent
        // the daemon from exiting on transient connection drops.
        yield* Effect.sleep(50)
        expect(shutdownExitCode).toBeUndefined()

        // Explicit shutdown must fire.
        yield* lifecycle.shutdown

        yield* Effect.gen(function* () {
          while (shutdownExitCode === undefined) {
            yield* Effect.sleep(5)
          }
        }).pipe(Effect.timeout("2 seconds"))

        expect(shutdownExitCode).toBe(0)
      })) as Effect.Effect<void>,
    ),
    { timeout: 10000 },
  )

  test("shutdown waits for active turn to finish within grace period", () =>
    Effect.runPromise(
      Effect.scoped(Effect.gen(function* () {
        let shutdownExitCode: number | undefined
        const lifecycle = yield* DaemonLifecycle.make({
          shutdownGraceMs: 5000,
          onShutdown: Effect.void as Effect.Effect<void, never, never>,
          shutdownDaemon: (code) => {
            shutdownExitCode = code
          },
        })

        yield* lifecycle.addConnection
        yield* lifecycle.incrementActiveTurn
        yield* lifecycle.removeConnection

        const scope = yield* Scope.Scope
        const shutdownFiber = yield* Effect.forkIn(lifecycle.shutdown, scope)

        // Give shutdown a moment to start waiting for active turns.
        yield* Effect.sleep(50)
        expect(shutdownExitCode).toBeUndefined()

        yield* lifecycle.decrementActiveTurn

        const exit = yield* Fiber.await(shutdownFiber).pipe(Effect.timeout("2 seconds"))
        expect(Exit.isSuccess(exit)).toBe(true)
        expect(shutdownExitCode).toBe(0)
      })) as Effect.Effect<void>,
    ),
    { timeout: 10000 },
  )

  test("shutdown does not wait longer than shutdownGraceMs", () =>
    Effect.runPromise(
      Effect.scoped(Effect.gen(function* () {
        let shutdownExitCode: number | undefined
        const lifecycle = yield* DaemonLifecycle.make({
          shutdownGraceMs: 100,
          onShutdown: Effect.void as Effect.Effect<void, never, never>,
          shutdownDaemon: (code) => {
            shutdownExitCode = code
          },
        })

        yield* lifecycle.incrementActiveTurn

        const start = yield* Effect.clockWith((clock) => clock.currentTimeMillis)
        yield* lifecycle.shutdown
        const end = yield* Effect.clockWith((clock) => clock.currentTimeMillis)

        expect(shutdownExitCode).toBe(0)
        expect(end - start).toBeLessThan(500)
      })) as Effect.Effect<void>,
    ),
    { timeout: 10000 },
  )
})
