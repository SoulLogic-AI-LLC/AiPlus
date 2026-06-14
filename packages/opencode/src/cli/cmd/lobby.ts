import { cmd } from "./cmd"
import { bindCommand, resumeCommand, statusCommand } from "../../../../../aiplus/lobby"

export const LobbyCommand = cmd({
  command: "lobby",
  describe: "AiPlus Agent Team lobby commands",
  builder: (yargs) =>
    yargs
      .command(
        "status",
        "show role and lane status",
        () => {},
        async () => {
          console.log(statusCommand(process.cwd()))
        },
      )
      .command(
        "bind [role]",
        "bind a role to the current session, or unbind when omitted",
        (yargs) =>
          yargs.positional("role", {
            type: "string",
            describe: "role id to bind",
          }),
        async (args) => {
          console.log(bindCommand(process.cwd(), typeof args.role === "string" ? args.role : null))
        },
      )
      .command(
        "resume <sessionId>",
        "show session resume instructions",
        (yargs) =>
          yargs.positional("sessionId", {
            type: "string",
            demandOption: true,
            describe: "dispatch id or session id",
          }),
        async (args) => {
          console.log(resumeCommand(process.cwd(), args.sessionId as string))
        },
      )
      .demandCommand(1, "subcommand required: status | bind | resume"),
  async handler() {},
})
