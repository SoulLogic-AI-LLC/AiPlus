/**
 * Agent Memory — Read Layer Tests
 */

import { describe, it, expect, beforeEach, afterEach } from "bun:test"
import * as fs from "node:fs"
import * as path from "node:path"
import * as os from "node:os"
import { appendTeamEntry } from "./append"
import { readActive, readAll, findById, findByQuery } from "./read"

describe("read layer", () => {
  let tmpDir: string

  beforeEach(() => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "aiplus-read-test-"))
  })

  afterEach(() => {
    fs.rmSync(tmpDir, { recursive: true, force: true })
  })

  it("readActive filters out superseded entries", () => {
    appendTeamEntry({ projectRoot: tmpDir, id: "t1", subject: "s1", summary: "active one", source: "a" })
    appendTeamEntry({ projectRoot: tmpDir, id: "t2", subject: "s2", summary: "also active", source: "b" })
    appendTeamEntry({ projectRoot: tmpDir, id: "t3", subject: "s3", summary: "gone", source: "c", status: "superseded" })

    const all = readAll(tmpDir, "team")
    expect(all.length).toBe(3)

    const active = readActive(tmpDir, "team")
    expect(active.length).toBe(2)
    expect(active.every(e => e.status !== "superseded")).toBe(true)
  })

  it("findById returns entry or null", () => {
    appendTeamEntry({ projectRoot: tmpDir, id: "find-me", subject: "target", summary: "found it", source: "x" })
    appendTeamEntry({ projectRoot: tmpDir, id: "other", subject: "other", summary: "nope", source: "y" })

    const found = findById(tmpDir, "team", "find-me")
    expect(found).not.toBeNull()
    expect(found!.id).toBe("find-me")

    const missing = findById(tmpDir, "team", "does-not-exist")
    expect(missing).toBeNull()
  })

  it("findByQuery is case-insensitive and searches summary/tags", () => {
    appendTeamEntry({ projectRoot: tmpDir, id: "q1", subject: "s", summary: "OOM on Mac", source: "a", tags: ["performance"] })
    appendTeamEntry({ projectRoot: tmpDir, id: "q2", subject: "s", summary: "all good", source: "b", tags: ["oom-fix"] })
    appendTeamEntry({ projectRoot: tmpDir, id: "q3", subject: "s", summary: "nothing here", source: "c", tags: ["other"] })

    const results = findByQuery(tmpDir, "team", "oom")
    expect(results.length).toBe(2)
    expect(results.every((r: any) => r.id === "q1" || r.id === "q2")).toBe(true)
  })

  it("readAll returns empty array for missing file", () => {
    const results = readAll(tmpDir, "project")
    expect(results).toEqual([])
  })
})
