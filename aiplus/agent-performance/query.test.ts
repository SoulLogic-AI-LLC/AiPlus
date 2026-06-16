/**
 * Agent Performance — Query Tests (V1)
 */

import { describe, it, expect, beforeEach, afterEach } from "bun:test"
import * as fs from "node:fs"
import * as path from "node:path"
import * as os from "node:os"
import { queryPerformance } from "./query"
import { appendPerformanceStart, appendPerformanceComplete } from "./record"

describe("agent-performance query", () => {
  let tmpDir: string

  beforeEach(() => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "aiplus-perf-query-"))
  })

  afterEach(() => {
    fs.rmSync(tmpDir, { recursive: true, force: true })
  })

  it("missing file → []", () => {
    const result = queryPerformance({ projectRoot: tmpDir })
    expect(result).toEqual([])
  })

  it("skips malformed lines", () => {
    const filePath = path.join(tmpDir, ".aiplus/agent-performance")
    fs.mkdirSync(filePath, { recursive: true })
    fs.writeFileSync(
      path.join(filePath, "performance.jsonl"),
      '{"phase":"start","sessionId":"s1","schemaVersion":"1.0.0","timestamp":"2026-01-01","role":"r","agentName":"a","modelId":"m","taskType":"t","taskSummary":"s","estimatedMs":null,"actualMs":0,"tokensIn":0,"tokensOut":0,"costUSD":0,"outcome":"success","linesChanged":0,"filesChanged":0}\nnot json\n{"phase":"complete","sessionId":"s1","schemaVersion":"1.0.0","timestamp":"2026-01-01","role":"","agentName":"","modelId":"","taskType":"","taskSummary":"","estimatedMs":null,"actualMs":1000,"tokensIn":50,"tokensOut":10,"costUSD":0.01,"outcome":"success","linesChanged":5,"filesChanged":1}\n',
    )
    const result = queryPerformance({ projectRoot: tmpDir })
    expect(result).toHaveLength(1)
    expect(result[0].sessionId).toBe("s1")
  })

  it("joins start+complete → merged record with Dim 1-3 from start, Dim 4-7 from complete", () => {
    appendPerformanceStart({
      projectRoot: tmpDir,
      sessionId: "ses-join",
      role: "engineer-a",
      agentName: "claude-sonnet",
      modelId: "claude-sonnet-4-20250514",
      taskType: "feat",
      taskSummary: "Add tracking",
      estimatedMs: 300000,
    })
    appendPerformanceComplete({
      projectRoot: tmpDir,
      sessionId: "ses-join",
      actualMs: 420000,
      tokensIn: 15000,
      tokensOut: 3000,
      costUSD: 0.165,
      outcome: "success",
      linesChanged: 120,
      filesChanged: 5,
    })

    const result = queryPerformance({ projectRoot: tmpDir })
    expect(result).toHaveLength(1)
    const r = result[0]
    // Dim 1-3 from start
    expect(r.role).toBe("engineer-a")
    expect(r.agentName).toBe("claude-sonnet")
    expect(r.modelId).toBe("claude-sonnet-4-20250514")
    expect(r.taskType).toBe("feat")
    expect(r.taskSummary).toBe("Add tracking")
    expect(r.estimatedMs).toBe(300000)
    // Dim 4-7 from complete
    expect(r.actualMs).toBe(420000)
    expect(r.tokensIn).toBe(15000)
    expect(r.tokensOut).toBe(3000)
    expect(r.costUSD).toBe(0.165)
    expect(r.outcome).toBe("success")
    expect(r.linesChanged).toBe(120)
    expect(r.filesChanged).toBe(5)
  })

  it("orphan complete → skipped", () => {
    appendPerformanceComplete({
      projectRoot: tmpDir,
      sessionId: "orphan",
      actualMs: 1000,
      tokensIn: 10,
      tokensOut: 5,
      costUSD: 0.001,
      outcome: "failed",
      linesChanged: 0,
      filesChanged: 0,
    })

    const result = queryPerformance({ projectRoot: tmpDir })
    expect(result).toHaveLength(0)
  })

  it("filter by role", () => {
    appendPerformanceStart({
      projectRoot: tmpDir, sessionId: "s1", role: "engineer-a", agentName: "a",
      modelId: "m", taskType: "feat", taskSummary: "t",
    })
    appendPerformanceComplete({
      projectRoot: tmpDir, sessionId: "s1", actualMs: 100, tokensIn: 10,
      tokensOut: 5, costUSD: 0.01, outcome: "success", linesChanged: 1, filesChanged: 1,
    })
    appendPerformanceStart({
      projectRoot: tmpDir, sessionId: "s2", role: "reviewer", agentName: "b",
      modelId: "m", taskType: "fix", taskSummary: "t2",
    })
    appendPerformanceComplete({
      projectRoot: tmpDir, sessionId: "s2", actualMs: 200, tokensIn: 20,
      tokensOut: 10, costUSD: 0.02, outcome: "success", linesChanged: 2, filesChanged: 1,
    })

    const result = queryPerformance({ projectRoot: tmpDir, role: "engineer-a" })
    expect(result).toHaveLength(1)
    expect(result[0].role).toBe("engineer-a")
  })

  it("filter by modelId", () => {
    appendPerformanceStart({
      projectRoot: tmpDir, sessionId: "s1", role: "r", agentName: "a",
      modelId: "gpt-4o", taskType: "feat", taskSummary: "t",
    })
    appendPerformanceComplete({
      projectRoot: tmpDir, sessionId: "s1", actualMs: 100, tokensIn: 10,
      tokensOut: 5, costUSD: 0.01, outcome: "success", linesChanged: 1, filesChanged: 1,
    })
    appendPerformanceStart({
      projectRoot: tmpDir, sessionId: "s2", role: "r", agentName: "a",
      modelId: "claude-sonnet-4-20250514", taskType: "feat", taskSummary: "t",
    })
    appendPerformanceComplete({
      projectRoot: tmpDir, sessionId: "s2", actualMs: 200, tokensIn: 20,
      tokensOut: 10, costUSD: 0.02, outcome: "success", linesChanged: 2, filesChanged: 1,
    })

    const result = queryPerformance({ projectRoot: tmpDir, modelId: "gpt-4o" })
    expect(result).toHaveLength(1)
    expect(result[0].modelId).toBe("gpt-4o")
  })

  it("filter by taskType", () => {
    appendPerformanceStart({
      projectRoot: tmpDir, sessionId: "s1", role: "r", agentName: "a",
      modelId: "m", taskType: "feat", taskSummary: "t",
    })
    appendPerformanceComplete({
      projectRoot: tmpDir, sessionId: "s1", actualMs: 100, tokensIn: 10,
      tokensOut: 5, costUSD: 0.01, outcome: "success", linesChanged: 1, filesChanged: 1,
    })
    appendPerformanceStart({
      projectRoot: tmpDir, sessionId: "s2", role: "r", agentName: "a",
      modelId: "m", taskType: "fix", taskSummary: "t",
    })
    appendPerformanceComplete({
      projectRoot: tmpDir, sessionId: "s2", actualMs: 200, tokensIn: 20,
      tokensOut: 10, costUSD: 0.02, outcome: "success", linesChanged: 2, filesChanged: 1,
    })

    const result = queryPerformance({ projectRoot: tmpDir, taskType: "fix" })
    expect(result).toHaveLength(1)
    expect(result[0].taskType).toBe("fix")
  })
})
