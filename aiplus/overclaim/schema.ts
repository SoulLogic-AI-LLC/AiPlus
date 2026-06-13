/**
 * Overclaim — Evidence Packet Schema (v2)
 *
 * Ported from AiPlus Source: crates/aiplus-cli/src/overclaim/schema.rs
 * v2 adds ClaimRecord.level for evidence-bound-done gating.
 */

// ---- Evidence Levels (ascending strength) --------------------------------

export type EvidenceLevel =
  | "L0_Asserted"   // "I believe X" — no evidence. Default.
  | "L1_Code"       // Code exists/changed (commit SHA + git read)
  | "L2_Built"      // Compiles/lints clean
  | "L3_Tested"     // Tests pass. Gate floor for anti-bypass.
  | "L4_Reviewed"   // Reviewer/QA verdict
  | "L5_Live"       // User-visible feature works (dogfood transcript)

export const LEVEL_ORDER: Record<EvidenceLevel, number> = {
  L0_Asserted: 0,
  L1_Code: 1,
  L2_Built: 2,
  L3_Tested: 3,
  L4_Reviewed: 4,
  L5_Live: 5,
}

/** level >= threshold */
export function levelGte(a: EvidenceLevel, b: EvidenceLevel): boolean {
  return LEVEL_ORDER[a] >= LEVEL_ORDER[b]
}

// ---- Rerun Result ---------------------------------------------------------

export type RerunResult = "LiteralPass" | "LiteralFail" | "NotRerunnable"

// ---- Claim Kinds ----------------------------------------------------------

export type ClaimKind = "Quantitative" | "Boolean" | "StopCondition" | "Qualitative"

// ---- Session Scope --------------------------------------------------------

export type SessionScope = "OwnCommits" | "RepoStateInWindow" | "Global"

// ---- Spirit Signals (D3 hooks, not enforced) ------------------------------

export interface SpiritSignals {
  artifact_evidence?: string[]
  window_utilization_pct?: number
  dispatchable_queue_depth_over_time?: number[]
  task_completion_distribution?: number[]
  monitoring_cadence?: string[]
}

// ---- Protocol Drift -------------------------------------------------------

export interface ProtocolDriftEvent {
  event_id: string
  drift_kind: string
  description: string
  related_claim_id?: string
}

// ---- Intent Reading (divergence surface) ----------------------------------

export interface IntentReading {
  /** What the claim MEANS (author-supplied alternate reading) */
  intent_expected: string
  /** Intent-reading outcome (descriptive, not verdict) */
  intent_result: string
}

// ---- Rerun Data -----------------------------------------------------------

export interface Rerun {
  /** Exact command string from the packet */
  cmd: string
  /** What the claim says the command should show */
  expected: string
  /** Filled by re-runner (captured output) */
  actual?: string
  /** SHA-256 of raw captured bytes (lowercase hex) */
  actual_sha256?: string
  /** Re-run verdict */
  result?: RerunResult
  /** Why not executed (only for NotRerunnable) */
  not_rerunnable_reason?: string
}

// ---- Claim Record ---------------------------------------------------------

export interface ClaimRecord {
  claim_id: string
  claim_text: string
  level: EvidenceLevel
  claim_kind: ClaimKind
  session_scope: SessionScope
  /** Verification mode (V1: Literal only) */
  verification_mode?: string
  /** Command + expected + actual */
  rerun: Rerun
  /** D3 gamed-metric hooks (default empty) */
  spirit_signals?: SpiritSignals
  /** When author wants both literal and intent reading */
  intent_reading?: IntentReading
}

// ---- Evidence Packet (top-level container) ---------------------------------

export interface EvidencePacket {
  schema_version: string
  packet_id: string
  source_packet_path?: string
  claims: ClaimRecord[]
  protocol_drift_events?: ProtocolDriftEvent[]
}

// ---- Gate Violation -------------------------------------------------------

export type GateViolationKind =
  | "EvidenceContradicts"
  | "UnderEvidencedNotRerunnable"
  | "UnderEvidencedNoArtifact"

export interface GateViolation {
  claim_id: string
  kind: GateViolationKind
  detail: string
}

// ---- Run Outcome (from rerun engine) --------------------------------------

export interface RunOutcome {
  result: RerunResult
  actual?: string
  actual_sha256?: string
  reason?: string
}
