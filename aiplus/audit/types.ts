export type AuditVerdict = "PASS" | "REVISE" | "BLOCKED"

export interface AuditCheck {
  id: string // "D1" | "D2" | "D3"
  name: string
  status: AuditVerdict
  detail?: string
}

export interface AuditReport {
  sessionId: string
  verdict: AuditVerdict
  timestamp: string // ISO 8601
  checks: AuditCheck[]
}
