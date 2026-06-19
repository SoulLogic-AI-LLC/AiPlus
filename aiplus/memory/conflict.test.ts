/**
 * Agent Memory — Conflict Detection Tests
 */

import { describe, it, expect } from "bun:test"
import { detectConflicts, detectStale } from "./conflict"
import type { ConflictCapable } from "./conflict"

function makeRecord(overrides: Partial<ConflictCapable> & { id: string }): ConflictCapable {
  return {
    summary: `summary for ${overrides.id}`,
    status: "active",
    conflictGroup: null,
    supersedes: [],
    supersededBy: [],
    confidence: "owner_asserted",
    expiresAt: null,
    staleAfter: null,
    ...overrides,
  }
}

describe("detectConflicts", () => {
  it("reports conflict_group_divergence when entries share group but differ in summary", () => {
    const records = [
      makeRecord({ id: "a", conflictGroup: "runtime-choice", summary: "use Bun" }),
      makeRecord({ id: "b", conflictGroup: "runtime-choice", summary: "use Node" }),
    ]
    const reports = detectConflicts(records)
    const divergences = reports.filter((r) => r.conflictType === "conflict_group_divergence")
    expect(divergences.length).toBe(2)
    expect(divergences[0].relatedIds).toEqual(["a", "b"])
    expect(divergences[1].relatedIds).toEqual(["a", "b"])
  })

  it("reports missing_superseded when supersedes references non-existent id", () => {
    const records = [makeRecord({ id: "new-1", supersedes: ["ghost-id"] })]
    const reports = detectConflicts(records)
    const missing = reports.filter((r) => r.conflictType === "missing_superseded")
    expect(missing.length).toBe(1)
    expect(missing[0].recordId).toBe("new-1")
    expect(missing[0].relatedIds).toEqual(["ghost-id"])
  })

  it("reports circular_supersede when A→B and B→A", () => {
    const records = [makeRecord({ id: "a", supersedes: ["b"] }), makeRecord({ id: "b", supersedes: ["a"] })]
    const reports = detectConflicts(records)
    const circulars = reports.filter((r) => r.conflictType === "circular_supersede")
    expect(circulars.length).toBe(1)
    expect(circulars[0].relatedIds).toContain("a")
    expect(circulars[0].relatedIds).toContain("b")
  })

  it("returns no conflicts when records are clean", () => {
    const records = [makeRecord({ id: "x" }), makeRecord({ id: "y" })]
    expect(detectConflicts(records).length).toBe(0)
  })
})

describe("detectStale", () => {
  it("reports confidence_marked_stale", () => {
    const records = [makeRecord({ id: "s1", confidence: "stale" })]
    const reports = detectStale(records)
    expect(reports.length).toBe(1)
    expect(reports[0].reason).toBe("confidence_marked_stale")
  })

  it("reports expired when now > expiresAt", () => {
    const records = [makeRecord({ id: "s2", expiresAt: "1000" })]
    const reports = detectStale(records, 2000)
    expect(reports.length).toBe(1)
    expect(reports[0].reason).toBe("expired")
  })

  it("reports stale_after_elapsed when now > staleAfter", () => {
    const records = [makeRecord({ id: "s3", staleAfter: "5000" })]
    const reports = detectStale(records, 6000)
    expect(reports.length).toBe(1)
    expect(reports[0].reason).toBe("stale_after_elapsed")
  })

  it("returns empty for fresh records", () => {
    const records = [makeRecord({ id: "fresh", expiresAt: String(Date.now() + 1_000_000) })]
    expect(detectStale(records, 0).length).toBe(0)
  })
})
