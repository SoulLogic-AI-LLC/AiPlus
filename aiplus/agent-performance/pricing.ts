/**
 * Agent Performance — Pricing (V1)
 *
 * Static model pricing table + cost estimation.
 * suggestCostEstimate reuses queryPerformance + percentile for historical lookup.
 */

import type { ModelPricing } from "./types"
import { percentile } from "./types"
import { queryPerformance } from "./query"

export const DEFAULT_PRICING: Record<string, ModelPricing> = {
  "claude-sonnet-4-20250514": { inputPer1k: 0.003, outputPer1k: 0.015 },
  "claude-sonnet-4-20250514-thinking": { inputPer1k: 0.003, outputPer1k: 0.015 },
  "claude-haiku-3.5": { inputPer1k: 0.0008, outputPer1k: 0.004 },
  "gpt-4o": { inputPer1k: 0.005, outputPer1k: 0.015 },
  "gpt-4o-mini": { inputPer1k: 0.00015, outputPer1k: 0.0006 },
  "gemini-2.5-pro": { inputPer1k: 0.00125, outputPer1k: 0.01 },
  "gemini-2.5-flash": { inputPer1k: 0.00015, outputPer1k: 0.0006 },
}

export function estimateCostUSD(modelId: string, tokensIn: number, tokensOut: number): number {
  const pricing = DEFAULT_PRICING[modelId]
  if (!pricing) return 0
  return (tokensIn / 1000) * pricing.inputPer1k + (tokensOut / 1000) * pricing.outputPer1k
}

export function suggestCostEstimate(
  projectRoot: string,
  role: string,
  taskType: string,
): { p50: number; p90: number; count: number } | null {
  const records = queryPerformance({ projectRoot, role, taskType })
  const costs = records
    .map((r) => r.costUSD)
    .filter((c) => c > 0)
    .sort((a, b) => a - b)
  if (costs.length < 5) return null
  return { p50: percentile(costs, 0.5), p90: percentile(costs, 0.9), count: costs.length }
}
