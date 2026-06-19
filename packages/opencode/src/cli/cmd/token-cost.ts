import { cmd } from "./cmd"
import { computeStats, writeStats } from "../../../../../aiplus/token-cost"

function formatUsd(value: number): string {
  return `$${value.toFixed(4)}`
}

function formatStats(stats: ReturnType<typeof computeStats>): string {
  const topModels = Object.entries(stats.byModel)
    .sort((a, b) => b[1].cost - a[1].cost)
    .slice(0, 5)
  const topRoles = Object.entries(stats.byRole)
    .sort((a, b) => b[1].cost - a[1].cost)
    .slice(0, 5)

  return [
    "AiPlus Token Cost",
    `  updated: ${stats.updated}`,
    `  source: ${stats.source}`,
    `  total tokens: ${stats.total.tokens}`,
    `  total cost: ${formatUsd(stats.total.cost)}`,
    `  models tracked: ${Object.keys(stats.byModel).length}`,
    `  roles tracked: ${Object.keys(stats.byRole).length}`,
    topModels.length > 0 ? "  top models:" : "  top models: none",
    ...topModels.map(
      ([model, entry]) =>
        `    - ${model}: ${formatUsd(entry.cost)} · ${entry.tokens} tokens · ${entry.sessions} sessions`,
    ),
    topRoles.length > 0 ? "  top roles:" : "  top roles: none",
    ...topRoles.map(
      ([role, entry]) =>
        `    - ${role}: ${formatUsd(entry.cost)} · ${entry.tokens} tokens · ${entry.sessions} sessions`,
    ),
  ].join("\n")
}

export const TokenCostCommand = cmd({
  command: "token-cost",
  describe: "inspect AiPlus token usage and cost from the OpenCode session database",
  builder: (yargs) =>
    yargs
      .option("db-path", {
        type: "string",
        describe: "optional SQLite database override",
      })
      .option("window-start", {
        type: "number",
        describe: "optional epoch-ms lower bound",
      })
      .option("window-end", {
        type: "number",
        describe: "optional epoch-ms upper bound",
      })
      .option("project-dir", {
        type: "string",
        describe: "optional project directory filter",
      })
      .option("write", {
        type: "boolean",
        default: false,
        describe: "persist stats to .aiplus/token-cost/stats.json in the current project",
      })
      .option("json", {
        type: "boolean",
        default: false,
        describe: "print raw JSON instead of the summary view",
      }),
  handler: async (args) => {
    const options = {
      dbPath: typeof args.dbPath === "string" ? args.dbPath : undefined,
      windowStart: typeof args.windowStart === "number" ? args.windowStart : undefined,
      windowEnd: typeof args.windowEnd === "number" ? args.windowEnd : undefined,
      projectDir: typeof args.projectDir === "string" ? args.projectDir : undefined,
    }
    const stats = args.write ? writeStats(process.cwd(), options) : computeStats(options)
    if (!stats) {
      process.exitCode = 1
      return
    }
    console.log(args.json ? JSON.stringify(stats, null, 2) : formatStats(stats))
  },
})
