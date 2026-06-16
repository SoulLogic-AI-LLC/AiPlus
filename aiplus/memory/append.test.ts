/**
 * Agent Memory — Tests (V2)
 */

import { describe, it, expect, beforeEach, afterEach } from "bun:test"
import * as fs from "node:fs"
import * as path from "node:path"
import * as os from "node:os"
import { appendMemoryEntry, appendTeamEntry, appendProjectEntry } from "./append"
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

    it("redacts secrets in task field", () => {
      appendMemoryEntry({
        projectRoot: tmpDir,
        sessionId: "session-secret",
        role: "engineer-a",
        startedAt: "2026-06-13T10:00:00Z",
        endedAt: "2026-06-13T10:30:00Z",
        task: "deploy with token=ghp_secret123456 to prod",
        outcome: "success",
      })

      const filePath = path.join(tmpDir, ".aiplus/agent-memory/engineer-a/memory.jsonl")
      const lines = fs.readFileSync(filePath, "utf-8").trim().split("\n")
      const entry = JSON.parse(lines[lines.length - 1])
      expect(entry.task).toContain("[REDACTED_TOKEN]")
      expect(entry.task).not.toContain("ghp_")
    })
  })

  // ---- Team (V2) -----------------------------------------------------------

  describe("appendTeamEntry", () => {
    it("creates _team/memory.jsonl with correct fields", () => {
      appendTeamEntry({
        projectRoot: tmpDir,
        id: "team-001",
        subject: "blocker",
        summary: "OOM on 16GB Mac when 4+ opencode sessions active",
        source: "ceo",
        tags: ["oom", "16gb", "sessions"],
      })

      const filePath = path.join(tmpDir, ".aiplus/agent-memory/_team/memory.jsonl")
      expect(fs.existsSync(filePath)).toBe(true)

      const entry = JSON.parse(fs.readFileSync(filePath, "utf-8").trim())
      expect(entry.id).toBe("team-001")
      expect(entry.subject).toBe("blocker")
      expect(entry.source).toBe("ceo")
      expect(entry.confidence).toBe("owner_asserted")
      expect(entry.status).toBe("active")
      expect(entry.tags).toEqual(["oom", "16gb", "sessions"])
      expect(entry.schemaVersion).toBe("0.2.1")
    })

    it("appends multiple team entries", () => {
      appendTeamEntry({ projectRoot: tmpDir, id: "t1", subject: "s1", summary: "a", source: "ceo" })
      appendTeamEntry({ projectRoot: tmpDir, id: "t2", subject: "s2", summary: "b", source: "advisor" })

      const filePath = path.join(tmpDir, ".aiplus/agent-memory/_team/memory.jsonl")
      const lines = fs.readFileSync(filePath, "utf-8").trim().split("\n")
      expect(lines.length).toBe(2)
    })

    it("redacts secrets in team summaries", () => {
      appendTeamEntry({
        projectRoot: tmpDir,
        id: "team-secret",
        subject: "leak",
        summary: "api_key=sk-live-abc123 was exposed in dispatch log",
        source: "security-reviewer",
      })

      const filePath = path.join(tmpDir, ".aiplus/agent-memory/_team/memory.jsonl")
      const entry = JSON.parse(fs.readFileSync(filePath, "utf-8").trim())
      expect(entry.summary).toContain("[REDACTED")
      expect(entry.summary).not.toContain("sk-live")
    })

    it("includes supersedes and new fields in team entry", () => {
      appendTeamEntry({
        projectRoot: tmpDir,
        id: "team-sup",
        subject: "replaces",
        summary: "this supersedes old",
        source: "advisor",
        supersedes: ["old-team-001"],
      })

      const filePath = path.join(tmpDir, ".aiplus/agent-memory/_team/memory.jsonl")
      const entry = JSON.parse(fs.readFileSync(filePath, "utf-8").trim())
      expect(entry.supersedes).toEqual(["old-team-001"])
      expect(entry.supersededBy).toEqual([])
      expect(entry.conflictGroup).toBeNull()
      expect(entry.expiresAt).toBeNull()
      expect(entry.staleAfter).toBeNull()
    })
  })

  // ---- Project (V2) --------------------------------------------------------

  describe("appendProjectEntry", () => {
    it("creates project/memory.jsonl", () => {
      appendProjectEntry({
        projectRoot: tmpDir,
        key: "preferred_runtime",
        value: "opencode",
        source: "owner",
      })

      const filePath = path.join(tmpDir, ".aiplus/agent-memory/project/memory.jsonl")
      expect(fs.existsSync(filePath)).toBe(true)

      const entry = JSON.parse(fs.readFileSync(filePath, "utf-8").trim())
      expect(entry.key).toBe("preferred_runtime")
      expect(entry.value).toBe("opencode")
      expect(entry.source).toBe("owner")
      expect(entry.schemaVersion).toBe("0.2.1")
    })

    it("redacts secrets in project values", () => {
      appendProjectEntry({
        projectRoot: tmpDir,
        key: "deploy_token",
        value: "token=ghp_secret123456",
        source: "owner",
      })

      const filePath = path.join(tmpDir, ".aiplus/agent-memory/project/memory.jsonl")
      const lines = fs.readFileSync(filePath, "utf-8").trim().split("\n")
      const entry = JSON.parse(lines[lines.length - 1])
      expect(entry.value).toContain("[REDACTED_TOKEN]")
      expect(entry.value).not.toContain("ghp_")
    })

    it("includes supersedes and new fields in project entry", () => {
      appendProjectEntry({
        projectRoot: tmpDir,
        key: "runtime",
        value: "bun",
        source: "owner",
        supersedes: ["old-runtime-entry"],
      })

      const filePath = path.join(tmpDir, ".aiplus/agent-memory/project/memory.jsonl")
      const entry = JSON.parse(fs.readFileSync(filePath, "utf-8").trim())
      expect(entry.supersedes).toEqual(["old-runtime-entry"])
      expect(entry.supersededBy).toEqual([])
      expect(entry.conflictGroup).toBeNull()
      expect(entry.expiresAt).toBeNull()
      expect(entry.staleAfter).toBeNull()
    })
  })
})
