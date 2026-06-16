/**
 * Agent Performance — Record (V1)
 *
 * Two-phase JSONL write: start at session creation, complete at session end.
 * Fire-and-forget: errors logged to stderr, never thrown.
 */

import * as fs from "node:fs"
import * as path from "node:path"
import { writeLine } from "../memory/append"
import { truncateTask } from "../memory/types"
import type { PerformanceRecord, PerformancePhase } from "./types"
import type { SessionOutcome } from "../memory/types"

const PERF_DIR = ".aiplus/agent-performance"
const PERF_FILE = "performance.jsonl"

function appendRecord(projectRoot: string, record: PerformanceRecord): void {
  const dir = path.join(projectRoot, PERF_DIR)
  fs.mkdirSync(dir, { recursive: true })
  const memFile = path.join(dir, PERF_FILE)
  writeLine(memFile, record)
}

export function appendPerformanceStart(params: {
  projectRoot: string
  sessionId: string
  role: string
  agentName: string
  modelId: string
  taskType: string
  taskSummary: string
  estimatedMs?: number | null
}): void {
  try {
    const record: PerformanceRecord = {
      phase: "start",
      sessionId: params.sessionId,
      schemaVersion: "1.0.0",
      timestamp: new Date().toISOString(),
      role: params.role,
      agentName: params.agentName,
      modelId: params.modelId,
      taskType: params.taskType,
      taskSummary: truncateTask(params.taskSummary),
      estimatedMs: params.estimatedMs ?? null,
      actualMs: 0,
      tokensIn: 0,
      tokensOut: 0,
      costUSD: 0,
      outcome: "success",
      linesChanged: 0,
      filesChanged: 0,
    }
    appendRecord(params.projectRoot, record)
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err)
    process.stderr.write(`[agent-performance] ${msg}\n`)
  }
}

export function appendPerformanceComplete(params: {
  projectRoot: string
  sessionId: string
  actualMs: number
  tokensIn: number
  tokensOut: number
  costUSD: number
  outcome: SessionOutcome
  linesChanged: number
  filesChanged: number
  reworkCount?: number
  errorCount?: number
}): void {
  try {
    const record: PerformanceRecord = {
      phase: "complete",
      sessionId: params.sessionId,
      schemaVersion: "1.0.0",
      timestamp: new Date().toISOString(),
      role: "",
      agentName: "",
      modelId: "",
      taskType: "",
      taskSummary: "",
      estimatedMs: null,
      actualMs: params.actualMs,
      tokensIn: params.tokensIn,
      tokensOut: params.tokensOut,
      costUSD: params.costUSD,
      outcome: params.outcome,
      linesChanged: params.linesChanged,
      filesChanged: params.filesChanged,
      reworkCount: params.reworkCount,
      errorCount: params.errorCount,
    }
    appendRecord(params.projectRoot, record)
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err)
    process.stderr.write(`[agent-performance] ${msg}\n`)
  }
}
