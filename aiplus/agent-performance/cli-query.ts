#!/usr/bin/env bun
/**
 * Agent Performance — Query CLI
 *
 * Usage:
 *   bun run aiplus/agent-performance/cli-query.ts -- --role <role> --task-type <type>
 *   bun run aiplus/agent-performance/cli-query.ts -- --budget [--date YYYY-MM-DD]
 *   bun run aiplus/agent-performance/cli-query.ts -- --recent [N]
 *
 * Prints JSON to stdout. No recommendations, no narrative. Data only.
 */
import { queryByRole, queryBudget, queryRecent } from "./query"

type Mode =
  | { kind: "byRole"; role: string; taskType: string; provider?: string }
  | { kind: "budget"; date?: string }
  | { kind: "recent"; n: number }

function parseArgs(argv: string[]): Mode {
  const hasByRole = argv.includes("--role") || argv.includes("--task-type")
  const hasBudget = argv.includes("--budget")
  const hasRecent = argv.includes("--recent")

  const modeCount = [hasByRole, hasBudget, hasRecent].filter(Boolean).length
  if (modeCount === 0) {
    process.stderr.write("error: must specify one of --role/--task-type, --budget, or --recent\n")
    process.exit(2)
  }
  if (modeCount > 1) {
    process.stderr.write("error: only one of --role/--task-type, --budget, or --recent allowed\n")
    process.exit(2)
  }

  if (hasByRole) {
    const roleIdx = argv.indexOf("--role")
    const taskIdx = argv.indexOf("--task-type")
    const providerIdx = argv.indexOf("--provider")
    const role = roleIdx >= 0 ? argv[roleIdx + 1] : undefined
    const taskType = taskIdx >= 0 ? argv[taskIdx + 1] : undefined
    const provider = providerIdx >= 0 ? argv[providerIdx + 1] : undefined
    if (!role || !taskType) {
      process.stderr.write("error: --role and --task-type both require values\n")
      process.exit(2)
    }
    return { kind: "byRole", role, taskType, provider }
  }

  if (hasBudget) {
    const dateIdx = argv.indexOf("--date")
    const date = dateIdx >= 0 ? argv[dateIdx + 1] : undefined
    if (dateIdx >= 0 && (!date || date.startsWith("--"))) {
      process.stderr.write("error: --date requires a YYYY-MM-DD value\n")
      process.exit(2)
    }
    return { kind: "budget", date }
  }

  const recentIdx = argv.indexOf("--recent")
  const next = argv[recentIdx + 1]
  let n = 10
  if (next && !next.startsWith("--")) {
    const parsed = Number(next)
    if (!Number.isFinite(parsed) || parsed <= 0) {
      process.stderr.write("error: --recent N requires a positive integer\n")
      process.exit(2)
    }
    n = Math.floor(parsed)
  }
  return { kind: "recent", n }
}

const projectRoot = process.cwd()
const mode = parseArgs(process.argv.slice(2))
let result: unknown

if (mode.kind === "byRole") {
  result = queryByRole(mode.role, mode.taskType, { projectRoot, providerID: mode.provider })
} else if (mode.kind === "budget") {
  result = queryBudget(mode.date, { projectRoot })
} else {
  result = queryRecent(mode.n, { projectRoot })
}

process.stdout.write(JSON.stringify(result, null, 2) + "\n")
