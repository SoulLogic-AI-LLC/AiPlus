import { cmd } from "./cmd"
import { computeVelocity, writeVelocity } from "../../../../../aiplus/velocity"

function formatPercentile(label: string, data: { p50: number; p90: number; count: number }) {
  return `  ${label}: p50=${data.p50}m · p90=${data.p90}m · n=${data.count}`
}

function formatVelocity(stats: ReturnType<typeof computeVelocity>): string {
  const topRoles = Object.entries(stats.byRole)
    .sort((a, b) => b[1].count - a[1].count)
    .slice(0, 5)
  const topTaskTypes = Object.entries(stats.byTaskType)
    .sort((a, b) => b[1].count - a[1].count)
    .slice(0, 5)

  return [
    "AiPlus Velocity",
    `  updated: ${stats.updated}`,
    `  source: ${stats.source}`,
    formatPercentile("7d trend", stats.trend7d),
    formatPercentile("30d trend", stats.trend30d),
    topRoles.length > 0 ? "  top roles:" : "  top roles: none",
    ...topRoles.map(([role, data]) => `    - ${role}: p50=${data.p50}m · p90=${data.p90}m · n=${data.count}`),
    topTaskTypes.length > 0 ? "  top task types:" : "  top task types: none",
    ...topTaskTypes.map(([type, data]) => `    - ${type}: p50=${data.p50}m · p90=${data.p90}m · n=${data.count}`),
  ].join("\n")
}

export const VelocityCommand = cmd({
  command: "velocity",
  describe: "inspect AiPlus session velocity percentiles from the OpenCode session database",
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
      .option("write", {
        type: "boolean",
        default: false,
        describe: "persist stats to .aiplus/velocity/stats.json in the current project",
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
    }
    const stats = args.write ? writeVelocity(process.cwd(), options) : computeVelocity(options)
    if (!stats) {
      process.exitCode = 1
      return
    }
    console.log(args.json ? JSON.stringify(stats, null, 2) : formatVelocity(stats))
  },
})
