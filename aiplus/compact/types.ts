export type PressureLevel = "silent" | "soft" | "hard" | "emergency"

export interface ContextCapsule {
  sessionId: string
  contextUsage: number // 0.0–1.0
  pressureLevel: PressureLevel
  tokenCount: { used: number; total: number }
  model: string
  writtenAt: string // ISO 8601
  recommendation: string
}
