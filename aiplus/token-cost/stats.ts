/**
 * Token Cost — Write Stats (V1)
 *
 * Persists computed stats to .aiplus/token-cost/stats.json.
 */

import * as fs from "node:fs"
import * as path from "node:path"
import type { TokenCostStats, TokenCostOptions } from "./types"
import { computeStats } from "./query"

const STATS_DIR = ".aiplus/token-cost"

/**
 * Compute and write token cost stats to the project's .aiplus directory.
 *
 * Fire-and-forget: errors are logged to stderr, never thrown.
 * Returns the stats object on success, null on failure.
 */
export function writeStats(
  projectRoot: string,
  options: TokenCostOptions = {},
): TokenCostStats | null {
  try {
    const stats = computeStats(options)
    const dir = path.join(projectRoot, STATS_DIR)
    fs.mkdirSync(dir, { recursive: true })

    const filePath = path.join(dir, "stats.json")
    fs.writeFileSync(filePath, JSON.stringify(stats, null, 2) + "\n", "utf-8")

    return stats
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err)
    process.stderr.write(`[aiplus-token-cost] ${msg}\n`)
    return null
  }
}
