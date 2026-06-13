import { cmd } from "./cmd"
import { handleOverclaimRerun } from "../../../../../aiplus/overclaim/index"

export const OverclaimCommand = cmd({
  command: "overclaim",
  describe: "verify evidence claims in a packet",
  builder: (yargs) =>
    yargs
      .command(
        "rerun",
        "re-execute all claims in an evidence packet",
        (yargs) =>
          yargs
            .option("packet", {
              type: "string",
              demandOption: true,
              describe: "path to evidence-packet JSON file",
            })
            .option("json", {
              type: "boolean",
              default: false,
              describe: "output JSON instead of table",
            })
            .option("gate", {
              type: "boolean",
              default: false,
              describe: "evaluate evidence gate, exit(1) on violations",
            }),
        async (args) => {
          await handleOverclaimRerun({
            packet: args.packet as string,
            json: args.json as boolean,
            gate: args.gate as boolean,
          })
        },
      )
      .demandCommand(1, "subcommand required: rerun"),
})
