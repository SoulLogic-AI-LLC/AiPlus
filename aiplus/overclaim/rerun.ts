/**
 * Overclaim — Sandboxed Re-Execution Engine (v1 MVP)
 *
 * Ported from AiPlus Source: crates/aiplus-cli/src/overclaim/rerun.rs
 *
 * v1: child_process.spawn + clean env + 10s timeout + 1MB output cap.
 * Skipped in v1: macOS sandbox-exec App Sandbox profile, process group SIGKILL.
 */

import { spawn, type ChildProcess } from "node:child_process"
import { classify } from "./allowlist"
import type { RunOutcome, RerunResult } from "./schema"

const TIMEOUT_MS = 10_000
const MAX_OUTPUT_BYTES = 1_000_000

// ---- Helpers ---------------------------------------------------------------

function sha256hex(data: Buffer | string): string {
  const input = typeof data === "string" ? Buffer.from(data, "utf-8") : data
  return Bun.SHA256.hash(input, "hex").slice(0, 64)
}

function cleanEnv(): Record<string, string> {
  // Minimal env: PATH + HOME only. Git needs HOME for config.
  return {
    PATH: "/usr/local/bin:/opt/homebrew/bin:/usr/bin:/bin:/usr/sbin:/sbin",
    HOME: process.env.HOME ?? "/",
    GIT_PAGER: "cat",
    GIT_TERMINAL_PROMPT: "0",
    GIT_OPTIONAL_LOCKS: "0",
    GIT_CONFIG_NOSYSTEM: "1",
    LC_ALL: "C",
  }
}

// ---- Sandboxed Execution ---------------------------------------------------

interface ExecOutcome {
  stdout: string
  stderr: string
  error?: string
  killed: boolean
}

function execSandboxed(argv: string[], root: string): Promise<ExecOutcome> {
  return new Promise((resolve) => {
    const [program, ...args] = argv
    let stdout = ""
    let stderr = ""
    let killed = false
    let timedOut = false

    const child: ChildProcess = spawn(program, args, {
      cwd: root,
      env: cleanEnv(),
      stdio: ["ignore", "pipe", "pipe"],
      // Node.js does not support process groups natively;
      // we use child.kill("SIGKILL") which kills the direct child.
    })

    const timer = setTimeout(() => {
      timedOut = true
      killed = true
      child.kill("SIGKILL")
    }, TIMEOUT_MS)

    child.stdout?.on("data", (chunk: Buffer) => {
      if (stdout.length < MAX_OUTPUT_BYTES) {
        stdout += chunk.toString("utf-8")
      }
    })

    child.stderr?.on("data", (chunk: Buffer) => {
      if (stderr.length < MAX_OUTPUT_BYTES) {
        stderr += chunk.toString("utf-8")
      }
    })

    child.on("close", (code, signal) => {
      clearTimeout(timer)
      const error = timedOut
        ? `timeout after ${TIMEOUT_MS}ms`
        : signal
          ? `killed by signal ${signal}`
          : undefined

      resolve({
        stdout: stdout.slice(0, MAX_OUTPUT_BYTES),
        stderr: stderr.slice(0, MAX_OUTPUT_BYTES),
        error,
        killed: killed || signal !== null,
      })
    })

    child.on("error", (err) => {
      clearTimeout(timer)
      resolve({
        stdout,
        stderr,
        error: err.message,
        killed: false,
      })
    })
  })
}

// ---- Main rerun function ---------------------------------------------------

/**
 * Re-run a single claim's command in a sandboxed environment.
 *
 * 1. Classify command via allowlist — reject immediately if unsafe.
 * 2. Execute sandboxed (clean env, timeout, output cap).
 * 3. Compare actual output against expected substring.
 * 4. Return RunOutcome with verdict.
 */
export async function rerunClaim(
  rawCmd: string,
  expected: string,
  root: string,
): Promise<RunOutcome> {
  const classification = classify(rawCmd, root)
  if (!classification.accepted) {
    return {
      result: "NotRerunnable",
      reason: classification.reason,
    }
  }

  // Security: python3 — isolated mode + disable site-packages
  const argv = [...classification.argv]
  if (argv[0] === "python3" || argv[0]?.endsWith("/python3")) {
    argv.splice(1, 0, "-I", "-S")
  }

  const execResult = await execSandboxed(argv, root)

  if (execResult.error && execResult.stdout.length === 0 && execResult.stderr.length === 0) {
    return {
      result: "NotRerunnable",
      reason: execResult.error,
    }
  }

  const output = execResult.stdout + (execResult.stderr ? "\n" + execResult.stderr : "")
  const rawBytes = Buffer.from(output, "utf-8")
  const sha = sha256hex(rawBytes)
  const passed = output.includes(expected)

  let result: RerunResult
  if (execResult.error) {
    // Command ran but had issues (e.g., non-zero exit) — still check output
    result = passed ? "LiteralPass" : "LiteralFail"
  } else {
    result = passed ? "LiteralPass" : "LiteralFail"
  }

  return {
    result,
    actual: output.slice(0, MAX_OUTPUT_BYTES),
    actual_sha256: sha,
  }
}
