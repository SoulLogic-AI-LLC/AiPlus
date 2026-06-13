#!/usr/bin/env bun
// Generate aiplus/gen/persona-assets.ts from aiplus/agents/*.md
import * as fs from "node:fs"
import * as path from "node:path"

const agentsDir = path.join(import.meta.dirname, "..", "agents")
const outDir = path.join(import.meta.dirname, "..", "gen")
fs.mkdirSync(outDir, { recursive: true })

const entries: string[] = []
for (const file of fs.readdirSync(agentsDir).sort()) {
  if (!file.endsWith(".md")) continue
  const content = fs.readFileSync(path.join(agentsDir, file), "utf-8")
  entries.push(`  ${JSON.stringify(file)}: ${JSON.stringify(content)}`)
}

const output = `// Auto-generated persona assets for aiplus-native init.
// Regenerate: bun run aiplus/gen/generate.ts
export const PERSONA_ASSETS: Record<string, string> = {
${entries.join(",\n")}
};
`

fs.writeFileSync(path.join(outDir, "persona-assets.ts"), output, "utf-8")
console.log(`Generated ${outDir}/persona-assets.ts (${entries.length} personas)`)
