import { cmd } from "./cmd"
import { acquire, fencingCheck, list, release, renew } from "../../../../../aiplus/worktree"

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
      .command(
        "acquire <sessionId> <lane>",
        "record a worktree lease for a session and lane",
        (yargs) =>
          yargs
            .positional("sessionId", {
              type: "string",
              demandOption: true,
              describe: "session id for the lease",
            })
            .positional("lane", {
              type: "string",
              demandOption: true,
              describe: "lane id to claim, e.g. ceo-1 or default",
            })
            .option("worktree-path", {
              type: "string",
              describe: "override tracked worktree path; defaults to the current directory",
            }),
        async (args) => {
          const worktreePath = typeof args.worktreePath === "string" ? args.worktreePath : process.cwd()
          const lease = acquire(process.cwd(), args.sessionId as string, args.lane as string, worktreePath)
          console.log([
            "AiPlus Worktree Acquire",
            `  leaseId: ${lease.leaseId}`,
            `  sessionId: ${lease.sessionId}`,
            `  lane: ${lease.lane}`,
            `  status: ${lease.status}`,
            `  worktreePath: ${lease.worktreePath}`,
            `  baseCommit: ${lease.baseCommit}`,
          ].join("\n"))
        },
      )
      .command(
        "renew <leaseId>",
        "renew a previously recorded worktree lease",
        (yargs) =>
          yargs.positional("leaseId", {
            type: "string",
            demandOption: true,
            describe: "lease id to renew",
          }),
        async (args) => {
          renew(process.cwd(), args.leaseId as string)
          console.log(["AiPlus Worktree Renew", `  leaseId: ${args.leaseId as string}`].join("\n"))
        },
      )
      .command(
        "release <sessionId>",
        "mark a session's lease as prunable",
        (yargs) =>
          yargs.positional("sessionId", {
            type: "string",
            demandOption: true,
            describe: "session id whose lease should be released",
          }),
        async (args) => {
          release(process.cwd(), args.sessionId as string)
          console.log(["AiPlus Worktree Release", `  sessionId: ${args.sessionId as string}`].join("\n"))
        },
      )
      .demandCommand(1, "subcommand required: status | check | acquire | renew | release"),
  async handler() {},
})
