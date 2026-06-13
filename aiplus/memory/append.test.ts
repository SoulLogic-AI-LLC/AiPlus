/**
 * Agent Memory Hook — Tests (V1)
 */

import { describe, it, expect, beforeEach, afterEach } from "bun:test"
import * as fs from "node:fs"
import * as path from "node:path"
import * as os from "node:os"
import { appendMemoryEntry } from "./append"
import { truncateTask } from "./types"

describe("agent-memory", () => {
  let tmpDir: string

  beforeEach(() => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "aiplus-memory-test-"))
  })

  afterEach(() => {
    fs.rmSync(tmpDir, { recursive: true, force: true })
  })

  describe("truncateTask", () => {
    it("returns short task unchanged", () => {
      expect(truncateTask("hello")).toBe("hello")
    })

    it("truncates long task to 200 chars", () => {
      const long = "a".repeat(300)
      const result = truncateTask(long)
      expect(result.length).toBe(200)
      expect(result.endsWith("...")).toBe(true)
    })

    it("respects custom max length", () => {
      expect(truncateTask("abcdef", 4)).toBe("a...")
    })
  })

  describe("appendMemoryEntry", () => {
    it("creates memory.jsonl with correct entry", () => {
      appendMemoryEntry({
        projectRoot: tmpDir,
        sessionId: "session-test-123",
        role: "engineer-a",
        startedAt: "2026-06-13T10:00:00Z",
        endedAt: "2026-06-13T10:30:00Z",
        task: "feat: add persona",
        outcome: "success",
      })

      const filePath = path.join(tmpDir, ".aiplus/agent-memory/engineer-a/memory.jsonl")
      expect(fs.existsSync(filePath)).toBe(true)

      const content = fs.readFileSync(filePath, "utf-8")
      const entry = JSON.parse(content.trim())

      expect(entry.sessionId).toBe("session-test-123")
      expect(entry.role).toBe("engineer-a")
      expect(entry.startedAt).toBe("2026-06-13T10:00:00Z")
      expect(entry.endedAt).toBe("2026-06-13T10:30:00Z")
      expect(entry.durationMs).toBe(1800000)
      expect(entry.task).toBe("feat: add persona")
      expect(entry.outcome).toBe("success")
      expect(entry.schemaVersion).toBe("0.1.0")
      expect(entry.timestamp).toBeDefined()
    })

    it("appends multiple entries to same file", () => {
      const params = {
        projectRoot: tmpDir,
        sessionId: "session-1",
        role: "advisor",
        startedAt: "2026-06-13T10:00:00Z",
        endedAt: "2026-06-13T10:15:00Z",
        task: "review plan",
        outcome: "success" as const,
      }

      appendMemoryEntry(params)
      appendMemoryEntry({ ...params, sessionId: "session-2", task: "second task" })

      const filePath = path.join(tmpDir, ".aiplus/agent-memory/advisor/memory.jsonl")
      const lines = fs.readFileSync(filePath, "utf-8").trim().split("\n")

      expect(lines.length).toBe(2)
      expect(JSON.parse(lines[0]).sessionId).toBe("session-1")
      expect(JSON.parse(lines[1]).sessionId).toBe("session-2")
    })

    it("creates role directory if missing", () => {
      appendMemoryEntry({
        projectRoot: tmpDir,
        sessionId: "session-new",
        role: "new-role",
        startedAt: "2026-06-13T10:00:00Z",
        endedAt: "2026-06-13T10:05:00Z",
        task: "test",
        outcome: "success",
      })

      const dirPath = path.join(tmpDir, ".aiplus/agent-memory/new-role")
      expect(fs.existsSync(dirPath)).toBe(true)
    })

    it("handles empty task gracefully", () => {
      appendMemoryEntry({
        projectRoot: tmpDir,
        sessionId: "session-empty",
        role: "qa",
        startedAt: "2026-06-13T10:00:00Z",
        endedAt: "2026-06-13T10:01:00Z",
        task: "",
        outcome: "failed",
      })

      const filePath = path.join(tmpDir, ".aiplus/agent-memory/qa/memory.jsonl")
      const entry = JSON.parse(fs.readFileSync(filePath, "utf-8").trim())
      expect(entry.task).toBe("")
      expect(entry.outcome).toBe("failed")
    })

    it("does not throw on write failure (fire-and-forget)", () => {
      // Use a non-existent root that can't be created (file as directory)
      const badRoot = path.join(tmpDir, "file-not-dir")
      fs.writeFileSync(badRoot, "blocking")

      // Should not throw
      expect(() => {
        appendMemoryEntry({
          projectRoot: badRoot,
          sessionId: "session-bad",
          role: "test",
          startedAt: "2026-06-13T10:00:00Z",
          endedAt: "2026-06-13T10:01:00Z",
          task: "test",
          outcome: "success",
        })
      }).not.toThrow()
    })
  })
})
