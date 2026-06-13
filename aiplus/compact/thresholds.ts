/** Per-model compact thresholds — from AiPlus-Source PR #395 (main @ a919bdb). */
export const COMPACT_THRESHOLDS: Record<
  string,
  { soft: number; hard: number; emergency: number }
> = {
  "deepseek-v4-pro":       { soft: 0.40, hard: 0.55, emergency: 0.70 },
  "minimax-m3":            { soft: 0.40, hard: 0.55, emergency: 0.70 },
  "mimo-v2.5-pro":         { soft: 0.25, hard: 0.35, emergency: 0.50 },
  "claude-opus":           { soft: 0.25, hard: 0.35, emergency: 0.50 },
  "gpt-5.5":               { soft: 0.25, hard: 0.35, emergency: 0.50 },
  "claude-fable":          { soft: 0.22, hard: 0.30, emergency: 0.45 },
}

/** Uniform handoff token reserve across all models. */
export const HANDOFF_TOKENS = 5_000

/** Lookup thresholds for a model ID, with a safe fallback. */
export function getThresholds(modelId: string): { soft: number; hard: number; emergency: number } {
  return COMPACT_THRESHOLDS[modelId] ?? { soft: 0.30, hard: 0.45, emergency: 0.60 }
}
