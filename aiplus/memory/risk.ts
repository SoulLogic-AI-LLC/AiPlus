/**
 * Agent Memory — Risk Classification (Stage 4)
 *
 * Pure-function classifier ported 1:1 from Rust auto_write.rs.
 * Gates auto-capture by risk level.
 */

import { detectFirstSensitive } from "./redact"

export type RiskLevel = "low" | "medium" | "high"

export interface AutoWriteConfig {
  autoLowRisk: boolean
  autoMediumRisk: boolean
  blockHighRisk: boolean
}

export interface AutoWriteResult {
  written: boolean
  riskLevel: RiskLevel
  recordId: string | null
  reason: string
}

const high_risk_keywords: readonly string[] = [
  "owner_gate",
  "owner gate",
  "push to",
  "release to",
  "deploy to",
  "payment",
  "override instruction",
  "override current instruction",
  "ignore previous instruction",
  "api key",
  "api_key",
  "apikey",
  "secret",
  "token",
  "cookie",
  "activate skill",
  "skill activation",
  "global config",
  "global configuration",
  "edit config",
  "begin transcript",
  "webvtt",
  "provider request body",
  "provider response body",
]

const high_risk_types: readonly string[] = [
  "owner_gate",
  "payment",
  "secret",
  "token",
  "api_key",
  "cookie",
  "transcript",
  "skill_activation",
  "global_config",
]

const low_risk_types: readonly string[] = [
  "owner_preference",
  "style_preference",
  "formatting_preference",
  "language_preference",
  "project_fact",
  "verified_project_structure",
  "file_location",
  "workflow_rule",
  "common_command",
  "verified_bug_fix",
  "bug_fix_lesson",
]

const medium_risk_types: readonly string[] = [
  "project_decision",
  "architecture_decision",
  "release_checklist",
  "cross_project_pattern",
  "risk",
  "recurring_failure",
  "skill_candidate",
  "draft_proposal",
  "model_preference",
  "provider_preference",
]

const low_risk_keywords: readonly string[] = [
  "style preference",
  "formatting preference",
  "language preference",
  "use spaces",
  "use tabs",
  "indent with",
  "file is located at",
  "project structure",
  "common command",
  "how to build",
  "build command",
  "test command",
  "verified bug fix",
  "bug fix lesson",
]

const medium_risk_keywords: readonly string[] = [
  "architecture decision",
  "decided to use",
  "release checklist",
  "cross-project",
  "recurring failure",
  "failure pattern",
  "skill candidate",
  "draft proposal",
  "model preference",
  "provider preference",
  "prefer to use",
  "recommend using",
]

/**
 * Classify risk level of text+memoryType.
 *
 * Priority (matching Rust classify_risk exactly):
 * 1. detectFirstSensitive → high
 * 2. high_risk_keywords match → high
 * 3. high_risk_types match → high
 * 4. low_risk_types match → low
 * 5. medium_risk_types match → medium
 * 6. Keyword scoring: lowScore vs mediumScore
 * 7. Default → medium
 */
export function classifyRisk(text: string, memoryType: string): RiskLevel {
  // 1. Sensitive data detection
  if (detectFirstSensitive(text) !== null) return "high"

  const lowered = text.toLowerCase()

  // 2. High-risk keywords
  if (high_risk_keywords.some((kw) => lowered.includes(kw))) return "high"

  // 3. High-risk types
  if (high_risk_types.includes(memoryType)) return "high"

  // 4. Low-risk types
  if (low_risk_types.includes(memoryType)) return "low"

  // 5. Medium-risk types
  if (medium_risk_types.includes(memoryType)) return "medium"

  // 6. Keyword scoring
  const lowScore = low_risk_keywords.filter((kw) => lowered.includes(kw)).length
  const mediumScore = medium_risk_keywords.filter((kw) => lowered.includes(kw)).length

  if (lowScore > 0 && mediumScore === 0) return "low"
  if (mediumScore > 0) return "medium"
  if (lowScore > 0) return "low"

  // 7. Default
  return "medium"
}

/**
 * Wraps classifyRisk with config gating.
 * Does NOT write to disk — only classifies and returns the decision.
 */
export function autoCapture(
  _projectRoot: string,
  text: string,
  memoryType: string,
  _scope: "personal" | "team" | "project",
  config?: Partial<AutoWriteConfig>,
): AutoWriteResult {
  const cfg: AutoWriteConfig = {
    autoLowRisk: config?.autoLowRisk ?? true,
    autoMediumRisk: config?.autoMediumRisk ?? true,
    blockHighRisk: config?.blockHighRisk ?? true,
  }

  const riskLevel = classifyRisk(text, memoryType)

  if (riskLevel === "high" && cfg.blockHighRisk) {
    return { written: false, riskLevel, recordId: null, reason: "blocked: high-risk content" }
  }
  if (riskLevel === "medium" && !cfg.autoMediumRisk) {
    return { written: false, riskLevel, recordId: null, reason: "blocked: medium-risk auto-write disabled" }
  }
  if (riskLevel === "low" && !cfg.autoLowRisk) {
    return { written: false, riskLevel, recordId: null, reason: "blocked: low-risk auto-write disabled" }
  }

  return { written: true, riskLevel, recordId: null, reason: "allowed" }
}
