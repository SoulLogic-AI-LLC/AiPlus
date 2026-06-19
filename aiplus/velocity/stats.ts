/**
 * Velocity — Write Stats (V1)
 */

import * as fs from "node:fs"
import * as path from "node:path"
import type { VelocityStats, VelocityOptions } from "./types"
import { computeVelocity } from "./query"

const STATS_DIR = ".aiplus/velocity"

export function writeVelocity(projectRoot: string, options: VelocityOptions = {}): VelocityStats | null {
  try {
    const stats = computeVelocity(options)
    const dir = path.join(projectRoot, STATS_DIR)
    fs.mkdirSync(dir, { recursive: true })
    fs.writeFileSync(path.join(dir, "stats.json"), JSON.stringify(stats, null, 2) + "\n", "utf-8")
    return stats
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err)
    process.stderr.write(`[aiplus-velocity] ${msg}\n`)
    return null
  }
}
