/**
 * Compact CLI — Check Command
 *
 * Run pressure check for a given model and token usage.
 */

import { checkPressure } from "../monitor"
import { writeCapsule } from "../capsule"
import { formatPressureResult } from "../format"

/** Run compact check command. */
export function checkCommand(
  projectRoot: string,
  model: string,
  used: number,
  total: number,
  role?: string,
  sessionId?: string,
): string {
  const result = checkPressure(projectRoot, sessionId ?? "cli-check", { used, total, model }, role)

  // Write capsule if not silent
  if (!result.action.silent) {
    writeCapsule(projectRoot, result)
  }

  return formatPressureResult(result)
}
