import * as fs from "node:fs"
import * as path from "node:path"
import type { AuditCheck } from "./types"

/** D2: verify memory entry count matches session count in dispatch log. */
export function checkMemoryMatch(projectRoot: string): AuditCheck {
  const dispatchLog = path.join(projectRoot, ".aiplus", "agents", "dispatch-log.jsonl")
  const memoryDir = path.join(projectRoot, ".aiplus", "agent-memory")

  let dispatchCount = 0
  if (fs.existsSync(dispatchLog)) {
    dispatchCount = fs.readFileSync(dispatchLog, "utf-8").split("\n").filter(l => l.trim()).length
  }

  let memoryCount = 0
  if (fs.existsSync(memoryDir)) {
    for (const role of fs.readdirSync(memoryDir)) {
      const memFile = path.join(memoryDir, role, "memory.jsonl")
      if (fs.existsSync(memFile)) {
        memoryCount += fs.readFileSync(memFile, "utf-8").split("\n").filter(l => l.trim()).length
      }
    }
  }

  if (dispatchCount === 0 && memoryCount === 0) {
    return { id: "D2", name: "memory-match", status: "PASS", detail: "no data — nothing to verify" }
  }
  if (dispatchCount === memoryCount) {
    return { id: "D2", name: "memory-match", status: "PASS", detail: `${dispatchCount} dispatch, ${memoryCount} memory — matched` }
  }
  return { id: "D2", name: "memory-match", status: "REVISE", detail: `${dispatchCount} dispatch entries vs ${memoryCount} memory entries — mismatch` }
}
