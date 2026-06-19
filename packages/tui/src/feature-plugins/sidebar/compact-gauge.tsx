/**
 * TUI Sidebar — Compact Pressure Gauge
 *
 * Real-time per-session compact pressure indicator. Polls B0 capsule endpoint
 * (GET /aiplus/compact/capsule) and renders a colored dot + usage % + thresholds.
 *
 * B0 response shape (B0 patch 094ff30dc + CEO-2 fix 2bc54580):
 *   { capsule: ContextCapsule | null,
 *     thresholds: Record<modelId, { soft, hard, emergency }> }
 *
 * Color mapping (Owner decision #2): uses theme tokens, NOT ANSI.
 *   - soft      → theme.success   (green)
 *   - hard      → theme.warning   (yellow)
 *   - emergency → theme.error     (red)
 *   - silent    → theme.textMuted (no render)
 *
 * Data source (Owner decision #1): HTTP fetch to B0 endpoint, NOT direct fs read.
 * Threshold source (CEO-3 follow-up): HTTP `thresholds` field from B0, replacing
 * the local `getThresholds()` fallback now that B0 import path is fixed.
 */

import { createResource, Show } from "solid-js"
import type { TuiPlugin, TuiPluginApi } from "@opencode-ai/plugin/tui"
import type { BuiltinTuiPlugin } from "../builtins"
import type { ContextCapsule } from "../../../../../aiplus/compact/types"
import { pressureFg, shouldRender } from "./compact-gauge-utils"

const id = "aiplus:sidebar-compact-gauge"
const CAPSULE_URL = "/aiplus/compact/capsule"

type ThresholdEntry = { soft: number; hard: number; emergency: number }
type Thresholds = Record<string, ThresholdEntry>
type CapsuleResponse = { capsule: ContextCapsule | null; thresholds: Thresholds }

/** Safe threshold lookup with safe fallback when HTTP omits a model. */
function lookupThreshold(thresholds: Thresholds, modelId: string): ThresholdEntry {
  return thresholds[modelId] ?? { soft: 0.3, hard: 0.45, emergency: 0.6 }
}

async function fetchCapsule(): Promise<CapsuleResponse | null> {
  try {
    const res = await fetch(CAPSULE_URL)
    if (!res.ok) return null
    return (await res.json()) as CapsuleResponse
  } catch {
    return null
  }
}

function View(props: { api: TuiPluginApi; session_id: string }) {
  const [response] = createResource(fetchCapsule)
  const theme = props.api.theme.current

  const data = (): { capsule: ContextCapsule; thresholds: Thresholds } | null => {
    const r = response() ?? null
    if (!r) return null
    const c = r.capsule
    if (c === null) return null
    if (!shouldRender(c, props.session_id)) return null
    return { capsule: c, thresholds: r.thresholds }
  }

  return (
    <Show when={data()}>
      {(d) => {
        const c = d().capsule
        const pct = Math.round(c.contextUsage * 100)
        const threshold = lookupThreshold(d().thresholds, c.model)
        return (
          <box>
            <text fg={pressureFg(c.pressureLevel, theme)}>
              <b>● Compact</b> {c.pressureLevel.toUpperCase()} {pct}%
            </text>
            <text fg={theme.textMuted}>
              {c.tokenCount.used.toLocaleString()} / {c.tokenCount.total.toLocaleString()} · {c.model}
            </text>
            <text fg={theme.textMuted}>
              thresholds: soft {threshold.soft * 100}% / hard {threshold.hard * 100}% / emergency{" "}
              {threshold.emergency * 100}%
            </text>
          </box>
        )
      }}
    </Show>
  )
}

const tui: TuiPlugin = async (api) => {
  api.slots.register({
    order: 110, // after SidebarContext (100)
    slots: {
      sidebar_content(_ctx, props) {
        return <View api={api} session_id={props.session_id} />
      },
    },
  })
}

const plugin: BuiltinTuiPlugin = {
  id,
  tui,
}

export default plugin
