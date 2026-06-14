import { cmd } from "./cmd"
import * as fs from "node:fs"
import * as path from "node:path"
import { classifyToolEffect, generateIdempotencyKey, interceptToolCall, type EffectLogEntry } from "../../../../../aiplus/effects"

function readEffectLog(projectRoot: string): EffectLogEntry[] {
  const filePath = path.join(projectRoot, ".aiplus", "effects", "effect-log.jsonl")
  if (!fs.existsSync(filePath)) return []
  return fs
    .readFileSync(filePath, "utf-8")
    .split("\n")
    .filter((line) => line.trim().length > 0)
    .map((line) => JSON.parse(line) as EffectLogEntry)
}

function parseArgsJson(raw: string | undefined): Record<string, unknown> {
  if (!raw) return {}
  try {
    const parsed = JSON.parse(raw)
    return parsed && typeof parsed === "object" && !Array.isArray(parsed)
      ? parsed as Record<string, unknown>
      : {}
  } catch {
    return {}
  }
}

export const EffectsCommand = cmd({
  command: "effects",
  describe: "inspect AiPlus effect classification and effect log state",
  builder: (yargs) =>
    yargs
      .command(
        "classify <toolName>",
        "classify a tool call by side-effect type",
        (yargs) =>
          yargs
            .positional("toolName", { type: "string", demandOption: true, describe: "tool name to classify" })
            .option("args", { type: "string", describe: "JSON object of tool arguments" }),
        async (args) => {
          const toolName = args.toolName as string
          const toolArgs = parseArgsJson(typeof args.args === "string" ? args.args : undefined)
          const result = classifyToolEffect(toolName, toolArgs)
          const key = generateIdempotencyKey(toolName, toolArgs)
          console.log([
            "AiPlus Effects",
            `  tool: ${toolName}`,
            `  sideEffectClass: ${result.sideEffectClass}`,
            `  retryPolicy: ${result.retryPolicy}`,
            `  idempotencyKey: ${key}`,
          ].join("\n"))
        },
      )
      .command(
        "check <toolName>",
        "run the effect gateway against a hypothetical tool call",
        (yargs) =>
          yargs
            .positional("toolName", { type: "string", demandOption: true, describe: "tool name to test" })
            .option("args", { type: "string", describe: "JSON object of tool arguments" })
            .option("session-id", { type: "string", default: "manual-session", describe: "session id for the check" })
            .option("role", { type: "string", default: "manual", describe: "role name for the check" }),
        async (args) => {
          const toolName = args.toolName as string
          const toolArgs = parseArgsJson(typeof args.args === "string" ? args.args : undefined)
          const result = interceptToolCall({
            toolName,
            toolArgs,
            sessionId: args.sessionId as string,
            role: args.role as string,
            projectRoot: process.cwd(),
          })
          console.log([
            "AiPlus Effects",
            `  tool: ${toolName}`,
            `  allowed: ${result.allowed}`,
            `  reason: ${result.reason ?? "(none)"}`,
          ].join("\n"))
        },
      )
      .command(
        "log [count]",
        "show recent effect-log entries",
        (yargs) =>
          yargs.positional("count", { type: "number", default: 10, describe: "number of recent entries to show" }),
        async (args) => {
          const entries = readEffectLog(process.cwd())
          const count = Number(args.count ?? 10)
          const recent = entries.slice(-count).reverse()
          if (recent.length === 0) {
            console.log("AiPlus Effects\n  no effect-log entries recorded")
            return
          }
          console.log([
            "AiPlus Effects",
            ...recent.map((entry, index) => [
              `entry ${index + 1}`,
              `  toolName: ${entry.toolName}`,
              `  sideEffectClass: ${entry.sideEffectClass}`,
              `  retryPolicy: ${entry.retryPolicy}`,
              `  outcome: ${entry.outcome}`,
              `  sessionId: ${entry.sessionId}`,
              `  role: ${entry.role}`,
              `  timestamp: ${entry.timestamp}`,
              `  idempotencyKey: ${entry.idempotencyKey}`,
              `  blockReason: ${entry.blockReason ?? "(none)"}`,
            ].join("\n")),
          ].join("\n"))
        },
      )
      .demandCommand(1, "subcommand required: classify | check | log"),
  async handler() {},
})
