/**
 * Agent Performance — Query (V1)
 *
 * Reads JSONL performance records, joins start+complete pairs,
 * and applies filters.
 */

import * as fs from "node:fs"
import * as path from "node:path"
import type { PerformanceRecord, PerformanceQuery } from "./types"
import { percentile } from "./types"

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

/**
 * AMTP query layer — thin wrappers over `queryPerformance`.
 * Data only. No recommendations, no ranking, no narrative.
 */

export interface ByModelEntry {
  modelId: string
  count: number
  successRate: number
  p50Ms: number
  p90Ms: number
  p50TokensIn: number
  p90TokensIn: number
  p50TokensOut: number
  p90TokensOut: number
}

export interface RecentEntry {
  sessionId: string
  modelId: string
  outcome: string
  actualMs: number
  tokensIn: number
  tokensOut: number
  costUSD: number
  timestamp: string
  taskSummary: string
}

export interface ByRoleResult {
  role: string
  taskType: string
  totalSamples: number
  byModel: ByModelEntry[]
  recent: RecentEntry[]
}

function nextDayIso(date: string): string {
  const next = new Date(`${date}T00:00:00.000Z`).getTime() + 24 * 60 * 60 * 1000
  return new Date(next).toISOString()
}

export function queryByRole(
  role: string,
  taskType: string,
  opts?: { projectRoot?: string; limitRecent?: number }
): ByRoleResult {
  const projectRoot = opts?.projectRoot ?? process.cwd()
  const records = queryPerformance({ projectRoot, role, taskType })

  const byModelMap = new Map<string, PerformanceRecord[]>()
  for (const r of records) {
    const group = byModelMap.get(r.modelId)
    if (group) group.push(r)
    else byModelMap.set(r.modelId, [r])
  }

  const byModel: ByModelEntry[] = []
  for (const [modelId, group] of byModelMap) {
    const success = group.filter((r) => r.outcome === "success").length
    // AI speed estimate (actualMs), not human-engineer baseline
    const msSorted = group.map((r) => r.actualMs).sort((a, b) => a - b)
    // AI speed estimate (actualMs), not human-engineer baseline
    const tokensInSorted = group.map((r) => r.tokensIn).sort((a, b) => a - b)
    const tokensOutSorted = group.map((r) => r.tokensOut).sort((a, b) => a - b)
    byModel.push({
      modelId,
      count: group.length,
      successRate: group.length === 0 ? 0 : success / group.length,
      p50Ms: percentile(msSorted, 0.5),
      p90Ms: percentile(msSorted, 0.9),
      p50TokensIn: percentile(tokensInSorted, 0.5),
      p90TokensIn: percentile(tokensInSorted, 0.9),
      p50TokensOut: percentile(tokensOutSorted, 0.5),
      p90TokensOut: percentile(tokensOutSorted, 0.9),
    })
  }

  const limit = opts?.limitRecent ?? 5
  const recentSorted = [...records].sort((a, b) => (a.timestamp < b.timestamp ? 1 : -1))
  const recent: RecentEntry[] = recentSorted.slice(0, limit).map((r) => ({
    sessionId: r.sessionId,
    modelId: r.modelId,
    outcome: r.outcome,
    actualMs: r.actualMs,
    tokensIn: r.tokensIn,
    tokensOut: r.tokensOut,
    costUSD: r.costUSD,
    timestamp: r.timestamp,
    taskSummary: r.taskSummary,
  }))

  return {
    role,
    taskType,
    totalSamples: records.length,
    byModel,
    recent,
  }
}

export interface BudgetResult {
  date: string
  totals: { tokensIn: number; tokensOut: number; costUSD: number; sessions: number }
  byRole: Record<string, { tokensIn: number; tokensOut: number; costUSD: number; sessions: number }>
  byModel: Record<string, { tokensIn: number; tokensOut: number; costUSD: number; sessions: number }>
}

function emptyBucket() {
  return { tokensIn: 0, tokensOut: 0, costUSD: 0, sessions: 0 }
}

export function queryBudget(
  date?: string,
  opts?: { projectRoot?: string }
): BudgetResult {
  const projectRoot = opts?.projectRoot ?? process.cwd()
  const resolvedDate = date ?? new Date().toISOString().slice(0, 10)
  const since = `${resolvedDate}T00:00:00.000Z`
  const nextDay = nextDayIso(resolvedDate)

  const raw = queryPerformance({ projectRoot, since })
  const records = raw.filter((r) => r.timestamp < nextDay)

  const totals = emptyBucket()
  const byRole: BudgetResult["byRole"] = {}
  const byModel: BudgetResult["byModel"] = {}

  for (const r of records) {
    totals.tokensIn += r.tokensIn
    totals.tokensOut += r.tokensOut
    totals.costUSD += r.costUSD
    totals.sessions += 1

    if (!byRole[r.role]) byRole[r.role] = emptyBucket()
    const roleBucket = byRole[r.role]
    roleBucket.tokensIn += r.tokensIn
    roleBucket.tokensOut += r.tokensOut
    roleBucket.costUSD += r.costUSD
    roleBucket.sessions += 1

    if (!byModel[r.modelId]) byModel[r.modelId] = emptyBucket()
    const modelBucket = byModel[r.modelId]
    modelBucket.tokensIn += r.tokensIn
    modelBucket.tokensOut += r.tokensOut
    modelBucket.costUSD += r.costUSD
    modelBucket.sessions += 1
  }

  return { date: resolvedDate, totals, byRole, byModel }
}

export type RecentRecord = {
  sessionId: string
  role: string
  taskType: string
  modelId: string
  outcome: string
  tokensIn: number
  tokensOut: number
  costUSD: number
  actualMs: number
  timestamp: string
  taskSummary: string
}

export function queryRecent(
  n?: number,
  opts?: { projectRoot?: string }
): RecentRecord[] {
  const projectRoot = opts?.projectRoot ?? process.cwd()
  const limit = n ?? 10
  const records = queryPerformance({ projectRoot })
  return [...records]
    .sort((a, b) => (a.timestamp < b.timestamp ? 1 : -1))
    .slice(0, limit)
    .map((r) => ({
      sessionId: r.sessionId,
      role: r.role,
      taskType: r.taskType,
      modelId: r.modelId,
      outcome: r.outcome,
      tokensIn: r.tokensIn,
      tokensOut: r.tokensOut,
      costUSD: r.costUSD,
      actualMs: r.actualMs,
      timestamp: r.timestamp,
      taskSummary: r.taskSummary,
    }))
}
