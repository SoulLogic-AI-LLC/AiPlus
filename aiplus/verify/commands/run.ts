/**
 * Verify CLI — Run Command
 *
 * Run all audit checks and write result to ledger.
 */

import { checkDispatchChain } from "../../audit/dispatch-integrity"
import { checkMemoryMatch } from "../../audit/memory-match"
import { checkPersonaPermissions } from "../../audit/permission-check"
import { appendLedger } from "../ledger"
import { formatVerifyRun } from "../format"
import type { VerifyEntry } from "../types"
import type { AuditVerdict } from "../../audit/types"

/** Run verify command — execute all checks and append to ledger. */
export function runCommand(projectRoot: string, sessionId?: string): string {
  const start = Date.now()

  const checks = [
    checkDispatchChain(projectRoot),
    checkMemoryMatch(projectRoot),
    checkPersonaPermissions(projectRoot),
  ]

  const hasBlocked = checks.some(c => c.status === "BLOCKED")
  const hasRevise = checks.some(c => c.status === "REVISE")
  const verdict: AuditVerdict = hasBlocked ? "BLOCKED" : hasRevise ? "REVISE" : "PASS"

  const entry: VerifyEntry = {
    id: `verify-${Date.now()}`,
    timestamp: new Date().toISOString(),
    sessionId,
    verdict,
    checks,
    source: "cli",
    durationMs: Date.now() - start,
  }

  appendLedger(projectRoot, entry)
  return formatVerifyRun(entry)
}
