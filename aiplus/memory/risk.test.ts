/**
 * Agent Memory — Risk Classification Tests (Stage 4)
 */

import { describe, it, expect } from "bun:test"
import { classifyRisk, autoCapture } from "./risk"

describe("classifyRisk", () => {
  it("returns high for text containing 'api key'", () => {
    expect(classifyRisk("never share your api key with anyone", "workflow_rule")).toBe("high")
  })

  it("returns low for 'how to build' with workflow_rule type", () => {
    expect(classifyRisk("how to build the project with bun", "workflow_rule")).toBe("low")
  })

  it("returns medium for text containing 'architecture decision'", () => {
    expect(classifyRisk("we made an architecture decision to use Effect", "unknown_type")).toBe("medium")
  })

  it("returns high for 'deploy to' keyword regardless of memoryType", () => {
    expect(classifyRisk("remember to deploy to production safely", "project_fact")).toBe("high")
  })

  it("returns high for high-risk memoryType 'api_key'", () => {
    expect(classifyRisk("some generic text", "api_key")).toBe("high")
  })

  it("returns low for low-risk memoryType 'style_preference'", () => {
    expect(classifyRisk("some generic text", "style_preference")).toBe("low")
  })

  it("returns medium for medium-risk memoryType 'architecture_decision'", () => {
    expect(classifyRisk("some generic text", "architecture_decision")).toBe("medium")
  })

  it("returns medium as default for unknown type and no keyword match", () => {
    expect(classifyRisk("completely unrelated text", "unknown_type")).toBe("medium")
  })
})

describe("autoCapture", () => {
  it("blocks high-risk content when blockHighRisk is true", () => {
    const result = autoCapture("/tmp", "my api key is exposed", "workflow_rule", "personal")
    expect(result.written).toBe(false)
    expect(result.riskLevel).toBe("high")
    expect(result.reason).toContain("high-risk")
  })

  it("allows low-risk content when autoLowRisk is true", () => {
    const result = autoCapture("/tmp", "style preference: use tabs", "workflow_rule", "personal")
    expect(result.written).toBe(true)
    expect(result.riskLevel).toBe("low")
  })

  it("blocks low-risk when autoLowRisk is false", () => {
    const result = autoCapture(
      "/tmp", "style preference: use tabs", "workflow_rule", "personal",
      { autoLowRisk: false },
    )
    expect(result.written).toBe(false)
    expect(result.riskLevel).toBe("low")
  })

  it("blocks medium-risk when autoMediumRisk is false", () => {
    const result = autoCapture(
      "/tmp", "architecture decision made", "unknown_type", "personal",
      { autoMediumRisk: false },
    )
    expect(result.written).toBe(false)
    expect(result.riskLevel).toBe("medium")
  })
})