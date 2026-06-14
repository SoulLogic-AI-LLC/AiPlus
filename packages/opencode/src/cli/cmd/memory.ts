import { cmd } from "./cmd"
import * as fs from "node:fs"
import {
  applyRedaction,
  appendMemoryEntry,
  appendProjectEntry,
  appendTeamEntry,
  detectFirstSensitive,
  getRedactionRules,
  resolveLayerPath,
  type SessionOutcome,
  type MemoryLayer,
} from "../../../../../aiplus/memory"

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
      .command(
        "detect <text>",
        "show the first matching redaction rule for a text sample",
        (yargs) =>
          yargs.positional("text", {
            type: "string",
            demandOption: true,
            describe: "text sample to inspect",
          }),
        async (args) => {
          const text = args.text as string
          const match = detectFirstSensitive(text)
          console.log([
            "AiPlus Memory Redaction",
            `  firstMatch: ${match ?? "none"}`,
          ].join("\n"))
        },
      )
      .command(
        "redact <text>",
        "preview how the redaction pipeline rewrites a text sample",
        (yargs) =>
          yargs.positional("text", {
            type: "string",
            demandOption: true,
            describe: "text sample to redact",
          }),
        async (args) => {
          const text = args.text as string
          console.log([
            "AiPlus Memory Redaction",
            `  original: ${text}`,
            `  redacted: ${applyRedaction(text)}`,
          ].join("\n"))
        },
      )
      .command(
        "rules",
        "list configured redaction rules",
        () => {},
        async () => {
          console.log([
            "AiPlus Memory Redaction Rules",
            ...getRedactionRules().map((rule, index) => `  ${index + 1}. ${rule.name} — ${rule.description}`),
          ].join("\n"))
        },
      )
      .command(
        "append-personal <role> <sessionId> <task>",
        "append a personal memory entry",
        (yargs) =>
          yargs
            .positional("role", { type: "string", demandOption: true, describe: "role name" })
            .positional("sessionId", { type: "string", demandOption: true, describe: "session id" })
            .positional("task", { type: "string", demandOption: true, describe: "task summary" })
            .option("outcome", {
              type: "string",
              choices: ["success", "failed", "canceled"],
              default: "success",
              describe: "session outcome",
            })
            .option("started-at", {
              type: "string",
              describe: "override start timestamp; defaults to now-1m",
            })
            .option("ended-at", {
              type: "string",
              describe: "override end timestamp; defaults to now",
            }),
        async (args) => {
          const endedAt = typeof args.endedAt === "string" ? args.endedAt : new Date().toISOString()
          const startedAt = typeof args.startedAt === "string"
            ? args.startedAt
            : new Date(Date.now() - 60_000).toISOString()
          appendMemoryEntry({
            projectRoot: process.cwd(),
            role: args.role as string,
            sessionId: args.sessionId as string,
            task: args.task as string,
            startedAt,
            endedAt,
            outcome: args.outcome as SessionOutcome,
          })
          console.log([
            "AiPlus Memory Append Personal",
            `  role: ${args.role as string}`,
            `  sessionId: ${args.sessionId as string}`,
            `  outcome: ${args.outcome as string}`,
          ].join("\n"))
        },
      )
      .command(
        "append-team <subject> <summary> <source>",
        "append a team memory entry",
        (yargs) =>
          yargs
            .positional("subject", { type: "string", demandOption: true, describe: "team memory subject" })
            .positional("summary", { type: "string", demandOption: true, describe: "team memory summary" })
            .positional("source", { type: "string", demandOption: true, describe: "entry source role or owner" })
            .option("id", { type: "string", describe: "optional entry id override" })
            .option("confidence", {
              type: "string",
              choices: ["owner_asserted", "verified", "speculative"],
              describe: "optional confidence level",
            })
            .option("status", {
              type: "string",
              choices: ["active", "superseded", "resolved"],
              describe: "optional entry lifecycle status",
            })
            .option("tags", {
              type: "string",
              describe: "comma-separated tags",
            }),
        async (args) => {
          appendTeamEntry({
            projectRoot: process.cwd(),
            id: typeof args.id === "string" ? args.id : `team-${Date.now()}`,
            subject: args.subject as string,
            summary: args.summary as string,
            source: args.source as string,
            confidence: typeof args.confidence === "string" ? args.confidence as "owner_asserted" | "verified" | "speculative" : undefined,
            status: typeof args.status === "string" ? args.status as "active" | "superseded" | "resolved" : undefined,
            tags: typeof args.tags === "string" ? args.tags.split(",").map((item) => item.trim()).filter(Boolean) : undefined,
          })
          console.log([
            "AiPlus Memory Append Team",
            `  subject: ${args.subject as string}`,
            `  source: ${args.source as string}`,
          ].join("\n"))
        },
      )
      .command(
        "append-project <key> <value> <source>",
        "append a project memory entry",
        (yargs) =>
          yargs
            .positional("key", { type: "string", demandOption: true, describe: "project memory key" })
            .positional("value", { type: "string", demandOption: true, describe: "project memory value" })
            .positional("source", { type: "string", demandOption: true, describe: "entry source role or owner" }),
        async (args) => {
          appendProjectEntry({
            projectRoot: process.cwd(),
            key: args.key as string,
            value: args.value as string,
            source: args.source as string,
          })
          console.log([
            "AiPlus Memory Append Project",
            `  key: ${args.key as string}`,
            `  source: ${args.source as string}`,
          ].join("\n"))
        },
      )
      .demandCommand(1, "subcommand required: status | list | detect | redact | rules | append-personal | append-team | append-project"),
  async handler() {},
})
