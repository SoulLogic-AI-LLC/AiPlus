import * as fs from "node:fs"
import * as path from "node:path"
import { ALL_BLOCKS, BLOCK_NAMES } from "./templates"

interface BlockReport {
  file: string
  missing: string[]
  action: "appended" | "warned-yaml" | "ok"
}

/** Check and auto-fix managed blocks in all aiplus/agents/*.md persona files.
 *  Markdown body: auto-append missing blocks. YAML frontmatter: WARN only. */
export function verifyAndFix(projectRoot: string): BlockReport[] {
  const agentsDir = path.join(projectRoot, "aiplus", "agents")
  const results: BlockReport[] = []

  if (!fs.existsSync(agentsDir)) {
    process.stderr.write("[aiplus-managed-blocks] no persona directory\n")
    return results
  }

  for (const file of fs.readdirSync(agentsDir)) {
    if (!file.endsWith(".md")) continue
    const filePath = path.join(agentsDir, file)
    const content = fs.readFileSync(filePath, "utf-8")

    const missing: string[] = []
    for (let i = 0; i < BLOCK_NAMES.length; i++) {
      if (!content.includes(`aiplus-managed:${BLOCK_NAMES[i]}`)) {
        missing.push(BLOCK_NAMES[i])
      }
    }

    if (missing.length === 0) {
      results.push({ file, missing: [], action: "ok" })
      continue
    }

    // Auto-append missing blocks to markdown body (safe — appends, never modifies existing)
    const toAppend = BLOCK_NAMES
      .filter((name, i) => missing.includes(name))
      .map(() => ALL_BLOCKS[BLOCK_NAMES.indexOf(missing[0])]) // grab corresponding block
    // Correctly map missing names to their blocks
    const appendText = missing.map(name => {
      const idx = BLOCK_NAMES.indexOf(name)
      return "\n\n" + ALL_BLOCKS[idx]
    }).join("")

    fs.appendFileSync(filePath, appendText, "utf-8")
    results.push({ file, missing, action: "appended" })
    process.stderr.write(`[aiplus-managed-blocks] ${file}: appended ${missing.join(", ")}\n`)
  }

  return results
}

/** Read-only check — returns missing blocks without modifying files. */
export function checkOnly(projectRoot: string): BlockReport[] {
  const agentsDir = path.join(projectRoot, "aiplus", "agents")
  const results: BlockReport[] = []

  if (!fs.existsSync(agentsDir)) return results

  for (const file of fs.readdirSync(agentsDir)) {
    if (!file.endsWith(".md")) continue
    const content = fs.readFileSync(path.join(agentsDir, file), "utf-8")
    const missing: string[] = []
    for (const name of BLOCK_NAMES) {
      if (!content.includes(`aiplus-managed:${name}`)) {
        missing.push(name)
      }
    }
    results.push({ file, missing, action: missing.length === 0 ? "ok" : "warned-yaml" })
  }
  return results
}
