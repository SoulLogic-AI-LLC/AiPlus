/**
 * Effect Gateway — Log Writer Tests
 *
 * Verifies that appendEffectLog applies redaction to the JSONL line
 * before writing to disk.
 */

import { describe, it, expect, beforeEach, afterEach } from "bun:test"
import * as fs from "node:fs"
import * as path from "node:path"
import * as os from "node:os"
import { appendEffectLog } from "./log"

describe("appendEffectLog", () => {
  let tmpDir: string

  beforeEach(() => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "aiplus-effects-log-test-"))
  })

  afterEach(() => {
    fs.rmSync(tmpDir, { recursive: true, force: true })
  })

  it("writes a JSONL line to effect-log.jsonl", () => {
    appendEffectLog({
      projectRoot: tmpDir,
      toolName: "write",
      toolArgs: { filePath: "/tmp/x.txt" },
      idempotencyKey: "abc12345",
      sideEffectClass: "MUTATING",
      retryPolicy: "EXPONENTIAL_BACKOFF",
      sessionId: "ses-1",
      role: "engineer-a",
      outcome: "allowed",
    })

    const filePath = path.join(tmpDir, ".aiplus/effects/effect-log.jsonl")
    expect(fs.existsSync(filePath)).toBe(true)
    const entry = JSON.parse(fs.readFileSync(filePath, "utf-8").trim())
    expect(entry.toolName).toBe("write")
    expect(entry.outcome).toBe("allowed")
  })

  it("redacts secrets in toolArgs before writing", () => {
    appendEffectLog({
      projectRoot: tmpDir,
      toolName: "bash",
      toolArgs: { command: "curl -H 'Authorization: token=ghp_secret1234567890' https://api.example.com" },
      idempotencyKey: "abc12345",
      sideEffectClass: "MUTATING",
      retryPolicy: "EXPONENTIAL_BACKOFF",
      sessionId: "ses-1",
      role: "engineer-a",
      outcome: "allowed",
    })

    const filePath = path.join(tmpDir, ".aiplus/effects/effect-log.jsonl")
    const content = fs.readFileSync(filePath, "utf-8")
    expect(content).not.toContain("ghp_secret")
    expect(content).toContain("[REDACTED_TOKEN]")
  })
})
