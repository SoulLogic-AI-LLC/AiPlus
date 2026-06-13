/**
 * Compact CLI — Thresholds Command
 *
 * Show all model thresholds.
 */

import { COMPACT_THRESHOLDS, HANDOFF_TOKENS } from "../thresholds"
import { formatThresholds } from "../format"

/** Run compact thresholds command. */
export function thresholdsCommand(): string {
  return formatThresholds(COMPACT_THRESHOLDS, HANDOFF_TOKENS)
}
