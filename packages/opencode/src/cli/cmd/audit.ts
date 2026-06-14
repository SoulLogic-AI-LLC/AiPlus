import { cmd } from "./cmd"
import {
  checkDispatchChain,
  checkMemoryMatch,
  checkPersonaPermissions,
  verify,
  type AuditCheck,
} from "../../../../../aiplus/audit"

function formatChecks(title: string, checks: AuditCheck[]): string {
  const verdict = checks.some((item) => item.status === "BLOCKED")
    ? "BLOCKED"
    : checks.some((item) => item.status === "REVISE")
      ? "REVISE"
      : "PASS"

  return [
    title,
    `  verdict: ${verdict}`,
    ...checks.map((item) => `  - ${item.id} ${item.name}: ${item.status}${item.detail ? ` · ${item.detail}` : ""}`),
  ].join("\n")
}

export const AuditCommand = cmd({
  command: "audit",
  describe: "run AiPlus audit checks over dispatch, memory, and persona permissions",
  builder: (yargs) =>
    yargs
      .command(
        "status",
        "run the three audit checks without writing a report",
        () => {},
        async () => {
          const projectRoot = process.cwd()
          console.log(
            formatChecks("AiPlus Audit", [
              checkDispatchChain(projectRoot),
              checkMemoryMatch(projectRoot),
              checkPersonaPermissions(projectRoot),
            ]),
          )
        },
      )
      .command(
        "run [sessionId]",
        "run audit checks and persist a CA report under .aiplus/agent-memory/ca",
        (yargs) =>
          yargs.positional("sessionId", {
            type: "string",
            describe: "optional session id for the persisted report",
          }),
        async (args) => {
          const projectRoot = process.cwd()
          const sessionId = typeof args.sessionId === "string" ? args.sessionId : `manual-${Date.now()}`
          verify(projectRoot, sessionId)
          console.log(
            formatChecks(`AiPlus Audit Report (${sessionId})`, [
              checkDispatchChain(projectRoot),
              checkMemoryMatch(projectRoot),
              checkPersonaPermissions(projectRoot),
            ]),
          )
        },
      )
      .demandCommand(1, "subcommand required: status | run"),
  async handler() {},
})
