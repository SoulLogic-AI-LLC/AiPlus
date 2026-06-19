import { cmd } from "./cmd"
import { ghCommand, historyCommand, reportCommand, runCommand, statusCommand } from "../../../../../aiplus/verify"

export const VerifyCommand = cmd({
  command: "verify",
  describe: "AiPlus verification ledger and audit commands",
  builder: (yargs) =>
    yargs
      .command(
        "run [sessionId]",
        "run verification checks and append a ledger entry",
        (yargs) =>
          yargs.positional("sessionId", {
            type: "string",
            describe: "optional session id to attach to the verify entry",
          }),
        async (args) => {
          console.log(runCommand(process.cwd(), typeof args.sessionId === "string" ? args.sessionId : undefined))
        },
      )
      .command(
        "status",
        "show the latest verification verdict",
        () => {},
        async () => {
          console.log(statusCommand(process.cwd()))
        },
      )
      .command(
        "history [count]",
        "show recent verification history",
        (yargs) =>
          yargs.positional("count", {
            type: "number",
            default: 20,
            describe: "number of recent entries to show",
          }),
        async (args) => {
          console.log(historyCommand(process.cwd(), Number(args.count ?? 20)))
        },
      )
      .command(
        "report <sessionId>",
        "show the latest verification report for a session",
        (yargs) =>
          yargs.positional("sessionId", {
            type: "string",
            demandOption: true,
            describe: "session id to inspect",
          }),
        async (args) => {
          console.log(reportCommand(process.cwd(), args.sessionId as string))
        },
      )
      .command(
        "gh [prNumber]",
        "check GitHub PR status and CI rollups",
        (yargs) =>
          yargs
            .positional("prNumber", {
              type: "number",
              describe: "optional PR number to inspect",
            })
            .option("repo", {
              type: "string",
              describe: "optional owner/repo override",
            }),
        async (args) => {
          console.log(
            ghCommand(
              typeof args.repo === "string" ? args.repo : undefined,
              typeof args.prNumber === "number" ? args.prNumber : undefined,
            ),
          )
        },
      )
      .demandCommand(1, "subcommand required: run | status | history | report | gh"),
  async handler() {},
})
