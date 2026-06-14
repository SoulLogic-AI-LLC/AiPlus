/**
 * Dispatch Log — Redaction Tests
 *
 * Verifies that appendDispatchLog applies redaction to the JSONL line
 * before writing to .aiplus/agents/dispatch-log.jsonl.
 */

import { describe, it, expect, beforeEach, afterEach } from "bun:test"
import * as fs from "node:fs"
import * as path from "node:path"
import * as os from "node:os"
import { appendDispatchLog } from "@opencode-ai/core/session"
import { readCanonicalEvents } from "../../../aiplus/canonical-events"

describe("appendDispatchLog redaction", () => {
  let tmpDir: string

  beforeEach(() => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "aiplus-dispatch-log-test-"))
  })

  afterEach(() => {
    fs.rmSync(tmpDir, { recursive: true, force: true })
  })

  it("writes a JSONL line to dispatch-log.jsonl", () => {
    appendDispatchLog({
      dispatchId: "dispatch-test-001",
      role: "engineer-a",
      sessionId: "ses-1",
      task: "feat: add persona",
      worktreePath: tmpDir,
    })

    const filePath = path.join(tmpDir, ".aiplus/agents/dispatch-log.jsonl")
    expect(fs.existsSync(filePath)).toBe(true)
    const content = fs.readFileSync(filePath, "utf-8").trim()
    const entry = JSON.parse(content)
    expect(entry.dispatchId).toBe("dispatch-test-001")
    expect(entry.role).toBe("engineer-a")

    const canonicalPath = path.join(tmpDir, ".aiplus/agents/canonical-events.jsonl")
    expect(fs.existsSync(canonicalPath)).toBe(true)
    const canonical = JSON.parse(fs.readFileSync(canonicalPath, "utf-8").trim())
    expect(canonical.eventType).toBe("dispatch.created")
    expect(canonical.dispatchId).toBe("dispatch-test-001")
    expect(canonical.provenance.shadowMode).toBe(true)

    const byDispatch = readCanonicalEvents(tmpDir, { dispatchId: "dispatch-test-001" })
    expect(byDispatch).toHaveLength(1)
    expect(byDispatch[0].eventType).toBe("dispatch.created")

    const byType = readCanonicalEvents(tmpDir, { eventType: "dispatch.created" })
    expect(byType).toHaveLength(1)
  })

  it("redacts secrets in task field before writing", () => {
    appendDispatchLog({
      dispatchId: "dispatch-test-002",
      role: "engineer-a",
      sessionId: "ses-1",
      task: "deploy with token=ghp_secret123456 to prod",
      worktreePath: tmpDir,
    })

    const filePath = path.join(tmpDir, ".aiplus/agents/dispatch-log.jsonl")
    const content = fs.readFileSync(filePath, "utf-8")
    const entry = JSON.parse(content.trim())
    expect(entry.task).toContain("[REDACTED_TOKEN]")
    expect(entry.task).not.toContain("ghp_")
  })

  it("skips malformed canonical lines when reading", () => {
    const canonicalPath = path.join(tmpDir, ".aiplus/agents/canonical-events.jsonl")
    fs.mkdirSync(path.dirname(canonicalPath), { recursive: true })
    fs.writeFileSync(
      canonicalPath,
      'not-json\n' +
        JSON.stringify({
          schemaVersion: "0.1.0",
          eventType: "dispatch.created",
          eventId: "evt-1",
          timestamp: new Date().toISOString(),
          dispatchId: "dispatch-test-003",
          role: "engineer-a",
          source: "test",
          status: "created",
          provenance: { transport: "native", emitter: "test", shadowMode: true },
          payload: {},
        }) +
        "\n",
      "utf-8",
    )

    const entries = readCanonicalEvents(tmpDir, { dispatchId: "dispatch-test-003" })
    expect(entries).toHaveLength(1)
    expect(entries[0].eventId).toBe("evt-1")
  })
})
