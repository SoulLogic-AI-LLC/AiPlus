/**
 * Agent Performance — Query (V1)
 *
 * Reads JSONL performance records, joins start+complete pairs,
 * and applies filters.
 */

import * as fs from "node:fs"
import * as path from "node:path"
import type { PerformanceRecord, PerformanceQuery } from "./types"

const PERF_DIR = ".aiplus/agent-performance"
const PERF_FILE = "performance.jsonl"

function readRecords(projectRoot: string): PerformanceRecord[] {
  const filePath = path.join(projectRoot, PERF_DIR, PERF_FILE)
  if (!fs.existsSync(filePath)) return []
  const content = fs.readFileSync(filePath, "utf-8")
  const lines = content.trim().split("\n").filter((l) => l.length > 0)
  const records: PerformanceRecord[] = []
  for (const line of lines) {
    try {
      const parsed: unknown = JSON.parse(line)
      if (parsed && typeof parsed === "object" && "phase" in parsed && "sessionId" in parsed) {
        records.push(parsed as PerformanceRecord)
      }
    } catch {
      // skip malformed lines
    }
  }
  return records
}

export function queryPerformance(q: PerformanceQuery): PerformanceRecord[] {
  const records = readRecords(q.projectRoot)
  const starts = new Map<string, PerformanceRecord>()
  const completedSessionIds = new Set<string>()
  for (const r of records) {
    if (r.phase === "start") starts.set(r.sessionId, r)
  }
  const merged: PerformanceRecord[] = []
  for (const r of records) {
    if (r.phase !== "complete") continue
    const start = starts.get(r.sessionId)
    if (!start) continue
    completedSessionIds.add(r.sessionId)
    merged.push({
      phase: "complete",
      sessionId: r.sessionId,
      schemaVersion: r.schemaVersion,
      timestamp: r.timestamp,
      // Dim 1-3 from start
      role: start.role,
      agentName: start.agentName,
      modelId: start.modelId,
      taskType: start.taskType,
      taskSummary: start.taskSummary,
      estimatedMs: start.estimatedMs,
      // Dim 4-7 from complete
      actualMs: r.actualMs,
      tokensIn: r.tokensIn,
      tokensOut: r.tokensOut,
      costUSD: r.costUSD,
      outcome: r.outcome,
      linesChanged: r.linesChanged,
      filesChanged: r.filesChanged,
      // Optional fields from complete
      reworkCount: r.reworkCount,
      qualityScore: r.qualityScore,
      errorCount: r.errorCount,
      contextUsagePct: r.contextUsagePct,
      selfCorrected: r.selfCorrected,
      estimateBias: r.estimateBias,
      // Hash chain from complete
      prev_hash: r.prev_hash,
      entry_hash: r.entry_hash,
    })
  }

  // Zombie session handling: start records without matching complete after 24h
  // are treated as implicit failed sessions (CA F2 resolution)
  const ZOMBIE_THRESHOLD_MS = 24 * 60 * 60 * 1000
  const now = Date.now()
  for (const [sessionId, start] of starts) {
    if (completedSessionIds.has(sessionId)) continue
    const age = now - new Date(start.timestamp).getTime()
    if (age > ZOMBIE_THRESHOLD_MS) {
      merged.push({
        ...start,
        phase: "complete",
        actualMs: 0,
        outcome: "failed",
        linesChanged: 0,
        filesChanged: 0,
      })
    }
  }

  return merged.filter((r) => {
    if (q.role && r.role !== q.role) return false
    if (q.modelId && r.modelId !== q.modelId) return false
    if (q.taskType && r.taskType !== q.taskType) return false
    if (q.since && r.timestamp < q.since) return false
    return true
  })
}
