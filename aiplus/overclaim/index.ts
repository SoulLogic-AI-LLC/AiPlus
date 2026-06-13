/**
 * Overclaim — Orchestrator Entry Point
 *
 * Ported from AiPlus Source: crates/aiplus-cli/src/overclaim/mod.rs
 * Main entry: handleOverclaimRerun(packetPath, json, gate)
 */

import { loadPacket } from "./parse"
import { rerunClaim } from "./rerun"
import { renderTable, evaluateGate } from "./render"

export interface RerunOptions {
  /** Path to evidence-packet JSON file */
  packet: string
  /** Output JSON instead of table */
  json?: boolean
  /** Evaluate gate after re-run, exit(1) on violations */
  gate?: boolean
}

/**
 * Overclaim rerun — load, re-execute all claims, render, gate.
 *
 * - Fresh re-runs every claim (never trusts stored values).
 * - Prints evidence report to STDOUT (JSON with --json, table otherwise).
 * - NO verdict in STDOUT.
 * - If --gate: writes gate verdict to STDERR. Exits 1 on FAIL.
 */
export async function handleOverclaimRerun(opts: RerunOptions): Promise<void> {
  const packet = loadPacket(opts.packet)
  const root = process.cwd()

  // Fresh re-runs: overwrite EVERY claim's stored results
  for (const claim of packet.claims) {
    const outcome = await rerunClaim(claim.rerun.cmd, claim.rerun.expected, root)
    claim.rerun.actual = outcome.actual
    claim.rerun.actual_sha256 = outcome.actual_sha256
    claim.rerun.result = outcome.result
    claim.rerun.not_rerunnable_reason = outcome.reason
  }

  // Output
  if (opts.json) {
    process.stdout.write(JSON.stringify(packet, null, 2) + "\n")
  } else {
    process.stdout.write(renderTable(packet) + "\n")
  }

  // Gate evaluation
  if (opts.gate) {
    const violations = evaluateGate(packet)
    if (violations.length > 0) {
      for (const v of violations) {
        process.stderr.write(`GATE_VIOLATION ${v.claim_id}: ${v.kind} — ${v.detail}\n`)
      }
      process.stderr.write(`EVIDENCE_GATE=FAIL violations=${violations.length}\n`)
      process.exit(1)
    }
    process.stderr.write(`EVIDENCE_GATE=PASS\n`)
  }
}

// Re-export for CLI command use
export { loadPacket, rerunClaim, renderTable, evaluateGate }
