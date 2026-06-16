/**
 * Agent Memory — Craft Marker Integration Tests (Stage 6)
 *
 * End-to-end coverage of the 3-gate pipeline (role whitelist → risk → dedup)
 * with realistic assistant text containing 📓 craft markers. Mirrors the
 * wiring in `packages/opencode/src/session/processor.ts` where finalized
 * assistant text is scanned after `session.updatePart`.
 */

import { describe, it, expect, beforeEach, afterEach } from "bun:test"
import * as fs from "node:fs"
import * as path from "node:path"
import * as os from "node:os"
import { processCraftMarkers } from "./craft"

describe("processCraftMarkers integration (session text scan)", () => {
  let tmpDir: string

  beforeEach(() => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "aiplus-craft-integration-"))
  })

  afterEach(() => {
    fs.rmSync(tmpDir, { recursive: true, force: true })
  })

  it("writes a valid low-risk craft marker embedded in assistant text", () => {
    const text = [
      "I traced the bug to the retry handler. The timeout was set to 0 in some paths.",
      "",
      "📓 craft · engineer-a · always run bun typecheck before committing",
      "",
      "The fix is straightforward — let me write it up.",
    ].join("\n")

    const outcome = processCraftMarkers(tmpDir, text)
    expect(outcome.captures.length).toBe(1)
    const cap = outcome.captures[0]
    expect(cap.written).toBe(true)
    expect(cap.deduped).toBe(false)
    expect(cap.blockedReason).toBe(null)
    expect(cap.riskLevel).not.toBe("high")
    expect(cap.marker.role).toBe("engineer-a")
    expect(cap.marker.lesson).toContain("bun typecheck")

    const memFile = path.join(tmpDir, ".aiplus/agent-memory/engineer-a/memory.jsonl")
    expect(fs.existsSync(memFile)).toBe(true)
    const content = fs.readFileSync(memFile, "utf-8").trim()
    expect(content.length).toBeGreaterThan(0)
    const entry = JSON.parse(content)
    expect(entry.source).toBe("craft_marker")
    expect(entry.summary).toContain("bun typecheck")
    expect(entry.tags).toContain("craft_memory")
  })

  it("blocks high-risk content (api key reference) without writing", () => {
    const text = "📓 craft · engineer-a · the api key for prod is in the env file"

    const outcome = processCraftMarkers(tmpDir, text)
    expect(outcome.captures.length).toBe(1)
    const cap = outcome.captures[0]
    expect(cap.written).toBe(false)
    expect(cap.deduped).toBe(false)
    expect(cap.blockedReason).toContain("high-risk")
    expect(cap.riskLevel).toBe("high")

    const memFile = path.join(tmpDir, ".aiplus/agent-memory/engineer-a/memory.jsonl")
    expect(fs.existsSync(memFile)).toBe(false)
  })

  it("skips a non-whitelisted role with blockedReason set", () => {
    const text = "📓 craft · random-user · some lesson about coding"

    const outcome = processCraftMarkers(tmpDir, text)
    expect(outcome.captures.length).toBe(1)
    const cap = outcome.captures[0]
    expect(cap.written).toBe(false)
    expect(cap.deduped).toBe(false)
    expect(cap.blockedReason).toContain("not in whitelist")
    expect(outcome.feedbackLines.length).toBe(1)
  })

  it("dedupes a second call with identical text (no new entry written)", () => {
    const text = "📓 craft · qa · always run full test suite before merge"

    const first = processCraftMarkers(tmpDir, text)
    expect(first.captures[0].written).toBe(true)
    expect(first.captures[0].deduped).toBe(false)

    const second = processCraftMarkers(tmpDir, text)
    expect(second.captures.length).toBe(1)
    expect(second.captures[0].written).toBe(false)
    expect(second.captures[0].deduped).toBe(true)
    expect(second.captures[0].blockedReason).toBe(null)

    const memFile = path.join(tmpDir, ".aiplus/agent-memory/qa/memory.jsonl")
    const lines = fs
      .readFileSync(memFile, "utf-8")
      .split("\n")
      .filter((line) => line.trim().length > 0)
    expect(lines.length).toBe(1)
  })

  it("processes multiple markers from a single text in one scan", () => {
    const text = [
      "Summary of what I learned:",
      "📓 craft · qa · always verify edge cases in tests",
      "📓 craft · reviewer · check for missing input validation",
      "📓 craft · hacker · this should be blocked",
    ].join("\n")

    const outcome = processCraftMarkers(tmpDir, text)
    expect(outcome.captures.length).toBe(3)
    expect(outcome.captures[0].written).toBe(true)
    expect(outcome.captures[0].marker.role).toBe("qa")
    expect(outcome.captures[1].written).toBe(true)
    expect(outcome.captures[1].marker.role).toBe("reviewer")
    expect(outcome.captures[2].written).toBe(false)
    expect(outcome.captures[2].blockedReason).toContain("not in whitelist")
  })
})
