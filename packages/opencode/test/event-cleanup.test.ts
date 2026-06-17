import { describe, expect, test } from "bun:test"
import { Effect } from "effect"
import { Database } from "@opencode-ai/core/database/database"

/**
 * Event cleanup tests using in-memory SQLite.
 * Bypasses testEffect's layer type gymnastics — directly provides the Database layer.
 */

const inMemoryLayer = Database.layerFromPath(":memory:")

const run = <A, E>(effect: Effect.Effect<A, E, Database.Service>) =>
  Effect.runPromise(effect.pipe(Effect.provide(inMemoryLayer)))

/** Seed a minimal session row (FKs disabled for test simplicity). */
const seedSession = (id: string, timeUpdated: number) =>
  Effect.gen(function* () {
    const { db } = yield* Database.Service
    yield* db.run("PRAGMA foreign_keys = OFF").pipe(Effect.orDie)
    yield* db
      .run(
        `INSERT INTO session (id, project_id, slug, directory, title, version, time_created, time_updated)
         VALUES ('${id}', 'proj_test', '${id}', '/tmp', 'Test Session', 'v2', ${timeUpdated}, ${timeUpdated})`,
      )
      .pipe(Effect.orDie)
    yield* db.run("PRAGMA foreign_keys = ON").pipe(Effect.orDie)
  })

const dedupMessageUpdated = Effect.gen(function* () {
  const { db } = yield* Database.Service
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
})

const dedupPartUpdated = Effect.gen(function* () {
  const { db } = yield* Database.Service
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
})

const ttlCleanup = (days: number) =>
  Effect.gen(function* () {
    if (days < 7) return
    const cutoff = Date.now() - days * 24 * 60 * 60 * 1000
    const { db } = yield* Database.Service
    yield* db
      .run(`DELETE FROM event WHERE aggregate_id IN (SELECT id FROM session WHERE time_updated < ${cutoff})`)
      .pipe(Effect.orDie)
    yield* db
      .run(
        `DELETE FROM event_sequence WHERE aggregate_id IN (SELECT id FROM session WHERE time_updated < ${cutoff})`,
      )
      .pipe(Effect.orDie)
  })

