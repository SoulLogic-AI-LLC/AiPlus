/**
 * Secret Broker — Types (V1)
 *
 * Alias registry: maps provider IDs to uppercase alias names.
 * No secret values stored — only provider → alias mappings.
 */

export interface AliasEntry {
  /** Uppercase alias (e.g., "DEEPSEEK_API_KEY") */
  alias: string
  /** Provider ID from OpenCode auth.json (e.g., "deepseek") */
  provider: string
  /** Source: "auth.json" | "credential_db" */
  source: "auth.json" | "credential_db"
}

export interface AliasRegistry {
  /** ISO timestamp */
  updated: string
  /** Available aliases */
  aliases: AliasEntry[]
}
