import { cmd } from "./cmd"
import { checkOnly, verifyAndFix } from "../../../../../aiplus/managed-blocks"

type BlockReport = ReturnType<typeof checkOnly>[number]

function formatReports(title: string, reports: BlockReport[]): string {
  if (reports.length === 0) return `${title}\n  no persona files found`
  return [
    title,
    ...reports.map((report) => {
      const missing = report.missing.length > 0 ? report.missing.join(", ") : "none"
      return `  - ${report.file}: ${report.action} · missing=${missing}`
    }),
  ].join("\n")
}

export const ManagedBlocksCommand = cmd({
  command: "managed-blocks",
  describe: "check or repair AiPlus managed persona markdown blocks",
  builder: (yargs) =>
    yargs
      .command(
        "check",
        "inspect persona files for missing managed blocks",
        () => {},
        async () => {
          console.log(formatReports("AiPlus Managed Blocks", checkOnly(process.cwd())))
        },
      )
      .command(
        "fix",
        "append any missing managed blocks to persona markdown files",
        () => {},
        async () => {
          console.log(formatReports("AiPlus Managed Blocks Fix", verifyAndFix(process.cwd())))
        },
      )
      .demandCommand(1, "subcommand required: check | fix"),
  async handler() {},
})