describe("event-cleanup", () => {
  test("compact removes duplicate message.updated events, keeps latest", async () => {
    await run(
      Effect.gen(function* () {
        const { db } = yield* Database.Service

        yield* db
          .run("INSERT INTO event_sequence (aggregate_id, seq) VALUES ('ses_test', 2)")
          .pipe(Effect.orDie)

        yield* db
          .run(
            `INSERT INTO event (id, aggregate_id, seq, type, data) VALUES
             ('evt_001', 'ses_test', 0, 'message.updated.1', '{"sessionID":"ses_test","info":{"id":"msg_A"}}'),
             ('evt_002', 'ses_test', 1, 'message.updated.1', '{"sessionID":"ses_test","info":{"id":"msg_A"}}')`,
          )
          .pipe(Effect.orDie)

        yield* dedupMessageUpdated

        const rows: any[] = yield* db
          .all("SELECT id, seq FROM event WHERE type = 'message.updated.1'")
          .pipe(Effect.orDie)
        expect(rows.length).toBe(1)
        expect(rows[0].id).toBe("evt_002")
      }),
    )
  })

  test("compact keeps distinct messages untouched", async () => {
    await run(
      Effect.gen(function* () {
        const { db } = yield* Database.Service

        yield* db
          .run("INSERT INTO event_sequence (aggregate_id, seq) VALUES ('ses_test', 3)")
          .pipe(Effect.orDie)

        yield* db
          .run(
            `INSERT INTO event (id, aggregate_id, seq, type, data) VALUES
             ('evt_A1', 'ses_test', 0, 'message.updated.1', '{"sessionID":"ses_test","info":{"id":"msg_A"}}'),
             ('evt_A2', 'ses_test', 1, 'message.updated.1', '{"sessionID":"ses_test","info":{"id":"msg_A"}}'),
             ('evt_B1', 'ses_test', 2, 'message.updated.1', '{"sessionID":"ses_test","info":{"id":"msg_B"}}')`,
          )
          .pipe(Effect.orDie)

        yield* dedupMessageUpdated

        const rows: any[] = yield* db
          .all("SELECT id FROM event WHERE type = 'message.updated.1' ORDER BY seq")
          .pipe(Effect.orDie)
        expect(rows.length).toBe(2)
        expect(rows.map((r: any) => r.id)).toEqual(["evt_A2", "evt_B1"])
      }),
    )
  })

  test("compact handles part.updated dedup", async () => {
    await run(
      Effect.gen(function* () {
        const { db } = yield* Database.Service

        yield* db
          .run("INSERT INTO event_sequence (aggregate_id, seq) VALUES ('ses_test', 2)")
          .pipe(Effect.orDie)

        yield* db
          .run(
            `INSERT INTO event (id, aggregate_id, seq, type, data) VALUES
             ('evt_P1', 'ses_test', 0, 'message.part.updated.1', '{"sessionID":"ses_test","part":{"id":"prt_X"}}'),
             ('evt_P2', 'ses_test', 1, 'message.part.updated.1', '{"sessionID":"ses_test","part":{"id":"prt_X"}}')`,
          )
          .pipe(Effect.orDie)

        yield* dedupPartUpdated

        const rows: any[] = yield* db
          .all("SELECT id FROM event WHERE type = 'message.part.updated.1'")
          .pipe(Effect.orDie)
        expect(rows.length).toBe(1)
        expect(rows[0].id).toBe("evt_P2")
      }),
    )
  })

  test("TTL deletes events for old sessions, keeps recent ones", async () => {
    await run(
      Effect.gen(function* () {
        const { db } = yield* Database.Service
        const oldTime = Date.now() - 40 * 24 * 60 * 60 * 1000
        const recentTime = Date.now() - 1 * 24 * 60 * 60 * 1000

        yield* seedSession("ses_old", oldTime)
        yield* db
          .run("INSERT INTO event_sequence (aggregate_id, seq) VALUES ('ses_old', 1)")
          .pipe(Effect.orDie)
        yield* db
          .run(
            `INSERT INTO event (id, aggregate_id, seq, type, data) VALUES
             ('evt_old', 'ses_old', 0, 'session.created.1', '{"sessionID":"ses_old","info":{"id":"ses_old"}}')`,
          )
          .pipe(Effect.orDie)

        yield* seedSession("ses_new", recentTime)
        yield* db
          .run("INSERT INTO event_sequence (aggregate_id, seq) VALUES ('ses_new', 1)")
          .pipe(Effect.orDie)
        yield* db
          .run(
            `INSERT INTO event (id, aggregate_id, seq, type, data) VALUES
             ('evt_new', 'ses_new', 0, 'session.created.1', '{"sessionID":"ses_new","info":{"id":"ses_new"}}')`,
          )
          .pipe(Effect.orDie)

        yield* ttlCleanup(30)

        const oldRows: any[] = yield* db
          .all("SELECT id FROM event WHERE aggregate_id = 'ses_old'")
          .pipe(Effect.orDie)
        expect(oldRows.length).toBe(0)

        const recentRows: any[] = yield* db
          .all("SELECT id FROM event WHERE aggregate_id = 'ses_new'")
          .pipe(Effect.orDie)
        expect(recentRows.length).toBe(1)
        expect(recentRows[0].id).toBe("evt_new")
      }),
    )
  })

  test("TTL does not touch message projection table", async () => {
    await run(
      Effect.gen(function* () {
        const { db } = yield* Database.Service
        const oldTime = Date.now() - 40 * 24 * 60 * 60 * 1000

        yield* seedSession("ses_msg", oldTime)
        yield* db
          .run(
            `INSERT INTO message (id, session_id, time_created, time_updated, data)
             VALUES ('msg_keep', 'ses_msg', ${oldTime}, ${oldTime}, '{"role":"user","content":"hello"}')`,
          )
          .pipe(Effect.orDie)
        yield* db
          .run("INSERT INTO event_sequence (aggregate_id, seq) VALUES ('ses_msg', 1)")
          .pipe(Effect.orDie)
        yield* db
          .run(
            `INSERT INTO event (id, aggregate_id, seq, type, data) VALUES
             ('evt_msg', 'ses_msg', 0, 'session.created.1', '{"sessionID":"ses_msg","info":{"id":"ses_msg"}}')`,
          )
          .pipe(Effect.orDie)

        yield* ttlCleanup(30)

        const evt: any[] = yield* db
          .all("SELECT id FROM event WHERE aggregate_id = 'ses_msg'")
          .pipe(Effect.orDie)
        expect(evt.length).toBe(0)

        const msg: any[] = yield* db
          .all("SELECT id FROM message WHERE session_id = 'ses_msg'")
          .pipe(Effect.orDie)
        expect(msg.length).toBe(1)
        expect(msg[0].id).toBe("msg_keep")
      }),
    )
  })
})
