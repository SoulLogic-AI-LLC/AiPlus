/**
 * Agent Performance — Query Tests (V1)
 */

import { describe, it, expect, beforeEach, afterEach } from "bun:test"
import * as fs from "node:fs"
import * as path from "node:path"
import * as os from "node:os"
import { queryPerformance, queryByRole, queryBudget, queryRecent } from "./query"
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

describe("agent-performance amtp query functions", () => {
  let tmpDir: string

  beforeEach(() => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "aiplus-perf-amtp-"))
  })

  afterEach(() => {
    fs.rmSync(tmpDir, { recursive: true, force: true })
  })

  function seed(dir: string, sessionId: string, role: string, taskType: string, modelId: string, actualMs: number, tokensIn: number, tokensOut: number, costUSD: number, outcome: "success" | "failed" = "success") {
    appendPerformanceStart({
      projectRoot: dir,
      sessionId,
      role,
      agentName: "agent",
      modelId,
      taskType,
      taskSummary: `task for ${sessionId}`,
    })
    appendPerformanceComplete({
      projectRoot: dir,
      sessionId,
      actualMs,
      tokensIn,
      tokensOut,
      costUSD,
      outcome,
      linesChanged: 1,
      filesChanged: 1,
    })
  }

  it("queryByRole returns per-model groups from a seeded fixture with 2 models and 4 records", () => {
    seed(tmpDir, "s1", "engineer-a", "feat", "model-A", 1000, 100, 50, 0.01)
    seed(tmpDir, "s2", "engineer-a", "feat", "model-A", 2000, 200, 80, 0.02)
    seed(tmpDir, "s3", "engineer-a", "feat", "model-B", 3000, 300, 120, 0.03, "failed")
    seed(tmpDir, "s4", "engineer-a", "feat", "model-B", 4000, 400, 160, 0.04)

    const result = queryByRole("engineer-a", "feat", { projectRoot: tmpDir })
    expect(result.role).toBe("engineer-a")
    expect(result.taskType).toBe("feat")
    expect(result.totalSamples).toBe(4)
    expect(result.byModel).toHaveLength(2)

    const a = result.byModel.find((m) => m.modelId === "model-A")
    const b = result.byModel.find((m) => m.modelId === "model-B")
    expect(a).toBeDefined()
    expect(b).toBeDefined()
    expect(a!.count).toBe(2)
    expect(a!.successRate).toBe(1)
    expect(a!.p50Ms).toBe(2000)
    expect(a!.p50TokensIn).toBe(200)
    expect(a!.p50TokensOut).toBe(80)
    expect(b!.count).toBe(2)
    expect(b!.successRate).toBe(0.5)
  })

  it("queryByRole returns totalSamples and recent (last 5 of role+taskType)", () => {
    for (let i = 0; i < 7; i++) {
      seed(tmpDir, `s${i}`, "engineer-a", "feat", "model-A", 1000 + i, 100 + i, 50 + i, 0.01)
    }
    seed(tmpDir, "noise", "engineer-a", "fix", "model-A", 9999, 9999, 9999, 0.99)

    const result = queryByRole("engineer-a", "feat", { projectRoot: tmpDir })
    expect(result.totalSamples).toBe(7)
    expect(result.recent).toHaveLength(5)
    expect(result.recent[0].sessionId).toBe("s6")
    expect(result.recent[4].sessionId).toBe("s2")
  })

  it("queryByRole with no matches returns totalSamples: 0, empty byModel, empty recent", () => {
    seed(tmpDir, "s1", "engineer-a", "feat", "model-A", 1000, 100, 50, 0.01)
    const result = queryByRole("nonexistent", "nonexistent", { projectRoot: tmpDir })
    expect(result.totalSamples).toBe(0)
    expect(result.byModel).toEqual([])
    expect(result.recent).toEqual([])
  })

  it("queryBudget for a given date aggregates tokens/cost grouped by role and model", () => {
    const date = "2026-06-01"
    const filePath = path.join(tmpDir, ".aiplus/agent-performance")
    fs.mkdirSync(filePath, { recursive: true })
    const records = [
      { phase: "start", sessionId: "b1", schemaVersion: "1.0.0", timestamp: `${date}T01:00:00.000Z`, role: "engineer-a", agentName: "a", modelId: "model-A", taskType: "feat", taskSummary: "t", estimatedMs: null, actualMs: 0, tokensIn: 0, tokensOut: 0, costUSD: 0, outcome: "success", linesChanged: 0, filesChanged: 0 },
      { phase: "complete", sessionId: "b1", schemaVersion: "1.0.0", timestamp: `${date}T01:30:00.000Z`, role: "", agentName: "", modelId: "", taskType: "", taskSummary: "", estimatedMs: null, actualMs: 1000, tokensIn: 100, tokensOut: 50, costUSD: 0.10, outcome: "success", linesChanged: 1, filesChanged: 1 },
      { phase: "start", sessionId: "b2", schemaVersion: "1.0.0", timestamp: `${date}T02:00:00.000Z`, role: "engineer-b", agentName: "a", modelId: "model-B", taskType: "fix", taskSummary: "t", estimatedMs: null, actualMs: 0, tokensIn: 0, tokensOut: 0, costUSD: 0, outcome: "success", linesChanged: 0, filesChanged: 0 },
      { phase: "complete", sessionId: "b2", schemaVersion: "1.0.0", timestamp: `${date}T02:30:00.000Z`, role: "", agentName: "", modelId: "", taskType: "", taskSummary: "", estimatedMs: null, actualMs: 2000, tokensIn: 200, tokensOut: 80, costUSD: 0.20, outcome: "success", linesChanged: 1, filesChanged: 1 },
    ]
    fs.writeFileSync(path.join(filePath, "performance.jsonl"), records.map((r) => JSON.stringify(r)).join("\n") + "\n")

    const result = queryBudget(date, { projectRoot: tmpDir })
    expect(result.date).toBe(date)
    expect(result.totals.tokensIn).toBe(300)
    expect(result.totals.tokensOut).toBe(130)
    expect(result.totals.costUSD).toBeCloseTo(0.30, 5)
    expect(result.totals.sessions).toBe(2)
    expect(result.byRole["engineer-a"].tokensIn).toBe(100)
    expect(result.byRole["engineer-a"].costUSD).toBeCloseTo(0.10, 5)
    expect(result.byRole["engineer-b"].tokensIn).toBe(200)
    expect(result.byModel["model-A"].tokensIn).toBe(100)
    expect(result.byModel["model-B"].tokensIn).toBe(200)
  })

  it("queryBudget defaults to today UTC when no date arg", () => {
    const today = new Date().toISOString().slice(0, 10)
    const filePath = path.join(tmpDir, ".aiplus/agent-performance")
    fs.mkdirSync(filePath, { recursive: true })
    const records = [
      { phase: "start", sessionId: "td1", schemaVersion: "1.0.0", timestamp: `${today}T03:00:00.000Z`, role: "engineer-a", agentName: "a", modelId: "model-A", taskType: "feat", taskSummary: "t", estimatedMs: null, actualMs: 0, tokensIn: 0, tokensOut: 0, costUSD: 0, outcome: "success", linesChanged: 0, filesChanged: 0 },
      { phase: "complete", sessionId: "td1", schemaVersion: "1.0.0", timestamp: `${today}T03:30:00.000Z`, role: "", agentName: "", modelId: "", taskType: "", taskSummary: "", estimatedMs: null, actualMs: 1000, tokensIn: 50, tokensOut: 25, costUSD: 0.05, outcome: "success", linesChanged: 1, filesChanged: 1 },
    ]
    fs.writeFileSync(path.join(filePath, "performance.jsonl"), records.map((r) => JSON.stringify(r)).join("\n") + "\n")

    const result = queryBudget(undefined, { projectRoot: tmpDir })
    expect(result.date).toBe(today)
    expect(result.totals.sessions).toBe(1)
  })

  it("queryBudget excludes records from a different date", () => {
    const target = "2026-06-01"
    const other = "2026-06-02"
    const filePath = path.join(tmpDir, ".aiplus/agent-performance")
    fs.mkdirSync(filePath, { recursive: true })
    const records = [
      { phase: "start", sessionId: "d1", schemaVersion: "1.0.0", timestamp: `${target}T05:00:00.000Z`, role: "engineer-a", agentName: "a", modelId: "model-A", taskType: "feat", taskSummary: "t", estimatedMs: null, actualMs: 0, tokensIn: 0, tokensOut: 0, costUSD: 0, outcome: "success", linesChanged: 0, filesChanged: 0 },
      { phase: "complete", sessionId: "d1", schemaVersion: "1.0.0", timestamp: `${target}T05:30:00.000Z`, role: "", agentName: "", modelId: "", taskType: "", taskSummary: "", estimatedMs: null, actualMs: 1000, tokensIn: 100, tokensOut: 50, costUSD: 0.10, outcome: "success", linesChanged: 1, filesChanged: 1 },
      { phase: "start", sessionId: "d2", schemaVersion: "1.0.0", timestamp: `${other}T05:00:00.000Z`, role: "engineer-a", agentName: "a", modelId: "model-A", taskType: "feat", taskSummary: "t", estimatedMs: null, actualMs: 0, tokensIn: 0, tokensOut: 0, costUSD: 0, outcome: "success", linesChanged: 0, filesChanged: 0 },
      { phase: "complete", sessionId: "d2", schemaVersion: "1.0.0", timestamp: `${other}T05:30:00.000Z`, role: "", agentName: "", modelId: "", taskType: "", taskSummary: "", estimatedMs: null, actualMs: 2000, tokensIn: 200, tokensOut: 80, costUSD: 0.20, outcome: "success", linesChanged: 1, filesChanged: 1 },
    ]
    fs.writeFileSync(path.join(filePath, "performance.jsonl"), records.map((r) => JSON.stringify(r)).join("\n") + "\n")

    const result = queryBudget(target, { projectRoot: tmpDir })
    expect(result.totals.sessions).toBe(1)
    expect(result.totals.costUSD).toBeCloseTo(0.10, 5)
    expect(result.totals.tokensIn).toBe(100)
  })

  it("queryRecent(3) returns 3 records sorted by timestamp desc", () => {
    seed(tmpDir, "r1", "engineer-a", "feat", "model-A", 1000, 100, 50, 0.01)
    seed(tmpDir, "r2", "engineer-a", "feat", "model-A", 1000, 100, 50, 0.01)
    seed(tmpDir, "r3", "engineer-a", "feat", "model-A", 1000, 100, 50, 0.01)
    seed(tmpDir, "r4", "engineer-a", "feat", "model-A", 1000, 100, 50, 0.01)
    seed(tmpDir, "r5", "engineer-a", "feat", "model-A", 1000, 100, 50, 0.01)

    const result = queryRecent(3, { projectRoot: tmpDir })
    expect(result).toHaveLength(3)
    expect(result[0].sessionId).toBe("r5")
    expect(result[1].sessionId).toBe("r4")
    expect(result[2].sessionId).toBe("r3")
  })

  it("queryRecent() defaults to 10", () => {
    for (let i = 0; i < 12; i++) {
      seed(tmpDir, `d${i}`, "engineer-a", "feat", "model-A", 1000, 100, 50, 0.01)
    }
    const result = queryRecent(undefined, { projectRoot: tmpDir })
    expect(result).toHaveLength(10)
    expect(result[0].sessionId).toBe("d11")
    expect(result[9].sessionId).toBe("d2")
  })
})
