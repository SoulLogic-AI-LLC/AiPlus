/**
 * Verify CLI — Report Command
 *
 * Show detailed report for a specific session.
 */

import { readLedger } from "../ledger"
import { formatVerifyRun } from "../format"

/** Run verify report command — find entry by sessionId. */
export function reportCommand(projectRoot: string, sessionId: string): string {
  const entries = readLedger(projectRoot)
  const match = entries.filter(e => e.sessionId === sessionId)

  if (match.length === 0) {
    return `\n  No verification records for session: ${sessionId}\n`
  }

  // Show the latest match
  return formatVerifyRun(match[match.length - 1])
}
