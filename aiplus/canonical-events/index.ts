import * as fs from "node:fs"
import * as path from "node:path"
import { applyRedaction } from "../memory/redact"
import {
  CANONICAL_DIVERGENCE_FILE,
  CANONICAL_EVENT_SCHEMA_VERSION,
  CANONICAL_EVENTS_FILE,
  CANONICAL_REDACTION_TOKEN,
} from "./contract"

export interface CanonicalEvent {
  schemaVersion: string
  eventType: string
  eventId: string
  timestamp: string
  sessionId?: string
  dispatchId?: string
  role?: string
  source: string
  status: string
  provenance: {
    transport: string
    emitter: string
    shadowMode: true
  }
  payload: Record<string, unknown>
}

export interface CanonicalEventQuery {
  eventType?: string
  dispatchId?: string
  sessionId?: string
}

export interface CanonicalEventInput {
  eventType: string
  timestamp?: string
  sessionId?: string
  dispatchId?: string
  role?: string
  source: string
  status: string
  provenance: {
    transport: string
    emitter: string
    shadowMode: true
  }
  payload: Record<string, unknown>
}

function recordCanonicalDivergence(projectRoot: string, input: CanonicalEventInput, reason: string) {
  try {
    const logPath = path.join(projectRoot, CANONICAL_DIVERGENCE_FILE)
    fs.mkdirSync(path.dirname(logPath), { recursive: true })
    fs.appendFileSync(
      logPath,
      JSON.stringify({
        schemaVersion: CANONICAL_EVENT_SCHEMA_VERSION,
        timestamp: new Date().toISOString(),
        eventType: input.eventType,
        dispatchId: input.dispatchId,
        sessionId: input.sessionId,
        role: input.role,
        source: input.source,
        status: input.status,
        policy: "fail-open-shadow-write",
        reason,
      }) + "\n",
      "utf-8",
    )
  } catch {
    // best-effort only
  }
}

export function appendCanonicalEvent(projectRoot: string, input: CanonicalEventInput): void {
  try {
    const event: CanonicalEvent = {
      schemaVersion: CANONICAL_EVENT_SCHEMA_VERSION,
      eventType: input.eventType,
      eventId: `evt-${Date.now()}-${Math.random().toString(36).slice(2, 10)}`,
      timestamp: input.timestamp ?? new Date().toISOString(),
      sessionId: input.sessionId,
      dispatchId: input.dispatchId,
      role: input.role,
      source: input.source,
      status: input.status,
      provenance: input.provenance,
      payload: input.payload,
    }
    const logPath = path.join(projectRoot, CANONICAL_EVENTS_FILE)
    fs.mkdirSync(path.dirname(logPath), { recursive: true })
    fs.appendFileSync(logPath, applyRedaction(JSON.stringify(event)).replaceAll("[REDACTED_TOKEN]", CANONICAL_REDACTION_TOKEN) + "\n", "utf-8")
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err)
    recordCanonicalDivergence(projectRoot, input, msg)
    process.stderr.write(`[aiplus-canonical-events] ${msg}\n`)
  }
}

export function readCanonicalEvents(projectRoot: string, query: CanonicalEventQuery = {}): CanonicalEvent[] {
  const logPath = path.join(projectRoot, CANONICAL_EVENTS_FILE)
  if (!fs.existsSync(logPath)) return []
  return fs
    .readFileSync(logPath, "utf-8")
    .split("\n")
    .filter((line) => line.trim().length > 0)
    .flatMap((line) => {
      try {
        return [JSON.parse(line) as CanonicalEvent]
      } catch {
        return []
      }
    })
    .filter((event) => {
      if (query.eventType && event.eventType !== query.eventType) return false
      if (query.dispatchId && event.dispatchId !== query.dispatchId) return false
      if (query.sessionId && event.sessionId !== query.sessionId) return false
      return true
    })
}
