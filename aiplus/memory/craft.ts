/**
 * Agent Memory — Craft Marker System (Stage 5)
 *
 * Parses 📓 craft · <role> · <lesson> markers from agent output,
 * runs a 3-gate pipeline (role whitelist → risk → dedup), and
 * writes approved entries to the role's memory.jsonl.
 */

import * as fs from "node:fs"
import * as path from "node:path"
import { hashEntry, writeLine } from "./append"
import { applyRedaction } from "./redact"
import { resolveLayerPath } from "./layers"
import { classifyRisk } from "./risk"
import type { CraftEntry } from "./types"

export interface CraftMarker {
  readonly role: string
  readonly lesson: string
}

export interface CraftCaptureResult {
  readonly marker: CraftMarker
  readonly written: boolean
  readonly deduped: boolean
  readonly blockedReason: string | null
  readonly riskLevel: ("low" | "medium" | "high") | null
  readonly roleMismatchWarn: string | null
}

export interface CraftScanOutcome {
  readonly captures: readonly CraftCaptureResult[]
  readonly feedbackLines: readonly string[]
}

export const ALLOWED_CRAFT_ROLES: readonly string[] = [
  "advisor",
  "ceo",
  "architect",
  "pm",
  "ui-designer",
  "ai-integration",
  "engineer-a",
  "engineer-b",
  "integration-manager",
  "qa",
  "reviewer",
  "security-reviewer",
]

export function parseCraftMarkers(text: string): CraftMarker[] {
  const lines = text.split("\n")
  const markers: CraftMarker[] = []

  for (const raw of lines) {
    const line = raw.trim()
    if (!line.startsWith("📓")) continue
    if (!line.includes("craft · ")) continue

    const afterEmoji = line.slice(line.indexOf("·") + 1).trim()
    if (!afterEmoji.includes("·")) continue

    const firstSep = afterEmoji.indexOf("·")
    const role = afterEmoji.slice(0, firstSep).trim()
    const lesson = afterEmoji.slice(firstSep + 1).trim()

    if (!role || !lesson) continue
    if (!/^[a-z0-9_-]+$/.test(role)) continue
    if (role.includes("..")) continue

    markers.push({ role, lesson })
  }

  return markers
}

export function isAllowedCraftRole(role: string): boolean {
  return ALLOWED_CRAFT_ROLES.includes(role)
}

function normalizeLesson(lesson: string): string {
  return lesson
    .trim()
    .replace(/\s{2,}/g, " ")
    .slice(0, 500)
}

function buildCraftId(lesson: string): string {
  return `craft_${Date.now()}_${hashEntry(lesson).slice(0, 12)}`
}

function writeFeedback(projectRoot: string, level: "WARN" | "BLOCKED", message: string): string {
  const feedbackDir = path.join(projectRoot, ".aiplus", "agents")
  fs.mkdirSync(feedbackDir, { recursive: true })
  const feedbackFile = path.join(feedbackDir, "stop-hook-feedback.jsonl")
  const line = JSON.stringify({ timestamp: new Date().toISOString(), level, message }) + "\n"
  fs.appendFileSync(feedbackFile, line, "utf-8")
  return line.trim()
}

function readExistingHashes(memFile: string): Set<string> {
  if (!fs.existsSync(memFile)) return new Set()
  const content = fs.readFileSync(memFile, "utf-8")
  const hashes = new Set<string>()
  for (const raw of content.split("\n")) {
    if (!raw.trim()) continue
    const entry = JSON.parse(raw)
    if (!entry.tags) continue
    for (const tag of entry.tags) {
      if (typeof tag === "string" && tag.startsWith("craft_hash:")) {
        hashes.add(tag.slice("craft_hash:".length))
      }
    }
  }
  return hashes
}

/**
 * Process craft markers from agent text through a 3-gate pipeline:
 * Gate 1 — Role whitelist
 * Gate 1.5 — Context role cross-check (warn only)
 * Gate 2 — Risk classification
 * Gate 3 — Dedup via contentHash
 */
