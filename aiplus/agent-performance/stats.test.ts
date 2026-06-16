/**
 * Agent Performance — Stats Tests (V1)
 */

import { describe, it, expect, beforeEach, afterEach } from "bun:test"
import * as fs from "node:fs"
import * as path from "node:path"
import * as os from "node:os"
import { computePerformanceStats } from "./stats"
import { appendPerformanceStart, appendPerformanceComplete } from "./record"

function seedPair(
  dir: string,
  sessionId: string,
  opts: { role?: string; modelId?: string; taskType?: string; actualMs?: number; costUSD?: number; outcome?: "success" | "failed" | "canceled"; linesChanged?: number },
) {
  appendPerformanceStart({
    projectRoot: dir, sessionId, role: opts.role ?? "engineer",
    agentName: "test", modelId: opts.modelId ?? "m", taskType: opts.taskType ?? "feat", taskSummary: "t",
  })
  appendPerformanceComplete({
    projectRoot: dir, sessionId, actualMs: opts.actualMs ?? 1000, tokensIn: 100,
    tokensOut: 50, costUSD: opts.costUSD ?? 0.01, outcome: opts.outcome ?? "success",
    linesChanged: opts.linesChanged ?? 10, filesChanged: 1,
  })
}

describe("agent-performance stats", () => {
  let tmpDir: string

  beforeEach(() => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "aiplus-perf-stats-"))
  })

  afterEach(() => {
    fs.rmSync(tmpDir, { recursive: true, force: true })
  })

  it("empty data → empty stats", () => {
    const stats = computePerformanceStats({ projectRoot: tmpDir })
    expect(Object.keys(stats.byRole)).toHaveLength(0)
    expect(Object.keys(stats.byModel)).toHaveLength(0)
    expect(Object.keys(stats.byTaskType)).toHaveLength(0)
    expect(Object.keys(stats.costByRole)).toHaveLength(0)
    expect(Object.keys(stats.passRateByRole)).toHaveLength(0)
    expect(Object.keys(stats.sizeByTaskType)).toHaveLength(0)
  })

  it("group by role → correct DimensionStats per role", () => {
    seedPair(tmpDir, "s1", { role: "engineer", actualMs: 1000, costUSD: 0.01 })
    seedPair(tmpDir, "s2", { role: "engineer", actualMs: 3000, costUSD: 0.03 })
    seedPair(tmpDir, "s3", { role: "reviewer", actualMs: 2000, costUSD: 0.02 })

    const stats = computePerformanceStats({ projectRoot: tmpDir })
    expect(stats.byRole["engineer"].count).toBe(2)
    expect(stats.byRole["reviewer"].count).toBe(1)
    expect(stats.costByRole["engineer"].count).toBe(2)
  })

  it("group by model → correct per model", () => {
    seedPair(tmpDir, "s1", { modelId: "gpt-4o", actualMs: 1000, costUSD: 0.01 })
    seedPair(tmpDir, "s2", { modelId: "gpt-4o", actualMs: 2000, costUSD: 0.02 })
    seedPair(tmpDir, "s3", { modelId: "claude", actualMs: 500, costUSD: 0.005 })

    const stats = computePerformanceStats({ projectRoot: tmpDir })
    expect(stats.byModel["gpt-4o"].count).toBe(2)
    expect(stats.byModel["claude"].count).toBe(1)
  })

  it("p50/p90 correct for [10,20,30,40,50,60,70,80,90,100] → p50=60, p90=90", () => {
    const values = [10, 20, 30, 40, 50, 60, 70, 80, 90, 100]
    for (let i = 0; i < values.length; i++) {
      seedPair(tmpDir, `s${i}`, { actualMs: values[i] })
    }

    const stats = computePerformanceStats({ projectRoot: tmpDir })
    expect(stats.byRole["engineer"].p50).toBe(60)
    expect(stats.byRole["engineer"].p90).toBe(90)
  })

  it("passRate correct: 3 success + 1 failed → 0.75", () => {
    seedPair(tmpDir, "s1", { outcome: "success" })
    seedPair(tmpDir, "s2", { outcome: "success" })
    seedPair(tmpDir, "s3", { outcome: "success" })
    seedPair(tmpDir, "s4", { outcome: "failed" })

    const stats = computePerformanceStats({ projectRoot: tmpDir })
    expect(stats.passRateByRole["engineer"]).toBe(0.75)
  })

  it("zeros filtered from percentile computation", () => {
    seedPair(tmpDir, "s1", { actualMs: 0 })
    seedPair(tmpDir, "s2", { actualMs: 100 })
    seedPair(tmpDir, "s3", { actualMs: 200 })

    const stats = computePerformanceStats({ projectRoot: tmpDir })
    expect(stats.byRole["engineer"].count).toBe(2)
    expect(stats.byRole["engineer"].p50).toBe(200)
  })
})
