/**
 * Overclaim — Table Rendering + Gate Evaluation
 *
 * Ported from AiPlus Source: crates/aiplus-cli/src/overclaim/mod.rs
 */

import type {
  EvidencePacket,
  ClaimRecord,
  GateViolation,
  GateViolationKind,
  RerunResult,
  EvidenceLevel,
  ClaimKind,
  SessionScope,
} from "./schema"
import { levelGte, LEVEL_ORDER } from "./schema"

// ---- Result Labels ---------------------------------------------------------

function resultLabel(result?: RerunResult): string {
  switch (result) {
    case "LiteralPass":
      return "LITERAL_PASS"
    case "LiteralFail":
      return "LITERAL_FAIL"
    case "NotRerunnable":
      return "NOT_RERUNNABLE"
    default:
      return "PENDING"
  }
}

function kindLabel(kind: ClaimKind): string {
  return kind.toUpperCase()
}

function scopeLabel(scope: SessionScope): string {
  switch (scope) {
    case "OwnCommits":
      return "OWN_COMMITS"
    case "RepoStateInWindow":
      return "REPO_WINDOW"
    case "Global":
      return "GLOBAL"
  }
}

function levelLabel(level: EvidenceLevel): string {
  return level.toUpperCase()
}

function shaShort(sha?: string): string {
  if (!sha) return "--"
  return sha.slice(0, 12)
}

function truncateInline(s: string, maxLen = 80): string {
  const collapsed = s.replace(/\n/g, " ")
  if (collapsed.length <= maxLen) return collapsed
  return collapsed.slice(0, maxLen - 3) + "..."
}

function isDivergent(claim: ClaimRecord): boolean {
  return !!claim.intent_reading
}

// ---- Table Rendering -------------------------------------------------------

/**
 * Render a human-readable evidence table.
 * NO verdict line — no aggregate judgment, no pass/fail rate.
 */
export function renderTable(packet: EvidencePacket): string {
  const lines: string[] = []

  // Header
  lines.push("=".repeat(80))
  lines.push(`EVIDENCE PACKET: ${packet.packet_id}`)
  lines.push(`Claims: ${packet.claims.length}  Drift events: ${packet.protocol_drift_events?.length ?? 0}`)
  if (packet.source_packet_path) {
    lines.push(`Source: ${packet.source_packet_path}`)
  }
  lines.push("=".repeat(80))
  lines.push("")

  // Per-claim rows
  for (const claim of packet.claims) {
    const divergent = isDivergent(claim) ? " DIVERGENT" : ""

    lines.push(
      `${claim.claim_id.padEnd(12)} ${kindLabel(claim.claim_kind).padEnd(16)} ` +
        `${scopeLabel(claim.session_scope).padEnd(14)} ` +
        `${levelLabel(claim.level).padEnd(12)} ` +
        `${resultLabel(claim.rerun.result)}${divergent}  ${shaShort(claim.rerun.actual_sha256)}`,
    )
    lines.push(`  ${truncateInline(claim.claim_text)}`)
    lines.push(`  cmd:      ${claim.rerun.cmd}`)

    if (claim.rerun.result === "NotRerunnable") {
      lines.push(`  reason:   ${claim.rerun.not_rerunnable_reason ?? "(unknown)"}`)
    } else if (claim.rerun.result) {
      lines.push(`  expected: ${truncateInline(claim.rerun.expected)}`)
      if (claim.rerun.actual !== undefined) {
        const actualPreview = truncateInline(claim.rerun.actual, 120)
        lines.push(`  actual:   ${actualPreview}`)
      }
    } else {
      lines.push(`  expected: ${truncateInline(claim.rerun.expected)}`)
      lines.push(`  (not yet re-run)`)
    }

    // Divergence rows
    if (claim.intent_reading) {
      lines.push(`  ── DIVERGENCE (human adjudicates) ──`)
      lines.push(`  literal:  ${truncateInline(claim.claim_text)}`)
      lines.push(`  intent:   ${truncateInline(claim.intent_reading.intent_expected)}`)
      lines.push(`  result:   ${claim.intent_reading.intent_result}`)
    }

    lines.push("")
  }

  // Drift events table
  if (packet.protocol_drift_events && packet.protocol_drift_events.length > 0) {
    lines.push("-".repeat(80))
    lines.push("PROTOCOL DRIFT EVENTS")
    lines.push("-".repeat(80))
    for (const ev of packet.protocol_drift_events) {
      lines.push(
        `${ev.event_id.padEnd(12)} ${ev.drift_kind.padEnd(20)} ` +
          `${ev.related_claim_id ?? "--".padEnd(12)}  ${truncateInline(ev.description)}`,
      )
    }
    lines.push("")
  }

  lines.push("=".repeat(80))
  return lines.join("\n")
}

// ---- Gate Evaluation -------------------------------------------------------

/**
 * Evaluate gate on a packet with already-computed rerun results.
 * PURE function — executes nothing, reads nothing from disk.
 *
 * Checks each claim in priority order (at most one violation per claim):
 * 1. result == LiteralFail → EvidenceContradicts
 * 2. level >= Tested AND result == NotRerunnable → UnderEvidencedNotRerunnable
 * 3. level >= Reviewed AND artifact_evidence is empty → UnderEvidencedNoArtifact
 */
export function evaluateGate(packet: EvidencePacket): GateViolation[] {
  const violations: GateViolation[] = []

  for (const claim of packet.claims) {
    // 1. Evidence contradicts claim
    if (claim.rerun.result === "LiteralFail") {
      violations.push({
        claim_id: claim.claim_id,
        kind: "EvidenceContradicts",
        detail: `rerun '${claim.rerun.cmd}' output does not contain expected '${claim.rerun.expected}'`,
      })
      continue
    }

    // 2. High-bar claim has no re-runnable evidence
    if (levelGte(claim.level, "L3_Tested") && claim.rerun.result === "NotRerunnable") {
      violations.push({
        claim_id: claim.claim_id,
        kind: "UnderEvidencedNotRerunnable",
        detail: `claim level ${claim.level} but command not re-runnable: ${claim.rerun.not_rerunnable_reason ?? "unknown"}`,
      })
      continue
    }

    // 3. Reviewed-level claim has no artifact
    if (
      levelGte(claim.level, "L4_Reviewed") &&
      (!claim.spirit_signals?.artifact_evidence || claim.spirit_signals.artifact_evidence.length === 0)
    ) {
      violations.push({
        claim_id: claim.claim_id,
        kind: "UnderEvidencedNoArtifact",
        detail: `claim level ${claim.level} but no artifact_evidence provided`,
      })
    }
  }

  return violations
}
