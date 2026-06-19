/**
 * Agent Memory — Craft Marker Tests (Stage 5)
 */

import { describe, it, expect, beforeEach, afterEach } from "bun:test"
import * as fs from "node:fs"
import * as path from "node:path"
import * as os from "node:os"
import { parseCraftMarkers, processCraftMarkers, isAllowedCraftRole, ALLOWED_CRAFT_ROLES } from "./craft"

describe("parseCraftMarkers", () => {
  it("extracts role and lesson from valid marker line", () => {
    const text = "📓 craft · engineer-a · always run bun typecheck before committing"
    const markers = parseCraftMarkers(text)
    expect(markers.length).toBe(1)
    expect(markers[0].role).toBe("engineer-a")
    expect(markers[0].lesson).toBe("always run bun typecheck before committing")
  })

  it("rejects role with '..' (path traversal)", () => {
    const text = "📓 craft · ../secret · this should be rejected"
    const markers = parseCraftMarkers(text)
    expect(markers.length).toBe(0)
  })

  it("rejects role not matching [a-z0-9_-]+", () => {
    const text = "📓 craft · Engineer A · invalid role with spaces"
    const markers = parseCraftMarkers(text)
    expect(markers.length).toBe(0)
  })

  it("returns empty for text with no craft markers", () => {
    const markers = parseCraftMarkers("just some regular text\nnothing special here")
    expect(markers.length).toBe(0)
  })

  it("parses multiple markers from text", () => {
    const text = [
      "📓 craft · qa · always run full test suite",
      "some intermediate text",
      "📓 craft · reviewer · check for security issues",
    ].join("\n")
    const markers = parseCraftMarkers(text)
    expect(markers.length).toBe(2)
    expect(markers[0].role).toBe("qa")
    expect(markers[1].role).toBe("reviewer")
  })
})

describe("isAllowedCraftRole", () => {
  it("returns true for allowed role", () => {
    expect(isAllowedCraftRole("engineer-a")).toBe(true)
  })

  it("returns false for disallowed role", () => {
    expect(isAllowedCraftRole("hacker")).toBe(false)
  })

  it("has exactly 12 allowed roles", () => {
    expect(ALLOWED_CRAFT_ROLES.length).toBe(12)
  })
})

describe("processCraftMarkers", () => {
  let tmpDir: string

  beforeEach(() => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "aiplus-craft-test-"))
  })

  afterEach(() => {
    fs.rmSync(tmpDir, { recursive: true, force: true })
  })

  it("blocks role not in ALLOWED_CRAFT_ROLES", () => {
    const text = "📓 craft · hacker · steal all the data"
    const outcome = processCraftMarkers(tmpDir, text)
    expect(outcome.captures.length).toBe(1)
    expect(outcome.captures[0].written).toBe(false)
    expect(outcome.captures[0].blockedReason).toContain("not in whitelist")
    expect(outcome.feedbackLines.length).toBe(1)
  })

  it("blocks high-risk lesson (contains 'api key')", () => {
    const text = "📓 craft · engineer-a · the api key for production is stored in env"
    const outcome = processCraftMarkers(tmpDir, text)
    expect(outcome.captures.length).toBe(1)
    expect(outcome.captures[0].written).toBe(false)
    expect(outcome.captures[0].blockedReason).toContain("high-risk")
    expect(outcome.captures[0].riskLevel).toBe("high")
  })

  it("writes valid low-risk lesson and returns written=true", () => {
    const text = "📓 craft · engineer-a · always use bun typecheck before committing"
    const outcome = processCraftMarkers(tmpDir, text)
    expect(outcome.captures.length).toBe(1)
    expect(outcome.captures[0].written).toBe(true)
    expect(outcome.captures[0].deduped).toBe(false)

    const memFile = path.join(tmpDir, ".aiplus/agent-memory/engineer-a/memory.jsonl")
    expect(fs.existsSync(memFile)).toBe(true)
    const entry = JSON.parse(fs.readFileSync(memFile, "utf-8").trim())
    expect(entry.source).toBe("craft_marker")
    expect(entry.summary).toContain("bun typecheck")
    expect(entry.tags).toContain("craft_memory")
  })

  it("dedupes on second write (same content hash)", () => {
    const text = "📓 craft · qa · always run full test suite before merge"
    const first = processCraftMarkers(tmpDir, text)
    expect(first.captures[0].written).toBe(true)

    const second = processCraftMarkers(tmpDir, text)
    expect(second.captures[0].written).toBe(false)
    expect(second.captures[0].deduped).toBe(true)
  })

  it("with contextRole mismatch writes WARN but does not block", () => {
    const text = "📓 craft · qa · always verify edge cases in tests"
    const outcome = processCraftMarkers(tmpDir, text, { contextRole: "engineer-a" })
    expect(outcome.captures.length).toBe(1)
    expect(outcome.captures[0].written).toBe(true)
    expect(outcome.captures[0].roleMismatchWarn).toContain("qa")
    expect(outcome.captures[0].roleMismatchWarn).toContain("engineer-a")
    expect(outcome.feedbackLines.length).toBe(1)
  })

  it("empty text returns empty outcome", () => {
    const outcome = processCraftMarkers(tmpDir, "")
    expect(outcome.captures.length).toBe(0)
    expect(outcome.feedbackLines.length).toBe(0)
  })

  it("writes feedback to stop-hook-feedback.jsonl", () => {
    const text = "📓 craft · hacker · bad lesson"
    processCraftMarkers(tmpDir, text)
    const fbFile = path.join(tmpDir, ".aiplus/agents/stop-hook-feedback.jsonl")
    expect(fs.existsSync(fbFile)).toBe(true)
    const content = fs.readFileSync(fbFile, "utf-8").trim()
    expect(content).toContain("CORE+DUAL whitelist")
  })
})
