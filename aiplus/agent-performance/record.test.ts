/**
 * Agent Performance — Record Tests (V1)
 */

import { describe, it, expect, beforeEach, afterEach } from "bun:test"
import * as fs from "node:fs"
import * as path from "node:path"
import * as os from "node:os"
import { appendPerformanceStart, appendPerformanceComplete } from "./record"

describe("agent-performance record", () => {
  let tmpDir: string

  beforeEach(() => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "aiplus-perf-test-"))
  })

  afterEach(() => {
    fs.rmSync(tmpDir, { recursive: true, force: true })
  })

  it("start record writes with correct fields", () => {
    appendPerformanceStart({
      projectRoot: tmpDir,
      sessionId: "ses-001",
      role: "engineer-a",
      agentName: "claude-sonnet",
      modelId: "claude-sonnet-4-20250514",
      taskType: "feat",
      taskSummary: "Add performance tracking",
    })

    const filePath = path.join(tmpDir, ".aiplus/agent-performance/performance.jsonl")
    expect(fs.existsSync(filePath)).toBe(true)

    const entry = JSON.parse(fs.readFileSync(filePath, "utf-8").trim())
    expect(entry.phase).toBe("start")
    expect(entry.sessionId).toBe("ses-001")
    expect(entry.role).toBe("engineer-a")
    expect(entry.agentName).toBe("claude-sonnet")
    expect(entry.modelId).toBe("claude-sonnet-4-20250514")
    expect(entry.taskType).toBe("feat")
    expect(entry.actualMs).toBe(0)
    expect(entry.tokensIn).toBe(0)
    expect(entry.costUSD).toBe(0)
    expect(entry.schemaVersion).toBe("1.1.0")
    expect(entry.timestamp).toBeDefined()
  })

  it("complete record writes with correct fields", () => {
    appendPerformanceComplete({
      projectRoot: tmpDir,
      sessionId: "ses-002",
      actualMs: 420000,
      tokensIn: 15000,
      tokensOut: 3000,
      costUSD: 0.165,
      outcome: "success",
      linesChanged: 120,
      filesChanged: 5,
    })

    const filePath = path.join(tmpDir, ".aiplus/agent-performance/performance.jsonl")
    const entry = JSON.parse(fs.readFileSync(filePath, "utf-8").trim())
    expect(entry.phase).toBe("complete")
    expect(entry.sessionId).toBe("ses-002")
    expect(entry.actualMs).toBe(420000)
    expect(entry.tokensIn).toBe(15000)
    expect(entry.tokensOut).toBe(3000)
    expect(entry.costUSD).toBe(0.165)
    expect(entry.outcome).toBe("success")
    expect(entry.linesChanged).toBe(120)
    expect(entry.filesChanged).toBe(5)
    expect(entry.role).toBe("")
    expect(entry.modelId).toBe("")
  })

  it("hash chain: complete.prev_hash equals start.entry_hash", () => {
    appendPerformanceStart({
      projectRoot: tmpDir,
      sessionId: "ses-003",
      role: "engineer-a",
      agentName: "test",
      modelId: "gpt-4o",
      taskType: "fix",
      taskSummary: "fix bug",
    })
    appendPerformanceComplete({
      projectRoot: tmpDir,
      sessionId: "ses-003",
      actualMs: 1000,
      tokensIn: 100,
      tokensOut: 50,
      costUSD: 0.01,
      outcome: "success",
      linesChanged: 10,
      filesChanged: 1,
    })

    const filePath = path.join(tmpDir, ".aiplus/agent-performance/performance.jsonl")
    const lines = fs.readFileSync(filePath, "utf-8").trim().split("\n")
    expect(lines.length).toBe(2)

    const start = JSON.parse(lines[0])
    const complete = JSON.parse(lines[1])
    expect(complete.prev_hash).toBe(start.entry_hash)
    expect(start.prev_hash).toBe("genesis")
  })

  it("taskSummary truncated to 200 chars", () => {
    const longSummary = "a".repeat(300)
    appendPerformanceStart({
      projectRoot: tmpDir,
      sessionId: "ses-004",
      role: "engineer-a",
      agentName: "test",
      modelId: "gpt-4o",
      taskType: "feat",
      taskSummary: longSummary,
    })

    const filePath = path.join(tmpDir, ".aiplus/agent-performance/performance.jsonl")
    const entry = JSON.parse(fs.readFileSync(filePath, "utf-8").trim())
    expect(entry.taskSummary.length).toBe(200)
    expect(entry.taskSummary.endsWith("...")).toBe(true)
  })

  it("fire-and-forget: bad path does not throw", () => {
    const badRoot = path.join(tmpDir, "file-not-dir")
    fs.writeFileSync(badRoot, "blocking")

    expect(() => {
      appendPerformanceStart({
        projectRoot: badRoot,
        sessionId: "ses-bad",
        role: "test",
        agentName: "test",
        modelId: "gpt-4o",
        taskType: "feat",
        taskSummary: "test",
      })
    }).not.toThrow()

    expect(() => {
      appendPerformanceComplete({
        projectRoot: badRoot,
        sessionId: "ses-bad",
        actualMs: 100,
        tokensIn: 10,
        tokensOut: 5,
        costUSD: 0.001,
        outcome: "failed",
        linesChanged: 0,
        filesChanged: 0,
      })
    }).not.toThrow()
  })
})
