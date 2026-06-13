/**
 * Verify CLI — Status Command
 *
 * Show the latest verification status.
 */

import { getLatestEntry } from "../ledger"
import { formatVerifyStatus } from "../format"

/** Run verify status command. */
export function statusCommand(projectRoot: string): string {
  const entry = getLatestEntry(projectRoot)
  return formatVerifyStatus(entry)
}
