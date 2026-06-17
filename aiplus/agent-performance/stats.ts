/**
 * Agent Performance — Stats (V1)
 *
 * Computes p50/p90 dimension statistics grouped by role, model, and taskType.
 */

import type { PerformanceRecord, PerformanceQuery, PerformanceStats, DimensionStats } from "./types"
import { percentile } from "./types"
import { queryPerformance } from "./query"

function groupBy<K>(items: PerformanceRecord[], keyFn: (r: PerformanceRecord) => K): Map<K, PerformanceRecord[]> {
  const map = new Map<K, PerformanceRecord[]>()
  for (const item of items) {
    const key = keyFn(item)
    const group = map.get(key)
    if (group) group.push(item)
    else map.set(key, [item])
  }
  return map
}

function computeDimensionStats(records: PerformanceRecord[], extractFn: (r: PerformanceRecord) => number): DimensionStats {
  const values = records.map(extractFn).filter((v) => v > 0).sort((a, b) => a - b)
  return {
    p50: percentile(values, 0.5),
    p90: percentile(values, 0.9),
    count: values.length,
  }
}

function passRate(records: PerformanceRecord[]): number {
  if (records.length === 0) return 0
  const successCount = records.filter((r) => r.outcome === "success").length
  return successCount / records.length
}

export function computePerformanceStats(q: PerformanceQuery): PerformanceStats {
  const records = queryPerformance(q)

  const byRole = groupBy(records, (r) => r.role)
  const byModel = groupBy(records, (r) => r.modelId)
  const byTaskType = groupBy(records, (r) => r.taskType)
  const providerRecords = records.filter((r) => r.providerID)
  const byProvider = groupBy(providerRecords, (r) => r.providerID!)

  const speedByRole: Record<string, DimensionStats> = {}
  const costByRole: Record<string, DimensionStats> = {}
  const passRateByRole: Record<string, number> = {}
  for (const [role, group] of byRole) {
    speedByRole[role] = computeDimensionStats(group, (r) => r.actualMs)
    costByRole[role] = computeDimensionStats(group, (r) => r.costUSD)
    passRateByRole[role] = passRate(group)
  }

  const speedByModel: Record<string, DimensionStats> = {}
  const costByModel: Record<string, DimensionStats> = {}
  const passRateByModel: Record<string, number> = {}
  for (const [model, group] of byModel) {
    speedByModel[model] = computeDimensionStats(group, (r) => r.actualMs)
    costByModel[model] = computeDimensionStats(group, (r) => r.costUSD)
    passRateByModel[model] = passRate(group)
  }

  const speedByTaskType: Record<string, DimensionStats> = {}
  const costByTaskType: Record<string, DimensionStats> = {}
  const sizeByTaskType: Record<string, DimensionStats> = {}
  for (const [taskType, group] of byTaskType) {
    speedByTaskType[taskType] = computeDimensionStats(group, (r) => r.actualMs)
    costByTaskType[taskType] = computeDimensionStats(group, (r) => r.costUSD)
    sizeByTaskType[taskType] = computeDimensionStats(group, (r) => r.linesChanged)
  }

  const speedByProvider: Record<string, DimensionStats> = {}
  const costByProvider: Record<string, DimensionStats> = {}
  const passRateByProvider: Record<string, number> = {}
  for (const [provider, group] of byProvider) {
    speedByProvider[provider] = computeDimensionStats(group, (r) => r.actualMs)
    costByProvider[provider] = computeDimensionStats(group, (r) => r.costUSD)
    passRateByProvider[provider] = passRate(group)
  }

  return {
    updated: new Date().toISOString(),
    source: q.projectRoot,
    windowStart: 0,
    byRole: speedByRole,
    byTaskType: speedByTaskType,
    byModel: speedByModel,
    costByRole,
    costByModel,
    costByTaskType,
    passRateByRole,
    passRateByModel,
    sizeByTaskType,
    byProvider: speedByProvider,
    costByProvider,
    passRateByProvider,
  }
}
