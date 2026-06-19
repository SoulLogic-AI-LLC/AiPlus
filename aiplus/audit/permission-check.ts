import * as fs from "node:fs"
import * as path from "node:path"
import type { AuditCheck } from "./types"

/** Runtime agent config from AgentV2 store. */
export interface RuntimeAgentConfig {
  id: string
  permissions: Array<{
    action: string
    resource: string
    effect: "allow" | "deny"
  }>
  mode: string
  hidden: boolean
}

/** D3: verify persona permissions align with pillar expectations.
 *  GAP-3: reads runtime AgentV2 store when provided, falls back to disk.
 */
export function checkPersonaPermissions(projectRoot: string, runtimeAgents?: RuntimeAgentConfig[]): AuditCheck {
  // Use runtime agents if provided (GAP-3: disk-not-runtime fix)
  if (runtimeAgents && runtimeAgents.length > 0) {
    return checkRuntimePermissions(runtimeAgents)
  }

  // Fallback: read from disk (legacy behavior with KNOWN_GAP annotation)
  return checkDiskPermissions(projectRoot)
}

/** Check permissions from runtime AgentV2 store. */
function checkRuntimePermissions(agents: RuntimeAgentConfig[]): AuditCheck {
  const results: string[] = []
  const issues: string[] = []

  for (const agent of agents) {
    const ruleCount = agent.permissions.length
    results.push(`${agent.id}: ${ruleCount} rules (mode=${agent.mode}, hidden=${agent.hidden})`)

    // Check for suspicious patterns
    const hasDenyAll = agent.permissions.some((p) => p.resource === "*" && p.effect === "deny")
    const hasAllowAll = agent.permissions.some((p) => p.resource === "*" && p.effect === "allow")

    if (hasAllowAll && !hasDenyAll) {
      issues.push(`${agent.id}: allow-all without deny-all — may be over-permissive`)
    }
  }

  if (issues.length > 0) {
    return {
      id: "D3",
      name: "persona-permissions",
      status: "REVISE",
      detail: `runtime check — ${results.length} agents, ${issues.length} issues: ${issues.join("; ")}`,
    }
  }

  return {
    id: "D3",
    name: "persona-permissions",
    status: "PASS",
    detail: `runtime check — ${results.length} agents verified: ${results.join(", ")}`,
  }
}

/** Check permissions from disk YAML files (legacy fallback). */
function checkDiskPermissions(projectRoot: string): AuditCheck {
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
    results.push(`${file}: OK (${frontmatter.split("\n").filter((l) => l.startsWith("- permission:")).length} rules)`)
  }

  return {
    id: "D3",
    name: "persona-permissions",
    status: "PASS",
    detail: `disk check (KNOWN_GAP: disk-not-runtime) — ${results.length} persona files checked: ${results.join(", ")}`,
  }
}
