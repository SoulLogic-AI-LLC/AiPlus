/**
 * Doctor — Unified Health Check CLI
 *
 * Aggregates audit, lobby, secret-broker, and compact status
 * into a single PASS/REVISE/BLOCKED verdict.
 *
 * Exit codes: 0=PASS, 1=REVISE, 2=BLOCKED
 *
 * Run: bun run aiplus/doctor/index.ts [project-root]
 */

import * as path from "node:path"
import { formatDoctorReport, runDoctor } from "./runner"

/** Resolve project root from arg or cwd. */
function resolveProjectRoot(): string {
  const arg = process.argv[2]
  return arg ? path.resolve(arg) : process.cwd()
}

if (import.meta.main) {
  const report = runDoctor(resolveProjectRoot())
  process.stdout.write(formatDoctorReport(report))
  process.exit(report.exitCode)
}

export { runDoctor, formatDoctorReport } from "./runner"
