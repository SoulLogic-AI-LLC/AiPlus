import * as fs from "node:fs"
import * as path from "node:path"
import type { AuditCheck } from "./types"
import { readCanonicalEvents } from "../canonical-events"
import { CANONICAL_DIVERGENCE_FILE } from "../canonical-events/contract"

const START_EVENT_TYPES = new Set(["dispatch.created", "dispatch.recorded", "dispatch.appended"])

type LegacyDispatchLifecycle = {
  startSeen: boolean
  completeSeen: boolean
}

type LegacyDispatchScan =
  | { ok: true; starts: Set<string>; count: number; detail: string }
  | { ok: false; check: AuditCheck }

function scanLegacyDispatchLog(projectRoot: string): LegacyDispatchScan {
  const dispatchLog = path.join(projectRoot, ".aiplus", "agents", "dispatch-log.jsonl")
  if (!fs.existsSync(dispatchLog)) {
    return { ok: true, starts: new Set(), count: 0, detail: "no dispatch log — nothing to verify" }
  }

  const lines = fs
    .readFileSync(dispatchLog, "utf-8")
    .split("\n")
    .filter((l) => l.trim())
  const lifecycle = new Map<string, LegacyDispatchLifecycle>()
  let lastTime = 0
  for (const line of lines) {
    try {
      const entry = JSON.parse(line)
      const dispatchId = typeof entry.dispatchId === "string" ? entry.dispatchId : undefined
      if (!dispatchId) continue
      const event = typeof entry.event === "string" ? entry.event : undefined
      const state = lifecycle.get(dispatchId) ?? { startSeen: false, completeSeen: false }
      if (event === "complete") {
        if (!state.startSeen) {
          return {
            ok: false,
            check: {
              id: "D1",
              name: "dispatch-chain",
              status: "REVISE",
              detail: `complete without start: ${dispatchId}`,
            },
          }
        }
        if (state.completeSeen) {
          return {
            ok: false,
            check: {
              id: "D1",
              name: "dispatch-chain",
              status: "REVISE",
              detail: `duplicate dispatch complete: ${dispatchId}`,
            },
          }
        }
        state.completeSeen = true
      } else {
        if (state.startSeen) {
          return {
            ok: false,
            check: {
              id: "D1",
              name: "dispatch-chain",
              status: "REVISE",
              detail: `duplicate dispatch start: ${dispatchId}`,
            },
          }
        }
        state.startSeen = true
      }
      lifecycle.set(dispatchId, state)
      const ts = new Date(entry.timestamp).getTime()
      if (isNaN(ts)) continue
      if (ts < lastTime) {
        return {
          ok: false,
          check: { id: "D1", name: "dispatch-chain", status: "REVISE", detail: `time disorder at ${dispatchId}` },
        }
      }
      lastTime = ts
    } catch {
      continue
    }
  }

  const starts = new Set<string>()
  for (const [dispatchId, state] of lifecycle) {
    if (state.startSeen) starts.add(dispatchId)
  }
  return {
    ok: true,
    starts,
    count: lifecycle.size,
    detail: `${lifecycle.size} legacy dispatch lifecycles verified — hash-chain-not-yet-implemented (KNOWN_GAP)`,
  }
}

function readCanonicalDivergenceCount(projectRoot: string): number {
  const divergencePath = path.join(projectRoot, CANONICAL_DIVERGENCE_FILE)
  if (!fs.existsSync(divergencePath)) return 0
  return fs
    .readFileSync(divergencePath, "utf-8")
    .split("\n")
    .filter((line) => line.trim()).length
}

function difference(left: Set<string>, right: Set<string>): string[] {
  return [...left].filter((value) => !right.has(value)).sort()
}

function verifyCanonicalDispatchEvents(projectRoot: string): AuditCheck | null {
  const events = readCanonicalEvents(projectRoot).filter((event) => event.eventType.startsWith("dispatch."))
  if (events.length === 0) return null

  const eventIds = new Set<string>()
  const dispatchStarts = new Set<string>()
  let lastTime = 0

  for (const event of events) {
    if (eventIds.has(event.eventId)) {
      return {
        id: "D1",
        name: "dispatch-chain",
        status: "REVISE",
        detail: `duplicate canonical eventId: ${event.eventId}`,
      }
    }
    eventIds.add(event.eventId)

    const ts = new Date(event.timestamp).getTime()
    if (!Number.isNaN(ts)) {
      if (ts < lastTime) {
        return {
          id: "D1",
          name: "dispatch-chain",
          status: "REVISE",
          detail: `canonical time disorder at ${event.eventId}`,
        }
      }
      lastTime = ts
    }

    if (event.dispatchId && START_EVENT_TYPES.has(event.eventType)) {
      if (dispatchStarts.has(event.dispatchId)) {
        return {
          id: "D1",
          name: "dispatch-chain",
          status: "REVISE",
          detail: `duplicate canonical dispatch start: ${event.dispatchId}`,
        }
      }
      dispatchStarts.add(event.dispatchId)
    }
  }

  const divergenceCount = readCanonicalDivergenceCount(projectRoot)
  if (divergenceCount > 0) {
    return {
      id: "D1",
      name: "dispatch-chain",
      status: "REVISE",
      detail: `canonical divergence recorded: ${divergenceCount} entries`,
    }
  }

  const legacy = scanLegacyDispatchLog(projectRoot)
  if (!legacy.ok) return legacy.check

  if (legacy.starts.size > 0) {
    const missingInCanonical = difference(legacy.starts, dispatchStarts)
    const missingInLegacy = difference(dispatchStarts, legacy.starts)
    if (missingInCanonical.length > 0 || missingInLegacy.length > 0) {
      const parts: string[] = []
      if (missingInCanonical.length > 0) parts.push(`missing canonical starts: ${missingInCanonical.join(",")}`)
      if (missingInLegacy.length > 0) parts.push(`orphan canonical starts: ${missingInLegacy.join(",")}`)
      return {
        id: "D1",
        name: "dispatch-chain",
        status: "REVISE",
        detail: `canonical/legacy dispatch parity mismatch — ${parts.join("; ")}`,
      }
    }
  }

  return {
    id: "D1",
    name: "dispatch-chain",
    status: "PASS",
    detail: `${events.length} canonical dispatch events verified — shadow-log reader parity=${dispatchStarts.size}`,
  }
}

/** D1: verify dispatch log integrity.
 *  KNOWN_GAP: hash chain not yet implemented (V1 JSONL is plain append).
 *  Returns PASS with annotation until hash chain follow-up PR lands. */
export function checkDispatchChain(projectRoot: string): AuditCheck {
  const canonical = verifyCanonicalDispatchEvents(projectRoot)
  if (canonical) return canonical

  const legacy = scanLegacyDispatchLog(projectRoot)
  if (!legacy.ok) return legacy.check
  return { id: "D1", name: "dispatch-chain", status: "PASS", detail: legacy.detail }
}
