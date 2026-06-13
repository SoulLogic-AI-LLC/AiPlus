/**
 * Token Cost — OpenCode DB Query (V1)
 *
 * Reads session token stats directly from OpenCode's SQLite database.
 * Session table carries pre-aggregated cost + token counters — no JOIN needed.
 */

import { Database } from "bun:sqlite"
import * as path from "node:path"
import * as os from "node:os"
import type { TokenCostStats, TokenCostOptions, ModelBreakdown, RoleBreakdown, DailyBreakdown, ProjectBreakdown } from "./types"

/** Default DB path: ~/.local/share/opencode/opencode.db */
function defaultDbPath(): string {
  return path.join(os.homedir(), ".local", "share", "opencode", "opencode.db")
}

/**
 * Extract a role name from a session title.
 *
 * OpenCode titles often carry role markers: "CEO-3 ...", "Advisor review...",
 * "@agent-team-ceo ...", etc. We extract the first recognizable token.
 */
function parseRole(title: string, agent: string | null): string {
  // Try agent field first (AIplus routes set agent="agent-team-<role>")
  if (agent) {
    const m = agent.match(/^agent-team-(\S+)$/)
    if (m) return m[1]
  }
  // Try title patterns
  const titlePatterns = [
    /^CEO-(\d+)/i,
    /^advisor/i,
    /^ca\b/i,
    /^chief.?auditor/i,
    /^reviewer/i,
    /^qa\b/i,
    /^engineer-[ab]/i,
    /^architect/i,
    /^pm\b/i,
    /^security/i,
    /^researcher/i,
    /^devops/i,
    /^tech.?writer/i,
  ]
  for (const p of titlePatterns) {
    const m = title.match(p)
    if (m) return m[0].toLowerCase().replace(/\s+/g, "-")
  }
  // Fallback: "unknown"
  return "unknown"
}

/**
 * Parse the model field. OpenCode stores it as a JSON object:
 * {"id":"MiniMax-M3","providerID":"minimax-coding-plan","variant":"default"}
 * Extract just the model ID; fall back to raw value or "unknown".
 */
function parseModel(raw: string | null): string {
  if (!raw) return "unknown"
  try {
    const obj = JSON.parse(raw)
    if (obj?.id) return String(obj.id)
  } catch { /* not JSON */ }
  return raw
}

/**
 * Compute stats from the OpenCode session table.
 *
 * Direct read — no dispatch log indirection. Prefers the session table's
 * pre-aggregated counters (cost, tokens_input, tokens_output, tokens_reasoning,
 * tokens_cache_read, tokens_cache_write) which are updated by OpenCode on every
 * model response.
 */
export function computeStats(options: TokenCostOptions = {}): TokenCostStats {
  const dbPath = options.dbPath ?? defaultDbPath()
  const now = Date.now()
  const windowStart = options.windowStart ?? (now - 7 * 24 * 60 * 60 * 1000)
  const windowEnd = options.windowEnd ?? now

  const db = new Database(dbPath, { readonly: true })

  // Query sessions in the time window
  const rows = db
    .query(
      `SELECT id, title, agent, model, directory,
              cost, tokens_input, tokens_output, tokens_reasoning,
              tokens_cache_read, tokens_cache_write,
              time_created
       FROM session
       WHERE time_created >= ? AND time_created <= ?
       ORDER BY time_created`,
    )
    .all(windowStart, windowEnd) as SessionRow[]

  db.close()

  let totalTokens = 0
  let totalCost = 0
  const byModel: ModelBreakdown = {}
  const byRole: RoleBreakdown = {}
  const byDay: DailyBreakdown = {}
  const byProject: ProjectBreakdown = {}

  for (const row of rows) {
    const tokens =
      (row.tokens_input ?? 0) +
      (row.tokens_output ?? 0) +
      (row.tokens_reasoning ?? 0) +
      (row.tokens_cache_read ?? 0) +
      (row.tokens_cache_write ?? 0)
    const cost = row.cost ?? 0
    const role = parseRole(row.title, row.agent)
    const model = parseModel(row.model)
    const day = new Date(row.time_created).toISOString().slice(0, 10)
    const dir = row.directory ? path.basename(row.directory) : "unknown"

    totalTokens += tokens
    totalCost += cost

    byModel[model] ??= { tokens: 0, cost: 0, sessions: 0 }
    byModel[model].tokens += tokens
    byModel[model].cost += cost
    byModel[model].sessions++

    byRole[role] ??= { tokens: 0, cost: 0, sessions: 0 }
    byRole[role].tokens += tokens
    byRole[role].cost += cost
    byRole[role].sessions++

    byDay[day] ??= { tokens: 0, cost: 0, sessions: 0 }
    byDay[day].tokens += tokens
    byDay[day].cost += cost
    byDay[day].sessions++

    byProject[dir] ??= { tokens: 0, cost: 0, sessions: 0 }
    byProject[dir].tokens += tokens
    byProject[dir].cost += cost
    byProject[dir].sessions++
  }

  return {
    updated: new Date().toISOString(),
    source: dbPath,
    windowStart,
    windowEnd,
    total: { tokens: totalTokens, cost: Math.round(totalCost * 10000) / 10000 },
    byModel,
    byRole,
    byDay,
    byProject,
  }
}

interface SessionRow {
  id: string
  title: string
  agent: string | null
  model: string | null
  directory: string | null
  cost: number | null
  tokens_input: number | null
  tokens_output: number | null
  tokens_reasoning: number | null
  tokens_cache_read: number | null
  tokens_cache_write: number | null
  time_created: number
}
