/**
 * Effect Gateway — Tests (V1)
 */

import { describe, it, expect, beforeEach, afterEach } from "bun:test"
import * as fs from "node:fs"
import * as path from "node:path"
import * as os from "node:os"
import { classifyToolEffect } from "./classify"
import { generateIdempotencyKey } from "./idempotency"
import { interceptToolCall } from "./gateway"

describe("effect-gateway", () => {
  let tmpDir: string

  beforeEach(() => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "aiplus-effects-test-"))
  })

  afterEach(() => {
    fs.rmSync(tmpDir, { recursive: true, force: true })
  })

  describe("classifyToolEffect", () => {
    it("classifies read as READ_ONLY", () => {
      const result = classifyToolEffect("read", { filePath: "/tmp/test.txt" })
      expect(result.sideEffectClass).toBe("READ_ONLY")
      expect(result.retryPolicy).toBe("LINEAR_BACKOFF")
    })

    it("classifies grep as READ_ONLY", () => {
      const result = classifyToolEffect("grep", { pattern: "test" })
      expect(result.sideEffectClass).toBe("READ_ONLY")
    })

    it("classifies write as MUTATING", () => {
      const result = classifyToolEffect("write", { filePath: "/tmp/test.txt", content: "hello" })
      expect(result.sideEffectClass).toBe("MUTATING")
      expect(result.retryPolicy).toBe("EXPONENTIAL_BACKOFF")
    })

    it("classifies edit as MUTATING", () => {
      const result = classifyToolEffect("edit", { filePath: "/tmp/test.txt" })
      expect(result.sideEffectClass).toBe("MUTATING")
    })

    it("classifies bash rm -rf as IRREVERSIBLE", () => {
      const result = classifyToolEffect("bash", { command: "rm -rf /tmp/test" })
      expect(result.sideEffectClass).toBe("IRREVERSIBLE")
      expect(result.retryPolicy).toBe("NO_RETRY")
    })

    it("classifies bash force-push as IRREVERSIBLE", () => {
      const result = classifyToolEffect("bash", { command: "git push --force" })
      expect(result.sideEffectClass).toBe("IRREVERSIBLE")
    })

    it("classifies bash DROP TABLE as IRREVERSIBLE", () => {
      const result = classifyToolEffect("bash", { command: "DROP TABLE users" })
      expect(result.sideEffectClass).toBe("IRREVERSIBLE")
    })

    it("classifies bash curl as EXTERNAL", () => {
      const result = classifyToolEffect("bash", { command: "curl https://example.com" })
      expect(result.sideEffectClass).toBe("EXTERNAL")
      expect(result.retryPolicy).toBe("NO_RETRY")
    })

    it("classifies bash wget as EXTERNAL", () => {
      const result = classifyToolEffect("bash", { command: "wget https://example.com" })
      expect(result.sideEffectClass).toBe("EXTERNAL")
    })

    it("classifies regular bash as MUTATING", () => {
      const result = classifyToolEffect("bash", { command: "echo hello" })
      expect(result.sideEffectClass).toBe("MUTATING")
    })

    it("classifies unknown tool as MUTATING", () => {
      const result = classifyToolEffect("unknown_tool", {})
      expect(result.sideEffectClass).toBe("MUTATING")
    })
  })

  describe("generateIdempotencyKey", () => {
    it("generates deterministic key", () => {
      const key1 = generateIdempotencyKey("bash", { command: "echo hello" })
      const key2 = generateIdempotencyKey("bash", { command: "echo hello" })
      expect(key1).toBe(key2)
    })

    it("includes tool name", () => {
      const key = generateIdempotencyKey("read", { filePath: "/tmp/test" })
      expect(key.startsWith("read:")).toBe(true)
    })

    it("includes date", () => {
      const key = generateIdempotencyKey("bash", { command: "test" })
      const date = new Date().toISOString().slice(0, 10).replace(/-/g, "")
      expect(key.endsWith(`:${date}`)).toBe(true)
    })

    it("generates different keys for different args", () => {
      const key1 = generateIdempotencyKey("bash", { command: "echo hello" })
      const key2 = generateIdempotencyKey("bash", { command: "echo world" })
      expect(key1).not.toBe(key2)
    })
  })

  describe("interceptToolCall", () => {
    it("allows READ_ONLY without dispatch-log entry", () => {
      const result = interceptToolCall({
        toolName: "read",
        toolArgs: { filePath: "/tmp/test.txt" },
        sessionId: "session-1",
        role: "engineer-a",
        projectRoot: tmpDir,
      })
      expect(result.allowed).toBe(true)
    })

    it("allows MUTATING without dispatch-log entry", () => {
      const result = interceptToolCall({
        toolName: "write",
        toolArgs: { filePath: "/tmp/test.txt", content: "hello" },
        sessionId: "session-1",
        role: "engineer-a",
        projectRoot: tmpDir,
      })
      expect(result.allowed).toBe(true)
    })

    it("blocks IRREVERSIBLE with duplicate in dispatch-log", () => {
      // Create dispatch-log with successful entry
      const dispatchDir = path.join(tmpDir, ".aiplus/agents")
      fs.mkdirSync(dispatchDir, { recursive: true })

      const key = generateIdempotencyKey("bash", { command: "rm -rf /tmp/test" })
      const entry = {
        dispatchId: "dispatch-1",
        idempotencyKey: key,
        outcome: "success",
        role: "engineer-a",
        schemaVersion: "0.4.0",
        timestamp: new Date().toISOString(),
      }
      fs.appendFileSync(
        path.join(dispatchDir, "dispatch-log.jsonl"),
        JSON.stringify(entry) + "\n",
      )

      const result = interceptToolCall({
        toolName: "bash",
        toolArgs: { command: "rm -rf /tmp/test" },
        sessionId: "session-2",
        role: "engineer-a",
        projectRoot: tmpDir,
      })
      expect(result.allowed).toBe(false)
      expect(result.reason).toContain("IRREVERSIBLE")
    })

    it("blocks MUTATING with duplicate in dispatch-log", () => {
      // Create dispatch-log with successful entry
      const dispatchDir = path.join(tmpDir, ".aiplus/agents")
      fs.mkdirSync(dispatchDir, { recursive: true })

      const key = generateIdempotencyKey("write", { filePath: "/tmp/test.txt", content: "hello" })
      const entry = {
        dispatchId: "dispatch-1",
        idempotencyKey: key,
        outcome: "success",
        role: "engineer-a",
        schemaVersion: "0.4.0",
        timestamp: new Date().toISOString(),
      }
      fs.appendFileSync(
        path.join(dispatchDir, "dispatch-log.jsonl"),
        JSON.stringify(entry) + "\n",
      )

      const result = interceptToolCall({
        toolName: "write",
        toolArgs: { filePath: "/tmp/test.txt", content: "hello" },
        sessionId: "session-2",
        role: "engineer-a",
        projectRoot: tmpDir,
      })
      expect(result.allowed).toBe(false)
      expect(result.reason).toContain("MUTATING")
    })

    it("allows READ_ONLY even with duplicate in dispatch-log", () => {
      // Create dispatch-log with successful entry
      const dispatchDir = path.join(tmpDir, ".aiplus/agents")
      fs.mkdirSync(dispatchDir, { recursive: true })

      const key = generateIdempotencyKey("read", { filePath: "/tmp/test.txt" })
      const entry = {
        dispatchId: "dispatch-1",
        idempotencyKey: key,
        outcome: "success",
        role: "engineer-a",
        schemaVersion: "0.4.0",
        timestamp: new Date().toISOString(),
      }
      fs.appendFileSync(
        path.join(dispatchDir, "dispatch-log.jsonl"),
        JSON.stringify(entry) + "\n",
      )

      const result = interceptToolCall({
        toolName: "read",
        toolArgs: { filePath: "/tmp/test.txt" },
        sessionId: "session-2",
        role: "engineer-a",
        projectRoot: tmpDir,
      })
      expect(result.allowed).toBe(true)
    })

    it("creates effect-log.jsonl", () => {
      interceptToolCall({
        toolName: "read",
        toolArgs: { filePath: "/tmp/test.txt" },
        sessionId: "session-1",
        role: "engineer-a",
        projectRoot: tmpDir,
      })

      const logPath = path.join(tmpDir, ".aiplus/effects/effect-log.jsonl")
      expect(fs.existsSync(logPath)).toBe(true)

      const entry = JSON.parse(fs.readFileSync(logPath, "utf-8").trim())
      expect(entry.toolName).toBe("read")
      expect(entry.sideEffectClass).toBe("READ_ONLY")
      expect(entry.outcome).toBe("allowed")
    })
  })
})
