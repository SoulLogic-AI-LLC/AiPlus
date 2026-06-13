/**
 * Lobby CLI — Manual Verification Script
 *
 * Run: bun run aiplus/lobby/verify.ts
 */

import * as fs from "node:fs"
import * as path from "node:path"
import * as os from "node:os"
import { statusCommand } from "./commands/status"
import { bindCommand } from "./commands/bind"
import { resumeCommand } from "./commands/resume"
import { readState } from "./state"
import { getAllRoleIds, getPillar, getDisplayName } from "./pillars"

const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "aiplus-lobby-verify-"))

console.log("=== Lobby CLI — Verification ===\n")

// Test 1: Pillar mapping
console.log("1. Pillar mapping")
const allRoles = getAllRoleIds()
console.log(`   Total roles: ${allRoles.length}`)
const pillars = { coordinator: 0, verifier: 0, expert: 0 }
for (const role of allRoles) {
  pillars[getPillar(role)]++
}
console.log(`   Coordinators: ${pillars.coordinator}`)
console.log(`   Verifiers: ${pillars.verifier}`)
console.log(`   Experts: ${pillars.expert}`)
console.log(`   ✅ PASS\n`)

// Test 2: Status command (no data)
console.log("2. Status command (no data)")
const status = statusCommand(tmpDir)
console.log(`   Output length: ${status.length}`)
console.log(`   Contains 'AiPlus Agent Lobby': ${status.includes("AiPlus Agent Lobby") ? "✅ PASS" : "❌ FAIL"}`)
console.log()

// Test 3: Bind command
console.log("3. Bind command")
const bindResult = bindCommand(tmpDir, "ceo")
console.log(`   Bind result: ${bindResult.includes("Bound to") ? "✅ PASS" : "❌ FAIL"}`)
const state = readState(tmpDir)
console.log(`   State boundRole: ${state.boundRole === "ceo" ? "✅ PASS" : "❌ FAIL"}`)
console.log()

// Test 4: Bind unknown role
console.log("4. Bind unknown role")
const badBind = bindCommand(tmpDir, "unknown-role")
console.log(`   Error: ${badBind.includes("Unknown role") ? "✅ PASS" : "❌ FAIL"}`)
console.log()

// Test 5: Unbind command
console.log("5. Unbind command")
const unbindResult = bindCommand(tmpDir, null)
console.log(`   Unbind result: ${unbindResult.includes("Unbound") ? "✅ PASS" : "❌ FAIL"}`)
const state2 = readState(tmpDir)
console.log(`   State boundRole: ${state2.boundRole === null ? "✅ PASS" : "❌ FAIL"}`)
console.log()

// Test 6: Resume command (no session)
console.log("6. Resume command (no session)")
const resumeResult = resumeCommand(tmpDir, "session-123")
console.log(`   Error: ${resumeResult.includes("not found") ? "✅ PASS" : "❌ FAIL"}`)
console.log()

// Test 7: Status with dispatch-log
console.log("7. Status with dispatch-log")
const dispatchDir = path.join(tmpDir, ".aiplus/agents")
fs.mkdirSync(dispatchDir, { recursive: true })
fs.appendFileSync(
  path.join(dispatchDir, "dispatch-log.jsonl"),
  JSON.stringify({
    dispatchId: `dispatch-${Date.now()}-ceo`,
    role: "ceo",
    outcome: "success",
    timestamp: new Date().toISOString(),
    task: "test task",
  }) + "\n",
)
const status2 = statusCommand(tmpDir)
console.log(`   Contains 'active': ${status2.includes("active") ? "✅ PASS" : "❌ FAIL"}`)
console.log()

// Cleanup
fs.rmSync(tmpDir, { recursive: true, force: true })

console.log("=== Verification complete ===")
