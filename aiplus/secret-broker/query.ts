/**
 * Secret Broker — Query (V1)
 *
 * Reads provider IDs from two OpenCode sources:
 * 1. auth.json (~/.local/share/opencode/auth.json)
 * 2. credential table (~/.local/share/opencode/opencode-local.db)
 *
 * Fallback: if one source fails, use the other. If both fail, return empty.
 */

import * as fs from "node:fs"
import * as path from "node:path"
import * as os from "node:os"
import { Database } from "bun:sqlite"
import type { AliasEntry } from "./types"

// ---- Paths -----------------------------------------------------------------

function authJsonPath(): string {
  return path.join(os.homedir(), ".local", "share", "opencode", "auth.json")
}

function opencodeDbPath(): string {
  return path.join(os.homedir(), ".local", "share", "opencode", "opencode-local.db")
}

// ---- Provider → alias mapping ---------------------------------------------

/** Map a provider ID to the canonical UPPER_SNAKE alias. */
function providerToAlias(provider: string): string {
  return (
    provider
      .replace(/[^a-z0-9]/gi, "_")
      .replace(/_+/g, "_")
      .toUpperCase() + "_API_KEY"
  )
}

// ---- Source 1: auth.json --------------------------------------------------

/**
 * Read provider IDs from OpenCode auth.json.
 *
 * auth.json format: { "deepseek": { "type": "api", "key": "sk-..." }, ... }
 * We extract only the provider names, never the key values.
 */
function readFromAuthJson(): AliasEntry[] {
  try {
    const raw = fs.readFileSync(authJsonPath(), "utf-8")
    const data = JSON.parse(raw) as Record<string, unknown>
    return Object.keys(data)
      .filter((k) => {
        const v = data[k]
        return v && typeof v === "object" && "key" in (v as Record<string, unknown>)
      })
      .map((provider) => ({
        alias: providerToAlias(provider),
        provider,
        source: "auth.json" as const,
      }))
  } catch {
    // File missing, unreadable, or invalid JSON — graceful fallback
    return []
  }
}

// ---- Source 2: credential table -------------------------------------------

/**
 * Read provider IDs from OpenCode credential table.
 *
 * Each credential row represents a configured API key. We extract only
 * the `label` field as the provider identifier, never the `value`.
 */
function readFromCredentialDb(): AliasEntry[] {
  try {
    const db = new Database(opencodeDbPath(), { readonly: true })
    const rows = db.query(`SELECT label, active FROM credential WHERE active = 1`).all() as {
      label: string
      active: number
    }[]
    db.close()

    return rows.map((row) => ({
      alias: providerToAlias(row.label),
      provider: row.label,
      source: "credential_db" as const,
    }))
  } catch {
    // DB locked, missing, or table absent — graceful fallback
    return []
  }
}

// ---- Unified query --------------------------------------------------------

/**
 * List all available secret aliases from both OpenCode sources.
 *
 * Deduplicates by alias (prefers auth.json source when both match).
 * Never reads or returns secret key values.
 */
export function listAliases(): AliasEntry[] {
  const fromAuth = readFromAuthJson()
  const fromDb = readFromCredentialDb()

  // Deduplicate: auth.json wins when both have same alias
  const seen = new Set(fromAuth.map((a) => a.alias))
  const merged = [...fromAuth]
  for (const entry of fromDb) {
    if (!seen.has(entry.alias)) {
      merged.push(entry)
      seen.add(entry.alias)
    }
  }

  return merged
}

/**
 * Resolve a single alias by name (case-insensitive).
 */
export function resolveAlias(name: string): AliasEntry | null {
  const normalized = name.toUpperCase()
  return listAliases().find((a) => a.alias === normalized) ?? null
}

/**
 * Resolve a secret value by alias name.
 *
 * Reads the actual key from auth.json (never from credential_db —
 * credential_db is read-only and may be locked). Returns the raw
 * secret value for env injection; caller must not log or persist it.
 *
 * Returns null if alias not found or source unreadable.
 */
export function resolveSecret(aliasName: string): string | null {
  const entry = resolveAlias(aliasName)
  if (!entry) return null

  // Only auth.json exposes raw key values
  if (entry.source === "auth.json") {
    return readSecretFromAuthJson(entry.provider)
  }

  // credential_db — try reading value column
  return readSecretFromCredentialDb(entry.provider)
}

/** Read a single secret value from auth.json by provider ID. */
function readSecretFromAuthJson(provider: string): string | null {
  try {
    const raw = fs.readFileSync(authJsonPath(), "utf-8")
    const data = JSON.parse(raw) as Record<string, unknown>
    const entry = data[provider]
    if (entry && typeof entry === "object" && "key" in (entry as Record<string, unknown>)) {
      const key = (entry as Record<string, unknown>).key
      return typeof key === "string" ? key : null
    }
    return null
  } catch {
    return null
  }
}

/** Read a single secret value from credential_db by provider label. */
function readSecretFromCredentialDb(provider: string): string | null {
  try {
    const db = new Database(opencodeDbPath(), { readonly: true })
    const row = db.query(`SELECT value FROM credential WHERE label = ? AND active = 1`).get(provider) as
      | { value: string }
      | undefined
    db.close()
    return row?.value ?? null
  } catch {
    return null
  }
}
