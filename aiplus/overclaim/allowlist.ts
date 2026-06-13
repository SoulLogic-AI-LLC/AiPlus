/**
 * Overclaim — Command Allowlist (v1 MVP)
 *
 * Ported from AiPlus Source: crates/aiplus-cli/src/overclaim/allowlist.rs
 *
 * v1: 8-step gating pipeline (fail-closed).
 * Skipped in v1: git/python3 deep validation, path operand worktree containment,
 * symlink defense, macOS sandbox-exec.
 */

import * as path from "node:path"

// ---- Types -----------------------------------------------------------------

export type Classification =
  | { accepted: true; argv: string[] }
  | { accepted: false; reason: string }

const METACHARS = new Set([
  "|", "&", ";", "(", ")", "<", ">", "`", "$", "\n", "\r", "\\", "*", "?", "{", "}", "[", "]",
])

const PROGRAM_ALLOWLIST = new Set([
  "grep", "rg", "git", "cat", "head", "tail", "wc", "test", "python3",
])

const DENY_FLAGS = new Set([
  "-w", "--write", "-o", "--output", "-i", "--in-place", "--force",
  "-d", "--delete", "-D", "--hard", "--soft", "-rf", "-fr",
])

// ---- Step 1: NUL byte rejection -------------------------------------------

function rejectNul(raw: string): string | null {
  if (raw.includes("\0")) return "command contains NUL byte"
  return null
}

// ---- Step 2: Control character rejection ----------------------------------

function rejectControl(raw: string): string | null {
  for (const ch of raw) {
    const code = ch.charCodeAt(0)
    // Allow: tab (9), newline (10), carriage return (13), and printable (32-126)
    // Newline/CR are caught by metachar scan; tab is allowed as token separator.
    if (code < 32 && code !== 9 && code !== 10 && code !== 13) {
      return `control character 0x${code.toString(16)}`
    }
  }
  return null
}

// ---- Step 3: Shell metacharacter rejection --------------------------------

function rejectMetachars(raw: string): string | null {
  for (const ch of raw) {
    if (METACHARS.has(ch)) {
      return `shell metacharacter: '${ch}'`
    }
  }
  return null
}

// ---- Step 4: Shell-free tokenizer -----------------------------------------

/**
 * Tokenize a command string WITHOUT any shell expansion.
 * Honors single and double quotes for grouping literal bytes only.
 * No variable expansion, command substitution, glob, brace, or tilde expansion.
 * Quotes are stripped; their contents taken literally.
 */
function tokenize(raw: string): string[] | string {
  const tokens: string[] = []
  let current = ""
  let inSingle = false
  let inDouble = false

  for (let i = 0; i < raw.length; i++) {
    const ch = raw[i]

    if (inSingle) {
      if (ch === "'") {
        inSingle = false
      } else {
        current += ch
      }
      continue
    }

    if (inDouble) {
      if (ch === '"') {
        inDouble = false
      } else {
        current += ch
      }
      continue
    }

    // Not in any quote
    if (ch === "'") {
      inSingle = true
      continue
    }
    if (ch === '"') {
      inDouble = true
      continue
    }

    if (ch === " " || ch === "\t") {
      if (current.length > 0) {
        tokens.push(current)
        current = ""
      }
      continue
    }

    current += ch
  }

  if (inSingle) return "unbalanced single quote"
  if (inDouble) return "unbalanced double quote"

  if (current.length > 0) tokens.push(current)
  return tokens
}

// ---- Step 5: Leading ~ rejection ------------------------------------------

function rejectLeadingTilde(argv: string[]): string | null {
  for (const token of argv) {
    if (token.startsWith("~")) return `leading ~ in token: '${token}'`
  }
  return null
}

// ---- Step 6: ENV assignment rejection -------------------------------------

function rejectEnvAssignment(argv: string[]): string | null {
  if (argv.length === 0) return null
  const first = argv[0]
  if (/^[A-Za-z_][A-Za-z0-9_]*=/.test(first)) {
    return `env assignment in first token: '${first}'`
  }
  return null
}

// ---- Step 7: Program allowlist --------------------------------------------

function rejectProgram(argv: string[]): string | null {
  if (argv.length === 0) return "empty command"
  const prog = argv[0]
  // Must be a bare name (no slashes, no path)
  if (prog.includes("/")) return `program name contains '/': '${prog}'`
  if (!PROGRAM_ALLOWLIST.has(prog)) {
    return `program '${prog}' not in allowlist: [${[...PROGRAM_ALLOWLIST].join(", ")}]`
  }
  return null
}

// ---- Step 8: Generic deny-flag scan ---------------------------------------

function rejectDenyFlags(argv: string[]): string | null {
  for (let i = 1; i < argv.length; i++) {
    const token = argv[i]
    // Exact match
    if (DENY_FLAGS.has(token)) return `deny-flag: '${token}'`
    // Glued form: --flag=VALUE or -fVALUE
    const eqIdx = token.indexOf("=")
    const flagPart = eqIdx > 0 ? token.slice(0, eqIdx) : token
    if (DENY_FLAGS.has(flagPart)) return `deny-flag: '${token}'`
    // Short flag cluster: only if the short form could be in a cluster
    // e.g., -rf → check if any deny short flag in cluster
    if (token.startsWith("-") && !token.startsWith("--") && token.length > 2) {
      for (const deny of DENY_FLAGS) {
        if (deny.startsWith("-") && !deny.startsWith("--") && deny.length === 2) {
          if (token.slice(1).includes(deny[1])) return `deny-flag in cluster: '${token}' (matched '${deny}')`
        }
      }
    }
  }
  return null
}

// ---- Main classify function ------------------------------------------------

/**
 * Classify a command string as accepted or rejected.
 * 8-step fail-closed pipeline: first rejection wins.
 *
 * @param raw Raw command string (e.g. "git log --oneline")
 * @param _root Worktree root (unused in v1, reserved for v2 path containment)
 */
export function classify(raw: string, _root?: string): Classification {
  // Step 1: NUL byte
  const nulErr = rejectNul(raw)
  if (nulErr) return { accepted: false, reason: `step1(NUL): ${nulErr}` }

  // Step 2: Control characters
  const ctrlErr = rejectControl(raw)
  if (ctrlErr) return { accepted: false, reason: `step2(control): ${ctrlErr}` }

  // Step 3: Shell metacharacters
  const metaErr = rejectMetachars(raw)
  if (metaErr) return { accepted: false, reason: `step3(metachar): ${metaErr}` }

  // Step 4: Tokenize
  const tokens = tokenize(raw)
  if (typeof tokens === "string") return { accepted: false, reason: `step4(tokenize): ${tokens}` }

  // Step 5: Leading ~
  const tildeErr = rejectLeadingTilde(tokens)
  if (tildeErr) return { accepted: false, reason: `step5(tilde): ${tildeErr}` }

  // Step 6: ENV assignment
  const envErr = rejectEnvAssignment(tokens)
  if (envErr) return { accepted: false, reason: `step6(env): ${envErr}` }

  // Step 7: Program allowlist
  const progErr = rejectProgram(tokens)
  if (progErr) return { accepted: false, reason: `step7(allowlist): ${progErr}` }

  // Step 8: Deny flags
  const flagErr = rejectDenyFlags(tokens)
  if (flagErr) return { accepted: false, reason: `step8(flags): ${flagErr}` }

  return { accepted: true, argv: tokens }
}
