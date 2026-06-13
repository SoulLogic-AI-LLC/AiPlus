/**
 * Secret Broker — Registry (V1)
 *
 * Writes alias registry to .aiplus/secret-broker/aliases.json.
 * Redaction safety net: applies applyRedaction to every value before write.
 */

import * as fs from "node:fs"
import * as path from "node:path"
import type { AliasRegistry } from "./types"
import { listAliases } from "./query"
import { applyRedaction } from "../memory/redact"

const REGISTRY_DIR = ".aiplus/secret-broker"
const REGISTRY_FILE = "aliases.json"

/**
 * Write the alias registry to the project's .aiplus directory.
 *
 * Redaction pipeline runs on all fields. In theory aliases.json should
 * never contain secret values (we only store alias→provider mappings),
 * but the redaction safety net costs nothing and protects against
 * accidental leakage if the data source changes in the future.
 *
 * Fire-and-forget: errors logged to stderr, never thrown.
 * Returns the registry on success, null on failure.
 */
export function writeAliasRegistry(projectRoot: string): AliasRegistry | null {
  try {
    const aliases = listAliases()
    const raw = JSON.stringify({ updated: new Date().toISOString(), aliases }, null, 2) + "\n"
    const redacted = applyRedaction(raw)

    const dir = path.join(projectRoot, REGISTRY_DIR)
    fs.mkdirSync(dir, { recursive: true })
    fs.writeFileSync(path.join(dir, REGISTRY_FILE), redacted, "utf-8")

    return JSON.parse(redacted) as AliasRegistry
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err)
    process.stderr.write(`[aiplus-secret-broker] ${msg}\n`)
    return null
  }
}
