/**
 * Audit Module — Verification Script
 *
 * Run: bun run aiplus/audit/verify.ts
 */

import * as fs from "node:fs"
import * as path from "node:path"
import * as os from "node:os"
import { checkMemoryMatch } from "./memory-match"
import { checkPersonaPermissions, type RuntimeAgentConfig } from "./permission-check"

const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "aiplus-audit-verify-"))

console.log("=== Audit Module — Verification ===\n")

// ========== GAP-4: D2 Entry-Level Memory Match ==========

console.log("1. D2 Memory Match — no data")
const d2NoData = checkMemoryMatch(tmpDir)
console.log(`   Status: ${d2NoData.status === "PASS" ? "✅ PASS" : "❌ FAIL"}`)
console.log(`   Detail: ${d2NoData.detail}`)
console.log()

console.log("2. D2 Memory Match — matching entries")
// Create dispatch-log with 2 entries
const dispatchDir = path.join(tmpDir, ".aiplus", "agents")
fs.mkdirSync(dispatchDir, { recursive: true })
fs.appendFileSync(
  path.join(dispatchDir, "dispatch-log.jsonl"),
  JSON.stringify({
    dispatchId: "dispatch-1000-engineer-a",
    role: "engineer-a",
    timestamp: "2026-06-13T10:00:00Z",
    outcome: "success",
  }) + "\n",
)
fs.appendFileSync(
  path.join(dispatchDir, "dispatch-log.jsonl"),
  JSON.stringify({
    dispatchId: "dispatch-2000-ceo",
    role: "ceo",
    timestamp: "2026-06-13T11:00:00Z",
    outcome: "success",
  }) + "\n",
)

// Create memory entries with matching sessionIds
const memoryDir = path.join(tmpDir, ".aiplus", "agent-memory")
fs.mkdirSync(path.join(memoryDir, "engineer-a"), { recursive: true })
fs.appendFileSync(
  path.join(memoryDir, "engineer-a", "memory.jsonl"),
  JSON.stringify({
    sessionId: "session-1000",
    role: "engineer-a",
    startedAt: "2026-06-13T10:00:00Z",
    endedAt: "2026-06-13T10:30:00Z",
    task: "test task",
    outcome: "success",
  }) + "\n",
)
fs.mkdirSync(path.join(memoryDir, "ceo"), { recursive: true })
fs.appendFileSync(
  path.join(memoryDir, "ceo", "memory.jsonl"),
  JSON.stringify({
    sessionId: "session-2000",
    role: "ceo",
    startedAt: "2026-06-13T11:00:00Z",
    endedAt: "2026-06-13T11:30:00Z",
    task: "test task 2",
    outcome: "success",
  }) + "\n",
)

const d2Match = checkMemoryMatch(tmpDir)
console.log(`   Status: ${d2Match.status === "PASS" ? "✅ PASS" : "❌ FAIL"}`)
console.log(`   Detail: ${d2Match.detail}`)
console.log()

console.log("3. D2 Memory Match — mismatch (memory-only)")
// Add extra memory entry
fs.appendFileSync(
  path.join(memoryDir, "ceo", "memory.jsonl"),
  JSON.stringify({
    sessionId: "session-9999",
    role: "ceo",
    startedAt: "2026-06-13T12:00:00Z",
    endedAt: "2026-06-13T12:30:00Z",
    task: "extra task",
    outcome: "success",
  }) + "\n",
)

const d2Mismatch = checkMemoryMatch(tmpDir)
console.log(`   Status: ${d2Mismatch.status === "REVISE" ? "✅ PASS (REVISE)" : "❌ FAIL"}`)
console.log(`   Detail: ${d2Mismatch.detail}`)
console.log()

// ========== GAP-3: D3 Runtime Permissions ==========

console.log("4. D3 Permission Check — disk fallback (no runtime)")
const d3Disk = checkPersonaPermissions(tmpDir)
console.log(`   Status: ${d3Disk.status === "PASS" ? "✅ PASS" : "❌ FAIL"}`)
console.log(`   Detail: ${d3Disk.detail}`)
console.log()

console.log("5. D3 Permission Check — runtime agents")
const runtimeAgents: RuntimeAgentConfig[] = [
  {
    id: "aiplus-ceo",
    permissions: [
      { action: "read", resource: "*", effect: "allow" },
      { action: "bash", resource: "cargo*", effect: "allow" },
      { action: "bash", resource: "*", effect: "deny" },
    ],
    mode: "subagent",
    hidden: false,
  },
  {
    id: "aiplus-advisor",
    permissions: [
      { action: "read", resource: "*", effect: "allow" },
      { action: "bash", resource: "*", effect: "deny" },
      { action: "write", resource: "*", effect: "deny" },
    ],
    mode: "subagent",
    hidden: false,
  },
]
const d3Runtime = checkPersonaPermissions(tmpDir, runtimeAgents)
console.log(`   Status: ${d3Runtime.status === "PASS" ? "✅ PASS" : "❌ FAIL"}`)
console.log(`   Detail: ${d3Runtime.detail}`)
console.log()

console.log("6. D3 Permission Check — runtime with issue (allow-all)")
const runtimeAgentsIssue: RuntimeAgentConfig[] = [
  {
    id: "aiplus-bad",
    permissions: [{ action: "*", resource: "*", effect: "allow" }],
    mode: "subagent",
    hidden: false,
  },
]
const d3Issue = checkPersonaPermissions(tmpDir, runtimeAgentsIssue)
console.log(`   Status: ${d3Issue.status === "REVISE" ? "✅ PASS (REVISE)" : "❌ FAIL"}`)
console.log(`   Detail: ${d3Issue.detail}`)
console.log()

// Cleanup
fs.rmSync(tmpDir, { recursive: true, force: true })

console.log("=== Verification complete ===")
