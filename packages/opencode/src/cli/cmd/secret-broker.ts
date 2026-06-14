import { cmd } from "./cmd"
import { listAliases, runWithSecrets, writeAliasRegistry } from "../../../../../aiplus/secret-broker"

function formatStatus(projectRoot: string): string {
  const aliases = listAliases()
  const registry = writeAliasRegistry(projectRoot)
  const authCount = aliases.filter((item) => item.source === "auth.json").length
  const dbCount = aliases.filter((item) => item.source === "credential_db").length
  return [
    "AiPlus Secret Broker",
    `  aliases: ${aliases.length}`,
    `  auth.json: ${authCount}`,
    `  credential_db: ${dbCount}`,
    `  registry: ${registry ? ".aiplus/secret-broker/aliases.json" : "write failed"}`,
  ].join("\n")
}

function formatList(): string {
  const aliases = listAliases()
  if (aliases.length === 0) return "No secret aliases found."
  return [
    "AiPlus Secret Broker Aliases",
    ...aliases.map((item) => `  - ${item.alias}  (${item.provider}, ${item.source})`),
  ].join("\n")
}

export const SecretBrokerCommand = cmd({
  command: "secret-broker",
  describe: "inspect and use AiPlus secret aliases",
  builder: (yargs) =>
    yargs
      .command(
        "status",
        "show discovered secret alias counts and refresh the local registry",
        () => {},
        async () => {
          console.log(formatStatus(process.cwd()))
        },
      )
      .command(
        "list",
        "list available secret aliases without revealing values",
        () => {},
        async () => {
          console.log(formatList())
        },
      )
      .command(
        "run",
        "inject one or more aliases into a child process environment",
        (yargs) =>
          yargs
            .option("alias", {
              type: "string",
              array: true,
              describe: "single alias to inject; may be repeated",
            })
            .option("aliases", {
              type: "string",
              describe: "comma-separated alias list",
            })
            .parserConfiguration({ "populate--": true }),
        async (args) => {
          const direct = Array.isArray(args.alias)
            ? args.alias.filter((item): item is string => typeof item === "string")
            : []
          const combined = typeof args.aliases === "string"
            ? args.aliases.split(",").map((item) => item.trim()).filter(Boolean)
            : []
          const aliases = [...direct, ...combined]
          const command = Array.isArray(args["--"])
            ? args["--"].filter((item): item is string => typeof item === "string")
            : []
          const exitCode = await runWithSecrets(aliases, command)
          if (exitCode !== 0) process.exitCode = exitCode
        },
      )
      .demandCommand(1, "subcommand required: status | list | run"),
  async handler() {},
})
