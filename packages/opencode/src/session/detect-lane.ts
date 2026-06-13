/**
 * AiPlus Multi-Lane — Lane Detection
 *
 * Detects CEO lane from AIPLUS_CEO_LANE environment variable.
 * Returns "default" when env is unset.
 */

/** Detect CEO lane from environment. */
export function detectLane(): string {
  const envLane = process.env.AIPLUS_CEO_LANE
  if (envLane && /^(ceo-[123]|default)$/.test(envLane)) {
    return envLane
  }
  return "default"
}
