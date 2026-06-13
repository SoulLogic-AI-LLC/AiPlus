/**
 * Doctor — Types
 *
 * Unified health check for AiPlus Native.
 * Aggregates audit, lobby, secret-broker, and compact status.
 */

/** Health check verdict. */
export type DoctorVerdict = "PASS" | "REVISE" | "BLOCKED"

/** Individual health check result. */
export interface DoctorCheck {
  /** Check ID (e.g., "audit", "lobby", "secret-broker", "compact") */
  id: string
  /** Human-readable name */
  name: string
  /** Check verdict */
  status: DoctorVerdict
  /** Detail message */
  detail: string
}

/** Full doctor report. */
export interface DoctorReport {
  /** Overall verdict (worst of all checks) */
  verdict: DoctorVerdict
  /** ISO 8601 timestamp */
  timestamp: string
  /** Individual check results */
  checks: DoctorCheck[]
  /** Exit code (0=PASS, 1=REVISE, 2=BLOCKED) */
  exitCode: number
}
