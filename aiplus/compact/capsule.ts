import * as fs from "node:fs"
import * as path from "node:path"
import type { ContextCapsule, PressureLevel } from "./types"

const CAPSULE_DIR = ".aiplus/compact"

/** Write a context capsule for session pressure tracking. */
export function writeCapsule(
  projectRoot: string,
  sessionId: string,
  level: PressureLevel,
  contextUsage: number,
  tokenCount: { used: number; total: number },
  model: string,
  recommendation: string,
): void {
  if (level === "silent") return
  try {
    const dir = path.join(projectRoot, CAPSULE_DIR)
    fs.mkdirSync(dir, { recursive: true })
    const capsule: ContextCapsule = {
      sessionId,
      contextUsage,
      pressureLevel: level,
      tokenCount,
      model,
      writtenAt: new Date().toISOString(),
      recommendation,
    }
    fs.writeFileSync(
      path.join(dir, "context-capsule.json"),
      JSON.stringify(capsule, null, 2),
      "utf-8",
    )
    process.stderr.write(
      `[aiplus-compact] PRESSURE=${level.toUpperCase()} usage=${(contextUsage * 100).toFixed(1)}% model=${model} — ${recommendation}\n`,
    )
  } catch (err) {
    process.stderr.write(`[aiplus-compact] ${err instanceof Error ? err.message : String(err)}\n`)
  }
}

/** Read the latest context capsule, if present. */
export function readCapsule(projectRoot: string): ContextCapsule | null {
  try {
    const filePath = path.join(projectRoot, CAPSULE_DIR, "context-capsule.json")
    if (!fs.existsSync(filePath)) return null
    return JSON.parse(fs.readFileSync(filePath, "utf-8")) as ContextCapsule
  } catch {
    return null
  }
}
