import { cmd } from "./cmd"
import * as fs from "node:fs"
import { resolveLayerPath, type MemoryLayer } from "../../../../../aiplus/memory"

function readJsonl(filePath: string): unknown[] {
  if (!fs.existsSync(filePath)) return []
  return fs
    .readFileSync(filePath, "utf-8")
    .split("\n")
    .filter((line) => line.trim().length > 0)
    .map((line) => JSON.parse(line))
}

function getLayerPath(projectRoot: string, layer: MemoryLayer, role?: string) {
  try {
    return resolveLayerPath(projectRoot, layer, role)
  } catch {
    return null
  }
}

export const MemoryCommand = cmd({
  command: "memory",
  describe: "inspect AiPlus personal, team, and project memory layers",
  builder: (yargs) =>
    yargs
      .command(
        "status",
        "show entry counts across memory layers",
        () => {},
        async () => {
          const projectRoot = process.cwd()
          const teamPath = getLayerPath(projectRoot, "team")
          const projectPath = getLayerPath(projectRoot, "project")
          const personalDir = `${projectRoot}/.aiplus/agent-memory`
          const personalRoles = fs.existsSync(personalDir)
            ? fs.readdirSync(personalDir).filter((name) => !name.startsWith(".") && name !== "_team" && name !== "project")
            : []
          const personalCount = personalRoles.reduce((sum, role) => {
            const filePath = getLayerPath(projectRoot, "personal", role)
            return sum + (filePath ? readJsonl(filePath).length : 0)
          }, 0)
          console.log([
            "AiPlus Memory",
            `  personal roles: ${personalRoles.length}`,
            `  personal entries: ${personalCount}`,
            `  team entries: ${teamPath ? readJsonl(teamPath).length : 0}`,
            `  project entries: ${projectPath ? readJsonl(projectPath).length : 0}`,
          ].join("\n"))
        },
      )
      .command(
        "list <layer>",
        "show recent entries from a memory layer",
        (yargs) =>
          yargs
            .positional("layer", {
              type: "string",
              choices: ["personal", "team", "project"],
              demandOption: true,
              describe: "memory layer to inspect",
            })
            .option("role", {
              type: "string",
              describe: "required when layer=personal",
            })
            .option("count", {
              type: "number",
              default: 10,
              describe: "number of recent entries to show",
            }),
        async (args) => {
          const layer = args.layer as MemoryLayer
          const role = typeof args.role === "string" ? args.role : undefined
          const filePath = getLayerPath(process.cwd(), layer, role)
          if (!filePath) {
            console.log(`AiPlus Memory\n  layer ${layer} requires a valid role`) 
            return
          }
          const entries = readJsonl(filePath)
          const count = Number(args.count ?? 10)
          const recent = entries.slice(-count).reverse()
          if (recent.length === 0) {
            console.log(`AiPlus Memory\n  no entries for layer=${layer}${role ? ` role=${role}` : ""}`)
            return
          }
          console.log([
            `AiPlus Memory (${layer}${role ? `:${role}` : ""})`,
            ...recent.map((entry, index) => `entry ${index + 1}\n${JSON.stringify(entry, null, 2)}`),
          ].join("\n"))
        },
      )
      .demandCommand(1, "subcommand required: status | list"),
  async handler() {},
})
