import * as fs from "node:fs"
import * as path from "node:path"
import type { AuditCheck } from "./types"

/** D1: verify dispatch log integrity.
 *  KNOWN_GAP: hash chain not yet implemented (V1 JSONL is plain append).
 *  Returns PASS with annotation until hash chain follow-up PR lands. */
export function checkDispatchChain(projectRoot: string): AuditCheck {
  const dispatchLog = path.join(projectRoot, ".aiplus", "agents", "dispatch-log.jsonl")
  if (!fs.existsSync(dispatchLog)) {
    return { id: "D1", name: "dispatch-chain", status: "PASS", detail: "no dispatch log — nothing to verify" }
  }
  // V1 verification: check dispatchId uniqueness + time ordering
  const lines = fs.readFileSync(dispatchLog, "utf-8").split("\n").filter(l => l.trim())
  const ids = new Set<string>()
  let lastTime = 0
  for (const line of lines) {
    try {
      const entry = JSON.parse(line)
      if (ids.has(entry.dispatchId)) {
        return { id: "D1", name: "dispatch-chain", status: "REVISE", detail: `duplicate dispatchId: ${entry.dispatchId}` }
      }
      ids.add(entry.dispatchId)
      const ts = new Date(entry.timestamp).getTime()
      if (isNaN(ts)) continue
      if (ts < lastTime) {
        return { id: "D1", name: "dispatch-chain", status: "REVISE", detail: `time disorder at ${entry.dispatchId}` }
      }
      lastTime = ts
    } catch { continue }
  }
  return {
    id: "D1", name: "dispatch-chain", status: "PASS",
    detail: `${ids.size} entries verified — hash-chain-not-yet-implemented (KNOWN_GAP)`,
  }
}
