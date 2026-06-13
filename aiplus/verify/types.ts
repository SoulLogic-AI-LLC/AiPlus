/**
 * Verify CLI — Types
 */

import type { AuditVerdict, AuditCheck } from "../audit/types"

/** A single verification ledger entry. */
export interface VerifyEntry {
  /** Unique verification ID */
  id: string
  /** ISO 8601 timestamp */
  timestamp: string
  /** Session ID (if applicable) */
  sessionId?: string
  /** Overall verdict */
  verdict: AuditVerdict
  /** Individual checks */
  checks: AuditCheck[]
  /** Source: "cli" | "hook" */
  source: "cli" | "hook"
  /** Duration in ms */
  durationMs?: number
}

/** GitHub PR check result. */
export interface GhPrCheck {
  pr: number
  title: string
  state: "OPEN" | "MERGED" | "CLOSED"
  statusCheckRollup: "SUCCESS" | "FAILURE" | "PENDING" | "NEUTRAL" | null
  url: string
}
