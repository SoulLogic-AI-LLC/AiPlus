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
    const skeleton: Record<string, string> = {
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
