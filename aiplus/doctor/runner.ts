import type { DoctorVerdict, DoctorCheck, DoctorReport } from "./types"
import { checkAudit, checkLobby, checkSecretBroker, checkCompact } from "./checks"

/** Compute overall verdict from checks (worst wins). */
function computeVerdict(checks: DoctorCheck[]): DoctorVerdict {
  if (checks.some((c) => c.status === "BLOCKED")) return "BLOCKED"
  if (checks.some((c) => c.status === "REVISE")) return "REVISE"
  return "PASS"
}

/** Map verdict to exit code. */
export function doctorVerdictToExitCode(verdict: DoctorVerdict): number {
  switch (verdict) {
    case "PASS":
      return 0
    case "REVISE":
      return 1
    case "BLOCKED":
      return 2
  }
}

/** ANSI colors. */
const C = {
  reset: "\x1b[0m",
  bold: "\x1b[1m",
  green: "\x1b[32m",
  yellow: "\x1b[33m",
  red: "\x1b[31m",
  dim: "\x1b[2m",
}

/** Color for verdict. */
function verdictColor(v: DoctorVerdict): string {
  switch (v) {
    case "PASS":
      return C.green
    case "REVISE":
      return C.yellow
    case "BLOCKED":
      return C.red
  }
}

/** Icon for verdict. */
function verdictIcon(v: DoctorVerdict): string {
  switch (v) {
    case "PASS":
      return "✓"
    case "REVISE":
      return "⚠"
    case "BLOCKED":
      return "✗"
  }
}

/** Format doctor report for terminal output. */
export function formatDoctorReport(report: DoctorReport): string {
  const lines: string[] = []

  lines.push("")
  lines.push(`${C.bold}╔══════════════════════════════════════════╗${C.reset}`)
  lines.push(`${C.bold}║          AiPlus Doctor                   ║${C.reset}`)
  lines.push(`${C.bold}╚══════════════════════════════════════════╝${C.reset}`)
  lines.push("")

  const vc = verdictColor(report.verdict)
  const vi = verdictIcon(report.verdict)
  lines.push(`  ${C.bold}Verdict:${C.reset} ${vc}${vi} ${report.verdict}${C.reset}`)
  lines.push(`  ${C.dim}Timestamp:${C.reset} ${report.timestamp}`)
  lines.push("")

  for (const check of report.checks) {
    const cc = verdictColor(check.status)
    const ci = verdictIcon(check.status)
    lines.push(`  ${cc}${ci}${C.reset} ${C.bold}${check.name}${C.reset}`)
    lines.push(`    ${C.dim}${check.detail}${C.reset}`)
  }

  lines.push("")
  lines.push(`  ${C.dim}Exit code: ${report.exitCode} (0=PASS, 1=REVISE, 2=BLOCKED)${C.reset}`)
  lines.push("")

  return lines.join("\n")
}

/** Run all checks and produce report. */
export function runDoctor(projectRoot: string): DoctorReport {
  const checks: DoctorCheck[] = [checkAudit(projectRoot), checkLobby(projectRoot), checkSecretBroker(), checkCompact()]

  const verdict = computeVerdict(checks)

  return {
    verdict,
    timestamp: new Date().toISOString(),
    checks,
    exitCode: doctorVerdictToExitCode(verdict),
  }
}
