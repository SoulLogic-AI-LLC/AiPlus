/**
 * Token Cost — Types (V1)
 *
 * Reads OpenCode session token usage directly from SQLite.
 * No dispatch-log indirection — real-time, per-session granularity.
 */

export interface TokenCostSummary {
  /** Total tokens across all sessions */
  tokens: number
  /** Total cost in USD */
  cost: number
}

export interface ModelBreakdown {
  [modelId: string]: {
    tokens: number
    cost: number
    sessions: number
  }
}

export interface RoleBreakdown {
  [role: string]: {
    tokens: number
    cost: number
    sessions: number
  }
}

export interface DailyBreakdown {
  [date: string]: {
    tokens: number
    cost: number
    sessions: number
  }
}

export interface ProjectBreakdown {
  [projectDir: string]: {
    tokens: number
    cost: number
    sessions: number
  }
}

export interface TokenCostStats {
  /** ISO 8601 timestamp — stats last updated */
  updated: string
  /** Source database path */
  source: string
  /** Minimum session time_created (epoch ms) included */
  windowStart: number
  /** Maximum session time_created (epoch ms) included */
  windowEnd: number
  /** Total across all matching sessions */
  total: TokenCostSummary
  /** By model ID */
  byModel: ModelBreakdown
  /** By role (parsed from session title or agent field) */
  byRole: RoleBreakdown
  /** By day (YYYY-MM-DD) */
  byDay: DailyBreakdown
  /** By project directory */
  byProject: ProjectBreakdown
}

/** Options for the stats query. */
export interface TokenCostOptions {
  /** Path to OpenCode SQLite DB. Default: ~/.local/share/opencode/opencode.db */
  dbPath?: string
  /** Only include sessions after this epoch ms. Default: 7 days ago. */
  windowStart?: number
  /** Only include sessions before this epoch ms. Default: now. */
  windowEnd?: number
  /** Filter by project directory (LIKE match). Default: all. */
  projectDir?: string
}
