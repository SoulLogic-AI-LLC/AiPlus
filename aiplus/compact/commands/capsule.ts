/**
 * Compact CLI — Capsule Command
 *
 * Show the current context capsule.
 */

import { readCapsule } from "../capsule"
import { formatCapsule } from "../format"

/** Run compact capsule command. */
export function capsuleCommand(projectRoot: string): string {
  const capsule = readCapsule(projectRoot)
  return formatCapsule(capsule)
}
