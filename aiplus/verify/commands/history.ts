/**
 * Verify CLI — History Command
 *
 * Show verification history from ledger.
 */

import { getLatestEntries } from "../ledger"
import { formatVerifyHistory } from "../format"

/** Run verify history command. */
export function historyCommand(projectRoot: string, count: number = 20): string {
  const entries = getLatestEntries(projectRoot, count)
  return formatVerifyHistory(entries)
}
