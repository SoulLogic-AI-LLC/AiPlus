/**
 * Color mapping for compact pressure levels.
 * Extracted from compact-gauge.tsx for testability.
 */

import type { TuiThemeCurrent } from "@opencode-ai/plugin/tui"
import type { ContextCapsule, PressureLevel } from "../../../../../aiplus/compact/types"

export function pressureFg(level: PressureLevel, theme: TuiThemeCurrent): TuiThemeCurrent["error"] {
  switch (level) {
    case "soft":
      return theme.success
    case "hard":
      return theme.warning
    case "emergency":
      return theme.error
    case "silent":
      return theme.textMuted
    default:
      return theme.textMuted
  }
}

/** Filter helper: should this capsule render in the sidebar? */
export function shouldRender(capsule: { sessionId: string; pressureLevel: PressureLevel } | null, currentSessionId: string): boolean {
  if (!capsule) return false
  if (capsule.sessionId !== currentSessionId) return false
  if (capsule.pressureLevel === "silent") return false
  return true
}

export type ThresholdEntry = { soft: number; hard: number; emergency: number }
export type Thresholds = Record<string, ThresholdEntry>

/**
 * Lookup per-model threshold from B0 HTTP response.
 * Falls back to a safe default when the model is missing.
 */
export function lookupThreshold(thresholds: Thresholds, modelId: string): ThresholdEntry {
  return thresholds[modelId] ?? { soft: 0.30, hard: 0.45, emergency: 0.60 }
}

/** Type guard for B0 response shape. */
export function isCapsuleResponse(value: unknown): value is { capsule: ContextCapsule | null; thresholds: Thresholds } {
  if (!value || typeof value !== "object") return false
  const v = value as Record<string, unknown>
  if (!("capsule" in v) || !("thresholds" in v)) return false
  if (v.thresholds === null || typeof v.thresholds !== "object") return false
  return true
}
