import { describe, expect, test } from "bun:test"
import { RGBA } from "@opentui/core"
import {
  pressureFg,
  shouldRender,
  lookupThreshold,
  isCapsuleResponse,
} from "../../src/feature-plugins/sidebar/compact-gauge-utils"
import type { TuiThemeCurrent } from "@opencode-ai/plugin/tui"

const makeTheme = (): TuiThemeCurrent => {
  const fields: Array<keyof TuiThemeCurrent> = [
    "primary",
    "secondary",
    "accent",
    "error",
    "warning",
    "success",
    "info",
    "text",
    "textMuted",
    "selectedListItemText",
    "background",
    "backgroundPanel",
    "backgroundElement",
    "backgroundMenu",
    "border",
    "borderActive",
    "borderSubtle",
    "diffAdded",
    "diffRemoved",
    "diffContext",
    "diffHunkHeader",
    "diffHighlightAdded",
    "diffHighlightRemoved",
    "diffAddedBg",
    "diffRemovedBg",
    "diffContextBg",
    "diffLineNumber",
    "diffAddedLineNumberBg",
    "diffRemovedLineNumberBg",
    "markdownText",
    "markdownHeading",
    "markdownLink",
    "markdownLinkText",
    "markdownCode",
    "markdownBlockQuote",
    "markdownEmph",
    "markdownStrong",
    "markdownHorizontalRule",
    "markdownListItem",
    "markdownListEnumeration",
    "markdownImage",
    "markdownImageText",
    "markdownCodeBlock",
    "syntaxComment",
    "syntaxKeyword",
    "syntaxFunction",
    "syntaxVariable",
    "syntaxString",
    "syntaxNumber",
    "syntaxType",
    "syntaxOperator",
    "syntaxPunctuation",
  ]
  const theme = {} as Record<keyof TuiThemeCurrent, RGBA>
  for (const f of fields) theme[f] = RGBA.fromValues(0, 0, 0, 1)
  return { ...theme, thinkingOpacity: 0.5 }
}

const fakeTheme: TuiThemeCurrent = (() => {
  const base = makeTheme()
  return {
    ...base,
    error: RGBA.fromValues(1, 0, 0, 1),
    warning: RGBA.fromValues(1, 1, 0, 1),
    success: RGBA.fromValues(0, 1, 0, 1),
    textMuted: RGBA.fromValues(0.5, 0.5, 0.5, 1),
  }
})()

const sampleThresholds = {
  "minimax-m3": { soft: 0.4, hard: 0.55, emergency: 0.7 },
  "claude-opus": { soft: 0.25, hard: 0.35, emergency: 0.5 },
}

describe("compact-gauge-utils", () => {
  describe("pressureFg", () => {
    test("soft → success (green)", () => {
      expect(pressureFg("soft", fakeTheme)).toBe(fakeTheme.success)
    })
    test("hard → warning (yellow)", () => {
      expect(pressureFg("hard", fakeTheme)).toBe(fakeTheme.warning)
    })
    test("emergency → error (red)", () => {
      expect(pressureFg("emergency", fakeTheme)).toBe(fakeTheme.error)
    })
    test("silent → textMuted (grey)", () => {
      expect(pressureFg("silent", fakeTheme)).toBe(fakeTheme.textMuted)
    })
  })

  describe("shouldRender", () => {
    test("null capsule → false", () => {
      expect(shouldRender(null, "ses_1")).toBe(false)
    })
    test("sessionId mismatch → false", () => {
      expect(shouldRender({ sessionId: "ses_2", pressureLevel: "soft" }, "ses_1")).toBe(false)
    })
    test("pressureLevel silent → false", () => {
      expect(shouldRender({ sessionId: "ses_1", pressureLevel: "silent" }, "ses_1")).toBe(false)
    })
    test("soft + matching session → true", () => {
      expect(shouldRender({ sessionId: "ses_1", pressureLevel: "soft" }, "ses_1")).toBe(true)
    })
    test("hard + matching session → true", () => {
      expect(shouldRender({ sessionId: "ses_1", pressureLevel: "hard" }, "ses_1")).toBe(true)
    })
    test("emergency + matching session → true", () => {
      expect(shouldRender({ sessionId: "ses_1", pressureLevel: "emergency" }, "ses_1")).toBe(true)
    })
  })

  describe("lookupThreshold", () => {
    test("known model → returns HTTP value", () => {
      expect(lookupThreshold(sampleThresholds, "minimax-m3")).toEqual({
        soft: 0.4,
        hard: 0.55,
        emergency: 0.7,
      })
    })
    test("unknown model → safe fallback", () => {
      expect(lookupThreshold(sampleThresholds, "unknown-model")).toEqual({
        soft: 0.3,
        hard: 0.45,
        emergency: 0.6,
      })
    })
    test("empty thresholds → safe fallback", () => {
      expect(lookupThreshold({}, "minimax-m3")).toEqual({
        soft: 0.3,
        hard: 0.45,
        emergency: 0.6,
      })
    })
  })

  describe("isCapsuleResponse", () => {
    test("valid shape → true", () => {
      const v = { capsule: null, thresholds: sampleThresholds }
      expect(isCapsuleResponse(v)).toBe(true)
    })
    test("missing capsule → false", () => {
      expect(isCapsuleResponse({ thresholds: sampleThresholds })).toBe(false)
    })
    test("missing thresholds → false", () => {
      expect(isCapsuleResponse({ capsule: null })).toBe(false)
    })
    test("thresholds not object → false", () => {
      expect(isCapsuleResponse({ capsule: null, thresholds: "bad" })).toBe(false)
    })
    test("null → false", () => {
      expect(isCapsuleResponse(null)).toBe(false)
    })
    test("undefined → false", () => {
      expect(isCapsuleResponse(undefined)).toBe(false)
    })
  })
})
