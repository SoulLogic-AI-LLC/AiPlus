/**
 * Effect Gateway — Manual Verification Script
 *
 * Run: bun run aiplus/effects/verify.ts
 */

import * as fs from "node:fs"
import * as path from "node:path"
import * as os from "node:os"
import { classifyToolEffect } from "./classify"
import { generateIdempotencyKey } from "./idempotency"
import { interceptToolCall } from "./gateway"

const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "aiplus-effects-verify-"))

console.log("=== Effect Gateway — Verification ===\n")

// Test 1: classifyToolEffect
console.log("1. classifyToolEffect")
const tests = [
  { tool: "read", args: { filePath: "/tmp/test" }, expected: "READ_ONLY" },
  { tool: "grep", args: { pattern: "test" }, expected: "READ_ONLY" },
  { tool: "write", args: { filePath: "/tmp/test", content: "hello" }, expected: "MUTATING" },
  { tool: "edit", args: { filePath: "/tmp/test" }, expected: "MUTATING" },
  { tool: "bash", args: { command: "rm -rf /tmp/test" }, expected: "IRREVERSIBLE" },
  { tool: "bash", args: { command: "git push --force" }, expected: "IRREVERSIBLE" },
  { tool: "bash", args: { command: "DROP TABLE users" }, expected: "IRREVERSIBLE" },
  { tool: "bash", args: { command: "curl https://example.com" }, expected: "EXTERNAL" },
  { tool: "bash", args: { command: "wget https://example.com" }, expected: "EXTERNAL" },
  { tool: "bash", args: { command: "echo hello" }, expected: "MUTATING" },
]

for (const t of tests) {
  const result = classifyToolEffect(t.tool, t.args)
  const pass = result.sideEffectClass === t.expected
  console.log(
    `   ${pass ? "✅" : "❌"} ${t.tool}(${JSON.stringify(t.args).slice(0, 40)}) → ${result.sideEffectClass} (expected: ${t.expected})`,
  )
}
console.log()

// Test 2: generateIdempotencyKey
console.log("2. generateIdempotencyKey")
const key1 = generateIdempotencyKey("bash", { command: "echo hello" })
const key2 = generateIdempotencyKey("bash", { command: "echo hello" })
const key3 = generateIdempotencyKey("bash", { command: "echo world" })
console.log(`   deterministic: ${key1 === key2 ? "✅ PASS" : "❌ FAIL"} (${key1})`)
console.log(`   different args: ${key1 !== key3 ? "✅ PASS" : "❌ FAIL"}`)
console.log(`   format: ${key1.includes(":") ? "✅ PASS" : "❌ FAIL"}`)
console.log()

// Test 3: interceptToolCall — allow
console.log("3. interceptToolCall — allow (no dispatch-log)")
const result1 = interceptToolCall({
  toolName: "read",
  toolArgs: { filePath: "/tmp/test.txt" },
  sessionId: "session-1",
  role: "engineer-a",
  projectRoot: tmpDir,
})
console.log(`   read → allowed: ${result1.allowed ? "✅ PASS" : "❌ FAIL"}`)
console.log()

// Test 4: interceptToolCall — block IRREVERSIBLE with duplicate
console.log("4. interceptToolCall — block IRREVERSIBLE with duplicate")
const dispatchDir = path.join(tmpDir, ".aiplus/agents")
fs.mkdirSync(dispatchDir, { recursive: true })

const key = generateIdempotencyKey("bash", { command: "rm -rf /tmp/test" })
fs.appendFileSync(
  path.join(dispatchDir, "dispatch-log.jsonl"),
  JSON.stringify({ dispatchId: "d1", idempotencyKey: key, outcome: "success", role: "engineer-a" }) + "\n",
)

const result2 = interceptToolCall({
  toolName: "bash",
  toolArgs: { command: "rm -rf /tmp/test" },
  sessionId: "session-2",
  role: "engineer-a",
  projectRoot: tmpDir,
})
console.log(`   blocked: ${!result2.allowed ? "✅ PASS" : "❌ FAIL"}`)
console.log(`   reason: ${result2.reason ?? "(none)"}`)
console.log()

// Test 5: effect-log.jsonl created
console.log("5. effect-log.jsonl created")
const logPath = path.join(tmpDir, ".aiplus/effects/effect-log.jsonl")
console.log(`   exists: ${fs.existsSync(logPath) ? "✅ PASS" : "❌ FAIL"}`)
if (fs.existsSync(logPath)) {
  const lines = fs.readFileSync(logPath, "utf-8").trim().split("\n")
  console.log(`   entries: ${lines.length}`)
}
console.log()

// Cleanup
fs.rmSync(tmpDir, { recursive: true, force: true })

console.log("=== Verification complete ===")
