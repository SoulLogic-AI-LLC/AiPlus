import { Effect } from "effect"
import { Database } from "@opencode-ai/core/database/database"

/**
 * Event table maintenance: deduplicate streaming events and enforce TTL.
 *
 * - Dedup: per message/part, keep only the latest event (highest seq).
 * - TTL:   delete events for sessions untouched > 30 days.
 *          message + part 投影表不受影响。
 * - Vacuum: reclaim free pages if auto_vacuum=incremental is active.
 */

/**
 * Remove redundant streaming events. For each distinct message ID /
 * part ID, keep only the event with the highest seq (latest update).
 * Intermediate token-level snapshots are discarded.
 */
export const compact = (): Effect.Effect<void, never, Database.Service> =>
  Effect.gen(function* () {
    const { db } = yield* Database.Service
    yield* Effect.logInfo("EventCleanup: dedup starting")

    yield* db
      .run(
        `DELETE FROM event
         WHERE type = 'message.updated.1'
           AND id NOT IN (
             SELECT id FROM (
               SELECT id, ROW_NUMBER() OVER (
                 PARTITION BY json_extract(data, '$.info.id')
                 ORDER BY seq DESC
               ) AS rn
               FROM event WHERE type = 'message.updated.1'
             ) WHERE rn = 1
           )`,
      )
      .pipe(Effect.orDie)
    yield* Effect.logInfo("EventCleanup: message.updated dedup done")

    yield* db
      .run(
        `DELETE FROM event
         WHERE type = 'message.part.updated.1'
           AND id NOT IN (
             SELECT id FROM (
               SELECT id, ROW_NUMBER() OVER (
                 PARTITION BY json_extract(data, '$.part.id')
                 ORDER BY seq DESC
               ) AS rn
               FROM event WHERE type = 'message.part.updated.1'
             ) WHERE rn = 1
           )`,
      )
      .pipe(Effect.orDie)
    yield* Effect.logInfo("EventCleanup: message.part.updated dedup done")
  })

/**
 * Delete events and event_sequence rows for sessions untouched > `days`.
 * Session / message / part projection tables are NOT touched.
 */
export const cleanupOldSessions = (days: number = 30): Effect.Effect<void, never, Database.Service> =>
  Effect.gen(function* () {
    if (days < 7) {
      yield* Effect.logWarning("EventCleanup: refusing TTL < 7 days", { days })
      return
    }
    const cutoff = Date.now() - days * 24 * 60 * 60 * 1000
    yield* Effect.logInfo("EventCleanup: TTL cleanup starting", { days, cutoff })

    const { db } = yield* Database.Service

    yield* db
      .run(`DELETE FROM event WHERE aggregate_id IN (SELECT id FROM session WHERE time_updated < ${cutoff})`)
      .pipe(Effect.orDie)

    yield* db
      .run(`DELETE FROM event_sequence WHERE aggregate_id IN (SELECT id FROM session WHERE time_updated < ${cutoff})`)
      .pipe(Effect.orDie)

    yield* Effect.logInfo("EventCleanup: TTL cleanup done")

    const av: any = yield* db.all("PRAGMA auto_vacuum").pipe(Effect.orDie)
    if (av?.[0]?.auto_vacuum === 2) {
      yield* db.run("PRAGMA incremental_vacuum(1000)").pipe(Effect.orDie)
      yield* Effect.logInfo("EventCleanup: incremental_vacuum done")
    }
  })

/**
 * Run dedup once, then TTL cleanup. Safe to call at daemon startup.
 */
export const compactAndCleanup = (): Effect.Effect<void, never, Database.Service> =>
  Effect.gen(function* () {
    yield* compact()
    yield* cleanupOldSessions(30)
  })

export * as EventCleanup from "./event-cleanup"
