/**
 * Agent Performance — Pricing Tests (V1)
 */

import { describe, it, expect, beforeEach, afterEach } from "bun:test"
import * as fs from "node:fs"
import * as path from "node:path"
import * as os from "node:os"
import { estimateCostUSD, suggestCostEstimate } from "./pricing"
import { appendPerformanceStart, appendPerformanceComplete } from "./record"

function seedPair(
  dir: string,
  sessionId: string,
  opts: { role?: string; taskType?: string; costUSD?: number },
) {
  appendPerformanceStart({
    projectRoot: dir, sessionId, role: opts.role ?? "engineer",
    agentName: "test", modelId: "m", taskType: opts.taskType ?? "feat", taskSummary: "t",
  })
  appendPerformanceComplete({
    projectRoot: dir, sessionId, actualMs: 1000, tokensIn: 100,
    tokensOut: 50, costUSD: opts.costUSD ?? 0.01, outcome: "success",
    linesChanged: 10, filesChanged: 1,
  })
}

describe("agent-performance pricing", () => {
  let tmpDir: string

  beforeEach(() => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "aiplus-perf-pricing-"))
  })

  afterEach(() => {
    fs.rmSync(tmpDir, { recursive: true, force: true })
  })

  it("known model → correct USD", () => {
    const cost = estimateCostUSD("claude-sonnet-4-20250514", 10000, 5000)
    expect(cost).toBe(10000 / 1000 * 0.003 + 5000 / 1000 * 0.015)
  })

  it("unknown model → returns 0", () => {
    expect(estimateCostUSD("unknown-model", 10000, 5000)).toBe(0)
  })

  it("zero tokens → returns 0", () => {
    expect(estimateCostUSD("gpt-4o", 0, 0)).toBe(0)
  })

  it("suggestCostEstimate with < 5 cost records → null", () => {
    for (let i = 0; i < 4; i++) {
      seedPair(tmpDir, `s${i}`, { costUSD: 0.1 })
    }
    expect(suggestCostEstimate(tmpDir, "engineer", "feat")).toBeNull()
  })

  it("suggestCostEstimate with ≥ 5 cost records → correct p50/p90", () => {
    const costs = [0.01, 0.02, 0.03, 0.04, 0.05, 0.06, 0.07, 0.08, 0.09, 0.10]
    for (let i = 0; i < costs.length; i++) {
      seedPair(tmpDir, `s${i}`, { costUSD: costs[i] })
    }
    const result = suggestCostEstimate(tmpDir, "engineer", "feat")
    expect(result).not.toBeNull()
    expect(result!.count).toBe(10)
    expect(result!.p50).toBe(0.06)
    expect(result!.p90).toBe(0.09)
  })
})
