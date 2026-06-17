/**
 * Agent Performance — Types (V1)
 *
 * 10-dimension agent performance tracking.
 * Extends velocity (speed-only) with cost, quality, and scope dimensions.
 */

import type { SessionOutcome } from "../memory/types"
export { truncateTask } from "../memory/types"

export type PerformancePhase = "start" | "complete"

/** Percentile computation on a sorted array. */
export function percentile(sorted: number[], p: number): number {
  if (sorted.length === 0) return 0
  const idx = Math.round((sorted.length - 1) * p)
  return sorted[Math.min(idx, sorted.length - 1)]
}

export interface PerformanceRecord {
  phase: PerformancePhase
  sessionId: string
  schemaVersion: "1.0.0" | "1.1.0"
  timestamp: string

  // Dim 1: Who
  role: string
  agentName: string

  // Dim 2: What (Tool)
  modelId: string

  // V1.1: Provider dimension (NEW, optional)
  providerID?: string

  // Dim 3: Task
  taskType: string
  taskSummary: string

  // Dim 4: Speed
  estimatedMs: number | null
  actualMs: number

  // Dim 5: Cost
  tokensIn: number
  tokensOut: number
  costUSD: number

  // Dim 6: Quality (V1 basic)
  outcome: SessionOutcome

  // Dim 7: Size (V1 basic)
  linesChanged: number
  filesChanged: number

  // V2 stubs (optional, not populated in V1)
  reworkCount?: number
  qualityScore?: number
  errorCount?: number

  // V3 stubs (always null in V1/V2)
  contextUsagePct?: number | null
  selfCorrected?: boolean
  estimateBias?: number | null

  // Hash chain (injected by writeLine)
  prev_hash?: string
  entry_hash?: string
}

export interface DimensionStats {
  p50: number
  p90: number
  count: number
}

export interface PerformanceStats {
  updated: string
  source: string
  windowStart: number

  byRole: Record<string, DimensionStats>
  byTaskType: Record<string, DimensionStats>
  byModel: Record<string, DimensionStats>

  costByRole: Record<string, DimensionStats>
  costByModel: Record<string, DimensionStats>
  costByTaskType: Record<string, DimensionStats>

  passRateByRole: Record<string, number>
  passRateByModel: Record<string, number>

  // V1.1: Provider aggregations
  byProvider?: Record<string, DimensionStats>
  costByProvider?: Record<string, DimensionStats>
  passRateByProvider?: Record<string, number>

  sizeByTaskType: Record<string, DimensionStats>
}

export interface ModelPricing {
  inputPer1k: number
  outputPer1k: number
}

export interface PerformanceQuery {
  projectRoot: string
  role?: string
  modelId?: string
  providerID?: string
  taskType?: string
  since?: string
}
