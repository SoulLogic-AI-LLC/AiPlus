import { cmd } from "./cmd"
import { formatDoctorReport, runDoctor } from "../../../../../aiplus/doctor"

export const DoctorCommand = cmd({
  command: "doctor [project]",
  describe: "run AiPlus health checks for the current project",
  builder: (yargs) =>
    yargs.positional("project", {
      type: "string",
      describe: "optional project root override",
    }),
  handler: async (args) => {
    const projectRoot = typeof args.project === "string" ? args.project : process.cwd()
    const report = runDoctor(projectRoot)
    process.stdout.write(formatDoctorReport(report))
    if (report.exitCode !== 0) process.exitCode = report.exitCode
  },
})
