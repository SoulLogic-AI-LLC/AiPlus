export const CANONICAL_EVENT_SCHEMA_VERSION = "0.1.0"
export const CANONICAL_EVENTS_FILE = ".aiplus/agents/canonical-events.jsonl"
export const CANONICAL_DIVERGENCE_FILE = ".aiplus/agents/canonical-divergence.jsonl"

export const CANONICAL_DISPATCH_EVENT_TYPES = [
  "dispatch.created",
  "dispatch.recorded",
  "dispatch.appended",
  "dispatch.completed",
] as const

export type CanonicalDispatchEventType = (typeof CANONICAL_DISPATCH_EVENT_TYPES)[number]

export const CANONICAL_START_EVENT_TYPES = new Set<string>([
  "dispatch.created",
  "dispatch.recorded",
  "dispatch.appended",
])

export const CANONICAL_COMPLETION_EVENT_TYPES = new Set<string>(["dispatch.completed"])

export const CANONICAL_REQUIRED_FIELDS = [
  "schemaVersion",
  "eventType",
  "eventId",
  "timestamp",
  "source",
  "status",
  "provenance",
  "payload",
] as const

export const CANONICAL_OPTIONAL_FIELDS = ["sessionId", "dispatchId", "role"] as const

export const CANONICAL_REDACTION_TOKEN = "[REDACTED_BY_AIPLUS_CANONICAL]"

export const CANONICAL_DUAL_WRITE_POLICY = "fail-open-shadow-write"

export const CANONICAL_DISPATCH_ID_RULE =
  "dispatchId must identify one logical dispatch lifecycle. Start-like events may appear once per dispatchId; completion may appear at most once."

export const CANONICAL_SESSION_ID_RULE =
  "sessionId is optional in v0.1.0 for source compatibility, but when present it must identify the owning session without being guessed from dispatchId."
