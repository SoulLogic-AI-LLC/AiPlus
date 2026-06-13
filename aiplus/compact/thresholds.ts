import { CompactProfile } from "./types"

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

/** Role → lifecycle profile mapping (20 roles, 3-way triage from Advisor spec v2). */
export const ROLE_COMPACT_PROFILES: Record<string, CompactProfile> = {
  // RESET_BOUND — single-shot audit/inspection tasks
  "chief-auditor":          CompactProfile.RESET_BOUND,
  "evidence-auditor":       CompactProfile.RESET_BOUND,

  // CONTINUOUS — long-running coordination
  "advisor":                CompactProfile.CONTINUOUS,
  "ceo":                    CompactProfile.CONTINUOUS,

  // TASK_BOUND — clear task boundaries (15 roles)
  "engineer-a":             CompactProfile.TASK_BOUND,
  "engineer-b":             CompactProfile.TASK_BOUND,
  "qa":                     CompactProfile.TASK_BOUND,
  "reviewer":               CompactProfile.TASK_BOUND,
  "pm":                     CompactProfile.TASK_BOUND,
  "architect":              CompactProfile.TASK_BOUND,
  "security-reviewer":      CompactProfile.TASK_BOUND,
  "researcher":             CompactProfile.TASK_BOUND,
  "tech-writer":            CompactProfile.TASK_BOUND,
  "devops":                 CompactProfile.TASK_BOUND,
  "ui-designer":            CompactProfile.TASK_BOUND,
  "ai-integration":         CompactProfile.TASK_BOUND,
  "integration-manager":    CompactProfile.TASK_BOUND,
  "cqo":                    CompactProfile.TASK_BOUND,
  "performance-auditor":    CompactProfile.TASK_BOUND,
  "release-manager":        CompactProfile.TASK_BOUND,
}

/** Lookup compact profile for a role ID, with TASK_BOUND fallback for unknown roles. */
export function getCompactProfile(role: string): CompactProfile {
  return ROLE_COMPACT_PROFILES[role] ?? CompactProfile.TASK_BOUND
}
