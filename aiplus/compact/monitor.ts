import { getThresholds, HANDOFF_TOKENS } from "./thresholds"
import type { PressureLevel } from "./types"

interface TokenUsage {
  used: number
  total: number
  model: string
}

export interface PressureResult {
  level: PressureLevel
  contextUsage: number
  tokenCount: { used: number; total: number }
  model: string
  recommendation: string
}

/** Check context pressure for a session given its token usage snapshot. */
export function checkPressure(usage: TokenUsage): PressureResult {
  const { soft, hard, emergency } = getThresholds(usage.model)
  const contextUsage = (usage.used + HANDOFF_TOKENS) / usage.total

  let level: PressureLevel = "silent"
  let recommendation = ""

  if (contextUsage >= emergency) {
    level = "emergency"
    recommendation = "Context critically full — compact immediately or close unused sessions"
  } else if (contextUsage >= hard) {
    level = "hard"
    recommendation = "Context near limit — compact strongly recommended"
  } else if (contextUsage >= soft) {
    level = "soft"
    recommendation = "Context usage elevated — consider compacting soon"
  }

  return {
    level,
    contextUsage: Math.round(contextUsage * 10000) / 10000,
    tokenCount: { used: usage.used, total: usage.total },
    model: usage.model,
    recommendation,
  }
}
