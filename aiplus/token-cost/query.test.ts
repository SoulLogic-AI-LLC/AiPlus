/**
 * Token Cost — Tests (V1)
 */

import { describe, it, expect } from "bun:test"
import * as fs from "node:fs"
import * as path from "node:path"
import * as os from "node:os"
import { computeStats } from "./query"
import { writeStats } from "./stats"
import { Database } from "bun:sqlite"

describe("token-cost query", () => {
  it("returns zero stats for empty DB", () => {
    // Create a temp DB with the session schema but no rows
    const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "tc-test-"))
    const dbPath = path.join(tmpDir, "empty.db")
    const db = new Database(dbPath)
    db.run(`CREATE TABLE session (
      id TEXT PRIMARY KEY, title TEXT, agent TEXT, model TEXT, directory TEXT,
      cost REAL DEFAULT 0, tokens_input INTEGER DEFAULT 0,
      tokens_output INTEGER DEFAULT 0, tokens_reasoning INTEGER DEFAULT 0,
      tokens_cache_read INTEGER DEFAULT 0, tokens_cache_write INTEGER DEFAULT 0,
      time_created INTEGER NOT NULL
    )`)
    db.close()

    const stats = computeStats({ dbPath, windowStart: 0 })
    expect(stats.total.tokens).toBe(0)
    expect(stats.total.cost).toBe(0)
    expect(Object.keys(stats.byModel)).toHaveLength(0)

    fs.rmSync(tmpDir, { recursive: true, force: true })
  })

  it("aggregates a single session correctly", () => {
    const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "tc-test-"))
    const dbPath = path.join(tmpDir, "test.db")
    const db = new Database(dbPath)
    db.run(`CREATE TABLE session (
      id TEXT PRIMARY KEY, title TEXT, agent TEXT, model TEXT, directory TEXT,
      cost REAL DEFAULT 0, tokens_input INTEGER DEFAULT 0,
      tokens_output INTEGER DEFAULT 0, tokens_reasoning INTEGER DEFAULT 0,
      tokens_cache_read INTEGER DEFAULT 0, tokens_cache_write INTEGER DEFAULT 0,
      time_created INTEGER NOT NULL
    )`)
    const now = Date.now()
    db.run(
      `INSERT INTO session (id, title, agent, model, directory, cost, tokens_input, tokens_output, time_created)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        "ses-1",
        "CEO-3 fix bug",
        "agent-team-ceo",
        '{"id":"MiniMax-M3"}',
        "/projects/aiplus",
        0.05,
        10000,
        500,
        now - 1000,
      ],
    )
    db.close()

    const stats = computeStats({ dbPath, windowStart: now - 10000 })
    expect(stats.total.tokens).toBe(10500)
    expect(stats.total.cost).toBe(0.05)
    expect(stats.byModel["MiniMax-M3"].sessions).toBe(1)
    expect(stats.byRole["ceo"].sessions).toBe(1)
    expect(stats.byProject["aiplus"].sessions).toBe(1)

    fs.rmSync(tmpDir, { recursive: true, force: true })
  })

  it("aggregates multiple sessions with different models", () => {
    const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "tc-test-"))
    const dbPath = path.join(tmpDir, "test.db")
    const db = new Database(dbPath)
    db.run(`CREATE TABLE session (
      id TEXT PRIMARY KEY, title TEXT, agent TEXT, model TEXT, directory TEXT,
      cost REAL DEFAULT 0, tokens_input INTEGER DEFAULT 0,
      tokens_output INTEGER DEFAULT 0, tokens_reasoning INTEGER DEFAULT 0,
      tokens_cache_read INTEGER DEFAULT 0, tokens_cache_write INTEGER DEFAULT 0,
      time_created INTEGER NOT NULL
    )`)
    const now = Date.now()
    db.run(`INSERT INTO session VALUES (?,?,?,?,?,?,?,?,?,?,?,?)`, [
      "s1",
      "QA test",
      null,
      '{"id":"DeepSeek-V4"}',
      "/p/a",
      0.1,
      5000,
      100,
      0,
      0,
      0,
      now - 2000,
    ])
    db.run(`INSERT INTO session VALUES (?,?,?,?,?,?,?,?,?,?,?,?)`, [
      "s2",
      "Architect review",
      "agent-team-architect",
      '{"id":"MiniMax-M3"}',
      "/p/b",
      0.2,
      8000,
      200,
      0,
      0,
      0,
      now - 1000,
    ])
    db.close()

    const stats = computeStats({ dbPath, windowStart: now - 10000 })
    expect(stats.total.tokens).toBe(13300)
    expect(stats.total.cost).toBe(0.3)
    expect(Object.keys(stats.byModel)).toHaveLength(2)
    expect(stats.byRole["qa"].sessions).toBe(1)
    expect(stats.byRole["architect"].sessions).toBe(1)
    expect(Object.keys(stats.byDay)).toHaveLength(1)

    fs.rmSync(tmpDir, { recursive: true, force: true })
  })
})

describe("token-cost writeStats", () => {
  it("writes stats.json to the project directory", () => {
    const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "tc-test-"))
    const dbPath = path.join(tmpDir, "test.db")
    const db = new Database(dbPath)
    db.run(`CREATE TABLE session (
      id TEXT PRIMARY KEY, title TEXT, agent TEXT, model TEXT, directory TEXT,
      cost REAL DEFAULT 0, tokens_input INTEGER DEFAULT 0,
      tokens_output INTEGER DEFAULT 0, tokens_reasoning INTEGER DEFAULT 0,
      tokens_cache_read INTEGER DEFAULT 0, tokens_cache_write INTEGER DEFAULT 0,
      time_created INTEGER NOT NULL
    )`)
    db.close()

    const projectRoot = path.join(tmpDir, "project")
    const result = writeStats(projectRoot, { dbPath, windowStart: 0 })
    expect(result).not.toBeNull()
    expect(result!.total.tokens).toBe(0)

    const statsPath = path.join(projectRoot, ".aiplus", "token-cost", "stats.json")
    expect(fs.existsSync(statsPath)).toBe(true)

    fs.rmSync(tmpDir, { recursive: true, force: true })
  })

  it("does not throw on write failure (fire-and-forget)", () => {
    // Use a file as directory to force failure
    const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "tc-test-"))
    const badRoot = path.join(tmpDir, "not-a-dir")
    fs.writeFileSync(badRoot, "blocking")
    expect(() => writeStats(badRoot, { windowStart: 0 })).not.toThrow()
    fs.rmSync(tmpDir, { recursive: true, force: true })
  })
})
