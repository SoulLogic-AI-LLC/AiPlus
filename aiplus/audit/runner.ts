import * as fs from "node:fs"
import * as path from "node:path"
import { checkDispatchChain } from "./dispatch-integrity"
import { checkMemoryMatch } from "./memory-match"
import { checkPersonaPermissions, type RuntimeAgentConfig } from "./permission-check"
import type { AuditReport, AuditVerdict } from "./types"

const CA_DIR = ".aiplus/agent-memory/ca"

/** Run all audit checks and write report. Fire-and-forget. */
export function verify(
  projectRoot: string,
  sessionId: string,
  runtimeAgents?: RuntimeAgentConfig[],
): void {
  try {
    const checks = [
      checkDispatchChain(projectRoot),
      checkMemoryMatch(projectRoot),
      checkPersonaPermissions(projectRoot, runtimeAgents),
    ]

    const hasBlocked = checks.some(c => c.status === "BLOCKED")
    const hasRevise = checks.some(c => c.status === "REVISE")
    const verdict: AuditVerdict = hasBlocked ? "BLOCKED" : hasRevise ? "REVISE" : "PASS"

    const report: AuditReport = {
      sessionId,
      verdict,
      timestamp: new Date().toISOString(),
      checks,
    }

    const dir = path.join(projectRoot, CA_DIR)
    fs.mkdirSync(dir, { recursive: true })
    fs.writeFileSync(
      path.join(dir, `${sessionId}.json`),
      JSON.stringify(report, null, 2),
      "utf-8",
    )
    process.stderr.write(`[aiplus-audit] verdict=${verdict} checks=${checks.length} session=${sessionId}\n`)
  } catch (err) {
    process.stderr.write(`[aiplus-audit] ${err instanceof Error ? err.message : String(err)}\n`)
  }
}
