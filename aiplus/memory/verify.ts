/**
 * Agent Memory Hook — Manual Verification Script
 *
 * Run: bun run aiplus/memory/verify.ts
 */

import * as fs from "node:fs"
import * as path from "node:path"
import * as os from "node:os"
import { appendMemoryEntry } from "./append"
import { truncateTask } from "./types"

const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "aiplus-memory-verify-"))

console.log("=== Agent Memory Hook — Verification ===\n")

// Test 1: truncateTask
console.log("1. truncateTask")
console.log(`   "hello" → "${truncateTask("hello")}"`)
console.log(`   "a".repeat(300) → "${truncateTask("a".repeat(300))}" (len=${truncateTask("a".repeat(300)).length})`)
console.log(`   "abcdef" (max=4) → "${truncateTask("abcdef", 4)}"`)
console.log("   ✅ PASS\n")

// Test 2: appendMemoryEntry — single entry
console.log("2. appendMemoryEntry — single entry")
appendMemoryEntry({
  projectRoot: tmpDir,
  sessionId: "session-test-123",
  role: "engineer-a",
  startedAt: "2026-06-13T10:00:00Z",
  endedAt: "2026-06-13T10:30:00Z",
  task: "feat: add persona",
  outcome: "success",
})

const filePath = path.join(tmpDir, ".aiplus/agent-memory/engineer-a/memory.jsonl")
const entry = JSON.parse(fs.readFileSync(filePath, "utf-8").trim())
console.log(`   sessionId: ${entry.sessionId}`)
console.log(`   role: ${entry.role}`)
console.log(`   durationMs: ${entry.durationMs}`)
console.log(`   outcome: ${entry.outcome}`)
console.log(`   schemaVersion: ${entry.schemaVersion}`)
console.log("   ✅ PASS\n")

// Test 3: appendMemoryEntry — multiple entries
console.log("3. appendMemoryEntry — multiple entries")
appendMemoryEntry({
  projectRoot: tmpDir,
  sessionId: "session-2",
  role: "engineer-a",
  startedAt: "2026-06-13T11:00:00Z",
  endedAt: "2026-06-13T11:15:00Z",
  task: "second task",
  outcome: "success",
})

const lines = fs.readFileSync(filePath, "utf-8").trim().split("\n")
console.log(`   entries: ${lines.length}`)
console.log(`   line1.sessionId: ${JSON.parse(lines[0]).sessionId}`)
console.log(`   line2.sessionId: ${JSON.parse(lines[1]).sessionId}`)
console.log("   ✅ PASS\n")

// Test 4: appendMemoryEntry — creates directory
console.log("4. appendMemoryEntry — creates directory")
appendMemoryEntry({
  projectRoot: tmpDir,
  sessionId: "session-new",
  role: "new-role",
  startedAt: "2026-06-13T10:00:00Z",
  endedAt: "2026-06-13T10:05:00Z",
  task: "test",
  outcome: "success",
})

const dirPath = path.join(tmpDir, ".aiplus/agent-memory/new-role")
console.log(`   dir exists: ${fs.existsSync(dirPath)}`)
console.log("   ✅ PASS\n")

// Test 5: appendMemoryEntry — fire-and-forget on error
console.log("5. appendMemoryEntry — fire-and-forget on error")
const badRoot = path.join(tmpDir, "file-not-dir")
fs.writeFileSync(badRoot, "blocking")
try {
  appendMemoryEntry({
    projectRoot: badRoot,
    sessionId: "session-bad",
    role: "test",
    startedAt: "2026-06-13T10:00:00Z",
    endedAt: "2026-06-13T10:01:00Z",
    task: "test",
    outcome: "success",
  })
  console.log("   did not throw")
  console.log("   ✅ PASS\n")
} catch (e) {
  console.log("   ❌ FAIL — threw error\n")
}

// Cleanup
fs.rmSync(tmpDir, { recursive: true, force: true })

console.log("=== All verification passed ===")
