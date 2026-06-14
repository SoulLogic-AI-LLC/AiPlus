import { cmd } from "./cmd"
import { append, latestForRole, readAll } from "../../../../../aiplus/dispatch"

function formatEntry(entry: {
  dispatchId: string
  role: string
  task: string
  status: string
  sessionId: string
  worktreePath: string
  timestamp: string
}) {
  return [
    `  dispatchId: ${entry.dispatchId}`,
    `  role: ${entry.role}`,
    `  task: ${entry.task}`,
    `  status: ${entry.status}`,
    `  sessionId: ${entry.sessionId}`,
    `  worktreePath: ${entry.worktreePath}`,
    `  timestamp: ${entry.timestamp}`,
  ].join("\n")
}

export const DispatchCommand = cmd({
  command: "dispatch",
  describe: "inspect AiPlus dispatch log entries",
  builder: (yargs) =>
    yargs
      .command(
        "list [count]",
        "show recent dispatch log entries",
        (yargs) =>
          yargs.positional("count", {
            type: "number",
            default: 10,
            describe: "number of most recent entries to show",
          }),
        async (args) => {
          const entries = readAll(process.cwd())
          const count = Number(args.count ?? 10)
          const recent = entries.slice(-count).reverse()
          if (recent.length === 0) {
            console.log("AiPlus Dispatch\n  no dispatch entries recorded")
            return
          }
          console.log([
            "AiPlus Dispatch",
            ...recent.flatMap((entry, index) => [
              `entry ${index + 1}`,
              formatEntry(entry),
            ]),
          ].join("\n"))
        },
      )
      .command(
        "latest <role>",
        "show the latest dispatch entry for a role",
        (yargs) =>
          yargs.positional("role", {
            type: "string",
            demandOption: true,
            describe: "role id to inspect",
          }),
        async (args) => {
          const role = args.role as string
          const entry = latestForRole(process.cwd(), role)
          if (!entry) {
            console.log(`AiPlus Dispatch\n  no dispatch entry for role: ${role}`)
            return
          }
          console.log([`AiPlus Dispatch Latest (${role})`, formatEntry(entry)].join("\n"))
        },
      )
      .command(
        "append <role> <task> <sessionId>",
        "append a dispatch entry to the local dispatch log",
        (yargs) =>
          yargs
            .positional("role", {
              type: "string",
              demandOption: true,
              describe: "role id for the dispatch entry",
            })
            .positional("task", {
              type: "string",
              demandOption: true,
              describe: "task summary for the dispatch entry",
            })
            .positional("sessionId", {
              type: "string",
              demandOption: true,
              describe: "session id for the dispatch entry",
            })
            .option("status", {
              type: "string",
              choices: ["created", "running", "completed", "failed"],
              default: "created",
              describe: "dispatch status",
            })
            .option("worktree-path", {
              type: "string",
              describe: "override worktree path; defaults to the current directory",
            }),
        async (args) => {
          const entry = {
            dispatchId: `dispatch-${Date.now()}-${args.role}`,
            role: args.role as string,
            task: args.task as string,
            status: args.status as "created" | "running" | "completed" | "failed",
            sessionId: args.sessionId as string,
            worktreePath: typeof args.worktreePath === "string" ? args.worktreePath : process.cwd(),
            timestamp: new Date().toISOString(),
          }
          append(process.cwd(), entry)
          console.log(["AiPlus Dispatch Append", formatEntry(entry)].join("\n"))
        },
      )
      .demandCommand(1, "subcommand required: list | latest | append"),
  async handler() {},
})
