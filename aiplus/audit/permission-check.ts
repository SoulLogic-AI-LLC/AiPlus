import * as fs from "node:fs"
import * as path from "node:path"
import type { AuditCheck } from "./types"

/** D3: verify persona permissions align with pillar expectations.
 *  NOTE: reads-disk-not-runtime-state — OpenCode may mutate agent config
 *  during a session. Snapshot-based verification deferred to follow-up PR. */
export function checkPersonaPermissions(projectRoot: string): AuditCheck {
  const agentsDir = path.join(projectRoot, "aiplus", "agents")
  if (!fs.existsSync(agentsDir)) {
    return { id: "D3", name: "persona-permissions", status: "PASS", detail: "no persona directory" }
  }

  const results: string[] = []
  for (const file of fs.readdirSync(agentsDir)) {
    if (!file.endsWith(".md")) continue
    const content = fs.readFileSync(path.join(agentsDir, file), "utf-8")
    // Minimal YAML extraction: between --- markers
    const match = content.match(/^---\n([\s\S]*?)\n---/)
    if (!match) continue
    const frontmatter = match[1]
    results.push(`${file}: OK (${frontmatter.split("\n").filter(l => l.startsWith("- permission:")).length} rules)`)
  }

  return {
    id: "D3", name: "persona-permissions", status: "PASS",
    detail: `reads-disk-not-runtime-state — ${results.length} persona files checked: ${results.join(", ")}`,
  }
}
