import type { RGBA } from "@opentui/core"

/** Pillar color mapping for terminal rendering. */
export function pillarColor(
  pillar: "coordinator" | "verifier" | "expert",
  theme: { success: RGBA; info: RGBA; warning: RGBA },
): RGBA {
  switch (pillar) {
    case "coordinator":
      return theme.info
    case "verifier":
      return theme.warning
    case "expert":
      return theme.success
  }
}

/** Pillar display label. */
export function pillarLabel(pillar: "coordinator" | "verifier" | "expert"): string {
  switch (pillar) {
    case "coordinator":
      return "Coordinator"
    case "verifier":
      return "Verifier"
    case "expert":
      return "Expert"
  }
}

/** Status display symbol for terminal. */
export function statusSymbol(status: "active" | "idle" | "stale"): string {
  switch (status) {
    case "active":
      return "●"
    case "idle":
      return "○"
    case "stale":
      return "◌"
  }
}

/** Truncate a string to maxLen, appending "…" if needed. */
export function truncate(s: string, maxLen: number): string {
  if (s.length <= maxLen) return s
  return s.slice(0, maxLen - 1) + "…"
}