export function processCraftMarkers(
  projectRoot: string,
  text: string,
  options?: { contextRole?: string },
): CraftScanOutcome {
  const markers = parseCraftMarkers(text)
  const captures: CraftCaptureResult[] = []
  const feedbackLines: string[] = []

  for (const marker of markers) {
    // Gate 1 — Role whitelist
    if (!isAllowedCraftRole(marker.role)) {
      const fb = writeFeedback(
        projectRoot,
        "BLOCKED",
        `craft_memory skip: role \`${marker.role}\` not in CORE+DUAL whitelist`,
      )
      feedbackLines.push(fb)
      captures.push({
        marker,
        written: false,
        deduped: false,
        blockedReason: `role \`${marker.role}\` not in whitelist`,
        riskLevel: null,
        roleMismatchWarn: null,
      })
      continue
    }

    // Gate 1.5 — Context role cross-check (warn only)
    let roleMismatchWarn: string | null = null
    if (options?.contextRole && options.contextRole !== marker.role) {
      const fb = writeFeedback(
        projectRoot,
        "WARN",
        `craft_memory role mismatch: marker role \`${marker.role}\` != context role \`${options.contextRole}\``,
      )
      feedbackLines.push(fb)
      roleMismatchWarn = `marker role \`${marker.role}\` != context role \`${options.contextRole}\``
    }

    // Gate 2 — Risk classification
    const lessonNormalized = normalizeLesson(marker.lesson)
    const risk = classifyRisk(lessonNormalized, "workflow_rule")
    if (risk === "high") {
      const redacted = applyRedaction(lessonNormalized)
      const fb = writeFeedback(
        projectRoot,
        "BLOCKED",
        `craft_memory BLOCKED (high-risk): role=${marker.role} lesson=${redacted}`,
      )
      feedbackLines.push(fb)
      captures.push({
        marker,
        written: false,
        deduped: false,
        blockedReason: "high-risk content",
        riskLevel: "high",
        roleMismatchWarn,
      })
      continue
    }

    // Gate 3 — Dedup via contentHash
    const contentHash = hashEntry(lessonNormalized)
    const memFile = resolveLayerPath(projectRoot, "personal", marker.role)
    const existingHashes = readExistingHashes(memFile)
    if (existingHashes.has(contentHash)) {
      const fb = writeFeedback(projectRoot, "WARN", `craft_memory skip: duplicate hash for role=${marker.role}`)
      feedbackLines.push(fb)
      captures.push({
        marker,
        written: false,
        deduped: true,
        blockedReason: null,
        riskLevel: risk,
        roleMismatchWarn,
      })
      continue
    }

    // Write
    const now = new Date().toISOString()
    const entry: CraftEntry = {
      schemaVersion: "0.2.0",
      id: buildCraftId(lessonNormalized),
      recordType: "workflow_rule",
      scope: "personal",
      source: "craft_marker",
      createdAt: now,
      updatedAt: now,
      summary: lessonNormalized,
      confidence: "auto_inferred",
      status: "active",
      evidence: ["craft_marker"],
      tags: ["craft_memory", `role:${marker.role}`, `craft_hash:${contentHash}`],
      redaction: "none",
      subject: marker.role,
      visibility: "personal",
      contentHash,
      supersedes: [],
      supersededBy: [],
      conflictGroup: null,
      expiresAt: null,
      staleAfter: null,
    }

    try {
      const roleDir = path.dirname(memFile)
      fs.mkdirSync(roleDir, { recursive: true })
      writeLine(memFile, entry)

      captures.push({
        marker,
        written: true,
        deduped: false,
        blockedReason: null,
        riskLevel: risk,
        roleMismatchWarn,
      })
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err)
      const fb = writeFeedback(projectRoot, "BLOCKED", `craft_memory write failed: ${msg}`)
      feedbackLines.push(fb)
      captures.push({
        marker,
        written: false,
        deduped: false,
        blockedReason: `write failed: ${msg}`,
        riskLevel: risk,
        roleMismatchWarn,
      })
    }
  }

  return { captures, feedbackLines }
}
