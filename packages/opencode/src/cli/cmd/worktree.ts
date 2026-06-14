import { cmd } from "./cmd"
import { fencingCheck, list } from "../../../../../aiplus/worktree"

export const WorktreeCommand = cmd({
  command: "worktree",
  describe: "inspect AiPlus worktree lease state",
  builder: (yargs) =>
    yargs
      .command(
        "status",
        "show recorded worktree leases",
        () => {},
        async () => {
          const leases = list(process.cwd())
          if (leases.length === 0) {
            console.log("AiPlus Worktree\n  no leases recorded")
            return
          }
          console.log([
            "AiPlus Worktree",
            ...leases.map((lease, index) => [
              `lease ${index + 1}`,
              `  leaseId: ${lease.leaseId}`,
              `  sessionId: ${lease.sessionId}`,
              `  lane: ${lease.lane}`,
              `  status: ${lease.status}`,
              `  worktreePath: ${lease.worktreePath}`,
              `  baseCommit: ${lease.baseCommit}`,
              `  acquiredAt: ${lease.acquiredAt}`,
              `  expiresAt: ${lease.expiresAt ?? "(none)"}`,
            ].join("\n")),
          ].join("\n"))
        },
      )
      .command(
        "check <lane>",
        "run a read-only fencing check for a lane",
        (yargs) =>
          yargs.positional("lane", {
            type: "string",
            demandOption: true,
            describe: "lane id to test, e.g. ceo-1 or default",
          }),
        async (args) => {
          const lane = args.lane as string
          const result = fencingCheck(process.cwd(), lane)
          if (result.allowed) {
            console.log(`AiPlus Worktree\n  lane ${lane}: allowed`)
            return
          }
          console.log([
            "AiPlus Worktree",
            `  lane ${lane}: blocked`,
            `  reason: ${result.reason ?? "unknown"}`,
          ].join("\n"))
        },
      )
      .demandCommand(1, "subcommand required: status | check"),
  async handler() {},
})
