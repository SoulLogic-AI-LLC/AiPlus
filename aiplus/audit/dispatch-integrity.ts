import * as fs from "node:fs"
import * as path from "node:path"
import type { AuditCheck } from "./types"
import { readCanonicalEvents } from "../canonical-events"

const START_EVENT_TYPES = new Set(["dispatch.created", "dispatch.recorded", "dispatch.appended"])

type LegacyDispatchLifecycle = {
  startSeen: boolean
  completeSeen: boolean
}

function verifyCanonicalDispatchEvents(projectRoot: string): AuditCheck | null {
  const events = readCanonicalEvents(projectRoot).filter((event) => event.eventType.startsWith("dispatch."))
  if (events.length === 0) return null

  const eventIds = new Set<string>()
  const dispatchStarts = new Set<string>()
  let lastTime = 0

  for (const event of events) {
    if (eventIds.has(event.eventId)) {
      return { id: "D1", name: "dispatch-chain", status: "REVISE", detail: `duplicate canonical eventId: ${event.eventId}` }
    }
    eventIds.add(event.eventId)

    const ts = new Date(event.timestamp).getTime()
    if (!Number.isNaN(ts)) {
      if (ts < lastTime) {
        return { id: "D1", name: "dispatch-chain", status: "REVISE", detail: `canonical time disorder at ${event.eventId}` }
      }
      lastTime = ts
    }

    if (event.dispatchId && START_EVENT_TYPES.has(event.eventType)) {
      if (dispatchStarts.has(event.dispatchId)) {
        return { id: "D1", name: "dispatch-chain", status: "REVISE", detail: `duplicate canonical dispatch start: ${event.dispatchId}` }
      }
      dispatchStarts.add(event.dispatchId)
    }
  }

  return {
    id: "D1",
    name: "dispatch-chain",
    status: "PASS",
    detail: `${events.length} canonical dispatch events verified — shadow-log reader`,
  }
}

/** D1: verify dispatch log integrity.
 *  KNOWN_GAP: hash chain not yet implemented (V1 JSONL is plain append).
 *  Returns PASS with annotation until hash chain follow-up PR lands. */
export function checkDispatchChain(projectRoot: string): AuditCheck {
  const canonical = verifyCanonicalDispatchEvents(projectRoot)
  if (canonical) return canonical

  const dispatchLog = path.join(projectRoot, ".aiplus", "agents", "dispatch-log.jsonl")
  if (!fs.existsSync(dispatchLog)) {
    return { id: "D1", name: "dispatch-chain", status: "PASS", detail: "no dispatch log — nothing to verify" }
  }
  // Legacy fallback verification: tolerate source-style multi-row dispatch
  // lifecycles where the same dispatchId appears once for the start row and
  // once again for `event=complete`.
  const lines = fs.readFileSync(dispatchLog, "utf-8").split("\n").filter(l => l.trim())
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
          return { id: "D1", name: "dispatch-chain", status: "REVISE", detail: `complete without start: ${dispatchId}` }
        }
        if (state.completeSeen) {
          return { id: "D1", name: "dispatch-chain", status: "REVISE", detail: `duplicate dispatch complete: ${dispatchId}` }
        }
        state.completeSeen = true
      } else {
        if (state.startSeen) {
          return { id: "D1", name: "dispatch-chain", status: "REVISE", detail: `duplicate dispatch start: ${dispatchId}` }
        }
        state.startSeen = true
      }
      lifecycle.set(dispatchId, state)
      const ts = new Date(entry.timestamp).getTime()
      if (isNaN(ts)) continue
      if (ts < lastTime) {
        return { id: "D1", name: "dispatch-chain", status: "REVISE", detail: `time disorder at ${dispatchId}` }
      }
      lastTime = ts
    } catch { continue }
  }
  return {
    id: "D1", name: "dispatch-chain", status: "PASS",
    detail: `${lifecycle.size} legacy dispatch lifecycles verified — hash-chain-not-yet-implemented (KNOWN_GAP)`,
  }
}
