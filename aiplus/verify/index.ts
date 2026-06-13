/**
 * Verify CLI — Module Index
 *
 * On-disk verification ledger with audit checks + GitHub integration.
 */

export { runCommand } from "./commands/run"
export { statusCommand } from "./commands/status"
export { historyCommand } from "./commands/history"
export { reportCommand } from "./commands/report"
export { ghCommand } from "./commands/gh"
export { appendLedger, readLedger, getLatestEntries, getLatestEntry } from "./ledger"
export { formatVerifyRun, formatVerifyStatus, formatVerifyHistory, formatGhChecks } from "./format"
export type { VerifyEntry, GhPrCheck } from "./types"
