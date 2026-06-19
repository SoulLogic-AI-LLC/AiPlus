/**
 * Velocity — Tests (V1)
 */

import { describe, it, expect } from "bun:test"
import * as fs from "node:fs"
import * as path from "node:path"
import * as os from "node:os"
import { Database } from "bun:sqlite"
import { computeVelocity } from "./query"
import { writeVelocity } from "./stats"

function seedSessions(
  db: Database,
  rows: Array<{
    durationMs: number
    title: string
    agent?: string | null
    timeCreated: number
  }>,
) {
  for (const r of rows) {
    const timeUpdated = r.timeCreated + r.durationMs
    db.run(
      `INSERT INTO session (id, title, agent, time_created, time_updated)
       VALUES (?, ?, ?, ?, ?)`,
      [`ses-${Math.random().toString(36).slice(2, 8)}`, r.title, r.agent ?? null, r.timeCreated, timeUpdated],
    )
  }
}

function createDb(): { db: Database; tmpDir: string } {
  const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "vel-test-"))
  const dbPath = path.join(tmpDir, "test.db")
  const db = new Database(dbPath)
  db.run(`CREATE TABLE session (
    id TEXT PRIMARY KEY, title TEXT, agent TEXT,
    time_created INTEGER NOT NULL, time_updated INTEGER NOT NULL
  )`)
  return { db, tmpDir }
}

describe("velocity query", () => {
  it("returns zeros for empty DB", () => {
    const { db, tmpDir } = createDb()
    const dbPath = path.join(tmpDir, "test.db")
    db.close()

    const stats = computeVelocity({ dbPath, windowStart: 0 })
    expect(stats.trend7d.count).toBe(0)
    expect(stats.trend7d.p50).toBe(0)
    expect(Object.keys(stats.byRole)).toHaveLength(0)

    fs.rmSync(tmpDir, { recursive: true, force: true })
  })

  it("computes p50/p90 from a small session set", () => {
    const { db, tmpDir } = createDb()
    const now = Date.now()
    // 5 sessions with known durations: 2,4,6,8,10 minutes
    seedSessions(db, [
      { durationMs: 2 * 60000, title: "feat: add login", agent: "agent-team-ceo", timeCreated: now - 1000 },
      { durationMs: 4 * 60000, title: "fix: null pointer", agent: null, timeCreated: now - 2000 },
      { durationMs: 6 * 60000, title: "feat: dashboard", agent: "agent-team-architect", timeCreated: now - 3000 },
      { durationMs: 8 * 60000, title: "Review PR #5", agent: null, timeCreated: now - 4000 },
      { durationMs: 10 * 60000, title: "CEO-3 weekly retro", agent: "agent-team-ceo", timeCreated: now - 5000 },
    ])
    const dbPath = path.join(tmpDir, "test.db")
    db.close()

    const stats = computeVelocity({ dbPath, windowStart: 0 })
    // p50 of [2,4,6,8,10] = index 2 → 6
    expect(stats.trend7d.p50).toBe(6)
    // p90 of [2,4,6,8,10] = index 4 → 10
    expect(stats.trend7d.p90).toBe(10)
    expect(stats.trend7d.count).toBe(5)

    // by task type: feat sessions [2,6] → p50=2, p90=6
    expect(stats.byTaskType["feat"].p50).toBe(2)
    expect(stats.byTaskType["feat"].count).toBe(2)

    // by role: ceo sessions [2,10] → p50=2, p90=10
    expect(stats.byRole["ceo"].count).toBe(2)

    fs.rmSync(tmpDir, { recursive: true, force: true })
  })

  it("correctly separates 7d and 30d trends", () => {
    const { db, tmpDir } = createDb()
    const now = Date.now()
    const dayMs = 24 * 60 * 60 * 1000
    // 3 sessions in last 7 days, 2 older (within 30 days)
    seedSessions(db, [
      { durationMs: 3 * 60000, title: "feat: recent", agent: null, timeCreated: now - 2 * dayMs },
      { durationMs: 5 * 60000, title: "fix: recent", agent: null, timeCreated: now - 5 * dayMs },
      { durationMs: 7 * 60000, title: "feat: recent2", agent: null, timeCreated: now - 6 * dayMs },
      { durationMs: 10 * 60000, title: "fix: old", agent: null, timeCreated: now - 10 * dayMs },
      { durationMs: 15 * 60000, title: "feat: older", agent: null, timeCreated: now - 25 * dayMs },
    ])
    const dbPath = path.join(tmpDir, "test.db")
    db.close()

    const stats = computeVelocity({ dbPath, windowStart: 0 })
    // 7d: [3,5,7] → p50=5, p90=7
    expect(stats.trend7d.count).toBe(3)
    expect(stats.trend7d.p50).toBe(5)
    expect(stats.trend7d.p90).toBe(7)
    // 30d: [3,5,7,10,15] → p50=7, p90=15
    expect(stats.trend30d.count).toBe(5)
    expect(stats.trend30d.p50).toBe(7)
    expect(stats.trend30d.p90).toBe(15)

    fs.rmSync(tmpDir, { recursive: true, force: true })
  })
})

describe("velocity writeStats", () => {
  it("writes stats.json to project directory", () => {
    const { db, tmpDir } = createDb()
    const now = Date.now()
    seedSessions(db, [{ durationMs: 3 * 60000, title: "test session", agent: null, timeCreated: now - 1000 }])
    const dbPath = path.join(tmpDir, "test.db")
    db.close()

    const projectRoot = path.join(tmpDir, "project")
    const result = writeVelocity(projectRoot, { dbPath, windowStart: 0 })
    expect(result).not.toBeNull()
    expect(result!.trend7d.count).toBe(1)

    const statsPath = path.join(projectRoot, ".aiplus", "velocity", "stats.json")
    expect(fs.existsSync(statsPath)).toBe(true)

    fs.rmSync(tmpDir, { recursive: true, force: true })
  })

  it("does not throw on write failure", () => {
    const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "vel-test-"))
    const badRoot = path.join(tmpDir, "not-dir")
    fs.writeFileSync(badRoot, "x")
    expect(() => writeVelocity(badRoot, { windowStart: 0 })).not.toThrow()
    fs.rmSync(tmpDir, { recursive: true, force: true })
  })
})
