/**
 * Effect Gateway — Classification (V1)
 *
 * Auto-classifies tool calls by side effect type.
 * V1: Hardcoded rules (configurable in V2 if needed).
 */

import type { ClassificationResult, SideEffectClass, RetryPolicy } from "./types"

/** Tools that are always READ_ONLY. */
const READ_ONLY_TOOLS = new Set(["read", "grep", "glob", "webfetch"])

/** Tools that are always MUTATING. */
const MUTATING_TOOLS = new Set(["write", "edit", "pencil_batch_design"])

/** Dangerous bash patterns that are IRREVERSIBLE. */
const IRREVERSIBLE_PATTERNS = [
  /rm\s+-rf/i,
  /force[-_]?push/i,
  /--force\b/i,
  /DROP\s+TABLE/i,
  /git\s+reset\s+--hard/i,
  /git\s+clean\s+-fd/i,
  /mkfs/i,
  /dd\s+if=/i,
]

/** Network-related bash patterns that are EXTERNAL. */
const EXTERNAL_PATTERNS = [
  /\bcurl\b/i,
  /\bwget\b/i,
  /\bfetch\b/i,
  /\bhttp\b/i,
  /\bhttps\b/i,
]

/**
 * Classify a tool call by side effect type.
 *
 * Rules (V1, hardcoded):
 * - read/grep/glob/webfetch → READ_ONLY
 * - write/edit/pencil_batch_design → MUTATING
 * - bash with dangerous patterns → IRREVERSIBLE
 * - bash with network patterns → EXTERNAL
 * - bash default → MUTATING
 * - default → MUTATING
 */
export function classifyToolEffect(
  toolName: string,
  toolArgs: Record<string, unknown>,
): ClassificationResult {
  // READ_ONLY
  if (READ_ONLY_TOOLS.has(toolName)) {
    return {
      sideEffectClass: "READ_ONLY",
      retryPolicy: "LINEAR_BACKOFF",
    }
  }

  // MUTATING (write/edit)
  if (MUTATING_TOOLS.has(toolName)) {
    return {
      sideEffectClass: "MUTATING",
      retryPolicy: "EXPONENTIAL_BACKOFF",
    }
  }

  // Bash: check patterns
  if (toolName === "bash") {
    const cmd = (toolArgs.command as string) ?? ""

    // IRREVERSIBLE: dangerous commands
    for (const pattern of IRREVERSIBLE_PATTERNS) {
      if (pattern.test(cmd)) {
        return {
          sideEffectClass: "IRREVERSIBLE",
          retryPolicy: "NO_RETRY",
        }
      }
    }

    // EXTERNAL: network requests
    for (const pattern of EXTERNAL_PATTERNS) {
      if (pattern.test(cmd)) {
        return {
          sideEffectClass: "EXTERNAL",
          retryPolicy: "NO_RETRY",
        }
      }
    }

    // MUTATING: regular bash
    return {
      sideEffectClass: "MUTATING",
      retryPolicy: "NO_RETRY",
    }
  }

  // Default: MUTATING
  return {
    sideEffectClass: "MUTATING",
    retryPolicy: "NO_RETRY",
  }
}
