import { cmd } from "./cmd"
import { capsuleCommand, checkCommand, statusCommand, thresholdsCommand } from "../../../../../aiplus/compact"

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
      .demandCommand(1, "subcommand required: status | check | thresholds | capsule"),
  async handler() {},
})
