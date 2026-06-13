import { cmd } from "./cmd"
import * as fs from "node:fs"
import * as path from "node:path"
import { PERSONA_ASSETS } from "../../../../../aiplus/gen/persona-assets"

export const InitCommand = cmd({
  command: "init",
  describe: "bootstrap AiPlus agents + skeleton in the current project",
  builder: (yargs) =>
    yargs.option("force", {
      type: "boolean",
      default: false,
      describe: "overwrite existing aiplus/ directory",
    }),
  handler: async (args) => {
    const cwd = process.cwd()
    const agentsDir = path.join(cwd, "aiplus", "agents")
    const dotAiplusDir = path.join(cwd, ".aiplus")

    // Check for existing aiplus/ directory
    if (fs.existsSync(agentsDir) && !args.force) {
      console.error(`aiplus/agents/ already exists. Use --force to overwrite.`)
      process.exit(1)
    }

    // Write persona files
    fs.mkdirSync(agentsDir, { recursive: true })
    let count = 0
    for (const [filename, content] of Object.entries(PERSONA_ASSETS) as [string, string][]) {
      fs.writeFileSync(path.join(agentsDir, filename), content, "utf-8")
      count++
    }
    console.log(`Wrote ${count} persona files → ${agentsDir}`)

    // Write .aiplus/ skeleton
    const agentTeamToml = `schema_version = "1.0"

[team]
project_name = "<your-project>"
core_roles = [
  "advisor", "ceo",
  "architect", "pm",
  "ui-designer", "ai-integration",
  "engineer-a", "engineer-b",
  "integration-manager",
  "reviewer", "security-reviewer", "qa",
]
active_experts = []

[advisor_review_bench]
purpose = "Independent review, verification, challenge, and gate readiness support for Advisor."
bench_roles = ["release-manager", "evidence-auditor", "qa"]
default_capabilities = ["read", "verify", "report", "recommend"]
forbidden_by_default = ["implement", "merge", "tag", "release", "push", "edit_secrets", "change_repo_settings"]
owner_gates = ["merge", "tag", "release", "publish", "deploy", "external_accounts", "secrets", "global_config"]

[chief_auditor]
purpose = "Read-only verification coordinator for Advisor CA-verdict packets."
role = "chief-auditor"
aliases = ["ca", "chief-auditor", "chief auditor", "chief-audit", "ca-verification"]
default_capabilities = ["read", "plan_verification", "route_verifiers", "report", "recommend"]
forbidden_by_default = ["implement", "merge", "tag", "release", "push", "edit_secrets", "change_repo_settings"]
owner_gates = ["merge", "tag", "release", "publish", "deploy", "external_accounts", "secrets", "global_config"]

[coordinator.light]
complexity_max = 2
fire_consultant = false

[coordinator.medium]
complexity_min = 3
complexity_max = 4
fire_consultant = true

[coordinator.heavy]
complexity_min = 5
risk_threshold = 0.7
fire_consultant = true

[owner_interface]
default_visible = ["advisor", "ceo"]
allow_direct_talk_to_others = true
`

    const skeleton: Record<string, string> = {
      "agents/agent-team.toml": agentTeamToml,
      "agents/dispatch-log.jsonl": "",
      "agents/execution-state.json": JSON.stringify({ schemaVersion: "0.1.0", roles: [], dispatches: [] }, null, 2),
      "agent-memory/_team/memory.jsonl": "",
      "worktree/leases.json": JSON.stringify({ leases: [] }, null, 2),
      "compact/context-capsule.json": "",
      "compact/session-compact-state.json": "{}",
    }
    for (const [relPath, content] of Object.entries(skeleton)) {
      const fullPath = path.join(dotAiplusDir, relPath)
      fs.mkdirSync(path.dirname(fullPath), { recursive: true })
      if (content) {
        fs.writeFileSync(fullPath, content + "\n", "utf-8")
      } else {
        fs.writeFileSync(fullPath, "", "utf-8")
      }
    }
    console.log(`Wrote .aiplus/ skeleton → ${dotAiplusDir}`)

    console.log("\nAiPlus initialized. Run: aiplus-native")
  },
})
