import { describe, expect, it } from "bun:test"
import {
  CANONICAL_COMPLETION_EVENT_TYPES,
  CANONICAL_DISPATCH_EVENT_TYPES,
  CANONICAL_DISPATCH_ID_RULE,
  CANONICAL_DUAL_WRITE_POLICY,
  CANONICAL_EVENT_SCHEMA_VERSION,
  CANONICAL_OPTIONAL_FIELDS,
  CANONICAL_REDACTION_TOKEN,
  CANONICAL_REQUIRED_FIELDS,
  CANONICAL_SESSION_ID_RULE,
  CANONICAL_START_EVENT_TYPES,
} from "./contract"

describe("canonical event contract", () => {
  it("freezes the canonical schema constants", () => {
    expect(CANONICAL_EVENT_SCHEMA_VERSION).toBe("0.1.0")
    expect(CANONICAL_DUAL_WRITE_POLICY).toBe("fail-open-shadow-write")
    expect(CANONICAL_REDACTION_TOKEN).toBe("[REDACTED_BY_AIPLUS_CANONICAL]")
  })

  it("freezes dispatch event taxonomy", () => {
    expect(CANONICAL_DISPATCH_EVENT_TYPES).toEqual([
      "dispatch.created",
      "dispatch.recorded",
      "dispatch.appended",
      "dispatch.completed",
    ])
    expect(Array.from(CANONICAL_START_EVENT_TYPES)).toEqual([
      "dispatch.created",
      "dispatch.recorded",
      "dispatch.appended",
    ])
    expect(Array.from(CANONICAL_COMPLETION_EVENT_TYPES)).toEqual(["dispatch.completed"])
  })

  it("freezes required and optional field sets", () => {
    expect(CANONICAL_REQUIRED_FIELDS).toEqual([
      "schemaVersion",
      "eventType",
      "eventId",
      "timestamp",
      "source",
      "status",
      "provenance",
      "payload",
    ])
    expect(CANONICAL_OPTIONAL_FIELDS).toEqual(["sessionId", "dispatchId", "role"])
  })

  it("documents dispatchId and sessionId rules", () => {
    expect(CANONICAL_DISPATCH_ID_RULE).toContain("dispatchId")
    expect(CANONICAL_SESSION_ID_RULE).toContain("sessionId")
  })
})
