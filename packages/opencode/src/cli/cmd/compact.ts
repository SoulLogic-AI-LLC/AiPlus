import { cmd } from "./cmd"
import {
  CompactProfile,
  bumpCompactionGeneration,
  capsuleCommand,
  checkCommand,
  initSessionCompactState,
  shouldForceFresh,
  statusCommand,
  thresholdsCommand,
} from "../../../../../aiplus/compact"

export const CompactCommand = cmd({
  command: "compact",
  describe: "AiPlus compact pressure and capsule commands",
  builder: (yargs) =>
    yargs
      .command(
        "status [sessionId]",
        "show compact state for all sessions or one session",
        (yargs) =>
          yargs.positional("sessionId", {
            type: "string",
            describe: "optional session id to inspect",
          }),
        async (args) => {
          console.log(statusCommand(process.cwd(), typeof args.sessionId === "string" ? args.sessionId : undefined))
        },
      )
      .command(
        "check",
        "run a compact pressure check with explicit model and token usage",
        (yargs) =>
          yargs
            .option("model", {
              type: "string",
              demandOption: true,
              describe: "model id to check",
            })
            .option("used", {
              type: "number",
              demandOption: true,
              describe: "tokens already used",
            })
            .option("total", {
              type: "number",
              demandOption: true,
              describe: "total token window",
            })
            .option("role", {
              type: "string",
              describe: "optional role id for task-bound policies",
            })
            .option("session-id", {
              type: "string",
              describe: "optional session id to write into state tracking",
            }),
        async (args) => {
          console.log(
            checkCommand(
              process.cwd(),
              args.model as string,
              Number(args.used),
              Number(args.total),
              typeof args.role === "string" ? args.role : undefined,
              typeof args.sessionId === "string" ? args.sessionId : undefined,
            ),
          )
        },
      )
      .command(
        "thresholds",
        "show compact thresholds by model",
        () => {},
        async () => {
          console.log(thresholdsCommand())
        },
      )
      .command(
        "capsule",
        "show the current context capsule",
        () => {},
        async () => {
          console.log(capsuleCommand(process.cwd()))
        },
      )
      .command(
        "init <sessionId> <profile>",
        "initialize compact generation state for a session",
        (yargs) =>
          yargs
            .positional("sessionId", {
              type: "string",
              demandOption: true,
              describe: "session id to initialize",
            })
            .positional("profile", {
              type: "string",
              choices: Object.values(CompactProfile),
              demandOption: true,
              describe: "compact profile to assign",
            }),
        async (args) => {
          initSessionCompactState(process.cwd(), args.sessionId as string, args.profile as CompactProfile)
          console.log([
            "AiPlus Compact Init",
            `  sessionId: ${args.sessionId as string}`,
            `  profile: ${args.profile as string}`,
          ].join("\n"))
        },
      )
      .command(
        "bump <sessionId>",
        "increment compaction generation after a successful compact",
        (yargs) =>
          yargs.positional("sessionId", {
            type: "string",
            demandOption: true,
            describe: "session id whose generation should be incremented",
          }),
        async (args) => {
          const generation = bumpCompactionGeneration(process.cwd(), args.sessionId as string)
          console.log([
            "AiPlus Compact Bump",
            `  sessionId: ${args.sessionId as string}`,
            `  generation: ${generation}`,
          ].join("\n"))
        },
      )
      .command(
        "force-fresh <sessionId>",
        "check whether a session should be forced to /new after repeated compactions",
        (yargs) =>
          yargs.positional("sessionId", {
            type: "string",
            demandOption: true,
            describe: "session id to inspect",
          }),
        async (args) => {
          const forceFresh = shouldForceFresh(process.cwd(), args.sessionId as string)
          console.log([
            "AiPlus Compact Force Fresh",
            `  sessionId: ${args.sessionId as string}`,
            `  forceFresh: ${forceFresh}`,
          ].join("\n"))
        },
      )
      .demandCommand(1, "subcommand required: status | check | thresholds | capsule | init | bump | force-fresh"),
  async handler() {},
})
